const { sendRequest } = require('./httpClient');
const { normalizeAuthRefreshConfig } = require('./models');
const {
  getVariable,
  runtimeEnvironment,
  setVariable
} = require('./variableScope');

const MILLIS_PER_SECOND = 1000;

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
      return refreshSnapshot(scope, this.stats());
    }
    const now = this.markStarted();
    this.beforeRunChecked = true;
    if (!this.shouldRefreshBeforeRun(scope, now)) {
      return refreshSnapshot(scope, this.stats());
    }
    return this.ensureFresh(scope, { force: true, reason: 'before-run' });
  }

  async ensureFresh(scope = {}, options = {}) {
    if (!this.enabled) {
      return refreshSnapshot(scope, this.stats());
    }
    const now = Number(options.now || this.now());
    this.markStarted(now);
    const force = options.force === true;
    if (!force && !this.shouldRefresh(scope, now)) {
      return refreshSnapshot(scope, this.stats());
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
      return refreshSnapshot(scope, this.stats(), result);
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
        return refreshSnapshot(scope, this.stats(), { refreshed: false, error: this.lastError });
      }
      throw error;
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
    }

    const mainStep = await this.sendRefreshRequest(this.config.request, scope, now);
    tokenForExpiry = this.applyRefreshOutputs(mainOutputs, mainStep, scope, variables, {
      tokenForExpiry,
      requireRefreshToken: false
    });
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
      if (!output?.variable || !output?.path) {
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
      setVariable(variables, output.variable, text);
      if (output.slot === 'accessToken' || output.variable === this.config.accessTokenVariable) {
        tokenForExpiry = text;
      }
    }
    return tokenForExpiry;
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
  const status = Number(response?.statusCode || response?.status || 0);
  const statusText = status ? ` Status ${status}.` : '';
  const keys = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? Object.keys(payload).filter(Boolean).slice(0, 8)
    : [];
  const keysText = keys.length ? ` Response keys: ${keys.join(', ')}.` : '';
  const bodyPreview = refreshBodyPreview(response?.body);
  const bodyText = bodyPreview ? ` Body preview: ${bodyPreview}` : '';
  const sourceText = source && source !== 'body' ? ` ${source} ` : ' ';
  return `Auth refresh response did not include${sourceText}"${path}".${statusText}${keysText}${bodyText}`;
}

function refreshBodyPreview(body) {
  const text = String(body == null ? '' : body).replace(/\s+/g, ' ').trim();
  if (!text) {
    return '';
  }
  return redactRefreshBodyPreview(text.slice(0, 240));
}

function redactRefreshBodyPreview(text) {
  return String(text || '')
    .replace(/\beyJ[A-Za-z0-9_-]+?\.[A-Za-z0-9_-]+?(?:\.[A-Za-z0-9_-]+)?\b/g, '[jwt]')
    .replace(/("(?:access|refresh|id)?_?token"\s*:\s*")[^"]+"/gi, '$1[redacted]"')
    .replace(/("(?:jwtToken|accessToken|refreshToken|idToken)"\s*:\s*")[^"]+"/gi, '$1[redacted]"');
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

function refreshSnapshot(scope, stats, result = {}) {
  return {
    ...result,
    environment: scope.environment,
    collectionVariables: scope.collectionVariables,
    globals: scope.globals,
    cookies: scope.cookies,
    stats
  };
}

module.exports = {
  createAuthRefreshManager,
  extractPath,
  jwtExpiresAtMillis,
  missingRefreshPathMessage,
  normalizeAuthRefreshConfig,
  refreshExpiresAtMillis
};
