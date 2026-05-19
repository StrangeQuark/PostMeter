const { resolveEnvironmentValue } = require('./environmentResolver');
const { sendRequest } = require('./httpClient');
const { normalizeAuthRefreshConfig } = require('./models');
const {
  getVariable,
  runtimeEnvironment,
  setVariable
} = require('./variableScope');

const MILLIS_PER_SECOND = 1000;
const AUTO_REFRESH_AUTH_TYPES = new Set(['bearer', 'apiKey', 'cookie']);

function createAuthRefreshManager(authRefresh, options = {}) {
  return new AuthRefreshManager(authRefresh, options);
}

class AuthRefreshManager {
  constructor(authRefresh, options = {}) {
    this.config = normalizeAuthRefreshConfig(authRefresh);
    this.sendRequest = options.sendRequest || sendRequest;
    this.recordDiagnosticEvent = typeof options.recordDiagnosticEvent === 'function'
      ? options.recordDiagnosticEvent
      : async () => {};
    this.now = typeof options.now === 'function'
      ? options.now
      : () => Date.now();
    this.refreshPromise = null;
    this.beforeRunChecked = false;
    this.startedMillis = 0;
    this.lastRefreshMillis = 0;
    this.expiresAtMillis = 0;
    this.refreshCount = 0;
    this.lastError = '';
    this.lastAccessToken = '';
    this.lastApiKey = '';
    this.lastRefreshToken = '';
    this.lastCookieName = '';
    this.lastCookieValue = '';
  }

  get enabled() {
    return this.config.enabled === true;
  }

  stats() {
    return {
      enabled: this.enabled,
      refreshCount: this.refreshCount,
      expiresAt: this.expiresAtMillis ? new Date(this.expiresAtMillis).toISOString() : '',
      lastError: this.lastError
    };
  }

  async beforeRun(scope = {}) {
    if (!this.enabled || this.beforeRunChecked) {
      return refreshSnapshot(scope, this.stats(), {}, this.autoRefreshAuth());
    }
    const now = this.markStarted();
    this.beforeRunChecked = true;
    if (!this.shouldRefreshBeforeRun(scope, now)) {
      return refreshSnapshot(scope, this.stats(), {}, this.autoRefreshAuth());
    }
    return this.ensureFresh(scope, { force: true, reason: 'before-run' });
  }

  async ensureFresh(scope = {}, options = {}) {
    if (!this.enabled) {
      return refreshSnapshot(scope, this.stats(), {}, this.autoRefreshAuth());
    }
    const now = Number(options.now || this.now());
    this.markStarted(now);
    const force = options.force === true;
    if (!force && !this.shouldRefresh(scope, now)) {
      return refreshSnapshot(scope, this.stats(), {}, this.autoRefreshAuth());
    }
    if (this.refreshPromise) {
      return this.refreshPromise;
    }
    this.refreshPromise = this.refresh(scope, {
      now,
      reason: options.reason || (force ? 'forced' : 'scheduled')
    }).finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }

  async forceRefresh(scope = {}, reason = 'forced') {
    return this.ensureFresh(scope, { force: true, reason });
  }

  markStarted(now = this.now()) {
    const started = Number(now);
    if (!this.startedMillis && Number.isFinite(started)) {
      this.startedMillis = started;
    }
    return Number.isFinite(started) ? started : this.now();
  }

  shouldRefreshBeforeRun(scope, now) {
    if (this.config.refreshBeforeRun !== true) {
      return this.shouldRefresh(scope, now);
    }
    if (!currentAccessToken(this.config, scope)) {
      return true;
    }
    if (this.config.mode === 'auto') {
      const expiresAt = this.currentExpiresAtMillis(scope);
      return expiresAt ? isWithinRefreshWindow(expiresAt, now, this.config.refreshWindowSeconds) : true;
    }
    return true;
  }

  shouldRefresh(scope, now) {
    if (!currentAccessToken(this.config, scope) && !this.lastRefreshMillis) {
      return true;
    }
    if (this.config.mode === 'interval') {
      const lastRefreshOrStart = this.lastRefreshMillis || this.startedMillis || now;
      return now >= lastRefreshOrStart + (this.config.refreshIntervalSeconds * MILLIS_PER_SECOND);
    }
    if (this.config.mode === 'lifetime') {
      const issuedAt = this.lastRefreshMillis || this.startedMillis || now;
      const expiresAt = issuedAt + (this.config.tokenLifetimeSeconds * MILLIS_PER_SECOND);
      return isWithinRefreshWindow(expiresAt, now, this.config.refreshWindowSeconds);
    }
    const expiresAt = this.currentExpiresAtMillis(scope);
    return expiresAt ? isWithinRefreshWindow(expiresAt, now, this.config.refreshWindowSeconds) : false;
  }

