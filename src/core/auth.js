const crypto = require('node:crypto');
const { resolveEnvironmentValue } = require('./environmentResolver');
const {
  API_KEY_LOCATIONS,
  AUTH_TYPES,
  OAUTH2_GRANT_TYPES,
  OAUTH2_REDIRECT_STRATEGIES,
  OAUTH2_TOKEN_TYPES,
  normalizeAuth
} = require('./authModel');
const {
  redactRequestResponseAliasesInText,
  redactTransportReferences
} = require('./diagnostics');

const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const OAUTH_REFRESH_WINDOW_MILLIS = 60_000;
const OAUTH_DEVICE_DEFAULT_EXPIRES_IN_SECONDS = 900;
const OAUTH_DEVICE_DEFAULT_INTERVAL_SECONDS = 5;
const OAUTH_DEVICE_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code';
const OAUTH_PKCE_CODE_VERIFIER_BYTES = 32;
const OAUTH_PKCE_STATE_BYTES = 24;
const OAUTH_REDACTED_VALUE = '[redacted]';
const OAUTH_AUTH_SCHEME_NAMES = 'Bearer|Basic|Digest|Hawk|Token|OAuth|NTLM|Negotiate|AWS4-HMAC-SHA256|EG1-HMAC-SHA256';
const OAUTH_SECRET_FIELD_NAMES = [
  'token',
  'secret',
  'cookie',
  'cookieHeader',
  'cookie_header',
  'cookie-header',
  'set-cookie',
  'set_cookie',
  'setCookieHeader',
  'set_cookie_header',
  'set-cookie-header',
  'access_token',
  'accessToken',
  'refresh_token',
  'refreshToken',
  'id_token',
  'idToken',
  'jwt_token',
  'jwtToken',
  'jwt-token',
  'csrf_token',
  'csrfToken',
  'csrf-token',
  'xsrf_token',
  'xsrfToken',
  'xsrf-token',
  'x_api_key',
  'xApiKey',
  'x-api-key',
  'x_access_token',
  'xAccessToken',
  'x-access-token',
  'x_auth_token',
  'xAuthToken',
  'x-auth-token',
  'x_authorization_token',
  'xAuthorizationToken',
  'x-authorization-token',
  'x_csrf_token',
  'xCsrfToken',
  'x-csrf-token',
  'x_xsrf_token',
  'xXsrfToken',
  'x-xsrf-token',
  'auth_token',
  'authToken',
  'auth-token',
  'authentication_token',
  'authenticationToken',
  'authentication-token',
  'authorization_token',
  'authorizationToken',
  'authorization-token',
  'bearer_token',
  'bearerToken',
  'bearer-token',
  'client_token',
  'clientToken',
  'client-token',
  'oauth_token',
  'oauthToken',
  'oauth-token',
  'client_secret',
  'clientSecret',
  'client-secret',
  'client_assertion',
  'clientAssertion',
  'client-assertion',
  'code',
  'authorization_code',
  'authorizationCode',
  'authorization-code',
  'code_verifier',
  'codeVerifier',
  'code-verifier',
  'device_code',
  'deviceCode',
  'device-code',
  'user_code',
  'userCode',
  'user-code',
  'session_token',
  'sessionToken',
  'session-token',
  'api_key',
  'apiKey',
  'api-key',
  'api_secret',
  'apiSecret',
  'api-secret',
  'secret_key',
  'secretKey',
  'secret-key',
  'subscription_key',
  'subscriptionKey',
  'subscription-key',
  'Ocp-Apim-Subscription-Key',
  'ocp_apim_subscription_key',
  'ocpApimSubscriptionKey',
  'access_key',
  'accessKey',
  'access-key',
  'access_key_id',
  'accessKeyId',
  'access-key-id',
  'secret_access_key',
  'secretAccessKey',
  'secret-access-key',
  'shared_access_key',
  'sharedAccessKey',
  'shared-access-key',
  'account_key',
  'accountKey',
  'account-key',
  'storage_key',
  'storageKey',
  'storage-key',
  'signing_key',
  'signingKey',
  'signing-key',
  'webhook_key',
  'webhookKey',
  'webhook-key',
  'license_key',
  'licenseKey',
  'license-key',
  'public_key',
  'publicKey',
  'public-key',
  'consumer_key',
  'consumerKey',
  'consumer-key',
  'consumer_secret',
  'consumerSecret',
  'consumer-secret',
  'oauth_consumer_key',
  'oauthConsumerKey',
  'oauth-consumer-key',
  'oauth_consumer_secret',
  'oauthConsumerSecret',
  'oauth-consumer-secret',
  'password',
  'passwd',
  'passphrase',
  'credential',
  'credentials',
  'x-amz-signature',
  'x_amz_signature',
  'xAmzSignature',
  'x-amz-credential',
  'x_amz_credential',
  'xAmzCredential',
  'x-amz-security-token',
  'x_amz_security_token',
  'xAmzSecurityToken',
  'aws_signature',
  'awsSignature',
  'aws-signature',
  'aws_credential',
  'awsCredential',
  'aws-credential',
  'oauth_signature',
  'oauthSignature',
  'oauth-signature',
  'signature',
  'mac',
  'authorization',
  'authorization_header',
  'authorizationHeader',
  'auth-header',
  'auth_header',
  'authHeader',
  'proxy-authorization',
  'proxy_authorization',
  'proxyAuthorization',
  'proxy-authorization-header',
  'proxy_authorization_header',
  'proxyAuthorizationHeader'
];
const OAUTH_AUTHORIZATION_HEADER_PATTERN = new RegExp(String.raw`\b((?:(?:Proxy[-_]?Authorization|Authorization)(?:[-_]?Header)?|Auth[-_]?Header))(\s*[:=]\s*)(["']?)(?!(?:(?:${OAUTH_AUTH_SCHEME_NAMES})\s+)?(?:\[redacted\]|redacted)\3?(?=\s|[;,.)\]]|$))(?:(?:${OAUTH_AUTH_SCHEME_NAMES})\s+)?(?:[A-Za-z][A-Za-z0-9_-]*\s*=\s*(?:"(?:\\.|[^"\\\r\n<>])*"|'(?:\\.|[^'\\\r\n<>])*'|[^\s"',;<>}\])]+)|"(?:\\.|[^"\\\r\n<>])*"|'(?:\\.|[^'\\\r\n<>])*'|[^\s"',;<>}\])]+)(?:\s*[,;]\s*[A-Za-z][A-Za-z0-9_-]*\s*=\s*(?:"(?:\\.|[^"\\\r\n<>])*"|'(?:\\.|[^'\\\r\n<>])*'|[^\s"',;<>}\])]+))*\3?`, 'gi');
const OAUTH_SECRET_TEXT_FIELD_NAME_PATTERN = /(?<![A-Za-z0-9_-])(["']?)(access[-_\s]*token|refresh[-_\s]*token|id[-_\s]*token|auth[-_\s]*token|authentication[-_\s]*token|authorization[-_\s]*token|bearer[-_\s]*token|client[-_\s]*token|oauth[-_\s]*token|csrf[-_\s]*token|xsrf[-_\s]*token|jwt[-_\s]*token|[A-Za-z][A-Za-z0-9]{0,80}[-_\s]*(?:token|secret|password|passwd|passphrase|credential|credentials)|x[-_\s]*(?:api[-_\s]*key|access[-_\s]*token|auth[-_\s]*token|authorization[-_\s]*token|csrf[-_\s]*token|xsrf[-_\s]*token)|client[-_\s]*secret|client[-_\s]*assertion|authorization[-_\s]*code|code[-_\s]*verifier|device[-_\s]*code|user[-_\s]*code|auth[-_\s]*header|authorization[-_\s]*header|proxy[-_\s]*authorization[-_\s]*header|proxy[-_\s]*authorization|authorization|session[-_\s]*(?:token|id)|api[-_\s]*(?:key|secret)|secret[-_\s]*(?:key|access[-_\s]*key)|subscription[-_\s]*key|ocp[-_\s]*apim[-_\s]*subscription[-_\s]*key|access[-_\s]*key(?:[-_\s]*id)?|shared[-_\s]*access[-_\s]*key|(?:account|consumer|license|public|private|signing|storage|webhook)[-_\s]*key(?:[-_\s]*id)?|consumer[-_\s]*(?:key|secret)|oauth[-_\s]*consumer[-_\s]*(?:key|secret)|x[-_\s]*amz[-_\s]*credential|x[-_\s]*amz[-_\s]*signature|x[-_\s]*amz[-_\s]*security[-_\s]*token|aws[-_\s]*credential|aws[-_\s]*signature|oauth[-_\s]*signature|cert(?:ificate)?[-_\s]*passphrase|private[-_\s]*key|secret[-_\s]*value|signature|mac|token|secret|password|passwd|passphrase|credential|credentials|cookie[-_\s]*header|cookieHeader|set[-_\s]*cookie[-_\s]*header|setCookieHeader|cookie|set[-_\s]*cookie|code|state)\1(\s*[:=]\s*)/gi;
const OAUTH_COOKIE_HEADER_START_PATTERN = /\b((?:Set[-_]?Cookie|Cookie)(?:[-_]?Header)?)(\s*:\s*)/gi;
const OAUTH_COOKIE_BARE_START_PATTERN = /\b((?:Set[-_]?Cookie|Cookie)(?:[-_]?Header)?)(\s+)(?!(?:authentication|authenticated|auth|jar|jars|handling|handler|helpers?|access|disabled|enabled|unavailable|available|failed|failure|required|provider|returned|setting|settings|policy|policies|headers?|values?|metadata)\b)(?=[^\r\n"'<>]{1,2048}=)/gi;
const OAUTH_COOKIE_SAFE_CONTEXT_BOUNDARY_PATTERN = /\s+(?=(?:OAuth\s+2\.0\b|token\s+endpoint\b|provider\s+(?:returned|failed|denied|reported)\b|HTTP\s+\d{3}\b|status\s*[:=]?\s*\d{3}\b|error(?:[-_\s]*description)?\s*[:=]|Basic\s+authentication\b|Bearer\s+authentication\b|Digest\s+auth\b|authentication\s+(?:failed|required)\b))/i;
const OAUTH_BARE_SECRET_LABEL_NAMES = String.raw`access[-_\s]*token|refresh[-_\s]*token|id[-_\s]*token|csrf[-_\s]*token|xsrf[-_\s]*token|jwt[-_\s]*token|[A-Za-z][A-Za-z0-9]{0,80}[-_\s]*(?:token|secret|password|passwd|passphrase|credential|credentials)|x[-_\s]*(?:api[-_\s]*key|access[-_\s]*token|auth[-_\s]*token|authorization[-_\s]*token|csrf[-_\s]*token|xsrf[-_\s]*token)|client[-_\s]*secret|client[-_\s]*assertion|authorization[-_\s]*code|code[-_\s]*verifier|device[-_\s]*code|user[-_\s]*code|api[-_\s]*(?:key|secret)|secret[-_\s]*(?:key|access[-_\s]*key)|subscription[-_\s]*key|ocp[-_\s]*apim[-_\s]*subscription[-_\s]*key|access[-_\s]*key(?:[-_\s]*id)?|shared[-_\s]*access[-_\s]*key|(?:account|consumer|license|public|private|signing|storage|webhook)[-_\s]*key(?:[-_\s]*id)?|consumer[-_\s]*(?:key|secret)|oauth[-_\s]*consumer[-_\s]*(?:key|secret)|session[-_\s]*(?:token|id)|auth[-_\s]*header|authorization[-_\s]*header|proxy[-_\s]*authorization(?:[-_\s]*header)?|cert(?:ificate)?[-_\s]*passphrase|private[-_\s]*key|secret[-_\s]*value|password|passwd|passphrase|credential|credentials|token|secret`;
const OAUTH_BARE_SECRET_LABEL_SAFE_WORDS = String.raw`is|are|was|were|be|must|should|may|can|cannot|not|endpoint|auth|authentication|authenticated|required|provider|returned|failed|failure|missing|empty|unset|invalid|expired|denied|enabled|disabled|available|unavailable|username|bearer|basic|digest|hawk|oauth|ntlm|negotiate|status|code|flow|grant|scope|scopes|setting|settings|policy|policies|field|fields|value|values|metadata|header|headers|cookie|cookies|jar`;
const OAUTH_BARE_SAFE_WORD_FOLLOW_PATTERN = String.raw`(?:\s|$|[.,;:!?)}\]])`;
const OAUTH_BARE_SECRET_LABEL_PATTERN = new RegExp(String.raw`(?<![A-Za-z0-9_-])(${OAUTH_BARE_SECRET_LABEL_NAMES})(\s+)(?!\[redacted\]|redacted\b)(?!(?:${OAUTH_BARE_SECRET_LABEL_SAFE_WORDS})${OAUTH_BARE_SAFE_WORD_FOLLOW_PATTERN})[A-Za-z0-9._~+/=-]{4,}`, 'gi');
const OAUTH_AWS_QUERY_FIELD_PATTERN = /\b((?:x[-_]?amz[-_]?credential|x[-_]?amz[-_]?signature|x[-_]?amz[-_]?security[-_]?token|aws[-_]?credential|aws[-_]?signature))(\s*[:=]\s*["']?)[^\s&"',;<>}\])]+/gi;
const OAUTH_REQUEST_RESPONSE_FIELD_NAMES = String.raw`request[-_\s]*body(?:[-_\s]*text)?|response[-_\s]*body(?:[-_\s]*text)?|body[-_\s]*preview|rendered[-_\s]*response(?:[-_\s]*text)?|response[-_\s]*text|graphql[-_\s]*variables|form[-_\s]*data(?:[-_\s]*parts)?|protocol[-_\s]*messages?|grpc[-_\s]*messages?|websocket[-_\s]*messages?|socketio[-_\s]*messages?|console[-_\s]*output|script[-_\s]*console|script[-_\s]*logs?|payload[-_\s]*derived[-_\s]*identifier|payload[-_\s]*identifier|request[-_\s]*id[-_\s]*from[-_\s]*payload|id[-_\s]*from[-_\s]*payload|variables|body|data|text`;
const OAUTH_REQUEST_RESPONSE_FIELD_NAME_PATTERN = new RegExp(String.raw`(?<![A-Za-z0-9_-])(["']?)(${OAUTH_REQUEST_RESPONSE_FIELD_NAMES})\1(\s*[:=]\s*)`, 'gi');
const OAUTH_REQUEST_RESPONSE_BARE_FIELD_TERMINATOR_PATTERN = String.raw`(?=\s+(?:${OAUTH_REQUEST_RESPONSE_FIELD_NAMES})\b|[\r\n;,.]|$)`;
const OAUTH_REQUEST_RESPONSE_BARE_FIELD_PATTERN = new RegExp(String.raw`(?<![A-Za-z0-9_-])(${OAUTH_REQUEST_RESPONSE_FIELD_NAMES})(\s+)(?!\[redacted\]|redacted\b)(?!(?:${OAUTH_BARE_SECRET_LABEL_SAFE_WORDS})${OAUTH_BARE_SAFE_WORD_FOLLOW_PATTERN})([^\r\n;,.]*?)${OAUTH_REQUEST_RESPONSE_BARE_FIELD_TERMINATOR_PATTERN}`, 'gi');
const OAUTH_AUTH_SCHEME_START_PATTERN = String.raw`(?<![A-Za-z0-9_-])`;
const OAUTH_COMPOUND_AUTH_SCHEME_PATTERN = new RegExp(String.raw`${OAUTH_AUTH_SCHEME_START_PATTERN}(${OAUTH_AUTH_SCHEME_NAMES})\s+(?!\[redacted\]|redacted\b)(?:[A-Za-z][A-Za-z0-9_-]*\s*=\s*(?:"(?:\\.|[^"\\\r\n<>])*"|'(?:\\.|[^'\\\r\n<>])*'|[^\s"',;<>}\])]+))(?:\s*[,;]\s*[A-Za-z][A-Za-z0-9_-]*\s*=\s*(?:"(?:\\.|[^"\\\r\n<>])*"|'(?:\\.|[^'\\\r\n<>])*'|[^\s"',;<>}\])]+))*`, 'gi');
const OAUTH_ALREADY_REDACTED_AUTH_VALUE_PATTERN = new RegExp(String.raw`^(?:${OAUTH_AUTH_SCHEME_NAMES})\s+\[redacted\]$`, 'i');
const OAUTH_AUTH_SCHEME_SAFE_VALUE_PATTERN = String.raw`(?:2\.0|\[redacted\]|redacted|endpoint|app|application|auth|authentication|authenticated|token|bearer|basic|digest|hawk|oauth|ntlm|negotiate|username|required|provider|returned|failed|failure|missing|empty|unset|invalid|expired|denied|enabled|disabled|available|unavailable|status|code|flow|grant|scope|scopes|setting|settings|policy|policies|field|fields|value|values|metadata|header|headers|cookie|cookies|jar)(?=\s|$|[.,;:!?)}\]])`;
const OAUTH_TOKEN_AUTH_SCHEME_PATTERN = new RegExp(String.raw`${OAUTH_AUTH_SCHEME_START_PATTERN}(Bearer|Basic|Digest|Hawk|Token|OAuth|NTLM|Negotiate)\s+(?!(?:${OAUTH_AUTH_SCHEME_SAFE_VALUE_PATTERN}))[A-Za-z0-9._~+/=-]{1,}`, 'gi');
const DIGEST_SUPPORTED_ALGORITHMS = new Map([
  ['md5', 'md5'],
  ['md5-sess', 'md5'],
  ['sha-256', 'sha256'],
  ['sha-256-sess', 'sha256'],
  ['sha-512-256', 'sha512-256'],
  ['sha-512-256-sess', 'sha512-256']
]);
const AWS_ALGORITHM = 'AWS4-HMAC-SHA256';
const OAUTH1_SIGNATURE_METHODS = new Set([
  'HMAC-SHA1',
  'HMAC-SHA256',
  'HMAC-SHA512',
  'RSA-SHA1',
  'RSA-SHA256',
  'RSA-SHA512',
  'PLAINTEXT'
]);

function validateAuth(auth = {}, environment) {
  const normalized = normalizeAuth(auth);
  const errors = [];
  if (normalized.type === 'none') {
    return errors;
  }
  if (normalized.type === 'bearer') {
    requireResolved(normalized.token, environment, 'Bearer token', errors);
  } else if (normalized.type === 'basic') {
    requireResolved(normalized.username, environment, 'Basic auth username', errors);
  } else if (normalized.type === 'apiKey') {
    const key = requireResolved(normalized.key, environment, 'API key name', errors);
    requireResolved(normalized.value, environment, 'API key value', errors);
    if (normalized.location === 'header' && key && !HEADER_NAME.test(key)) {
      errors.push(`Invalid API key header name: ${key}.`);
    }
  } else if (normalized.type === 'cookie') {
    requireResolved(normalized.value, environment, 'Cookie value', errors);
  } else if (normalized.type === 'oauth2') {
    const accessToken = resolveEnvironmentValue(normalized.accessToken, environment).trim();
    if (accessToken) {
      return errors;
    }
    if (normalized.grantType === 'clientCredentials') {
      requireResolved(normalized.tokenUrl, environment, 'OAuth 2.0 token URL', errors);
      requireResolved(normalized.clientId, environment, 'OAuth 2.0 client ID', errors);
      requireResolved(normalized.clientSecret, environment, 'OAuth 2.0 client secret', errors);
    } else if (normalized.grantType === 'passwordCredentials') {
      requireResolved(normalized.tokenUrl, environment, 'OAuth 2.0 token URL', errors);
      requireResolved(normalized.username, environment, 'OAuth 2.0 username', errors);
      requireResolved(normalized.password, environment, 'OAuth 2.0 password', errors);
    } else if (normalized.grantType === 'deviceCode') {
      if (resolveEnvironmentValue(normalized.deviceCode, environment).trim()) {
        requireResolved(normalized.refreshTokenUrl || normalized.tokenUrl, environment, 'OAuth 2.0 token URL', errors);
        requireResolved(normalized.clientId, environment, 'OAuth 2.0 client ID', errors);
      } else {
        requireResolved(normalized.deviceAuthorizationUrl, environment, 'OAuth 2.0 device authorization URL', errors);
        requireResolved(normalized.tokenUrl, environment, 'OAuth 2.0 token URL', errors);
        requireResolved(normalized.clientId, environment, 'OAuth 2.0 client ID', errors);
        errors.push('Start and complete the OAuth 2.0 device-code flow before sending this request.');
      }
    } else if (normalized.grantType === 'implicit') {
      requireResolved(normalized.authorizationUrl, environment, 'OAuth 2.0 authorization URL', errors);
      requireResolved(normalized.clientId, environment, 'OAuth 2.0 client ID', errors);
      errors.push('Start and complete the OAuth 2.0 implicit flow before sending this request.');
    } else {
      const refreshToken = resolveEnvironmentValue(normalized.refreshToken, environment).trim();
      if (refreshToken) {
        requireResolved(normalized.refreshTokenUrl || normalized.tokenUrl, environment, 'OAuth 2.0 token URL', errors);
      } else {
        requireResolved(normalized.authorizationUrl, environment, 'OAuth 2.0 authorization URL', errors);
        requireResolved(normalized.tokenUrl, environment, 'OAuth 2.0 token URL', errors);
        requireResolved(normalized.clientId, environment, 'OAuth 2.0 client ID', errors);
        errors.push('Start and complete the OAuth 2.0 authorization-code flow before sending this request.');
      }
    }
  } else if (normalized.type === 'clientCertificate') {
    if (resolveEnvironmentValue(normalized.certificateId, environment).trim()) {
      return errors;
    }
    const pfxPath = resolveEnvironmentValue(normalized.pfxPath, environment).trim();
    const certPath = resolveEnvironmentValue(normalized.certPath, environment).trim();
    const keyPath = resolveEnvironmentValue(normalized.keyPath, environment).trim();
    if (pfxPath) {
      return errors;
    }
    if (!certPath && !keyPath) {
      errors.push('Client certificate auth requires a PEM certificate/key pair or a PFX/P12 bundle.');
    } else {
      if (!certPath) {
        errors.push('Client certificate PEM certificate path is required.');
      }
      if (!keyPath) {
        errors.push('Client certificate PEM key path is required.');
      }
    }
  } else if (normalized.type === 'digest') {
    requireResolved(normalized.username, environment, 'Digest auth username', errors);
    requireResolved(normalized.password, environment, 'Digest auth password', errors);
    const algorithm = normalizeDigestAlgorithm(resolveEnvironmentValue(normalized.algorithm, environment));
    if (!algorithm) {
      errors.push(`Unsupported Digest auth algorithm: ${normalized.algorithm}.`);
    }
  } else if (normalized.type === 'hawk') {
    requireResolved(normalized.authId, environment, 'Hawk auth ID', errors);
    requireResolved(normalized.authKey, environment, 'Hawk auth key', errors);
    const algorithm = normalizeHawkAlgorithm(resolveEnvironmentValue(normalized.algorithm, environment));
    if (!algorithm) {
      errors.push(`Unsupported Hawk auth algorithm: ${normalized.algorithm}.`);
    }
  } else if (normalized.type === 'aws') {
    requireResolved(normalized.accessKey, environment, 'AWS access key', errors);
    requireResolved(normalized.secretKey, environment, 'AWS secret key', errors);
    requireResolved(normalized.region, environment, 'AWS region', errors);
    requireResolved(normalized.service, environment, 'AWS service', errors);
  } else if (normalized.type === 'oauth1') {
    requireResolved(normalized.consumerKey, environment, 'OAuth 1.0 consumer key', errors);
    const signatureMethod = normalizeOAuth1SignatureMethod(resolveEnvironmentValue(normalized.signatureMethod, environment));
    if (!OAUTH1_SIGNATURE_METHODS.has(signatureMethod)) {
      errors.push(`Unsupported OAuth 1.0 signature method: ${normalized.signatureMethod}.`);
    } else if (signatureMethod.startsWith('RSA-')) {
      requireResolved(normalized.privateKey || normalized.consumerSecret, environment, 'OAuth 1.0 private key', errors);
    } else {
      requireResolved(normalized.consumerSecret, environment, 'OAuth 1.0 consumer secret', errors);
    }
  } else if (normalized.type === 'ntlm') {
    requireResolved(normalized.username, environment, 'NTLM auth username', errors);
    requireResolved(normalized.password, environment, 'NTLM auth password', errors);
  } else if (normalized.type === 'akamaiEdgeGrid') {
    requireResolved(normalized.accessToken, environment, 'Akamai EdgeGrid access token', errors);
    requireResolved(normalized.clientToken, environment, 'Akamai EdgeGrid client token', errors);
    requireResolved(normalized.clientSecret, environment, 'Akamai EdgeGrid client secret', errors);
  } else if (normalized.type === 'jwtBearer') {
    const algorithm = normalizeJwtAlgorithm(resolveEnvironmentValue(normalized.algorithm, environment));
    if (!algorithm) {
      errors.push(`Unsupported JWT Bearer algorithm: ${normalized.algorithm}.`);
    } else if (algorithm.startsWith('HS')) {
      requireResolved(normalized.secret, environment, 'JWT Bearer secret', errors);
    } else {
      requireResolved(normalized.privateKey, environment, 'JWT Bearer private key', errors);
    }
  } else if (normalized.type === 'asap') {
    const algorithm = normalizeJwtAlgorithm(resolveEnvironmentValue(normalized.algorithm, environment) || 'RS256');
    if (!algorithm) {
      errors.push(`Unsupported ASAP algorithm: ${normalized.algorithm}.`);
    } else if (algorithm.startsWith('HS')) {
      requireResolved(normalized.secret, environment, 'ASAP secret', errors);
    } else {
      requireResolved(normalized.privateKey, environment, 'ASAP private key', errors);
    }
    requireResolved(normalized.issuer, environment, 'ASAP issuer', errors);
    requireResolved(normalized.audience, environment, 'ASAP audience', errors);
  }
  return errors;
}

async function maybeRefreshOAuthToken(auth = {}, environment, options = {}) {
  const normalized = normalizeAuth(auth);
  if (normalized.type !== 'oauth2') {
    return { auth: normalized, refreshed: false };
  }
  if (normalized.autoRefreshToken === false) {
    return { auth: normalized, refreshed: false };
  }
  if (normalized.grantType === 'clientCredentials') {
    if (!shouldRequestClientCredentialsToken(normalized, environment, options.now)) {
      return { auth: normalized, refreshed: false };
    }
    return {
      auth: await requestOAuthClientCredentialsToken(normalized, environment, options),
      refreshed: true
    };
  }
  if (normalized.grantType === 'passwordCredentials') {
    if (!shouldRequestPasswordCredentialsToken(normalized, environment, options.now)) {
      return { auth: normalized, refreshed: false };
    }
    return {
      auth: await requestOAuthPasswordCredentialsToken(normalized, environment, options),
      refreshed: true
    };
  }
  if (normalized.grantType === 'deviceCode') {
    if (shouldRefreshOAuthToken(normalized, environment, options.now)) {
      return {
        auth: await refreshOAuthToken(normalized, environment, options),
        refreshed: true
      };
    }
    if (!shouldPollOAuthDeviceToken(normalized, environment, options.now)) {
      return { auth: normalized, refreshed: false };
    }
    return {
      auth: await pollOAuthDeviceToken(normalized, environment, options),
      refreshed: true
    };
  }
  if (!shouldRefreshOAuthToken(normalized, environment, options.now)) {
    return { auth: normalized, refreshed: false };
  }
  return {
    auth: await refreshOAuthToken(normalized, environment, options),
    refreshed: true
  };
}

async function refreshOAuthToken(auth = {}, environment, options = {}) {
  const normalized = normalizeAuth(auth);
  if (normalized.type !== 'oauth2') {
    throw new Error('OAuth 2.0 auth is required for token refresh.');
  }

  const tokenUrl = requireResolvedValue(normalized.refreshTokenUrl || normalized.tokenUrl, environment, 'OAuth 2.0 token URL');
  const refreshToken = requireResolvedValue(normalized.refreshToken, environment, 'OAuth 2.0 refresh token');
  const url = parseTokenUrl(tokenUrl);
  const body = new URLSearchParams();
  const headers = {};
  body.set('grant_type', 'refresh_token');
  body.set('refresh_token', refreshToken);

  const scopes = resolveEnvironmentValue(normalized.scopes, environment).trim();
  applyOAuth2ClientAuthentication(normalized, environment, body, headers);
  if (scopes) {
    body.set('scope', scopes);
  }
  applyOAuth2RequestParams(normalized.refreshRequestParams, environment, body, headers);

  const payload = await postOAuthTokenRequest(url, body, options, 'OAuth 2.0 token refresh', { headers });

  const tokenType = normalizeTokenType(payload.token_type || normalized.tokenType);
  return normalizeAuth({
    ...normalized,
    tokenType,
    headerPrefix: normalized.headerPrefix || tokenType,
    accessToken: String(payload.access_token),
    refreshToken: payload.refresh_token ? String(payload.refresh_token) : normalized.refreshToken,
    expiresAt: expiresAtFromPayload(payload, options.now)
  });
}

async function requestOAuthClientCredentialsToken(auth = {}, environment, options = {}) {
  const normalized = normalizeAuth(auth);
  if (normalized.type !== 'oauth2') {
    throw new Error('OAuth 2.0 auth is required for client credentials token requests.');
  }
  if (normalized.grantType !== 'clientCredentials') {
    throw new Error('OAuth 2.0 client credentials grant is required for client credentials token requests.');
  }

  const tokenUrl = requireResolvedValue(normalized.tokenUrl, environment, 'OAuth 2.0 token URL');
  const clientId = requireResolvedValue(normalized.clientId, environment, 'OAuth 2.0 client ID');
  requireResolvedValue(normalized.clientSecret, environment, 'OAuth 2.0 client secret');
  const scopes = resolveEnvironmentValue(normalized.scopes, environment).trim();
  const body = new URLSearchParams();
  const headers = {};
  body.set('grant_type', 'client_credentials');
  applyOAuth2ClientAuthentication({ ...normalized, clientId }, environment, body, headers);
  if (scopes) {
    body.set('scope', scopes);
  }
  applyOAuth2RequestParams(normalized.tokenRequestParams, environment, body, headers);

  const payload = await postOAuthTokenRequest(parseTokenUrl(tokenUrl), body, options, 'OAuth 2.0 client credentials token request', { headers });
  const tokenType = normalizeTokenType(payload.token_type || normalized.tokenType);
  return normalizeAuth({
    ...normalized,
    tokenType,
    headerPrefix: normalized.headerPrefix || tokenType,
    accessToken: String(payload.access_token),
    refreshToken: payload.refresh_token ? String(payload.refresh_token) : normalized.refreshToken,
    expiresAt: expiresAtFromPayload(payload, options.now)
  });
}

async function requestOAuthPasswordCredentialsToken(auth = {}, environment, options = {}) {
  const normalized = normalizeAuth(auth);
  if (normalized.type !== 'oauth2') {
    throw new Error('OAuth 2.0 auth is required for password credentials token requests.');
  }
  if (normalized.grantType !== 'passwordCredentials') {
    throw new Error('OAuth 2.0 password credentials grant is required for password credentials token requests.');
  }

  const tokenUrl = requireResolvedValue(normalized.tokenUrl, environment, 'OAuth 2.0 token URL');
  const username = requireResolvedValue(normalized.username, environment, 'OAuth 2.0 username');
  const password = requireResolvedValue(normalized.password, environment, 'OAuth 2.0 password');
  const scopes = resolveEnvironmentValue(normalized.scopes, environment).trim();
  const body = new URLSearchParams();
  const headers = {};
  body.set('grant_type', 'password');
  body.set('username', username);
  body.set('password', password);
  applyOAuth2ClientAuthentication(normalized, environment, body, headers);
  if (scopes) {
    body.set('scope', scopes);
  }
  applyOAuth2RequestParams(normalized.tokenRequestParams, environment, body, headers);

  const payload = await postOAuthTokenRequest(parseTokenUrl(tokenUrl), body, options, 'OAuth 2.0 password credentials token request', { headers });
  const tokenType = normalizeTokenType(payload.token_type || normalized.tokenType);
  return normalizeAuth({
    ...normalized,
    tokenType,
    headerPrefix: normalized.headerPrefix || tokenType,
    accessToken: String(payload.access_token),
    refreshToken: payload.refresh_token ? String(payload.refresh_token) : normalized.refreshToken,
    expiresAt: expiresAtFromPayload(payload, options.now)
  });
}

function createOAuthPkceSession(auth = {}, environment, options = {}) {
  const normalized = normalizeAuth(auth);
  if (normalized.type !== 'oauth2') {
    throw new Error('OAuth 2.0 auth is required for authorization-code PKCE.');
  }
  if (!isAuthorizationCodeGrant(normalized.grantType)) {
    throw new Error('OAuth 2.0 authorization-code grant is required for PKCE.');
  }

  const authorizationUrl = requireResolvedValue(normalized.authorizationUrl, environment, 'OAuth 2.0 authorization URL');
  const tokenUrl = requireResolvedValue(normalized.tokenUrl, environment, 'OAuth 2.0 token URL');
  const clientId = requireResolvedValue(normalized.clientId, environment, 'OAuth 2.0 client ID');
  const redirectUri = requireResolvedValue(options.redirectUri || normalized.redirectUri, environment, 'OAuth 2.0 redirect URI');
  const scopes = resolveEnvironmentValue(normalized.scopes, environment).trim();
  const state = options.state || resolveEnvironmentValue(normalized.state, environment).trim() || randomBase64Url(OAUTH_PKCE_STATE_BYTES);
  const usesPkce = normalized.grantType === 'authorizationCodePkce';
  const codeVerifier = usesPkce
    ? (options.codeVerifier || resolveEnvironmentValue(normalized.codeVerifier, environment).trim() || randomBase64Url(OAUTH_PKCE_CODE_VERIFIER_BYTES))
    : '';
  const codeChallengeMethod = usesPkce && normalized.codeChallengeMethod === 'plain' ? 'plain' : 'S256';
  const codeChallenge = usesPkce
    ? (codeChallengeMethod === 'plain' ? codeVerifier : pkceChallengeForVerifier(codeVerifier))
    : '';
  if (usesPkce) {
    validatePkceCodeVerifier(codeVerifier);
  }

  const url = parseTokenUrl(authorizationUrl, 'OAuth 2.0 authorization URL');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  if (usesPkce) {
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', codeChallengeMethod);
  }
  if (scopes) {
    url.searchParams.set('scope', scopes);
  }
  applyOAuth2AuthRequestParams(normalized.authRequestParams, environment, url);

  return {
    authorizationUrl: url.toString(),
    tokenUrl,
    redirectUri,
    clientId,
    clientSecret: resolveEnvironmentValue(normalized.clientSecret, environment),
    scopes,
    clientAuthentication: normalized.clientAuthentication,
    tokenRequestParams: normalized.tokenRequestParams,
    state,
    codeVerifier,
    codeChallengeMethod: usesPkce ? codeChallengeMethod : '',
    codeChallenge
  };
}

async function exchangeOAuthAuthorizationCode(auth = {}, session, callbackUrl, environment, options = {}) {
  const normalized = normalizeAuth(auth);
  if (normalized.type !== 'oauth2') {
    throw new Error('OAuth 2.0 auth is required for authorization-code exchange.');
  }
  if (!session || typeof session !== 'object') {
    throw new Error('OAuth 2.0 PKCE session is required for authorization-code exchange.');
  }

  const parsedCallback = parseCallbackUrl(callbackUrl);
  const error = parsedCallback.searchParams.get('error');
  if (error) {
    const description = parsedCallback.searchParams.get('error_description');
    throw new Error(redactOAuthErrorMessage(description || error));
  }
  const state = parsedCallback.searchParams.get('state');
  if (!state || state !== session.state) {
    throw new Error('OAuth 2.0 authorization response state did not match the active request.');
  }
  const code = parsedCallback.searchParams.get('code');
  if (!code) {
    throw new Error('OAuth 2.0 authorization response did not include an authorization code.');
  }

  const tokenUrl = requireResolvedValue(session.tokenUrl || normalized.tokenUrl, environment, 'OAuth 2.0 token URL');
  const clientId = requireResolvedValue(session.clientId || normalized.clientId, environment, 'OAuth 2.0 client ID');
  const redirectUri = requireResolvedValue(session.redirectUri || normalized.redirectUri, environment, 'OAuth 2.0 redirect URI');
  const codeVerifier = resolveEnvironmentValue(session.codeVerifier, environment).trim();
  if (codeVerifier) {
    validatePkceCodeVerifier(codeVerifier);
  }
  const body = new URLSearchParams();
  const headers = {};
  body.set('grant_type', 'authorization_code');
  body.set('code', code);
  body.set('redirect_uri', redirectUri);
  if (codeVerifier) {
    body.set('code_verifier', codeVerifier);
  }
  applyOAuth2ClientAuthentication({
    ...normalized,
    clientAuthentication: session.clientAuthentication || normalized.clientAuthentication,
    clientId,
    clientSecret: session.clientSecret || normalized.clientSecret
  }, environment, body, headers);
  applyOAuth2RequestParams(session.tokenRequestParams || normalized.tokenRequestParams, environment, body, headers);

  const payload = await postOAuthTokenRequest(
    parseTokenUrl(tokenUrl),
    body,
    options,
    'OAuth 2.0 authorization-code token request',
    { headers }
  );
  const tokenType = normalizeTokenType(payload.token_type || normalized.tokenType);
  return normalizeAuth({
    ...normalized,
    tokenType,
    headerPrefix: normalized.headerPrefix || tokenType,
    accessToken: String(payload.access_token),
    refreshToken: payload.refresh_token ? String(payload.refresh_token) : normalized.refreshToken,
    expiresAt: expiresAtFromPayload(payload, options.now),
    redirectUri
  });
}

async function requestOAuthDeviceAuthorization(auth = {}, environment, options = {}) {
  const normalized = normalizeAuth(auth);
  if (normalized.type !== 'oauth2') {
    throw new Error('OAuth 2.0 auth is required for device authorization.');
  }
  if (normalized.grantType !== 'deviceCode') {
    throw new Error('OAuth 2.0 device-code grant is required for device authorization.');
  }

  const deviceAuthorizationUrl = requireResolvedValue(normalized.deviceAuthorizationUrl, environment, 'OAuth 2.0 device authorization URL');
  const clientId = requireResolvedValue(normalized.clientId, environment, 'OAuth 2.0 client ID');
  const scopes = resolveEnvironmentValue(normalized.scopes, environment).trim();
  const body = new URLSearchParams();
  body.set('client_id', clientId);
  if (scopes) {
    body.set('scope', scopes);
  }
  applyOAuth2RequestParams(normalized.authRequestParams, environment, body, {});

  const payload = await postOAuthTokenRequest(
    parseTokenUrl(deviceAuthorizationUrl, 'OAuth 2.0 device authorization URL'),
    body,
    options,
    'OAuth 2.0 device authorization request',
    { requireAccessToken: false }
  );
  if (!payload.device_code || !payload.user_code || !payload.verification_uri) {
    throw new Error('OAuth 2.0 device authorization response did not include device_code, user_code, and verification_uri.');
  }
  parseTokenUrl(String(payload.verification_uri), 'OAuth 2.0 verification URL');
  if (payload.verification_uri_complete) {
    parseTokenUrl(String(payload.verification_uri_complete), 'OAuth 2.0 complete verification URL');
  }

  const expiresIn = positiveNumberOrDefault(payload.expires_in, OAUTH_DEVICE_DEFAULT_EXPIRES_IN_SECONDS);
  const interval = positiveNumberOrDefault(payload.interval, OAUTH_DEVICE_DEFAULT_INTERVAL_SECONDS);
  return normalizeAuth({
    ...normalized,
    deviceCode: String(payload.device_code),
    userCode: String(payload.user_code),
    verificationUri: String(payload.verification_uri),
    verificationUriComplete: payload.verification_uri_complete ? String(payload.verification_uri_complete) : '',
    deviceCodeExpiresAt: new Date(Number(options.now || Date.now()) + Math.round(expiresIn * 1000)).toISOString(),
    devicePollIntervalSeconds: String(interval)
  });
}

async function pollOAuthDeviceToken(auth = {}, environment, options = {}) {
  const normalized = normalizeAuth(auth);
  if (normalized.type !== 'oauth2' || normalized.grantType !== 'deviceCode') {
    throw new Error('OAuth 2.0 device-code auth is required for device token polling.');
  }

  const tokenUrl = requireResolvedValue(normalized.refreshTokenUrl || normalized.tokenUrl, environment, 'OAuth 2.0 token URL');
  const deviceCode = requireResolvedValue(normalized.deviceCode, environment, 'OAuth 2.0 device code');
  const clientId = requireResolvedValue(normalized.clientId, environment, 'OAuth 2.0 client ID');
  let intervalMillis = positiveNumberOrDefault(normalized.devicePollIntervalSeconds, OAUTH_DEVICE_DEFAULT_INTERVAL_SECONDS) * 1000;
  const now = Number(options.now || Date.now());
  const deadline = deviceCodeDeadlineMillis(normalized, now);
  const fetchOptions = { ...options };
  delete fetchOptions.now;

  while (Date.now() <= deadline) {
    options.onProgress?.({
      status: 'polling',
      nextAttemptAt: new Date(Date.now() + intervalMillis).toISOString()
    });
    const body = new URLSearchParams();
    const headers = {};
    body.set('grant_type', OAUTH_DEVICE_GRANT_TYPE);
    body.set('device_code', deviceCode);
    applyOAuth2ClientAuthentication({ ...normalized, clientId }, environment, body, headers);
    applyOAuth2RequestParams(normalized.tokenRequestParams, environment, body, headers);

    try {
      const payload = await postOAuthTokenRequest(
        parseTokenUrl(tokenUrl),
        body,
        fetchOptions,
        'OAuth 2.0 device token request',
        { headers }
      );
      const tokenType = normalizeTokenType(payload.token_type || normalized.tokenType);
      return normalizeAuth({
        ...normalized,
        tokenType,
        headerPrefix: normalized.headerPrefix || tokenType,
        accessToken: String(payload.access_token),
        refreshToken: payload.refresh_token ? String(payload.refresh_token) : normalized.refreshToken,
        expiresAt: expiresAtFromPayload(payload, Date.now()),
        deviceCode: '',
        userCode: '',
        verificationUri: '',
        verificationUriComplete: '',
        deviceCodeExpiresAt: '',
        devicePollIntervalSeconds: ''
      });
    } catch (error) {
      if (error.oauthError === 'authorization_pending') {
        await sleep(intervalMillis, options.signal);
        continue;
      }
      if (error.oauthError === 'slow_down') {
        intervalMillis += 5000;
        await sleep(intervalMillis, options.signal);
        continue;
      }
      if (error.oauthError === 'access_denied') {
        throw new Error('OAuth 2.0 device authorization was denied.');
      }
      if (error.oauthError === 'expired_token') {
        throw new Error('OAuth 2.0 device authorization expired.');
      }
      throw error;
    }
  }

  throw new Error('OAuth 2.0 device authorization timed out.');
}

function shouldRefreshOAuthToken(auth, environment, now = Date.now()) {
  if (auth.autoRefreshToken === false) {
    return false;
  }
  if (!resolveEnvironmentValue(auth.refreshToken, environment).trim()
    || !resolveEnvironmentValue(auth.refreshTokenUrl || auth.tokenUrl, environment).trim()) {
    return false;
  }
  if (!resolveEnvironmentValue(auth.accessToken, environment).trim()) {
    return true;
  }
  if (!auth.expiresAt) {
    return false;
  }
  const expiresAtMillis = Date.parse(auth.expiresAt);
  return Number.isFinite(expiresAtMillis) && expiresAtMillis <= Number(now) + OAUTH_REFRESH_WINDOW_MILLIS;
}

function shouldRequestPasswordCredentialsToken(auth, environment, now = Date.now()) {
  if (!resolveEnvironmentValue(auth.tokenUrl, environment).trim()
    || !resolveEnvironmentValue(auth.username, environment).trim()
    || !resolveEnvironmentValue(auth.password, environment).trim()) {
    return false;
  }
  if (!resolveEnvironmentValue(auth.accessToken, environment).trim()) {
    return true;
  }
  return tokenExpiresSoon(auth.expiresAt, now);
}

function tokenExpiresSoon(expiresAt, now = Date.now()) {
  if (!expiresAt) {
    return false;
  }
  const expiresAtMillis = Date.parse(expiresAt);
  return Number.isFinite(expiresAtMillis) && expiresAtMillis <= Number(now) + OAUTH_REFRESH_WINDOW_MILLIS;
}

function shouldPollOAuthDeviceToken(auth, environment, now = Date.now()) {
  if (!resolveEnvironmentValue(auth.refreshTokenUrl || auth.tokenUrl, environment).trim()
    || !resolveEnvironmentValue(auth.clientId, environment).trim()
    || !resolveEnvironmentValue(auth.deviceCode, environment).trim()) {
    return false;
  }
  if (resolveEnvironmentValue(auth.accessToken, environment).trim()) {
    return false;
  }
  const deadline = deviceCodeDeadlineMillis(auth, Number(now));
  return deadline > Number(now);
}

function isAuthorizationCodeGrant(grantType) {
  return grantType === 'authorizationCode' || grantType === 'authorizationCodePkce';
}

function shouldRequestClientCredentialsToken(auth, environment, now = Date.now()) {
  if (!resolveEnvironmentValue(auth.tokenUrl, environment).trim()
    || !resolveEnvironmentValue(auth.clientId, environment).trim()
    || !resolveEnvironmentValue(auth.clientSecret, environment).trim()) {
    return false;
  }
  if (!resolveEnvironmentValue(auth.accessToken, environment).trim()) {
    return true;
  }
  if (!auth.expiresAt) {
    return false;
  }
  return tokenExpiresSoon(auth.expiresAt, now);
}

function applyAuth(request, environment, target) {
  const auth = normalizeAuth(request?.auth);
  if (auth.type === 'none') {
    return;
  }
  if (auth.type === 'bearer') {
    target.headers.Authorization = `Bearer ${resolveEnvironmentValue(auth.token, environment)}`;
  } else if (auth.type === 'basic') {
    const username = resolveEnvironmentValue(auth.username, environment);
    const password = resolveEnvironmentValue(auth.password, environment);
    target.headers.Authorization = `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`;
  } else if (auth.type === 'apiKey') {
    const key = resolveEnvironmentValue(auth.key, environment).trim();
    const value = resolveEnvironmentValue(auth.value, environment);
    if (auth.location === 'query') {
      target.url.searchParams.append(key, value);
    } else {
      target.headers[key] = value;
    }
  } else if (auth.type === 'cookie') {
    target.headers.Cookie = resolveEnvironmentValue(auth.value, environment);
  } else if (auth.type === 'oauth2') {
    const accessToken = resolveEnvironmentValue(auth.accessToken, environment);
    if (auth.addAuthDataTo === 'query') {
      target.url.searchParams.set('access_token', accessToken);
    } else {
      const headerPrefix = resolveEnvironmentValue(auth.headerPrefix || auth.tokenType, environment).trim();
      target.headers.Authorization = headerPrefix ? `${headerPrefix} ${accessToken}` : accessToken;
    }
  } else if (auth.type === 'digest') {
    if (auth.realm && auth.nonce) {
      setHeader(target.headers, 'Authorization', buildDigestAuthorizationHeader(auth, environment, target));
    }
  } else if (auth.type === 'hawk') {
    setHeader(target.headers, 'Authorization', buildHawkAuthorizationHeader(auth, environment, target));
  } else if (auth.type === 'aws') {
    applyAwsSignature(auth, environment, target);
  } else if (auth.type === 'oauth1') {
    applyOAuth1Signature(auth, environment, target);
  } else if (auth.type === 'ntlm') {
    setHeader(target.headers, 'Authorization', buildNtlmType1AuthorizationHeader(auth, environment));
  } else if (auth.type === 'akamaiEdgeGrid') {
    applyAkamaiEdgeGridSignature(auth, environment, target);
  } else if (auth.type === 'jwtBearer') {
    applyJwtBearerAuth(auth, environment, target);
  } else if (auth.type === 'asap') {
    applyAsapAuth(auth, environment, target);
  }
}

function applyDigestChallengeAuth(request, environment, target, challenge) {
  const auth = normalizeAuth(request?.auth);
  if (auth.type !== 'digest') {
    return false;
  }
  setHeader(target.headers, 'Authorization', buildDigestAuthorizationHeader({
    ...auth,
    ...challenge
  }, environment, target));
  return true;
}

function buildDigestAuthorizationHeader(auth, environment, target) {
  const username = resolveEnvironmentValue(auth.username, environment);
  const password = resolveEnvironmentValue(auth.password, environment);
  const realm = resolveEnvironmentValue(auth.realm, environment);
  const nonce = resolveEnvironmentValue(auth.nonce, environment);
  const algorithmName = String(resolveEnvironmentValue(auth.algorithm, environment) || 'MD5');
  const algorithm = normalizeDigestAlgorithm(algorithmName);
  if (!algorithm) {
    throw new Error(`Unsupported Digest auth algorithm: ${algorithmName}.`);
  }
  if (!realm || !nonce) {
    throw new Error('Digest auth requires a server challenge with realm and nonce.');
  }
  const qop = String(resolveEnvironmentValue(auth.qop, environment) || 'auth')
    .split(',')
    .map((item) => item.trim())
    .find((item) => item === 'auth') || '';
  const opaque = resolveEnvironmentValue(auth.opaque, environment);
  const cnonce = resolveEnvironmentValue(auth.clientNonce, environment).trim() || crypto.randomBytes(8).toString('hex');
  const nc = resolveEnvironmentValue(auth.nonceCount, environment).trim() || '00000001';
  const uri = `${target.url.pathname}${target.url.search}`;
  let ha1 = digestHash(algorithm.hash, `${username}:${realm}:${password}`);
  if (algorithm.sess) {
    ha1 = digestHash(algorithm.hash, `${ha1}:${nonce}:${cnonce}`);
  }
  const ha2 = digestHash(algorithm.hash, `${target.method || 'GET'}:${uri}`);
  const response = qop
    ? digestHash(algorithm.hash, `${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
    : digestHash(algorithm.hash, `${ha1}:${nonce}:${ha2}`);
  const fields = [
    ['username', username],
    ['realm', realm],
    ['nonce', nonce],
    ['uri', uri],
    ['response', response],
    ['algorithm', algorithm.label]
  ];
  if (opaque) {
    fields.push(['opaque', opaque]);
  }
  if (qop) {
    fields.push(['qop', qop, false], ['nc', nc, false], ['cnonce', cnonce]);
  }
  return `Digest ${fields.map(([key, value, quoted = true]) => `${key}=${quoted ? quoteAuthValue(value) : value}`).join(', ')}`;
}

function parseDigestChallenge(headerValues) {
  const header = Array.isArray(headerValues) ? headerValues.find((value) => /^digest\b/i.test(String(value))) : String(headerValues || '');
  if (!/^digest\b/i.test(header)) {
    return null;
  }
  const text = header.replace(/^digest\s+/i, '');
  const fields = {};
  const pattern = /([A-Za-z0-9_-]+)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^,]*))(?:,|$)/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const key = match[1].toLowerCase();
    const raw = match[2] != null ? match[2].replace(/\\"/g, '"') : String(match[3] || '').trim();
    fields[key] = raw;
  }
  if (!fields.realm || !fields.nonce) {
    return null;
  }
  return {
    realm: fields.realm,
    nonce: fields.nonce,
    algorithm: fields.algorithm || 'MD5',
    qop: fields.qop || '',
    opaque: fields.opaque || ''
  };
}

function normalizeDigestAlgorithm(value) {
  const label = String(value || 'MD5').trim() || 'MD5';
  const hash = DIGEST_SUPPORTED_ALGORITHMS.get(label.toLowerCase());
  if (!hash) {
    return null;
  }
  return {
    hash,
    label,
    sess: label.toLowerCase().endsWith('-sess')
  };
}

function digestHash(algorithm, value) {
  return crypto.createHash(algorithm).update(value, 'utf8').digest('hex');
}

function buildHawkAuthorizationHeader(auth, environment, target) {
  const id = resolveEnvironmentValue(auth.authId, environment);
  const key = resolveEnvironmentValue(auth.authKey, environment);
  const algorithmName = resolveEnvironmentValue(auth.algorithm, environment);
  const algorithm = normalizeHawkAlgorithm(algorithmName);
  if (!algorithm) {
    throw new Error(`Unsupported Hawk auth algorithm: ${algorithmName || auth.algorithm}.`);
  }
  const ts = resolveEnvironmentValue(auth.timestamp, environment).trim() || String(Math.floor(Number(target.now || Date.now()) / 1000));
  const nonce = resolveEnvironmentValue(auth.nonce, environment).trim() || crypto.randomBytes(6).toString('hex');
  const ext = resolveEnvironmentValue(auth.extraData, environment);
  const app = resolveEnvironmentValue(auth.app, environment);
  const dlg = resolveEnvironmentValue(auth.delegation, environment);
  const hash = auth.includePayloadHash === true
    ? hawkPayloadHash(algorithm, target.body || '', headerValue(target.headers || {}, 'Content-Type'))
    : '';
  const port = target.url.port || (target.url.protocol === 'https:' ? '443' : '80');
  const normalized = [
    'hawk.1.header',
    ts,
    nonce,
    String(target.method || 'GET').toUpperCase(),
    `${target.url.pathname}${target.url.search}`,
    target.url.hostname.toLowerCase(),
    port,
    hash,
    ext,
    app,
    dlg,
    ''
  ].join('\n');
  const mac = crypto.createHmac(algorithm, key).update(normalized, 'utf8').digest('base64');
  const fields = [
    ['id', id],
    ['ts', ts],
    ['nonce', nonce],
    ['mac', mac]
  ];
  if (hash) {
    fields.push(['hash', hash]);
  }
  if (ext) {
    fields.push(['ext', ext]);
  }
  if (app) {
    fields.push(['app', app]);
  }
  if (dlg) {
    fields.push(['dlg', dlg]);
  }
  return `Hawk ${fields.map(([name, value]) => `${name}=${quoteAuthValue(value)}`).join(', ')}`;
}

function hawkPayloadHash(algorithm, body, contentType = '') {
  const hash = crypto.createHash(algorithm);
  hash.update('hawk.1.payload\n', 'utf8');
  hash.update(normalizeHawkContentType(contentType), 'utf8');
  hash.update('\n', 'utf8');
  if (Buffer.isBuffer(body)) {
    hash.update(body);
  } else {
    hash.update(String(body || ''), 'utf8');
  }
  hash.update('\n', 'utf8');
  return hash.digest('base64');
}

function normalizeHawkAlgorithm(value) {
  const normalized = String(value || 'sha256').trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (normalized === 'sha1') {
    return 'sha1';
  }
  if (normalized === 'sha256') {
    return 'sha256';
  }
  return null;
}

function normalizeHawkContentType(contentType = '') {
  return String(contentType || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
}

function applyAwsSignature(auth, environment, target) {
  const accessKey = resolveEnvironmentValue(auth.accessKey, environment);
  const secretKey = resolveEnvironmentValue(auth.secretKey, environment);
  const region = resolveEnvironmentValue(auth.region, environment);
  const service = resolveEnvironmentValue(auth.service, environment);
  const sessionToken = resolveEnvironmentValue(auth.sessionToken, environment);
  const amzDate = awsAmzDate(target.now || Date.now());
  const shortDate = amzDate.slice(0, 8);
  setHeader(target.headers, 'Host', hostHeader(target.url));
  if (auth.addAuthDataToQuery === true) {
    target.url.searchParams.set('X-Amz-Algorithm', AWS_ALGORITHM);
    target.url.searchParams.set('X-Amz-Credential', `${accessKey}/${shortDate}/${region}/${service}/aws4_request`);
    target.url.searchParams.set('X-Amz-Date', amzDate);
    target.url.searchParams.set('X-Amz-Expires', '900');
    if (sessionToken) {
      target.url.searchParams.set('X-Amz-Security-Token', sessionToken);
    }
  } else {
    setHeader(target.headers, 'X-Amz-Date', amzDate);
    if (sessionToken) {
      setHeader(target.headers, 'X-Amz-Security-Token', sessionToken);
    }
  }
  const signedHeaders = awsSignedHeaderNames(target.headers);
  if (auth.addAuthDataToQuery === true) {
    target.url.searchParams.set('X-Amz-SignedHeaders', signedHeaders);
  }
  const canonicalRequest = [
    String(target.method || 'GET').toUpperCase(),
    awsCanonicalUri(target.url),
    awsCanonicalQuery(target.url),
    awsCanonicalHeaders(target.headers),
    signedHeaders,
    sha256Hex(target.body || '')
  ].join('\n');
  const credentialScope = `${shortDate}/${region}/${service}/aws4_request`;
  const stringToSign = [
    AWS_ALGORITHM,
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest)
  ].join('\n');
  const signature = crypto
    .createHmac('sha256', awsSigningKey(secretKey, shortDate, region, service))
    .update(stringToSign, 'utf8')
    .digest('hex');
  if (auth.addAuthDataToQuery === true) {
    target.url.searchParams.set('X-Amz-Signature', signature);
    return;
  }
  setHeader(
    target.headers,
    'Authorization',
    `${AWS_ALGORITHM} Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
  );
}

function applyOAuth1Signature(auth, environment, target) {
  const signatureMethod = normalizeOAuth1SignatureMethod(resolveEnvironmentValue(auth.signatureMethod, environment));
  if (!OAUTH1_SIGNATURE_METHODS.has(signatureMethod)) {
    throw new Error(`Unsupported OAuth 1.0 signature method: ${auth.signatureMethod}.`);
  }
  const addEmptyParamsToSign = auth.addEmptyParamsToSign === true;
  const params = {
    oauth_consumer_key: resolveEnvironmentValue(auth.consumerKey, environment),
    oauth_nonce: resolveEnvironmentValue(auth.nonce, environment).trim() || crypto.randomBytes(12).toString('hex'),
    oauth_signature_method: signatureMethod,
    oauth_timestamp: resolveEnvironmentValue(auth.timestamp, environment).trim() || String(Math.floor(Number(target.now || Date.now()) / 1000)),
    oauth_version: resolveEnvironmentValue(auth.version, environment).trim() || '1.0'
  };
  appendOptionalOAuth1Param(params, 'oauth_token', resolveEnvironmentValue(auth.token, environment), addEmptyParamsToSign);
  appendOptionalOAuth1Param(params, 'oauth_callback', resolveEnvironmentValue(auth.callback, environment), addEmptyParamsToSign);
  appendOptionalOAuth1Param(params, 'oauth_verifier', resolveEnvironmentValue(auth.verifier, environment), addEmptyParamsToSign);
  if (auth.includeBodyHash === true) {
    params.oauth_body_hash = oauth1BodyHash(target.body);
  }
  const baseParams = oauth1SignatureBaseParams(target, params, addEmptyParamsToSign);
  const baseUrl = `${target.url.protocol}//${target.url.host}${target.url.pathname}`;
  const normalizedParams = baseParams
    .map(([key, value]) => [oauthPercentEncode(key), oauthPercentEncode(value)])
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => leftKey === rightKey ? leftValue.localeCompare(rightValue) : leftKey.localeCompare(rightKey))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  const baseString = [
    String(target.method || 'GET').toUpperCase(),
    oauthPercentEncode(baseUrl),
    oauthPercentEncode(normalizedParams)
  ].join('&');
  const signature = oauth1Signature(signatureMethod, baseString, auth, environment);
  const headerParams = {
    ...params,
    oauth_signature: signature
  };
  if (auth.addAuthDataTo === 'queryOrBody') {
    appendOAuth1ParamsToRequest(target, headerParams);
    return;
  }
  const realm = resolveEnvironmentValue(auth.realm, environment);
  const parts = realm ? [`realm=${quoteAuthValue(realm)}`] : [];
  for (const key of Object.keys(headerParams).sort()) {
    parts.push(`${oauthPercentEncode(key)}=${quoteAuthValue(oauthPercentEncode(headerParams[key]))}`);
  }
  setHeader(target.headers, 'Authorization', `OAuth ${parts.join(', ')}`);
}

function appendOptionalOAuth1Param(params, key, value, includeEmpty) {
  const resolved = String(value ?? '');
  if (resolved || includeEmpty) {
    params[key] = resolved;
  }
}

function oauth1Signature(signatureMethod, baseString, auth, environment) {
  const consumerSecret = resolveEnvironmentValue(auth.consumerSecret, environment);
  const tokenSecret = resolveEnvironmentValue(auth.tokenSecret, environment);
  const signingKey = `${oauthPercentEncode(consumerSecret)}&${oauthPercentEncode(tokenSecret)}`;
  if (signatureMethod === 'PLAINTEXT') {
    return signingKey;
  }
  if (signatureMethod.startsWith('RSA-')) {
    return crypto
      .createSign(oauth1RsaSignatureAlgorithm(signatureMethod))
      .update(baseString, 'utf8')
      .sign(resolveEnvironmentValue(auth.privateKey, environment) || consumerSecret, 'base64');
  }
  return crypto
    .createHmac(oauth1HmacHashAlgorithm(signatureMethod), signingKey)
    .update(baseString, 'utf8')
    .digest('base64');
}

function oauth1HmacHashAlgorithm(signatureMethod) {
  if (signatureMethod === 'HMAC-SHA512') {
    return 'sha512';
  }
  if (signatureMethod === 'HMAC-SHA256') {
    return 'sha256';
  }
  return 'sha1';
}

function oauth1RsaSignatureAlgorithm(signatureMethod) {
  if (signatureMethod === 'RSA-SHA512') {
    return 'RSA-SHA512';
  }
  if (signatureMethod === 'RSA-SHA256') {
    return 'RSA-SHA256';
  }
  return 'RSA-SHA1';
}

function oauth1SignatureBaseParams(target, oauthParams, includeEmpty) {
  const params = [];
  appendOAuth1SearchParams(params, target.url.searchParams, includeEmpty, { excludeOAuthSignature: false });
  if (oauth1BodyContributesToSignature(target)) {
    appendOAuth1SearchParams(params, new URLSearchParams(oauth1BodyText(target.body)), includeEmpty, { excludeOAuthSignature: false });
  }
  for (const [key, value] of Object.entries(oauthParams)) {
    if (key !== 'oauth_signature' && (includeEmpty || String(value) !== '')) {
      params.push([key, value]);
    }
  }
  return params;
}

function appendOAuth1ParamsToRequest(target, params) {
  if (oauth1ShouldPlaceParamsInBody(target)) {
    const bodyParams = new URLSearchParams(oauth1BodyText(target.body));
    for (const [key, value] of Object.entries(params)) {
      bodyParams.append(key, value);
    }
    target.body = bodyParams.toString();
    return;
  }
  for (const [key, value] of Object.entries(params)) {
    target.url.searchParams.append(key, value);
  }
}

function oauth1ShouldPlaceParamsInBody(target) {
  return String(target.method || 'GET').toUpperCase() !== 'GET' && oauth1BodyContributesToSignature(target);
}

function oauth1BodyContributesToSignature(target) {
  return target.body != null
    && (
      target.bodyType === 'URLENCODED'
      || String(headerValue(target.headers, 'Content-Type') || '').toLowerCase().split(';')[0].trim() === 'application/x-www-form-urlencoded'
    );
}

function appendOAuth1SearchParams(target, source, includeEmpty, options = {}) {
  for (const [key, value] of source.entries()) {
    if (options.excludeOAuthSignature && key === 'oauth_signature') {
      continue;
    }
    if (includeEmpty || String(value) !== '') {
      target.push([key, value]);
    }
  }
}

function oauth1BodyText(body) {
  if (Buffer.isBuffer(body)) {
    return body.toString('utf8');
  }
  return String(body ?? '');
}

function oauth1BodyHash(body) {
  const hash = crypto.createHash('sha1');
  if (Buffer.isBuffer(body)) {
    return hash.update(body).digest('base64');
  }
  return hash.update(String(body ?? ''), 'utf8').digest('base64');
}

function buildNtlmType1AuthorizationHeader(auth, environment) {
  const domain = resolveEnvironmentValue(auth.domain, environment).toUpperCase();
  const workstation = resolveEnvironmentValue(auth.workstation, environment).toUpperCase();
  const flags = 0x00000001 | 0x00000002 | 0x00000200 | 0x00008000 | 0x00080000 | 0x20000000 | 0x02000000;
  const domainBuffer = Buffer.from(domain, 'ascii');
  const workstationBuffer = Buffer.from(workstation, 'ascii');
  const payloadOffset = 32;
  const message = Buffer.alloc(payloadOffset + domainBuffer.length + workstationBuffer.length);
  message.write('NTLMSSP\0', 0, 'ascii');
  message.writeUInt32LE(1, 8);
  message.writeUInt32LE(flags, 12);
  writeSecurityBuffer(message, 16, domainBuffer.length, payloadOffset);
  writeSecurityBuffer(message, 24, workstationBuffer.length, payloadOffset + domainBuffer.length);
  domainBuffer.copy(message, payloadOffset);
  workstationBuffer.copy(message, payloadOffset + domainBuffer.length);
  return `NTLM ${message.toString('base64')}`;
}

function buildNtlmType3AuthorizationHeader(auth, environment, challengeHeader, options = {}) {
  const challenge = parseNtlmChallenge(challengeHeader);
  if (!challenge) {
    throw new Error('NTLM auth requires a server NTLM challenge.');
  }
  const username = resolveEnvironmentValue(auth.username, environment);
  const password = resolveEnvironmentValue(auth.password, environment);
  const domain = resolveEnvironmentValue(auth.domain, environment).toUpperCase();
  const workstation = resolveEnvironmentValue(auth.workstation, environment).toUpperCase();
  const timestamp = ntlmTimestamp(options.now || Date.now());
  const clientNonce = crypto.randomBytes(8);
  const ntlmHash = md4(Buffer.from(password, 'utf16le'));
  const ntlmV2Hash = crypto.createHmac('md5', ntlmHash)
    .update(Buffer.from(`${username.toUpperCase()}${challenge.targetName || domain}`, 'utf16le'))
    .digest();
  const targetInfo = challenge.targetInfo.length ? challenge.targetInfo : Buffer.from([0, 0, 0, 0]);
  const blob = Buffer.concat([
    Buffer.from('0101000000000000', 'hex'),
    timestamp,
    clientNonce,
    Buffer.alloc(4),
    targetInfo,
    Buffer.alloc(4)
  ]);
  const ntProof = crypto.createHmac('md5', ntlmV2Hash).update(Buffer.concat([challenge.serverChallenge, blob])).digest();
  const ntResponse = Buffer.concat([ntProof, blob]);
  const lmResponse = Buffer.concat([
    crypto.createHmac('md5', ntlmV2Hash).update(Buffer.concat([challenge.serverChallenge, clientNonce])).digest(),
    clientNonce
  ]);
  const domainBuffer = Buffer.from(domain, 'utf16le');
  const userBuffer = Buffer.from(username, 'utf16le');
  const workstationBuffer = Buffer.from(workstation, 'utf16le');
  const sessionKey = Buffer.alloc(0);
  const flags = challenge.flags || 0x02888205;
  const payloadOffset = 64;
  let offset = payloadOffset;
  const message = Buffer.alloc(payloadOffset + lmResponse.length + ntResponse.length + domainBuffer.length + userBuffer.length + workstationBuffer.length);
  message.write('NTLMSSP\0', 0, 'ascii');
  message.writeUInt32LE(3, 8);
  offset = writeSecurityBufferWithPayload(message, 12, lmResponse, offset);
  offset = writeSecurityBufferWithPayload(message, 20, ntResponse, offset);
  offset = writeSecurityBufferWithPayload(message, 28, domainBuffer, offset);
  offset = writeSecurityBufferWithPayload(message, 36, userBuffer, offset);
  offset = writeSecurityBufferWithPayload(message, 44, workstationBuffer, offset);
  writeSecurityBuffer(message, 52, sessionKey.length, offset);
  message.writeUInt32LE(flags, 60);
  return `NTLM ${message.toString('base64')}`;
}

function parseNtlmChallenge(headerValues) {
  const header = Array.isArray(headerValues)
    ? headerValues.find((value) => /^ntlm\s+\S+/i.test(String(value)))
    : String(headerValues || '').split(',').map((value) => value.trim()).find((value) => /^ntlm\s+\S+/i.test(value));
  if (!header) {
    return null;
  }
  let message;
  try {
    message = Buffer.from(String(header).replace(/^ntlm\s+/i, ''), 'base64');
  } catch {
    return null;
  }
  if (message.length < 32 || message.slice(0, 8).toString('ascii') !== 'NTLMSSP\0' || message.readUInt32LE(8) !== 2) {
    return null;
  }
  const targetName = readSecurityBuffer(message, 12).toString('utf16le');
  const flags = message.readUInt32LE(20);
  const serverChallenge = message.slice(24, 32);
  const targetInfo = message.length >= 48 ? readSecurityBuffer(message, 40) : Buffer.alloc(0);
  return { flags, serverChallenge, targetInfo, targetName };
}

function applyAkamaiEdgeGridSignature(auth, environment, target) {
  const accessToken = resolveEnvironmentValue(auth.accessToken, environment);
  const clientToken = resolveEnvironmentValue(auth.clientToken, environment);
  const clientSecret = resolveEnvironmentValue(auth.clientSecret, environment);
  const timestamp = resolveEnvironmentValue(auth.timestamp, environment).trim() || edgeGridTimestamp(target.now || Date.now());
  const nonce = resolveEnvironmentValue(auth.nonce, environment).trim() || crypto.randomBytes(16).toString('hex');
  const signingUrl = edgeGridSigningUrl(target.url, auth.baseUrl, environment);
  const authPrefix = `EG1-HMAC-SHA256 client_token=${clientToken};access_token=${accessToken};timestamp=${timestamp};nonce=${nonce};`;
  const dataToSign = [
    String(target.method || 'GET').toUpperCase(),
    signingUrl.protocol.replace(/:$/, ''),
    signingUrl.hostname.toLowerCase(),
    `${target.url.pathname}${target.url.search}`,
    edgeGridCanonicalHeaders(target.headers, auth.headersToSign, environment),
    sha256Base64(edgeGridBodyForHash(target.body || '', auth.maxBodySize, environment)),
    authPrefix
  ].join('\t');
  const signingKey = crypto.createHmac('sha256', clientSecret).update(timestamp, 'utf8').digest('base64');
  const signature = crypto.createHmac('sha256', signingKey).update(dataToSign, 'utf8').digest('base64');
  setHeader(target.headers, 'Authorization', `${authPrefix}signature=${signature}`);
}

function applyJwtBearerAuth(auth, environment, target) {
  const token = buildJwtToken(auth, environment, target.now || Date.now());
  const location = normalizeJwtTokenPlacement(resolveEnvironmentValue(auth.addTokenTo, environment) || 'header');
  if (location === 'query') {
    target.url.searchParams.set('token', token);
    return;
  }
  const prefix = resolveEnvironmentValue(auth.headerPrefix, environment).trim() || 'Bearer';
  setHeader(target.headers, 'Authorization', `${prefix} ${token}`);
}

function applyAsapAuth(auth, environment, target) {
  const issuer = resolveEnvironmentValue(auth.issuer, environment);
  const subject = resolveEnvironmentValue(auth.subject, environment) || issuer;
  const audience = resolveEnvironmentValue(auth.audience, environment);
  const configuredClaims = {
    iss: issuer,
    sub: subject,
    aud: audience,
    ...parseJwtClaims(resolveEnvironmentValue(auth.additionalClaims || auth.claims || '{}', environment))
  };
  const token = buildJwtToken({
    ...auth,
    issuer: '',
    subject: '',
    audience: '',
    expiresIn: auth.expiresIn || auth.expiry || '3600',
    claims: JSON.stringify(configuredClaims)
  }, environment, target.now || Date.now());
  setHeader(target.headers, 'Authorization', `Bearer ${token}`);
}

function buildJwtToken(auth, environment, now = Date.now()) {
  const algorithm = normalizeJwtAlgorithm(resolveEnvironmentValue(auth.algorithm, environment) || 'HS256');
  if (!algorithm) {
    throw new Error(`Unsupported JWT algorithm: ${auth.algorithm}.`);
  }
  const issuedAt = Math.floor(Number(now) / 1000);
  const expiresIn = Math.max(1, Number(resolveEnvironmentValue(auth.expiresIn, environment) || 300) || 300);
  const payload = {
    iat: issuedAt,
    exp: issuedAt + expiresIn,
    ...parseJwtClaims(resolveEnvironmentValue(auth.claims, environment))
  };
  const issuer = resolveEnvironmentValue(auth.issuer, environment);
  const subject = resolveEnvironmentValue(auth.subject, environment);
  const audience = resolveEnvironmentValue(auth.audience, environment);
  if (issuer) { payload.iss = issuer; }
  if (subject) { payload.sub = subject; }
  if (audience) { payload.aud = audience; }
  const customHeaders = parseJwtHeaders(resolveEnvironmentValue(auth.jwtHeaders, environment));
  const header = { typ: 'JWT', ...customHeaders, alg: algorithm };
  const keyId = resolveEnvironmentValue(auth.keyId, environment);
  if (keyId) { header.kid = keyId; }
  const signingInput = `${base64UrlJson(header)}.${base64UrlJson(payload)}`;
  return `${signingInput}.${jwtSignature(algorithm, signingInput, auth, environment)}`;
}

function jwtSignature(algorithm, signingInput, auth, environment) {
  if (algorithm === 'none') {
    return '';
  }
  if (algorithm.startsWith('HS')) {
    const secret = jwtHmacSecret(auth, environment);
    return crypto.createHmac(jwtHashForAlgorithm(algorithm), secret).update(signingInput, 'utf8').digest('base64url');
  }
  const privateKey = requireResolvedValue(auth.privateKey, environment, 'JWT private key');
  const input = Buffer.from(signingInput, 'utf8');
  if (algorithm.startsWith('PS')) {
    return crypto.sign(jwtHashForAlgorithm(algorithm), input, {
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST
    }).toString('base64url');
  }
  if (algorithm.startsWith('ES')) {
    return ecdsaDerToJose(crypto.sign(jwtHashForAlgorithm(algorithm), input, privateKey), ecdsaPartLength(algorithm)).toString('base64url');
  }
  return crypto.sign(jwtHashForAlgorithm(algorithm), input, privateKey).toString('base64url');
}

function normalizeJwtAlgorithm(value) {
  const algorithm = String(value || 'HS256').trim().toUpperCase().replace(/[-_]/g, '');
  if (algorithm === 'NONE') {
    return 'none';
  }
  if ([
    'HS256',
    'HS384',
    'HS512',
    'RS256',
    'RS384',
    'RS512',
    'PS256',
    'PS384',
    'PS512',
    'ES256',
    'ES384',
    'ES512'
  ].includes(algorithm)) {
    return algorithm;
  }
  return '';
}

function normalizeJwtTokenPlacement(value) {
  const normalized = String(value || '').trim().toLowerCase().replace(/[\s_/-]+/g, '');
  if (normalized === 'query' || normalized === 'queryparam' || normalized === 'requesturl' || normalized === 'url') {
    return 'query';
  }
  return 'header';
}

function jwtHmacSecret(auth, environment) {
  const raw = requireResolvedValue(auth.secret || auth.clientSecret, environment, 'JWT secret');
  if (auth.secretBase64Encoded !== true) {
    return raw;
  }
  const normalized = raw.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized, 'base64');
}

function jwtHashForAlgorithm(algorithm) {
  if (algorithm.endsWith('384')) {
    return 'sha384';
  }
  if (algorithm.endsWith('512')) {
    return 'sha512';
  }
  return 'sha256';
}

function parseJwtClaims(value) {
  const text = String(value || '').trim();
  if (!text) {
    return {};
  }
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function parseJwtHeaders(value) {
  const text = String(value || '').trim();
  if (!text) {
    return {};
  }
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function ecdsaPartLength(algorithm) {
  if (algorithm.endsWith('384')) {
    return 48;
  }
  if (algorithm.endsWith('512')) {
    return 66;
  }
  return 32;
}

function ecdsaDerToJose(signature, partLength) {
  const der = Buffer.from(signature);
  let offset = 0;
  if (der[offset++] !== 0x30) {
    return der;
  }
  const sequenceLength = readDerLength(der, offset);
  offset = sequenceLength.offset;
  if (der[offset++] !== 0x02) {
    return der;
  }
  const rLength = readDerLength(der, offset);
  offset = rLength.offset;
  const r = der.slice(offset, offset + rLength.length);
  offset += rLength.length;
  if (der[offset++] !== 0x02) {
    return der;
  }
  const sLength = readDerLength(der, offset);
  offset = sLength.offset;
  const s = der.slice(offset, offset + sLength.length);
  return Buffer.concat([leftPadEcdsaPart(r, partLength), leftPadEcdsaPart(s, partLength)]);
}

function readDerLength(buffer, offset) {
  const first = buffer[offset];
  if ((first & 0x80) === 0) {
    return { length: first, offset: offset + 1 };
  }
  const bytes = first & 0x7f;
  let length = 0;
  for (let index = 0; index < bytes; index += 1) {
    length = (length << 8) | buffer[offset + 1 + index];
  }
  return { length, offset: offset + 1 + bytes };
}

function leftPadEcdsaPart(value, partLength) {
  let part = Buffer.from(value);
  while (part.length > partLength && part[0] === 0) {
    part = part.slice(1);
  }
  if (part.length > partLength) {
    return part.slice(part.length - partLength);
  }
  if (part.length === partLength) {
    return part;
  }
  return Buffer.concat([Buffer.alloc(partLength - part.length), part]);
}

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function setHeader(headers, name, value) {
  const existing = Object.keys(headers).find((key) => key.toLowerCase() === name.toLowerCase());
  if (existing) {
    headers[existing] = value;
  } else {
    headers[name] = value;
  }
}

function hostHeader(url) {
  if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80') || !url.port) {
    return url.hostname;
  }
  return `${url.hostname}:${url.port}`;
}

function awsAmzDate(now) {
  return new Date(Number(now)).toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function awsCanonicalUri(url) {
  const path = url.pathname || '/';
  return path
    .split('/')
    .map((part) => encodeRfc3986(decodeURIComponentSafe(part)))
    .join('/') || '/';
}

function awsCanonicalQuery(url) {
  return [...url.searchParams.entries()]
    .map(([key, value]) => [encodeRfc3986(key), encodeRfc3986(value)])
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => leftKey === rightKey ? leftValue.localeCompare(rightValue) : leftKey.localeCompare(rightKey))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
}

function awsCanonicalHeaders(headers) {
  return awsSignedHeaderNames(headers)
    .split(';')
    .map((name) => `${name}:${String(headerValue(headers, name) || '').trim().replace(/\s+/g, ' ')}`)
    .join('\n') + '\n';
}

function awsSignedHeaderNames(headers) {
  return Object.keys(headers)
    .map((key) => key.toLowerCase())
    .filter((key) => key !== 'authorization')
    .sort()
    .join(';');
}

function headerValue(headers, name) {
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : '';
}

function awsSigningKey(secretKey, shortDate, region, service) {
  const dateKey = crypto.createHmac('sha256', `AWS4${secretKey}`).update(shortDate, 'utf8').digest();
  const dateRegionKey = crypto.createHmac('sha256', dateKey).update(region, 'utf8').digest();
  const dateRegionServiceKey = crypto.createHmac('sha256', dateRegionKey).update(service, 'utf8').digest();
  return crypto.createHmac('sha256', dateRegionServiceKey).update('aws4_request', 'utf8').digest();
}

function sha256Hex(value) {
  const hash = crypto.createHash('sha256');
  if (Buffer.isBuffer(value)) {
    return hash.update(value).digest('hex');
  }
  return hash.update(String(value || ''), 'utf8').digest('hex');
}

function normalizeOAuth1SignatureMethod(value) {
  const method = String(value || 'HMAC-SHA1').trim().toUpperCase();
  if (method === 'HMACSHA1') {
    return 'HMAC-SHA1';
  }
  if (method === 'HMACSHA256') {
    return 'HMAC-SHA256';
  }
  if (method === 'HMACSHA512') {
    return 'HMAC-SHA512';
  }
  if (method === 'RSASHA1') {
    return 'RSA-SHA1';
  }
  if (method === 'RSASHA256') {
    return 'RSA-SHA256';
  }
  if (method === 'RSASHA512') {
    return 'RSA-SHA512';
  }
  return method;
}

function quoteAuthValue(value) {
  return `"${String(value == null ? '' : value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function oauthPercentEncode(value) {
  return encodeRfc3986(value);
}

function encodeRfc3986(value) {
  return encodeURIComponent(String(value == null ? '' : value))
    .replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function decodeURIComponentSafe(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function writeSecurityBuffer(message, offset, length, payloadOffset) {
  message.writeUInt16LE(length, offset);
  message.writeUInt16LE(length, offset + 2);
  message.writeUInt32LE(payloadOffset, offset + 4);
}

function writeSecurityBufferWithPayload(message, descriptorOffset, payload, payloadOffset) {
  writeSecurityBuffer(message, descriptorOffset, payload.length, payloadOffset);
  payload.copy(message, payloadOffset);
  return payloadOffset + payload.length;
}

function readSecurityBuffer(message, offset) {
  if (message.length < offset + 8) {
    return Buffer.alloc(0);
  }
  const length = message.readUInt16LE(offset);
  const payloadOffset = message.readUInt32LE(offset + 4);
  if (length < 0 || payloadOffset < 0 || payloadOffset + length > message.length) {
    return Buffer.alloc(0);
  }
  return message.slice(payloadOffset, payloadOffset + length);
}

function ntlmTimestamp(now) {
  const epochOffset = 11644473600000;
  const value = BigInt(Math.max(0, Number(now) + epochOffset)) * 10000n;
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(value);
  return buffer;
}

function md4(input) {
  const message = Buffer.from(input);
  const bitLength = BigInt(message.length) * 8n;
  const paddedLength = (((message.length + 9 + 63) >> 6) << 6);
  const buffer = Buffer.alloc(paddedLength);
  message.copy(buffer);
  buffer[message.length] = 0x80;
  buffer.writeBigUInt64LE(bitLength, paddedLength - 8);
  let a = 0x67452301;
  let b = 0xefcdab89;
  let c = 0x98badcfe;
  let d = 0x10325476;
  for (let offset = 0; offset < buffer.length; offset += 64) {
    const x = Array.from({ length: 16 }, (_value, index) => buffer.readUInt32LE(offset + index * 4));
    const aa = a;
    const bb = b;
    const cc = c;
    const dd = d;
    [a, b, c, d] = md4Round1(a, b, c, d, x);
    [a, b, c, d] = md4Round2(a, b, c, d, x);
    [a, b, c, d] = md4Round3(a, b, c, d, x);
    a = (a + aa) >>> 0;
    b = (b + bb) >>> 0;
    c = (c + cc) >>> 0;
    d = (d + dd) >>> 0;
  }
  const digest = Buffer.alloc(16);
  digest.writeUInt32LE(a, 0);
  digest.writeUInt32LE(b, 4);
  digest.writeUInt32LE(c, 8);
  digest.writeUInt32LE(d, 12);
  return digest;
}

function md4Round1(a, b, c, d, x) {
  const s = [3, 7, 11, 19];
  for (let i = 0; i < 16; i += 4) {
    a = rotl((a + md4F(b, c, d) + x[i]) >>> 0, s[0]);
    d = rotl((d + md4F(a, b, c) + x[i + 1]) >>> 0, s[1]);
    c = rotl((c + md4F(d, a, b) + x[i + 2]) >>> 0, s[2]);
    b = rotl((b + md4F(c, d, a) + x[i + 3]) >>> 0, s[3]);
  }
  return [a, b, c, d];
}

function md4Round2(a, b, c, d, x) {
  const s = [3, 5, 9, 13];
  for (const i of [0, 1, 2, 3]) {
    a = rotl((a + md4G(b, c, d) + x[i] + 0x5a827999) >>> 0, s[0]);
    d = rotl((d + md4G(a, b, c) + x[i + 4] + 0x5a827999) >>> 0, s[1]);
    c = rotl((c + md4G(d, a, b) + x[i + 8] + 0x5a827999) >>> 0, s[2]);
    b = rotl((b + md4G(c, d, a) + x[i + 12] + 0x5a827999) >>> 0, s[3]);
  }
  return [a, b, c, d];
}

function md4Round3(a, b, c, d, x) {
  const s = [3, 9, 11, 15];
  for (const i of [0, 2, 1, 3]) {
    a = rotl((a + md4H(b, c, d) + x[i] + 0x6ed9eba1) >>> 0, s[0]);
    d = rotl((d + md4H(a, b, c) + x[i + 8] + 0x6ed9eba1) >>> 0, s[1]);
    c = rotl((c + md4H(d, a, b) + x[i + 4] + 0x6ed9eba1) >>> 0, s[2]);
    b = rotl((b + md4H(c, d, a) + x[i + 12] + 0x6ed9eba1) >>> 0, s[3]);
  }
  return [a, b, c, d];
}

function md4F(x, y, z) { return ((x & y) | (~x & z)) >>> 0; }
function md4G(x, y, z) { return ((x & y) | (x & z) | (y & z)) >>> 0; }
function md4H(x, y, z) { return (x ^ y ^ z) >>> 0; }
function rotl(value, bits) { return ((value << bits) | (value >>> (32 - bits))) >>> 0; }

function edgeGridTimestamp(now) {
  return new Date(Number(now)).toISOString().replace(/\.\d{3}Z$/, '+0000');
}

function edgeGridSigningUrl(requestUrl, baseUrl, environment) {
  const rawBaseUrl = resolveEnvironmentValue(baseUrl, environment).trim();
  if (!rawBaseUrl) {
    return requestUrl;
  }
  try {
    return new URL(rawBaseUrl);
  } catch {
    return requestUrl;
  }
}

function edgeGridCanonicalHeaders(headers, headersToSign, environment) {
  const names = String(resolveEnvironmentValue(headersToSign || '', environment) || '')
    .split(/[,\s]+/)
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
  return names
    .map((name) => {
      const value = headerValue(headers, name);
      return value == null || value === '' ? '' : `${name}:${String(value).trim().replace(/\s+/g, ' ')}`;
    })
    .filter(Boolean)
    .join('\t');
}

function edgeGridBodyForHash(body, maxBodySize, environment) {
  const rawMaxBodySize = resolveEnvironmentValue(maxBodySize, environment).trim();
  const parsed = Number(rawMaxBodySize);
  if (!rawMaxBodySize || !Number.isFinite(parsed) || parsed < 0) {
    return body;
  }
  const size = Math.floor(parsed);
  if (Buffer.isBuffer(body)) {
    return body.slice(0, size);
  }
  return Buffer.from(String(body || ''), 'utf8').slice(0, size);
}

function sha256Base64(value) {
  return crypto.createHash('sha256').update(Buffer.isBuffer(value) ? value : String(value || ''), Buffer.isBuffer(value) ? undefined : 'utf8').digest('base64');
}

function requireResolved(value, environment, label, errors) {
  const resolved = resolveEnvironmentValue(value, environment).trim();
  if (!resolved) {
    errors.push(`${label} is required.`);
  }
  return resolved;
}

function requireResolvedValue(value, environment, label) {
  const resolved = resolveEnvironmentValue(value, environment).trim();
  if (!resolved) {
    throw new Error(`${label} is required.`);
  }
  return resolved;
}

function parseTokenUrl(value, label = 'OAuth 2.0 token URL') {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} is not a valid URI.`);
  }
  const scheme = url.protocol.replace(':', '').toLowerCase();
  if (scheme !== 'http' && scheme !== 'https') {
    throw new Error(`${label} must use http or https.`);
  }
  return url;
}

function parseCallbackUrl(value) {
  try {
    return new URL(String(value));
  } catch {
    throw new Error('OAuth 2.0 authorization callback URL is not valid.');
  }
}

function applyOAuth2ClientAuthentication(auth, environment, body, headers) {
  const clientId = resolveEnvironmentValue(auth.clientId, environment).trim();
  const clientSecret = resolveEnvironmentValue(auth.clientSecret, environment);
  if (!clientId) {
    return;
  }
  if (auth.clientAuthentication === 'basic' && clientSecret) {
    headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`, 'utf8').toString('base64')}`;
    return;
  }
  body.set('client_id', clientId);
  if (clientSecret) {
    body.set('client_secret', clientSecret);
  }
}

function applyOAuth2AuthRequestParams(params, environment, url) {
  for (const param of oauth2RequestParams(params, environment)) {
    url.searchParams.set(param.key, param.value);
  }
}

function applyOAuth2RequestParams(params, environment, body, headers) {
  for (const param of oauth2RequestParams(params, environment)) {
    if (param.sendIn === 'header') {
      headers[param.key] = param.value;
    } else {
      body.set(param.key, param.value);
    }
  }
}

function oauth2RequestParams(params, environment) {
  return (Array.isArray(params) ? params : [])
    .filter((param) => param && param.enabled !== false)
    .map((param) => ({
      key: resolveEnvironmentValue(param.key, environment).trim(),
      value: resolveEnvironmentValue(param.value, environment),
      sendIn: String(param.sendIn || 'body').toLowerCase() === 'header' ? 'header' : 'body'
    }))
    .filter((param) => param.key);
}

async function postOAuthTokenRequest(url, body, options, label, requestOptions = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const response = await fetchImpl(url, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(requestOptions.headers || {})
    },
    body,
    signal: options.signal
  });

  if (response.status >= 300 && response.status < 400) {
    throw new Error(`${label} refused an HTTP redirect from the token endpoint.`);
  }

  const responseText = await response.text();
  let payload = {};
  if (responseText.trim()) {
    try {
      payload = JSON.parse(responseText);
    } catch {
      throw new Error(`${label} returned invalid JSON.`);
    }
  }
  if (!response.ok) {
    const error = new Error(redactOAuthErrorMessage(payload.error_description || payload.error || `${label} failed with HTTP ${response.status}.`));
    error.oauthError = payload.error ? String(payload.error) : '';
    error.status = response.status;
    throw error;
  }
  if (requestOptions.requireAccessToken !== false && !payload.access_token) {
    throw new Error(`${label} response did not include an access token.`);
  }
  return payload;
}

function deviceCodeDeadlineMillis(auth, now = Date.now()) {
  const explicit = Date.parse(auth.deviceCodeExpiresAt);
  if (Number.isFinite(explicit)) {
    return explicit;
  }
  return Number(now) + OAUTH_DEVICE_DEFAULT_EXPIRES_IN_SECONDS * 1000;
}

function positiveNumberOrDefault(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function sleep(milliseconds, signal) {
  if (signal?.aborted) {
    return Promise.reject(signal.reason || new Error('Operation cancelled.'));
  }
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, milliseconds);
    const onAbort = () => {
      clearTimeout(timeout);
      reject(signal.reason || new Error('Operation cancelled.'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function pkceChallengeForVerifier(codeVerifier) {
  validatePkceCodeVerifier(codeVerifier);
  return crypto
    .createHash('sha256')
    .update(String(codeVerifier))
    .digest('base64url');
}

function randomBase64Url(bytes) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function validatePkceCodeVerifier(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._~-]{43,128}$/.test(value)) {
    throw new Error('OAuth 2.0 PKCE code verifier must be 43 to 128 URL-safe characters.');
  }
}

function redactOAuthErrorMessage(value) {
  let text = String(value || '').trim();
  if (!text) {
    return 'OAuth 2.0 provider returned an error.';
  }
  text = redactOAuthQuotedSecretFields(text);
  text = redactTransportReferences(text);
  text = redactOAuthCookieHeaders(text);
  text = redactOAuthBareCookieValues(text);
  text = text.replace(/\s+/g, ' ').trim();
  text = redactOAuthQuotedSecretFields(text);
  text = text.replace(OAUTH_AUTHORIZATION_HEADER_PATTERN, `$1$2${OAUTH_REDACTED_VALUE}`);
  text = text
    .replace(OAUTH_COMPOUND_AUTH_SCHEME_PATTERN, `$1 ${OAUTH_REDACTED_VALUE}`);
  text = redactOAuthAwsQueryFields(text);
  text = redactOAuthSecretFieldsInText(text);
  text = redactOAuthBareSecretLabelsInText(text);
  text = redactRequestResponseAliasesInText(text, OAUTH_REDACTED_VALUE);
  text = redactOAuthRequestResponseFieldsInText(text);
  text = redactOAuthBareRequestResponseLabelsInText(text);
  text = text
    .replace(OAUTH_TOKEN_AUTH_SCHEME_PATTERN, `$1 ${OAUTH_REDACTED_VALUE}`)
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, OAUTH_REDACTED_VALUE);
  text = text.replace(/\[redacted\]\]+/g, OAUTH_REDACTED_VALUE);
  if (text.length > 1000) {
    return `${text.slice(0, 1000)}...`;
  }
  return text;
}

function redactOAuthQuotedSecretFields(value) {
  let text = String(value || '');
  for (const fieldName of OAUTH_SECRET_FIELD_NAMES) {
    const field = escapeRegExp(fieldName);
    text = text
      .replace(new RegExp(`("${field}"\\s*:\\s*")((?:\\\\.|[^"\\\\])*)(")`, 'gi'), `$1${OAUTH_REDACTED_VALUE}$3`)
      .replace(new RegExp(`('\\s*${field}\\s*'\\s*:\\s*')((?:\\\\.|[^'\\\\])*)(')`, 'gi'), `$1${OAUTH_REDACTED_VALUE}$3`);
  }
  return text;
}

function redactOAuthCookieHeaders(value) {
  const text = String(value || '');
  let output = '';
  let cursor = 0;
  OAUTH_COOKIE_HEADER_START_PATTERN.lastIndex = 0;
  let match;
  while ((match = OAUTH_COOKIE_HEADER_START_PATTERN.exec(text)) !== null) {
    if (match.index < cursor) {
      continue;
    }
    const valueStart = OAUTH_COOKIE_HEADER_START_PATTERN.lastIndex;
    const valueEnd = oauthCookieHeaderValueEnd(text, valueStart);
    output += text.slice(cursor, match.index);
    const cookieValue = text.slice(valueStart, valueEnd).trim();
    if (cookieValue === OAUTH_REDACTED_VALUE || /^redacted$/i.test(cookieValue)) {
      output += text.slice(match.index, valueEnd);
    } else {
      output += `${match[1]}${match[2]}${OAUTH_REDACTED_VALUE}`;
    }
    cursor = valueEnd;
    OAUTH_COOKIE_HEADER_START_PATTERN.lastIndex = valueEnd;
  }
  return output + text.slice(cursor);
}

function redactOAuthBareCookieValues(value) {
  const text = String(value || '');
  let output = '';
  let cursor = 0;
  OAUTH_COOKIE_BARE_START_PATTERN.lastIndex = 0;
  let match;
  while ((match = OAUTH_COOKIE_BARE_START_PATTERN.exec(text)) !== null) {
    if (match.index < cursor) {
      continue;
    }
    const valueStart = OAUTH_COOKIE_BARE_START_PATTERN.lastIndex;
    const valueEnd = oauthCookieHeaderValueEnd(text, valueStart);
    output += text.slice(cursor, match.index);
    const cookieValue = text.slice(valueStart, valueEnd).trim();
    if (cookieValue === OAUTH_REDACTED_VALUE || /^redacted$/i.test(cookieValue)) {
      output += text.slice(match.index, valueEnd);
    } else {
      output += `${match[1]}${match[2]}${OAUTH_REDACTED_VALUE}`;
    }
    cursor = valueEnd;
    OAUTH_COOKIE_BARE_START_PATTERN.lastIndex = valueEnd;
  }
  return output + text.slice(cursor);
}

function oauthCookieHeaderValueEnd(text, valueStart) {
  const start = Math.max(0, Number(valueStart) || 0);
  const nextNewline = text.slice(start).search(/[\r\n]/);
  const lineEnd = nextNewline === -1 ? text.length : start + nextNewline;
  const lineValue = text.slice(start, lineEnd);
  const safeBoundary = OAUTH_COOKIE_SAFE_CONTEXT_BOUNDARY_PATTERN.exec(lineValue);
  if (safeBoundary) {
    return start + safeBoundary.index;
  }
  return lineEnd;
}

function redactOAuthAwsQueryFields(value) {
  return String(value || '').replace(OAUTH_AWS_QUERY_FIELD_PATTERN, `$1$2${OAUTH_REDACTED_VALUE};`);
}

function redactOAuthSecretFieldsInText(value) {
  const text = String(value || '');
  let output = '';
  let cursor = 0;
  OAUTH_SECRET_TEXT_FIELD_NAME_PATTERN.lastIndex = 0;
  let match;
  while ((match = OAUTH_SECRET_TEXT_FIELD_NAME_PATTERN.exec(text)) !== null) {
    if (match.index < cursor) {
      continue;
    }
    const valueStart = OAUTH_SECRET_TEXT_FIELD_NAME_PATTERN.lastIndex;
    const valueEnd = oauthSecretFieldValueEnd(text, valueStart);
    output += text.slice(cursor, match.index);
    const redactedValue = text.slice(valueStart, valueEnd).trim();
    const normalizedRedactedValue = redactedValue.replace(/^(['"])(.*)\1$/, '$2').toLowerCase();
    if (normalizedRedactedValue === OAUTH_REDACTED_VALUE || OAUTH_ALREADY_REDACTED_AUTH_VALUE_PATTERN.test(redactedValue)) {
      output += text.slice(match.index, valueEnd);
      cursor = valueEnd;
      OAUTH_SECRET_TEXT_FIELD_NAME_PATTERN.lastIndex = valueEnd;
      continue;
    }
    output += `${match[1]}${match[2]}${match[1]}${match[3]}${OAUTH_REDACTED_VALUE}`;
    cursor = valueEnd;
    OAUTH_SECRET_TEXT_FIELD_NAME_PATTERN.lastIndex = valueEnd;
  }
  return output + text.slice(cursor);
}

function redactOAuthBareSecretLabelsInText(value) {
  return String(value || '').replace(OAUTH_BARE_SECRET_LABEL_PATTERN, `$1$2${OAUTH_REDACTED_VALUE}`);
}

function redactOAuthRequestResponseFieldsInText(value) {
  const text = String(value || '');
  let output = '';
  let cursor = 0;
  OAUTH_REQUEST_RESPONSE_FIELD_NAME_PATTERN.lastIndex = 0;
  let match;
  while ((match = OAUTH_REQUEST_RESPONSE_FIELD_NAME_PATTERN.exec(text)) !== null) {
    if (match.index < cursor) {
      continue;
    }
    const valueStart = OAUTH_REQUEST_RESPONSE_FIELD_NAME_PATTERN.lastIndex;
    const valueEnd = oauthSecretFieldValueEnd(text, valueStart);
    output += text.slice(cursor, match.index);
    output += `${match[1]}${match[2]}${match[1]}${match[3]}${OAUTH_REDACTED_VALUE}`;
    cursor = valueEnd;
    OAUTH_REQUEST_RESPONSE_FIELD_NAME_PATTERN.lastIndex = valueEnd;
  }
  return output + text.slice(cursor);
}

function redactOAuthBareRequestResponseLabelsInText(value) {
  return String(value || '').replace(OAUTH_REQUEST_RESPONSE_BARE_FIELD_PATTERN, `$1$2${OAUTH_REDACTED_VALUE}`);
}

function oauthSecretFieldValueEnd(text, valueStart) {
  const start = Math.max(0, Number(valueStart) || 0);
  if (text.startsWith(OAUTH_REDACTED_VALUE, start)) {
    return start + OAUTH_REDACTED_VALUE.length;
  }
  const alreadyRedactedAuth = new RegExp(String.raw`^(?:${OAUTH_AUTH_SCHEME_NAMES})\s+\[redacted\]`, 'i').exec(text.slice(start));
  if (alreadyRedactedAuth) {
    return start + alreadyRedactedAuth[0].length;
  }
  const valueChar = text[start];
  if (valueChar === '"' || valueChar === "'") {
    return quotedOAuthValueEnd(text, start, valueChar);
  }
  if (valueChar === '{' || valueChar === '[') {
    return balancedOAuthValueEnd(text, start);
  }
  return unquotedOAuthSecretValueEnd(text, start);
}

function unquotedOAuthSecretValueEnd(text, start) {
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (/[\r\n&"',;<>}\])]/.test(char)) {
      return index;
    }
    if (/\s/.test(char) && looksLikeFollowingOAuthBoundary(text, index + 1)) {
      return index;
    }
  }
  return text.length;
}

function looksLikeFollowingOAuthBoundary(text, start) {
  const remaining = text.slice(start);
  return /^(?:access[-_\s]*token|refresh[-_\s]*token|id[-_\s]*token|auth[-_\s]*token|authentication[-_\s]*token|authorization[-_\s]*token|bearer[-_\s]*token|client[-_\s]*token|oauth[-_\s]*token|client[-_\s]*secret|client[-_\s]*assertion|authorization[-_\s]*code|code[-_\s]*verifier|device[-_\s]*code|user[-_\s]*code|auth[-_\s]*header|authorization[-_\s]*header|proxy[-_\s]*authorization[-_\s]*header|proxy[-_\s]*authorization|authorization|session[-_\s]*token|api[-_\s]*key|x[-_\s]*amz[-_\s]*credential|x[-_\s]*amz[-_\s]*signature|x[-_\s]*amz[-_\s]*security[-_\s]*token|aws[-_\s]*credential|aws[-_\s]*signature|oauth[-_\s]*signature|cert(?:ificate)?[-_\s]*passphrase|private[-_\s]*key|secret[-_\s]*value|signature|mac|token|secret|password|passwd|passphrase|credential|credentials|cookie[-_\s]*header|cookieHeader|set[-_\s]*cookie[-_\s]*header|setCookieHeader|cookie|set[-_\s]*cookie|code|state)\s*[:=]/i.test(remaining)
    || /^[A-Za-z][A-Za-z0-9_.-]{0,128}\s*[:=]/.test(remaining);
}

function quotedOAuthValueEnd(text, start, quote) {
  for (let index = start + 1; index < text.length; index += 1) {
    if (text[index] === '\\') {
      index += 1;
      continue;
    }
    if (text[index] === quote) {
      return index + 1;
    }
  }
  return text.length;
}

function balancedOAuthValueEnd(text, start) {
  const stack = [text[start]];
  let quote = '';
  for (let index = start + 1; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === '\\') {
        index += 1;
        continue;
      }
      if (char === quote) {
        quote = '';
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '{' || char === '[') {
      stack.push(char);
      continue;
    }
    if (char === '}' || char === ']') {
      const expectedOpen = char === '}' ? '{' : '[';
      if (stack.at(-1) !== expectedOpen) {
        return index;
      }
      stack.pop();
      if (stack.length === 0) {
        return index + 1;
      }
    }
  }
  return text.length;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeTokenType(value) {
  if (typeof value === 'string' && value.toLowerCase() === 'bearer') {
    return 'Bearer';
  }
  if (typeof value === 'string' && value.toUpperCase() === 'MAC') {
    return 'MAC';
  }
  return OAUTH2_TOKEN_TYPES.has(value) ? value : 'Bearer';
}

function expiresAtFromPayload(payload, now = Date.now()) {
  const expiresIn = Number(payload.expires_in);
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) {
    return '';
  }
  return new Date(Number(now) + Math.round(expiresIn * 1000)).toISOString();
}

module.exports = {
  API_KEY_LOCATIONS,
  AUTH_TYPES,
  OAUTH2_GRANT_TYPES,
  OAUTH2_REDIRECT_STRATEGIES,
  OAUTH_DEVICE_DEFAULT_EXPIRES_IN_SECONDS,
  OAUTH_DEVICE_DEFAULT_INTERVAL_SECONDS,
  OAUTH_DEVICE_GRANT_TYPE,
  OAUTH_REFRESH_WINDOW_MILLIS,
  applyDigestChallengeAuth,
  applyAuth,
  buildNtlmType3AuthorizationHeader,
  createOAuthPkceSession,
  exchangeOAuthAuthorizationCode,
  maybeRefreshOAuthToken,
  normalizeAuth,
  parseDigestChallenge,
  pkceChallengeForVerifier,
  pollOAuthDeviceToken,
  redactOAuthErrorMessage,
  refreshOAuthToken,
  requestOAuthClientCredentialsToken,
  requestOAuthDeviceAuthorization,
  requestOAuthPasswordCredentialsToken,
  shouldPollOAuthDeviceToken,
  shouldRequestClientCredentialsToken,
  shouldRequestPasswordCredentialsToken,
  shouldRefreshOAuthToken,
  validateAuth
};
