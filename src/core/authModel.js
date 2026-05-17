(function attachAuthModel(global) {
  const {
    API_KEY_LOCATIONS: API_KEY_LOCATION_VALUES,
    AUTH_TYPE_VALUES,
    OAUTH1_ADD_AUTH_DATA_TO: OAUTH1_ADD_AUTH_DATA_TO_VALUES,
    OAUTH1_SIGNATURE_METHODS: OAUTH1_SIGNATURE_METHOD_VALUES,
    OAUTH2_ADD_AUTH_DATA_TO: OAUTH2_ADD_AUTH_DATA_TO_VALUES,
    OAUTH2_CODE_CHALLENGE_METHODS: OAUTH2_CODE_CHALLENGE_METHOD_VALUES,
    OAUTH2_CLIENT_AUTHENTICATION: OAUTH2_CLIENT_AUTHENTICATION_VALUES,
    OAUTH2_GRANT_TYPES: OAUTH2_GRANT_TYPE_VALUES,
    OAUTH2_REDIRECT_STRATEGIES: OAUTH2_REDIRECT_STRATEGY_VALUES,
    OAUTH2_TOKEN_TYPES: OAUTH2_TOKEN_TYPE_VALUES,
    normalizeSchemaEnumValue
  } = resolvePayloadSchemas(global);

  const AUTH_TYPES = new Set(AUTH_TYPE_VALUES);
  const API_KEY_LOCATIONS = new Set(API_KEY_LOCATION_VALUES);
  const OAUTH1_ADD_AUTH_DATA_TO = new Set(OAUTH1_ADD_AUTH_DATA_TO_VALUES);
  const OAUTH1_SIGNATURE_METHODS = new Set(OAUTH1_SIGNATURE_METHOD_VALUES);
  const OAUTH2_ADD_AUTH_DATA_TO = new Set(OAUTH2_ADD_AUTH_DATA_TO_VALUES);
  const OAUTH2_CODE_CHALLENGE_METHODS = new Set(OAUTH2_CODE_CHALLENGE_METHOD_VALUES);
  const OAUTH2_CLIENT_AUTHENTICATION = new Set(OAUTH2_CLIENT_AUTHENTICATION_VALUES);
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
      const redirectUri = auth.redirectUri ?? auth.callbackUrl ?? auth.callbackURL ?? '';
      const tokenType = normalizeSchemaEnumValue('oauth2TokenTypes', auth.tokenType, 'Bearer');
      return {
        type,
        tokenType,
        headerPrefix: auth.headerPrefix ?? tokenType,
        tokenName: auth.tokenName ?? '',
        addAuthDataTo: normalizeOAuth2AddAuthDataTo(auth.addAuthDataTo ?? auth.addAuthorizationDataTo ?? auth.addTokenTo),
        accessToken: auth.accessToken ?? '',
        refreshToken: auth.refreshToken ?? '',
        autoRefreshToken: auth.autoRefreshToken == null ? true : authBoolean(auth.autoRefreshToken),
        shareToken: authBoolean(auth.shareToken),
        tokenUrl: auth.tokenUrl ?? auth.accessTokenUrl ?? '',
        refreshTokenUrl: auth.refreshTokenUrl ?? '',
        authorizationUrl: auth.authorizationUrl ?? auth.authUrl ?? '',
        deviceAuthorizationUrl: auth.deviceAuthorizationUrl ?? '',
        clientId: auth.clientId ?? '',
        clientSecret: auth.clientSecret ?? '',
        username: auth.username ?? '',
        password: auth.password ?? '',
        scopes: auth.scopes ?? auth.scope ?? '',
        state: auth.state ?? '',
        codeChallengeMethod: normalizeOAuth2CodeChallengeMethod(auth.codeChallengeMethod),
        codeVerifier: auth.codeVerifier ?? '',
        authorizeUsingBrowser: authBoolean(auth.authorizeUsingBrowser ?? auth.useBrowser),
        clientAuthentication: normalizeOAuth2ClientAuthentication(auth.clientAuthentication ?? auth.client_authentication),
        authRequestParams: normalizeOAuth2ParamList(auth.authRequestParams),
        tokenRequestParams: normalizeOAuth2ParamList(auth.tokenRequestParams, true),
        refreshRequestParams: normalizeOAuth2ParamList(auth.refreshRequestParams, true),
        grantType: normalizeOAuth2GrantType(auth.grantType),
        redirectStrategy: normalizeSchemaEnumValue('oauth2RedirectStrategies', auth.redirectStrategy, 'loopback'),
        redirectUri,
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
        algorithm: normalizeHawkAlgorithm(auth.algorithm),
        user: auth.user ?? '',
        nonce: auth.nonce ?? '',
        extraData: auth.extraData ?? auth.ext ?? '',
        app: auth.app ?? '',
        delegation: auth.delegation ?? auth.dlg ?? '',
        timestamp: auth.timestamp ?? auth.ts ?? '',
        includePayloadHash: authBoolean(
          auth.includePayloadHash
          ?? auth.includePayloadHas
          ?? auth.payloadHash
          ?? auth.includeBodyHash
        )
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
    if (lowered === 'hawk' || lowered === 'hawkauth' || lowered === 'hawkauthentication') {
      return 'hawk';
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

  function normalizeHawkAlgorithm(value) {
    const label = String(value ?? '').trim();
    const normalized = label.toLowerCase().replace(/[\s_-]+/g, '');
    if (!normalized || normalized === 'sha256') {
      return 'sha256';
    }
    if (normalized === 'sha1') {
      return 'sha1';
    }
    return label;
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

  function normalizeOAuth2AddAuthDataTo(value) {
    const normalized = String(value || '').trim().toLowerCase().replace(/[\s_/-]+/g, '');
    if (normalized === 'query' || normalized === 'url' || normalized === 'requesturl') {
      return 'query';
    }
    return OAUTH2_ADD_AUTH_DATA_TO.has(value) ? value : 'header';
  }

  function normalizeOAuth2ClientAuthentication(value) {
    const normalized = String(value || '').trim().toLowerCase().replace(/[\s_/-]+/g, '');
    if (normalized === 'basic' || normalized === 'basicauth' || normalized === 'sendasbasicauthheader') {
      return 'basic';
    }
    if (normalized === 'body' || normalized === 'requestbody' || normalized === 'sendclientcredentialsinbody') {
      return 'body';
    }
    return OAUTH2_CLIENT_AUTHENTICATION.has(value) ? value : 'basic';
  }

  function normalizeOAuth2GrantType(value) {
    const normalized = String(value || '').trim().toLowerCase().replace(/[\s_/-]+/g, '');
    if (normalized === 'authorizationcodewithpkce' || normalized === 'authorizationcodepkce') {
      return 'authorizationCodePkce';
    }
    if (normalized === 'clientcredentials' || normalized === 'clientcredential') {
      return 'clientCredentials';
    }
    if (normalized === 'passwordcredentials' || normalized === 'passwordcredential' || normalized === 'password') {
      return 'passwordCredentials';
    }
    if (normalized === 'devicecode') {
      return 'deviceCode';
    }
    if (normalized === 'implicit') {
      return 'implicit';
    }
    return normalizeSchemaEnumValue('oauth2GrantTypes', value, 'authorizationCode');
  }

  function normalizeOAuth2CodeChallengeMethod(value) {
    if (value === 'plain') {
      return 'plain';
    }
    return OAUTH2_CODE_CHALLENGE_METHODS.has(value) ? value : 'S256';
  }

  function normalizeOAuth2ParamList(value, includeSendIn = false) {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .filter((item) => item && typeof item === 'object')
      .map((item) => {
        const normalized = {
          enabled: item.enabled !== false,
          key: item.key ?? '',
          value: item.value ?? ''
        };
        if (includeSendIn) {
          normalized.sendIn = normalizeOAuth2ParamSendIn(item.sendIn);
        }
        return normalized;
      });
  }

  function normalizeOAuth2ParamSendIn(value) {
    return String(value || '').trim().toLowerCase() === 'header' ? 'header' : 'body';
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
      oauthHeaderPrefix: 'Bearer',
      oauthTokenName: '',
      oauthAddAuthDataTo: 'header',
      oauthAccessToken: '',
      oauthRefreshToken: '',
      oauthAutoRefreshToken: true,
      oauthShareToken: false,
      oauthAuthorizationUrl: '',
      oauthCallbackUrl: '',
      oauthAuthorizeUsingBrowser: false,
      oauthRedirectStrategy: 'loopback',
      oauthDeviceAuthorizationUrl: '',
      oauthTokenUrl: '',
      oauthRefreshTokenUrl: '',
      oauthClientId: '',
      oauthClientSecret: '',
      oauthUsername: '',
      oauthPassword: '',
      oauthScopes: '',
      oauthState: '',
      oauthCodeChallengeMethod: 'S256',
      oauthCodeVerifier: '',
      oauthClientAuthentication: 'basic',
      oauthAuthRequestParamKey: '',
      oauthAuthRequestParamValue: '',
      oauthTokenRequestParamKey: '',
      oauthTokenRequestParamValue: '',
      oauthTokenRequestParamSendIn: 'body',
      oauthRefreshRequestParamKey: '',
      oauthRefreshRequestParamValue: '',
      oauthRefreshRequestParamSendIn: 'body',
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
      hawkAuthId: '',
      hawkAuthKey: '',
      hawkAlgorithm: 'sha256',
      hawkUser: '',
      hawkNonce: '',
      hawkExtraData: '',
      hawkApp: '',
      hawkDelegation: '',
      hawkTimestamp: '',
      hawkIncludePayloadHash: false,
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
      state.oauthHeaderPrefix = normalized.headerPrefix;
      state.oauthTokenName = normalized.tokenName;
      state.oauthAddAuthDataTo = normalized.addAuthDataTo;
      state.oauthAccessToken = normalized.accessToken;
      state.oauthRefreshToken = normalized.refreshToken;
      state.oauthAutoRefreshToken = normalized.autoRefreshToken;
      state.oauthShareToken = normalized.shareToken;
      state.oauthAuthorizationUrl = normalized.authorizationUrl;
      state.oauthCallbackUrl = normalized.redirectUri;
      state.oauthAuthorizeUsingBrowser = normalized.authorizeUsingBrowser;
      state.oauthRedirectStrategy = normalized.redirectStrategy;
      state.oauthDeviceAuthorizationUrl = normalized.deviceAuthorizationUrl;
      state.oauthTokenUrl = normalized.tokenUrl;
      state.oauthRefreshTokenUrl = normalized.refreshTokenUrl;
      state.oauthClientId = normalized.clientId;
      state.oauthClientSecret = normalized.clientSecret;
      state.oauthUsername = normalized.username;
      state.oauthPassword = normalized.password;
      state.oauthScopes = normalized.scopes;
      state.oauthState = normalized.state;
      state.oauthCodeChallengeMethod = normalized.codeChallengeMethod;
      state.oauthCodeVerifier = normalized.codeVerifier;
      state.oauthClientAuthentication = normalized.clientAuthentication;
      const authRequestParam = normalized.authRequestParams[0] || {};
      const tokenRequestParam = normalized.tokenRequestParams[0] || {};
      const refreshRequestParam = normalized.refreshRequestParams[0] || {};
      state.oauthAuthRequestParamKey = authRequestParam.key ?? '';
      state.oauthAuthRequestParamValue = authRequestParam.value ?? '';
      state.oauthTokenRequestParamKey = tokenRequestParam.key ?? '';
      state.oauthTokenRequestParamValue = tokenRequestParam.value ?? '';
      state.oauthTokenRequestParamSendIn = tokenRequestParam.sendIn || 'body';
      state.oauthRefreshRequestParamKey = refreshRequestParam.key ?? '';
      state.oauthRefreshRequestParamValue = refreshRequestParam.value ?? '';
      state.oauthRefreshRequestParamSendIn = refreshRequestParam.sendIn || 'body';
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
    if (normalized.type === 'hawk') {
      state.hawkAuthId = normalized.authId;
      state.hawkAuthKey = normalized.authKey;
      state.hawkAlgorithm = normalized.algorithm;
      state.hawkUser = normalized.user;
      state.hawkNonce = normalized.nonce;
      state.hawkExtraData = normalized.extraData;
      state.hawkApp = normalized.app;
      state.hawkDelegation = normalized.delegation;
      state.hawkTimestamp = normalized.timestamp;
      state.hawkIncludePayloadHash = normalized.includePayloadHash;
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
        headerPrefix: state.oauthHeaderPrefix ?? state.oauthTokenType ?? 'Bearer',
        tokenName: state.oauthTokenName ?? '',
        addAuthDataTo: state.oauthAddAuthDataTo ?? 'header',
        accessToken: state.oauthAccessToken ?? '',
        refreshToken: state.oauthRefreshToken ?? '',
        autoRefreshToken: state.oauthAutoRefreshToken !== false,
        shareToken: state.oauthShareToken === true,
        authorizationUrl: state.oauthAuthorizationUrl ?? '',
        deviceAuthorizationUrl: state.oauthDeviceAuthorizationUrl ?? '',
        tokenUrl: state.oauthTokenUrl ?? '',
        refreshTokenUrl: state.oauthRefreshTokenUrl ?? '',
        clientId: state.oauthClientId ?? '',
        clientSecret: state.oauthClientSecret ?? '',
        username: state.oauthUsername ?? '',
        password: state.oauthPassword ?? '',
        scopes: state.oauthScopes ?? '',
        state: state.oauthState ?? '',
        codeChallengeMethod: state.oauthCodeChallengeMethod ?? 'S256',
        codeVerifier: state.oauthCodeVerifier ?? '',
        authorizeUsingBrowser: state.oauthAuthorizeUsingBrowser === true,
        clientAuthentication: state.oauthClientAuthentication ?? 'basic',
        authRequestParams: editorOAuth2Params(state.oauthAuthRequestParamKey, state.oauthAuthRequestParamValue),
        tokenRequestParams: editorOAuth2Params(state.oauthTokenRequestParamKey, state.oauthTokenRequestParamValue, state.oauthTokenRequestParamSendIn),
        refreshRequestParams: editorOAuth2Params(state.oauthRefreshRequestParamKey, state.oauthRefreshRequestParamValue, state.oauthRefreshRequestParamSendIn),
        grantType,
        redirectStrategy: state.oauthRedirectStrategy,
        redirectUri: state.oauthCallbackUrl ?? (keepExistingOauthState ? normalizedExisting.redirectUri : ''),
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
    if (type === 'hawk') {
      return normalizeAuth({
        type,
        authId: state.hawkAuthId ?? '',
        authKey: state.hawkAuthKey ?? '',
        algorithm: state.hawkAlgorithm ?? 'sha256',
        user: state.hawkUser ?? '',
        nonce: state.hawkNonce ?? '',
        extraData: state.hawkExtraData ?? '',
        app: state.hawkApp ?? '',
        delegation: state.hawkDelegation ?? '',
        timestamp: state.hawkTimestamp ?? '',
        includePayloadHash: state.hawkIncludePayloadHash === true
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
    if (['aws', 'ntlm', 'akamaiEdgeGrid', 'jwtBearer', 'asap'].includes(type)) {
      const existing = normalizeAuth(existingAuth);
      return normalizeAuth(existing.type === type ? existing : { type });
    }
    return { type: 'none' };
  }

  function editorOAuth2Params(key, value, sendIn = null) {
    if (!key && !value) {
      return [];
    }
    const param = {
      enabled: true,
      key: key ?? '',
      value: value ?? ''
    };
    if (sendIn != null) {
      param.sendIn = normalizeOAuth2ParamSendIn(sendIn);
    }
    return [param];
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
    OAUTH2_ADD_AUTH_DATA_TO,
    OAUTH2_ADD_AUTH_DATA_TO_VALUES,
    OAUTH2_CODE_CHALLENGE_METHODS,
    OAUTH2_CODE_CHALLENGE_METHOD_VALUES,
    OAUTH2_CLIENT_AUTHENTICATION,
    OAUTH2_CLIENT_AUTHENTICATION_VALUES,
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