  currentExpiresAtMillis(scope) {
    const configuredValue = this.config.expiresAtVariable
      ? getVariable(targetVariables(this.config, scope), this.config.expiresAtVariable)
      : '';
    const configuredMillis = Date.parse(configuredValue || '');
    if (Number.isFinite(configuredMillis)) {
      return configuredMillis;
    }
    if (this.expiresAtMillis) {
      return this.expiresAtMillis;
    }
    return jwtExpiresAtMillis(currentAccessToken(this.config, scope));
  }

  async refresh(scope, options = {}) {
    try {
      const result = await this.performRefresh(scope, options);
      this.lastError = '';
      await this.recordDiagnosticEvent({
        type: 'auth.refresh.completed',
        level: 'info',
        outcome: 'completed',
        fields: {
          reason: options.reason || 'scheduled',
          mode: this.config.mode,
          targetScope: this.config.targetScope,
          expiresAt: result.expiresAt || '',
          refreshCount: this.refreshCount
        }
      });
      return refreshSnapshot(scope, this.stats(), result, this.autoRefreshAuth());
    } catch (error) {
      this.lastError = error?.message || String(error);
      await this.recordDiagnosticEvent({
        type: 'auth.refresh.failed',
        level: 'error',
        outcome: 'failed',
        failureCode: 'auth_refresh_failed',
        fields: {
          reason: options.reason || 'scheduled',
          mode: this.config.mode,
          targetScope: this.config.targetScope,
          error: this.lastError
        }
      });
      if (this.config.failurePolicy === 'continue') {
        return refreshSnapshot(scope, this.stats(), { refreshed: false, error: this.lastError }, this.autoRefreshAuth());
      }
      const wrapped = new Error(`Refreshing Auth failed: ${this.lastError}`);
      if (error?.code) {
        wrapped.code = error.code;
      }
      throw wrapped;
    }
  }

  async performRefresh(scope, options = {}) {
    if (!String(this.config.request?.url || '').trim()) {
      throw new Error('Auth refresh request URL is required.');
    }
    const now = Number(options.now || this.now());
    const variables = targetVariables(this.config, scope);
    let tokenForExpiry = currentAccessToken(this.config, scope);

    const outputs = Array.isArray(this.config.outputs) ? this.config.outputs : [];
    const refreshTokenOutputs = outputs.filter((output) => output?.slot === 'refreshToken');
    const mainOutputs = configuredRefreshRequest(this.config.refreshTokenRequest)
      ? outputs.filter((output) => output?.slot !== 'refreshToken')
      : outputs;

    if (configuredRefreshRequest(this.config.refreshTokenRequest)) {
      const refreshTokenStep = await this.sendRefreshRequest(this.config.refreshTokenRequest, scope, now);
      this.applyRefreshOutputs(refreshTokenOutputs, refreshTokenStep, scope, variables, {
        tokenForExpiry,
        requireRefreshToken: true
      });
      this.applyManagedRefreshCookie(scope);
    }

    const mainStep = await this.sendRefreshRequest(this.requestWithAutoRefreshRefreshTokenAuth(this.config.request), scope, now);
    tokenForExpiry = this.applyRefreshOutputs(mainOutputs, mainStep, scope, variables, {
      tokenForExpiry,
      requireRefreshToken: false
    });
    this.applyManagedAccessCookie(scope);
    const expiresAtValue = extractPath(mainStep.payload, this.config.expiresAtPath);
    const expiresInValue = extractPath(mainStep.payload, this.config.expiresInPath);
    const expiresAtMillis = refreshExpiresAtMillis({
      expiresAt: expiresAtValue,
      expiresIn: expiresInValue,
      token: tokenForExpiry,
      now,
      tokenLifetimeSeconds: this.config.mode === 'lifetime' ? this.config.tokenLifetimeSeconds : 0
    });
    if (expiresAtMillis) {
      this.expiresAtMillis = expiresAtMillis;
      if (this.config.expiresAtVariable) {
        setVariable(variables, this.config.expiresAtVariable, new Date(expiresAtMillis).toISOString());
      }
    }
    this.lastRefreshMillis = now;
    this.refreshCount += 1;
    return {
      refreshed: true,
      expiresAt: expiresAtMillis ? new Date(expiresAtMillis).toISOString() : ''
    };
  }

