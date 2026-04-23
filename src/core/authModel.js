(function attachAuthModel(global) {
  const {
    API_KEY_LOCATIONS: API_KEY_LOCATION_VALUES,
    AUTH_TYPE_VALUES,
    OAUTH2_GRANT_TYPES: OAUTH2_GRANT_TYPE_VALUES,
    OAUTH2_REDIRECT_STRATEGIES: OAUTH2_REDIRECT_STRATEGY_VALUES,
    OAUTH2_TOKEN_TYPES: OAUTH2_TOKEN_TYPE_VALUES,
    normalizeSchemaEnumValue
  } = resolvePayloadSchemas(global);

  const AUTH_TYPES = new Set(AUTH_TYPE_VALUES);
  const API_KEY_LOCATIONS = new Set(API_KEY_LOCATION_VALUES);
  const OAUTH2_TOKEN_TYPES = new Set(OAUTH2_TOKEN_TYPE_VALUES);
  const OAUTH2_GRANT_TYPES = new Set(OAUTH2_GRANT_TYPE_VALUES);
  const OAUTH2_REDIRECT_STRATEGIES = new Set(OAUTH2_REDIRECT_STRATEGY_VALUES);

  function normalizeAuth(auth = {}) {
    const type = normalizeSchemaEnumValue('authTypes', auth.type, 'none');
    if (type === 'none') {
      return { type: 'none' };
    }
    if (type === 'bearer') {
      return { type, token: auth.token ?? '' };
    }
    if (type === 'basic') {
      return { type, username: auth.username ?? '', password: auth.password ?? '' };
    }
    if (type === 'apiKey') {
      return {
        type,
        location: normalizeSchemaEnumValue('apiKeyLocations', auth.location, 'header'),
        key: auth.key ?? '',
        value: auth.value ?? ''
      };
    }
    if (type === 'cookie') {
      return { type, value: auth.value ?? '' };
    }
    if (type === 'oauth2') {
      return {
        type,
        tokenType: normalizeSchemaEnumValue('oauth2TokenTypes', auth.tokenType, 'Bearer'),
        accessToken: auth.accessToken ?? '',
        refreshToken: auth.refreshToken ?? '',
        tokenUrl: auth.tokenUrl ?? '',
        authorizationUrl: auth.authorizationUrl ?? '',
        deviceAuthorizationUrl: auth.deviceAuthorizationUrl ?? '',
        clientId: auth.clientId ?? '',
        clientSecret: auth.clientSecret ?? '',
        scopes: auth.scopes ?? '',
        grantType: normalizeSchemaEnumValue('oauth2GrantTypes', auth.grantType, 'authorizationCode'),
        redirectStrategy: normalizeSchemaEnumValue('oauth2RedirectStrategies', auth.redirectStrategy, 'loopback'),
        redirectUri: auth.redirectUri ?? '',
        expiresAt: auth.expiresAt ?? '',
        deviceCode: auth.deviceCode ?? '',
        userCode: auth.userCode ?? '',
        verificationUri: auth.verificationUri ?? '',
        verificationUriComplete: auth.verificationUriComplete ?? '',
        deviceCodeExpiresAt: auth.deviceCodeExpiresAt ?? '',
        devicePollIntervalSeconds: auth.devicePollIntervalSeconds ?? ''
      };
    }
    return {
      type,
      certPath: auth.certPath ?? '',
      keyPath: auth.keyPath ?? '',
      pfxPath: auth.pfxPath ?? '',
      caPath: auth.caPath ?? '',
      passphrase: auth.passphrase ?? ''
    };
  }

  function normalizePersistedAuth(auth) {
    if (!auth || typeof auth !== 'object' || !AUTH_TYPES.has(auth.type)) {
      return { type: 'none' };
    }
    return { ...auth };
  }

  function defaultAuthEditorState() {
    return {
      type: 'none',
      bearerToken: '',
      basicUsername: '',
      basicPassword: '',
      apiKeyLocation: 'header',
      apiKeyName: '',
      apiKeyValue: '',
      cookieValue: '',
      oauthGrantType: 'authorizationCode',
      oauthTokenType: 'Bearer',
      oauthAccessToken: '',
      oauthRefreshToken: '',
      oauthAuthorizationUrl: '',
      oauthRedirectStrategy: 'loopback',
      oauthDeviceAuthorizationUrl: '',
      oauthTokenUrl: '',
      oauthClientId: '',
      oauthClientSecret: '',
      oauthScopes: '',
      oauthUserCode: '',
      oauthVerificationUri: '',
      clientPfxPath: '',
      clientCertPath: '',
      clientKeyPath: '',
      clientCaPath: '',
      clientPassphrase: ''
    };
  }

  function authEditorState(auth = {}) {
    const normalized = normalizeAuth(auth);
    const state = defaultAuthEditorState();
    state.type = normalized.type;
    if (normalized.type === 'bearer') {
      state.bearerToken = normalized.token;
      return state;
    }
    if (normalized.type === 'basic') {
      state.basicUsername = normalized.username;
      state.basicPassword = normalized.password;
      return state;
    }
    if (normalized.type === 'apiKey') {
      state.apiKeyLocation = normalized.location;
      state.apiKeyName = normalized.key;
      state.apiKeyValue = normalized.value;
      return state;
    }
    if (normalized.type === 'cookie') {
      state.cookieValue = normalized.value;
      return state;
    }
    if (normalized.type === 'oauth2') {
      state.oauthGrantType = normalized.grantType;
      state.oauthTokenType = normalized.tokenType;
      state.oauthAccessToken = normalized.accessToken;
      state.oauthRefreshToken = normalized.refreshToken;
      state.oauthAuthorizationUrl = normalized.authorizationUrl;
      state.oauthRedirectStrategy = normalized.redirectStrategy;
      state.oauthDeviceAuthorizationUrl = normalized.deviceAuthorizationUrl;
      state.oauthTokenUrl = normalized.tokenUrl;
      state.oauthClientId = normalized.clientId;
      state.oauthClientSecret = normalized.clientSecret;
      state.oauthScopes = normalized.scopes;
      state.oauthUserCode = normalized.userCode;
      state.oauthVerificationUri = normalized.verificationUriComplete || normalized.verificationUri;
      return state;
    }
    if (normalized.type === 'clientCertificate') {
      state.clientPfxPath = normalized.pfxPath;
      state.clientCertPath = normalized.certPath;
      state.clientKeyPath = normalized.keyPath;
      state.clientCaPath = normalized.caPath;
      state.clientPassphrase = normalized.passphrase;
      return state;
    }
    return state;
  }

  function authFromEditorState(state = {}, existingAuth = {}) {
    const type = normalizeSchemaEnumValue('authTypes', state.type, 'none');
    if (type === 'bearer') {
      return normalizeAuth({
        type,
        token: state.bearerToken ?? ''
      });
    }
    if (type === 'basic') {
      return normalizeAuth({
        type,
        username: state.basicUsername ?? '',
        password: state.basicPassword ?? ''
      });
    }
    if (type === 'apiKey') {
      return normalizeAuth({
        type,
        location: state.apiKeyLocation,
        key: state.apiKeyName ?? '',
        value: state.apiKeyValue ?? ''
      });
    }
    if (type === 'cookie') {
      return normalizeAuth({
        type,
        value: state.cookieValue ?? ''
      });
    }
    if (type === 'oauth2') {
      const grantType = normalizeSchemaEnumValue('oauth2GrantTypes', state.oauthGrantType, 'authorizationCode');
      const normalizedExisting = normalizeAuth(existingAuth);
      const keepExistingOauthState = normalizedExisting.type === 'oauth2';
      const keepDeviceState = grantType === 'deviceCode' && keepExistingOauthState;
      return normalizeAuth({
        type,
        tokenType: state.oauthTokenType,
        accessToken: state.oauthAccessToken ?? '',
        refreshToken: state.oauthRefreshToken ?? '',
        authorizationUrl: state.oauthAuthorizationUrl ?? '',
        deviceAuthorizationUrl: state.oauthDeviceAuthorizationUrl ?? '',
        tokenUrl: state.oauthTokenUrl ?? '',
        clientId: state.oauthClientId ?? '',
        clientSecret: state.oauthClientSecret ?? '',
        scopes: state.oauthScopes ?? '',
        grantType,
        redirectStrategy: state.oauthRedirectStrategy,
        redirectUri: keepExistingOauthState ? normalizedExisting.redirectUri : '',
        expiresAt: keepExistingOauthState ? normalizedExisting.expiresAt : '',
        deviceCode: keepDeviceState ? normalizedExisting.deviceCode : '',
        userCode: keepDeviceState ? (state.oauthUserCode ?? '') : '',
        verificationUri: keepDeviceState ? normalizedExisting.verificationUri : '',
        verificationUriComplete: keepDeviceState ? normalizedExisting.verificationUriComplete : '',
        deviceCodeExpiresAt: keepDeviceState ? normalizedExisting.deviceCodeExpiresAt : '',
        devicePollIntervalSeconds: keepDeviceState ? normalizedExisting.devicePollIntervalSeconds : ''
      });
    }
    if (type === 'clientCertificate') {
      return normalizeAuth({
        type,
        pfxPath: state.clientPfxPath ?? '',
        certPath: state.clientCertPath ?? '',
        keyPath: state.clientKeyPath ?? '',
        caPath: state.clientCaPath ?? '',
        passphrase: state.clientPassphrase ?? ''
      });
    }
    return { type: 'none' };
  }

  function resolvePayloadSchemas(runtimeGlobal) {
    if (runtimeGlobal?.PostMeterPayloadSchemas) {
      return runtimeGlobal.PostMeterPayloadSchemas;
    }
    if (typeof module !== 'undefined' && module.exports) {
      return require('./payloadSchemas');
    }
    throw new Error('PostMeter payload schema metadata must load before authModel.js.');
  }

  const exported = {
    API_KEY_LOCATIONS,
    API_KEY_LOCATION_VALUES,
    AUTH_TYPES,
    AUTH_TYPE_VALUES,
    OAUTH2_GRANT_TYPES,
    OAUTH2_GRANT_TYPE_VALUES,
    OAUTH2_REDIRECT_STRATEGIES,
    OAUTH2_REDIRECT_STRATEGY_VALUES,
    OAUTH2_TOKEN_TYPES,
    OAUTH2_TOKEN_TYPE_VALUES,
    authEditorState,
    authFromEditorState,
    defaultAuthEditorState,
    normalizeAuth,
    normalizePersistedAuth
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }

  global.PostMeterAuthModel = exported;
})(typeof window === 'undefined' ? globalThis : window);
