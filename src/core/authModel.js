(function attachAuthModel(global) {
  const {
    API_KEY_LOCATIONS: API_KEY_LOCATION_VALUES,
    AUTH_TYPE_VALUES,
    OAUTH1_ADD_AUTH_DATA_TO: OAUTH1_ADD_AUTH_DATA_TO_VALUES,
    OAUTH1_SIGNATURE_METHODS: OAUTH1_SIGNATURE_METHOD_VALUES,
    OAUTH2_GRANT_TYPES: OAUTH2_GRANT_TYPE_VALUES,
    OAUTH2_REDIRECT_STRATEGIES: OAUTH2_REDIRECT_STRATEGY_VALUES,
    OAUTH2_TOKEN_TYPES: OAUTH2_TOKEN_TYPE_VALUES,
    normalizeSchemaEnumValue
  } = resolvePayloadSchemas(global);

  const AUTH_TYPES = new Set(AUTH_TYPE_VALUES);
  const API_KEY_LOCATIONS = new Set(API_KEY_LOCATION_VALUES);
  const OAUTH1_ADD_AUTH_DATA_TO = new Set(OAUTH1_ADD_AUTH_DATA_TO_VALUES);
  const OAUTH1_SIGNATURE_METHODS = new Set(OAUTH1_SIGNATURE_METHOD_VALUES);
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
    if (type === 'autoRefresh') {
      return { type };
    }
    if (type === 'autoRefreshRefreshToken') {
      return { type };
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
        disableRetryingRequest: authBoolean(
          auth.disableRetryingRequest
          ?? auth.disableRetryRequest
          ?? auth.disableRetry
          ?? auth.disableRetrying
        ),
        realm: auth.realm ?? '',
        nonce: auth.nonce ?? '',
        algorithm: auth.algorithm ?? 'MD5',
        qop: auth.qop ?? 'auth',
        opaque: auth.opaque ?? '',
        clientNonce: auth.clientNonce ?? auth.cnonce ?? '',
        nonceCount: auth.nonceCount ?? auth.nc ?? ''
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
        signatureMethod: normalizeOAuth1SignatureMethod(auth.signatureMethod),
        privateKey: auth.privateKey ?? auth.consumerPrivateKey ?? '',
        addAuthDataTo: oauth1AddAuthDataToFromAuth(auth),
        callback: auth.callback ?? auth.callbackUrl ?? auth.callbackURL ?? '',
        verifier: auth.verifier ?? '',
        timestamp: auth.timestamp ?? '',
        nonce: auth.nonce ?? '',
        version: auth.version ?? '1.0',
        realm: auth.realm ?? '',
        includeBodyHash: authBoolean(auth.includeBodyHash),
        addEmptyParamsToSign: authBoolean(
          auth.addEmptyParamsToSign
          ?? auth.addEmptyParametersToSignature
          ?? auth.addEmptyParamsToSignature
        )
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
    if (type === 'jwtBearer') {
      return {
        type,
        algorithm: auth.algorithm ?? 'HS256',
        secret: auth.secret ?? auth.clientSecret ?? '',
        privateKey: auth.privateKey ?? '',
        keyId: auth.keyId ?? auth.kid ?? '',
        issuer: auth.issuer ?? auth.iss ?? '',
        subject: auth.subject ?? auth.sub ?? '',
        audience: auth.audience ?? auth.aud ?? '',
        expiresIn: auth.expiresIn ?? '300',
        claims: auth.claims ?? '',
        headerPrefix: auth.headerPrefix ?? 'Bearer',
        addTokenTo: auth.addTokenTo ?? 'header',
        queryParamName: auth.queryParamName ?? 'token'
      };
    }
    if (type === 'asap') {
      return {
        type,
        algorithm: auth.algorithm ?? 'RS256',
        privateKey: auth.privateKey ?? '',
        secret: auth.secret ?? auth.clientSecret ?? '',
        issuer: auth.issuer ?? auth.iss ?? '',
        subject: auth.subject ?? auth.sub ?? '',
        audience: auth.audience ?? auth.aud ?? '',
        keyId: auth.keyId ?? auth.kid ?? '',
        expiresIn: auth.expiresIn ?? '300',
        headerPrefix: auth.headerPrefix ?? 'Bearer'
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
    if (lowered === 'autorefresh' || lowered === 'autorefreshtoken') {
      return 'autoRefresh';
    }
    if (lowered === 'autorefreshrefreshtoken' || lowered === 'refreshingauthrefreshtoken') {
      return 'autoRefreshRefreshToken';
    }
    if (lowered === 'refreshingauthaccesstoken'
      || lowered === 'userefreshingaccesstoken'
      || lowered === 'refreshingauthapikey'
      || lowered === 'userefreshingapikey') {
      return 'autoRefresh';
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
    if (lowered === 'jwt' || lowered === 'jwtbearer' || lowered === 'bearerjwt') {
      return 'jwtBearer';
    }
    if (lowered === 'asap' || lowered === 'atlassianasap') {
      return 'asap';
    }
    return AUTH_TYPES.has(text) ? text : normalizeSchemaEnumValue('authTypes', text, 'none');
  }

  function authBoolean(value) {
    return value === true || String(value).trim().toLowerCase() === 'true';
  }

  function normalizeOAuth1SignatureMethod(value) {
    const normalized = String(value || 'HMAC-SHA1').trim().toUpperCase();
    if (normalized === 'HMACSHA1') {
      return 'HMAC-SHA1';
    }
    if (normalized === 'HMACSHA256') {
      return 'HMAC-SHA256';
    }
    if (normalized === 'HMACSHA512') {
      return 'HMAC-SHA512';
    }
    if (normalized === 'RSASHA1') {
      return 'RSA-SHA1';
    }
    if (normalized === 'RSASHA256') {
      return 'RSA-SHA256';
    }
    if (normalized === 'RSASHA512') {
      return 'RSA-SHA512';
    }
    return OAUTH1_SIGNATURE_METHODS.has(normalized) ? normalized : 'HMAC-SHA1';
  }

  function oauth1AddAuthDataToFromAuth(auth = {}) {
    const explicit = auth.addAuthDataTo ?? auth.addAuthorizationDataTo;
    if (explicit != null) {
      return normalizeOAuth1AddAuthDataTo(explicit);
    }
    if (auth.addParamsToHeader != null) {
      return authBoolean(auth.addParamsToHeader) ? 'header' : 'queryOrBody';
    }
    return 'header';
  }

  function normalizeOAuth1AddAuthDataTo(value) {
    const normalized = String(value || '').trim().toLowerCase().replace(/[\s_/-]+/g, '');
    if (normalized === 'header' || normalized === 'headers' || normalized === 'requestheaders') {
      return 'header';
    }
    if (normalized === 'queryorbody'
      || normalized === 'bodyorquery'
      || normalized === 'requestbodyrequesturl'
      || normalized === 'requesturlrequestbody'
      || normalized === 'bodyurl'
      || normalized === 'urlbody'
      || normalized === 'query'
      || normalized === 'url'
      || normalized === 'body') {
      return 'queryOrBody';
    }
    return 'header';
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
      oauth1SignatureMethod: 'HMAC-SHA1',
      oauth1ConsumerKey: '',
      oauth1ConsumerSecret: '',
      oauth1Token: '',
      oauth1TokenSecret: '',
      oauth1PrivateKey: '',
      oauth1AddAuthDataTo: 'header',
      oauth1Callback: '',
      oauth1Verifier: '',
      oauth1Timestamp: '',
      oauth1Nonce: '',
      oauth1Version: '1.0',
      oauth1Realm: '',
      oauth1IncludeBodyHash: false,
      oauth1AddEmptyParamsToSign: false,
      digestUsername: '',
      digestPassword: '',
      digestDisableRetryingRequest: false,
      digestRealm: '',
      digestNonce: '',
      digestAlgorithm: 'MD5',
      digestQop: 'auth',
      digestNonceCount: '',
      digestClientNonce: '',
      digestOpaque: '',
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
    if (normalized.type === 'digest') {
      state.digestUsername = normalized.username;
      state.digestPassword = normalized.password;
      state.digestDisableRetryingRequest = normalized.disableRetryingRequest;
      state.digestRealm = normalized.realm;
      state.digestNonce = normalized.nonce;
      state.digestAlgorithm = normalized.algorithm;
      state.digestQop = normalized.qop;
      state.digestNonceCount = normalized.nonceCount;
      state.digestClientNonce = normalized.clientNonce;
      state.digestOpaque = normalized.opaque;
      return state;
    }
    if (normalized.type === 'oauth1') {
      state.oauth1SignatureMethod = normalized.signatureMethod;
      state.oauth1ConsumerKey = normalized.consumerKey;
      state.oauth1ConsumerSecret = normalized.consumerSecret;
      state.oauth1Token = normalized.token;
      state.oauth1TokenSecret = normalized.tokenSecret;
      state.oauth1PrivateKey = normalized.privateKey;
      state.oauth1AddAuthDataTo = normalized.addAuthDataTo;
      state.oauth1Callback = normalized.callback;
      state.oauth1Verifier = normalized.verifier;
      state.oauth1Timestamp = normalized.timestamp;
      state.oauth1Nonce = normalized.nonce;
      state.oauth1Version = normalized.version;
      state.oauth1Realm = normalized.realm;
      state.oauth1IncludeBodyHash = normalized.includeBodyHash;
      state.oauth1AddEmptyParamsToSign = normalized.addEmptyParamsToSign;
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
    if (type === 'autoRefresh') {
      return { type };
    }
    if (type === 'autoRefreshRefreshToken') {
      return { type };
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
    if (type === 'digest') {
      return normalizeAuth({
        type,
        username: state.digestUsername ?? '',
        password: state.digestPassword ?? '',
        disableRetryingRequest: state.digestDisableRetryingRequest === true,
        realm: state.digestRealm ?? '',
        nonce: state.digestNonce ?? '',
        algorithm: state.digestAlgorithm ?? 'MD5',
        qop: state.digestQop ?? '',
        nonceCount: state.digestNonceCount ?? '',
        clientNonce: state.digestClientNonce ?? '',
        opaque: state.digestOpaque ?? ''
      });
    }
    if (type === 'oauth1') {
      return normalizeAuth({
        type,
        signatureMethod: state.oauth1SignatureMethod ?? 'HMAC-SHA1',
        consumerKey: state.oauth1ConsumerKey ?? '',
        consumerSecret: state.oauth1ConsumerSecret ?? '',
        token: state.oauth1Token ?? '',
        tokenSecret: state.oauth1TokenSecret ?? '',
        privateKey: state.oauth1PrivateKey ?? '',
        addAuthDataTo: state.oauth1AddAuthDataTo ?? 'header',
        callback: state.oauth1Callback ?? '',
        verifier: state.oauth1Verifier ?? '',
        timestamp: state.oauth1Timestamp ?? '',
        nonce: state.oauth1Nonce ?? '',
        version: state.oauth1Version ?? '1.0',
        realm: state.oauth1Realm ?? '',
        includeBodyHash: state.oauth1IncludeBodyHash === true,
        addEmptyParamsToSign: state.oauth1AddEmptyParamsToSign === true
      });
    }
    if (['hawk', 'aws', 'ntlm', 'akamaiEdgeGrid', 'jwtBearer', 'asap'].includes(type)) {
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
    OAUTH1_ADD_AUTH_DATA_TO,
    OAUTH1_ADD_AUTH_DATA_TO_VALUES,
    OAUTH1_SIGNATURE_METHODS,
    OAUTH1_SIGNATURE_METHOD_VALUES,
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