  async sendRefreshRequest(request, scope, now) {
    const environment = refreshResolutionEnvironment(this.config, scope, request);
    const response = await this.sendRequest(request, environment, {
      ...(scope.sendOptions || {}),
      signal: scope.signal,
      cookieJar: scope.cookies || [],
      clientCertificates: scope.clientCertificates || [],
      tlsSettings: scope.tlsSettings || {},
      fileBindings: scope.fileBindings || [],
      sandboxPackages: scope.sandboxPackages || [],
      vault: scope.vault,
      vaultPrompt: scope.vaultPrompt,
      recordDiagnosticEvent: scope.recordDiagnosticEvent,
      now
    });
    if (Array.isArray(response?.updatedCookies)) {
      scope.cookies = response.updatedCookies;
    }
    return {
      response,
      payload: parseRefreshPayload(response?.body)
    };
  }

  applyRefreshOutputs(outputs = [], step = {}, scope = {}, variables = [], options = {}) {
    let tokenForExpiry = options.tokenForExpiry || '';
    for (const output of outputs || []) {
      if (!output?.path && output?.source !== 'rawBody') {
        continue;
      }
      const value = extractRefreshOutput(output, step.payload, step.response, scope);
      if (value == null) {
        if (output.slot === 'refreshToken' && options.requireRefreshToken !== true) {
          continue;
        }
        throw new Error(missingRefreshPathMessage(output.path, step.response, step.payload, output.source));
      }
      const text = String(value);
      if (output.variable) {
        setVariable(variables, output.variable, text);
      }
      this.rememberAutoRefreshOutput(output, text);
      if (output.slot === 'accessToken' || output.variable === this.config.accessTokenVariable) {
        tokenForExpiry = text;
      }
    }
    return tokenForExpiry;
  }

  rememberAutoRefreshOutput(output = {}, value = '') {
    if (output.slot === 'accessToken') {
      this.lastAccessToken = value;
    } else if (output.slot === 'apiKey') {
      this.lastApiKey = value;
    } else if (output.slot === 'refreshToken') {
      this.lastRefreshToken = value;
    } else if (output.slot === 'cookie') {
      this.lastCookieName = String(output.path || '').trim();
      this.lastCookieValue = value;
    }
  }

  requestWithAutoRefreshRefreshTokenAuth(request = {}) {
    if (request?.auth?.type !== 'autoRefreshRefreshToken' || !this.lastRefreshToken) {
      return request;
    }
    if (String(this.config.authType || '').trim() === 'cookie') {
      return {
        ...request,
        auth: { type: 'none' },
        cookieJar: {
          ...(request.cookieJar || {}),
          enabled: true,
          storeResponses: true
        }
      };
    }
    return {
      ...request,
      auth: { type: 'bearer', token: this.lastRefreshToken }
    };
  }

  autoRefreshAuth() {
    const authType = String(this.config.authType || '').trim();
    if (!AUTO_REFRESH_AUTH_TYPES.has(authType)) {
      return null;
    }
    if (authType === 'bearer' && this.lastAccessToken) {
      return { type: 'bearer', token: this.lastAccessToken };
    }
    if (authType === 'apiKey' && this.lastApiKey) {
      return {
        type: 'apiKey',
        location: this.config.apiKeyLocation,
        key: this.config.apiKeyName,
        value: this.lastApiKey
      };
    }
    if (authType === 'cookie' && this.lastCookieName && this.lastCookieValue) {
      return { type: 'cookie', value: `${this.lastCookieName}=${this.lastCookieValue}` };
    }
    return null;
  }

  applyManagedRefreshCookie(scope = {}) {
    if (String(this.config.authType || '').trim() !== 'cookie' || !this.lastRefreshToken) {
      return;
    }
    upsertRuntimeCookie(scope, this.config.request, this.config, refreshTokenCookieName(this.config), this.lastRefreshToken);
  }

  applyManagedAccessCookie(scope = {}) {
    if (String(this.config.authType || '').trim() !== 'cookie' || !this.lastCookieName || !this.lastCookieValue) {
      return;
    }
    upsertRuntimeCookie(scope, this.config.request, this.config, this.lastCookieName, this.lastCookieValue);
  }
}

function refreshResolutionEnvironment(config, scope, request = config.request) {
  return runtimeEnvironment(scope.collectionVariables || [], scope.environment || null, request?.variables || [], {
    globals: scope.globals || []
  });
}

