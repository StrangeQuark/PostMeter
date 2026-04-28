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
    const type = normalizeAuthType(auth.type);
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
    if (type === 'clientCertificate') {
      return {
        type,
        certificateId: auth.certificateId ?? '',
        certPath: auth.certPath ?? '',
        keyPath: auth.keyPath ?? '',
        pfxPath: auth.pfxPath ?? '',
        caPath: auth.caPath ?? '',
        passphrase: auth.passphrase ?? ''
      };
    }
    if (type === 'digest') {
      return {
        type,
        username: auth.username ?? '',
        password: auth.password ?? '',
        realm: auth.realm ?? '',
        nonce: auth.nonce ?? '',
        algorithm: auth.algorithm ?? 'MD5',
        qop: auth.qop ?? 'auth',
        opaque: auth.opaque ?? '',
        clientNonce: auth.clientNonce ?? '',
        nonceCount: auth.nonceCount ?? ''
      };
    }
    if (type === 'hawk') {
      return {
        type,
        authId: auth.authId ?? auth.id ?? '',
        authKey: auth.authKey ?? auth.key ?? '',
        algorithm: auth.algorithm ?? 'sha256',
        user: auth.user ?? '',
        nonce: auth.nonce ?? '',
        extraData: auth.extraData ?? auth.ext ?? '',
        app: auth.app ?? '',
        delegation: auth.delegation ?? auth.dlg ?? ''
      };
    }
    if (type === 'aws') {
      return {
        type,
        accessKey: auth.accessKey ?? '',
        secretKey: auth.secretKey ?? '',
        region: auth.region ?? '',
        service: auth.service ?? auth.serviceName ?? '',
        sessionToken: auth.sessionToken ?? '',
        addAuthDataToQuery: auth.addAuthDataToQuery === true
      };
    }
    if (type === 'oauth1') {
      return {
        type,
        consumerKey: auth.consumerKey ?? '',
        consumerSecret: auth.consumerSecret ?? '',
        token: auth.token ?? '',
        tokenSecret: auth.tokenSecret ?? '',
        signatureMethod: auth.signatureMethod ?? 'HMAC-SHA1',
        timestamp: auth.timestamp ?? '',
        nonce: auth.nonce ?? '',
        version: auth.version ?? '1.0',
        realm: auth.realm ?? ''
      };
    }
    if (type === 'ntlm') {
      return {
        type,
        username: auth.username ?? '',
        password: auth.password ?? '',
        domain: auth.domain ?? '',
        workstation: auth.workstation ?? ''
      };
    }
    if (type === 'akamaiEdgeGrid') {
      return {
        type,
        accessToken: auth.accessToken ?? '',
        clientToken: auth.clientToken ?? '',
        clientSecret: auth.clientSecret ?? '',
        headersToSign: auth.headersToSign ?? ''
      };
    }
    return { type: 'none' };
  }

  function normalizeAuthType(value) {
    const text = String(value || '').trim();
    const lowered = text.toLowerCase().replace(/[\s_.-]+/g, '');
    if (!text || lowered === 'none' || lowered === 'noauth') {
      return 'none';
    }
    if (lowered === 'apikey') {
      return 'apiKey';
    }
    if (lowered === 'clientcertificate' || lowered === 'clientcert' || lowered === 'clientcertificateauth') {
      return 'clientCertificate';
    }
    if (lowered === 'awsv4' || lowered === 'aws' || lowered === 'awssignature') {
      return 'aws';
    }
    if (lowered === 'oauth1' || lowered === 'oauth10' || lowered === 'oauth1auth') {
      return 'oauth1';
    }
    if (lowered === 'akamai' || lowered === 'edgegrid' || lowered === 'akamaiedgegrid') {
      return 'akamaiEdgeGrid';
    }
    return AUTH_TYPES.has(text) ? text : normalizeSchemaEnumValue('authTypes', text, 'none');
  }

  function normalizePersistedAuth(auth) {
    if (!auth || typeof auth !== 'object') {
      return { type: 'none' };
    }
    const type = normalizeAuthType(auth.type);
    if (type === 'none' || !AUTH_TYPES.has(type)) {
      return { type: 'none' };
    }
    return { ...auth, type };
  }

  function defaultAuthEditorState() {
    return {
      type: 'none',
      basicUsername: '',
      basicPassword: '',
      bearerToken: '',
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
    const type = normalizeAuthType(state.type);
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
        certificateId: normalizeAuth(existingAuth).type === 'clientCertificate' ? normalizeAuth(existingAuth).certificateId : '',
        pfxPath: state.clientPfxPath ?? '',
        certPath: state.clientCertPath ?? '',
        keyPath: state.clientKeyPath ?? '',
        caPath: state.clientCaPath ?? '',
        passphrase: state.clientPassphrase ?? ''
      });
    }
    if (['digest', 'hawk', 'aws', 'oauth1', 'ntlm', 'akamaiEdgeGrid'].includes(type)) {
      const existing = normalizeAuth(existingAuth);
      return normalizeAuth(existing.type === type ? existing : { type });
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
    normalizeAuthType,
    normalizePersistedAuth
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }

  global.PostMeterAuthModel = exported;
})(typeof window === 'undefined' ? globalThis : window);