function configuredRefreshRequest(request = {}) {
  return Boolean(String(request?.url || '').trim());
}

function targetVariables(config, scope) {
  if (config.targetScope === 'collection') {
    scope.collectionVariables ||= [];
    return scope.collectionVariables;
  }
  if (config.targetScope === 'globals') {
    scope.globals ||= [];
    return scope.globals;
  }
  scope.environment ||= { id: 'runtime', name: 'Runtime', variables: [] };
  scope.environment.variables ||= [];
  return scope.environment.variables;
}

function currentAccessToken(config, scope) {
  if (!config.accessTokenVariable) {
    return '';
  }
  return getVariable(targetVariables(config, scope), config.accessTokenVariable) || '';
}

function refreshTokenCookieName(config = {}) {
  const output = Array.isArray(config.outputs)
    ? config.outputs.find((item) => item?.slot === 'refreshToken')
    : null;
  const name = String(output?.path || config.refreshTokenPath || config.refreshTokenVariable || '').trim();
  return name && name !== '$body' ? name : 'refresh_token';
}

function upsertRuntimeCookie(scope = {}, request = {}, config = {}, name = '', value = '') {
  const cookieName = String(name || '').trim();
  const cookieValue = String(value ?? '');
  if (!cookieName) {
    return;
  }
  const url = resolvedRequestUrl(request, config, scope);
  if (!url) {
    return;
  }
  scope.cookies = Array.isArray(scope.cookies) ? scope.cookies : [];
  const domain = url.hostname.toLowerCase();
  const path = '/';
  const existing = scope.cookies.find((cookie) => String(cookie?.name || '') === cookieName
    && String(cookie?.domain || '').toLowerCase() === domain
    && String(cookie?.path || '/') === path);
  if (existing) {
    existing.enabled = true;
    existing.value = cookieValue;
    existing.hostOnly = existing.hostOnly !== false;
    return;
  }
  scope.cookies.push({
    enabled: true,
    name: cookieName,
    value: cookieValue,
    domain,
    path,
    secure: url.protocol === 'https:',
    httpOnly: true,
    sameSite: 'Lax',
    hostOnly: true,
    source: 'auth-refresh'
  });
}

function resolvedRequestUrl(request = {}, config = {}, scope = {}) {
  try {
    const environment = refreshResolutionEnvironment(config, scope, request);
    return new URL(resolveEnvironmentValue(request?.url || '', environment).trim());
  } catch {
    return null;
  }
}

function isWithinRefreshWindow(expiresAtMillis, now, refreshWindowSeconds) {
  return Number.isFinite(expiresAtMillis)
    && expiresAtMillis <= Number(now) + (Number(refreshWindowSeconds || 0) * MILLIS_PER_SECOND);
}

function parseRefreshPayload(body) {
  if (body == null || String(body).trim() === '') {
    return {};
  }
  try {
    return JSON.parse(String(body));
  } catch {
    return {};
  }
}

function extractRefreshOutput(output, payload, response, scope) {
  const source = output?.source || 'body';
  const path = String(output?.path || '').trim();
  if (source === 'rawBody') {
    const body = response?.body;
    if (body == null || String(body).trim() === '') {
      return undefined;
    }
    return String(body);
  }
  if (!path) {
    return undefined;
  }
  if (source === 'header') {
    return extractHeader(response?.headers, path);
  }
  if (source === 'cookie') {
    return extractCookie(scope?.cookies, path);
  }
  return extractPath(payload, path);
}

function extractHeader(headers = {}, name = '') {
  const target = String(name || '').trim().toLowerCase();
  if (!target || !headers || typeof headers !== 'object') {
    return undefined;
  }
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === target);
  if (!key) {
    return undefined;
  }
  const value = headers[key];
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function extractCookie(cookies = [], name = '') {
  const target = String(name || '').trim();
  if (!target || !Array.isArray(cookies)) {
    return undefined;
  }
  return cookies.find((cookie) => cookie?.enabled !== false && String(cookie.name || '') === target)?.value;
}

function missingRefreshPathMessage(path, response = {}, payload = {}, source = 'body') {
  if (source === 'rawBody') {
    return 'Auth refresh response body was empty.';
  }
  const keys = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? Object.keys(payload).filter(Boolean).slice(0, 8)
    : [];
  const sourceText = source && source !== 'body' ? ` ${source} ` : ' ';
  const lines = [`Auth refresh response did not include${sourceText}"${path}".`];
  if (keys.length) {
    lines.push('', 'Response keys:', ...keys);
  }
  return lines.join('\n');
}

function extractPath(source, path) {
  const text = String(path || '').trim();
  if (!text) {
    return undefined;
  }
  const segments = pathSegments(text);
  let value = source;
  for (const segment of segments) {
    if (value == null) {
      return undefined;
    }
    value = value[segment];
  }
  return value == null ? undefined : value;
}

function pathSegments(path) {
  const segments = [];
  const pattern = /[^.[\]]+|\[(\d+|(["'])(.*?)\2)\]/g;
  for (const match of String(path).matchAll(pattern)) {
    if (match[1] != null) {
      segments.push(match[3] != null ? match[3] : Number(match[1]));
    } else {
      segments.push(match[0]);
    }
  }
  return segments;
}

function refreshExpiresAtMillis(options = {}) {
  const expiresAtMillis = Date.parse(String(options.expiresAt || ''));
  if (Number.isFinite(expiresAtMillis)) {
    return expiresAtMillis;
  }
  const expiresIn = Number(options.expiresIn);
  if (Number.isFinite(expiresIn) && expiresIn > 0) {
    return Number(options.now || Date.now()) + Math.round(expiresIn * MILLIS_PER_SECOND);
  }
  const jwtExpiresAt = jwtExpiresAtMillis(options.token);
  if (jwtExpiresAt) {
    return jwtExpiresAt;
  }
  const lifetime = Number(options.tokenLifetimeSeconds || 0);
  if (Number.isFinite(lifetime) && lifetime > 0) {
    return Number(options.now || Date.now()) + Math.round(lifetime * MILLIS_PER_SECOND);
  }
  return 0;
}

function jwtExpiresAtMillis(token) {
  const parts = String(token || '').split('.');
  if (parts.length < 2) {
    return 0;
  }
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    const exp = Number(payload.exp);
    if (Number.isFinite(exp) && exp > 0) {
      return Math.round(exp * MILLIS_PER_SECOND);
    }
  } catch {
    return 0;
  }
  return 0;
}

function refreshSnapshot(scope, stats, result = {}, autoRefreshAuth = null) {
  return {
    ...result,
    environment: scope.environment,
    collectionVariables: scope.collectionVariables,
    globals: scope.globals,
    cookies: scope.cookies,
    autoRefreshAuth,
    stats
  };
}

function requestWithAutoRefreshAuth(request = {}, authRefresh = {}, autoRefreshAuth = null, options = {}) {
  if (!autoRefreshAuth || authRefresh?.enabled !== true) {
    return request;
  }
  const configuredType = String(authRefresh.authType || '').trim();
  const requestType = String(request?.auth?.type || 'none').trim();
  const requestUsesRefreshingCookie = request?.useRefreshingAuthCookie === true;
  if (!AUTO_REFRESH_AUTH_TYPES.has(configuredType)) {
    return request;
  }
  const matchConfiguredAuthType = options.matchConfiguredAuthType !== false;
  if (requestType !== 'autoRefresh'
    && !requestUsesRefreshingCookie
    && (!matchConfiguredAuthType || requestType !== configuredType)) {
    return request;
  }
  if (configuredType === 'bearer' && autoRefreshAuth.type === 'bearer' && autoRefreshAuth.token) {
    return {
      ...request,
      auth: { type: 'bearer', token: autoRefreshAuth.token }
    };
  }
  if (configuredType === 'apiKey' && autoRefreshAuth.type === 'apiKey' && autoRefreshAuth.value) {
    return {
      ...request,
      auth: {
        type: 'apiKey',
        location: autoRefreshAuth.location || authRefresh.apiKeyLocation || 'header',
        key: autoRefreshAuth.key || authRefresh.apiKeyName || 'X-API-Key',
        value: autoRefreshAuth.value
      }
    };
  }
  if (configuredType === 'cookie' && autoRefreshAuth.type === 'cookie' && autoRefreshAuth.value) {
    return {
      ...request,
      auth: { type: 'none' },
      cookieJar: {
        ...(request.cookieJar || {}),
        enabled: true,
        storeResponses: true
      }
    };
  }
  return request;
}

module.exports = {
  createAuthRefreshManager,
  extractPath,
  jwtExpiresAtMillis,
  missingRefreshPathMessage,
  normalizeAuthRefreshConfig,
  requestWithAutoRefreshAuth,
  refreshExpiresAtMillis
};
