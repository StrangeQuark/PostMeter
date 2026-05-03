const fs = require('node:fs/promises');
const path = require('node:path');
const { writeTextFileAtomic } = require('./workspacePersistence');
const {
  buildProductionReadinessMatrix,
  productionReadinessSummary
} = require('./productionReadinessMatrix');
const {
  DIAGNOSTIC_LEVELS,
  REQUEST_RESPONSE_LOGGING_FIELDS,
  defaultDiagnosticsSettings,
  normalizeDiagnosticsSettings
} = require('./diagnosticsSettings');

const DIAGNOSTICS_SCHEMA_VERSION = 1;
const LOG_LEVEL_WEIGHT = Object.freeze({ debug: 10, info: 20, warn: 30, error: 40 });
const DEFAULT_MAX_LOG_FILE_BYTES = 512 * 1024;
const DEFAULT_MAX_LOG_FILES = 5;
const DEFAULT_MAX_RECORD_BYTES = 16 * 1024;
const DEFAULT_RECENT_LOG_LIMIT = 200;
const MAX_BUNDLE_LOGS = 500;
const MAX_URL_DECODE_DEPTH = 8;
const SENSITIVE_URL_PATH_PARAM_NAMES = new Set([
  'accessToken',
  'apiKey',
  'auth',
  'authorization',
  'authorizationCode',
  'bearer',
  'clientAssertion',
  'clientSecret',
  'code',
  'codeVerifier',
  'cookie',
  'credential',
  'credentials',
  'csrf',
  'deviceCode',
  'idToken',
  'jwt',
  'nonce',
  'oauthNonce',
  'oauthSignature',
  'passphrase',
  'passwd',
  'password',
  'refreshToken',
  'secret',
  'session',
  'sessionToken',
  'signature',
  'state',
  'token',
  'userCode'
].map((name) => name.toLowerCase()));
const SENSITIVE_OBJECT_KEY_NAME_ALLOWLIST = new Set([
  ...SENSITIVE_URL_PATH_PARAM_NAMES,
  'apikey',
  'xapikey',
  'xamzcredential',
  'xamzsignature',
  'xamzsecuritytoken',
  'awscredential',
  'awssignature',
  'authheader',
  'authorizationheader',
  'proxyauthorization',
  'proxyauthorizationheader',
  'oauthsignature',
  'certpassphrase',
  'certificatepassphrase',
  'privatekey',
  'secretvalue',
  'mac',
  'vault'
]);
const REQUEST_RESPONSE_KEY_CATEGORIES = Object.freeze({
  body: 'bodies',
  bodypreview: 'bodies',
  data: 'bodies',
  example: 'bodies',
  examples: 'bodies',
  formdata: 'bodies',
  graphql: 'bodies',
  payload: 'bodies',
  rawbody: 'bodies',
  renderedresponsetext: 'bodies',
  requestbody: 'bodies',
  requestbodytext: 'bodies',
  responsebody: 'bodies',
  responsebodytext: 'bodies',
  responsetext: 'bodies',
  text: 'bodies',
  variables: 'bodies',
  formdataparts: 'bodies',
  graphqlvariables: 'bodies',
  grpc: 'protocolMessages',
  message: 'protocolMessages',
  messages: 'protocolMessages',
  grpcmetadata: 'headers',
  metadata: 'headers',
  requestmetadata: 'headers',
  responsemetadata: 'headers',
  protocolmessage: 'protocolMessages',
  protocolmessages: 'protocolMessages',
  cookie: 'cookies',
  cookies: 'cookies',
  cookiejar: 'cookies',
  setcookie: 'cookies',
  setcookies: 'cookies',
  header: 'headers',
  headers: 'headers',
  httpstatus: 'headers',
  httpstatuscode: 'headers',
  method: 'headers',
  protocol: 'headers',
  requestheaders: 'headers',
  requestmethod: 'headers',
  responseheaders: 'headers',
  responsestatus: 'headers',
  responsestatuscategory: 'headers',
  responsestatuscode: 'headers',
  statuscategory: 'headers',
  statuscode: 'headers',
  headerstext: 'headers',
  finalurl: 'urls',
  fullurl: 'urls',
  href: 'urls',
  path: 'urls',
  pathname: 'urls',
  query: 'urls',
  queryparam: 'urls',
  queryparams: 'urls',
  searchparam: 'urls',
  searchparams: 'urls',
  urlparam: 'urls',
  urlparams: 'urls',
  urlparameter: 'urls',
  urlparameters: 'urls',
  pathparam: 'urls',
  pathparams: 'urls',
  pathparameter: 'urls',
  pathparameters: 'urls',
  parameter: 'urls',
  parameters: 'urls',
  requesturl: 'urls',
  responseurl: 'urls',
  uri: 'urls',
  url: 'urls',
  requestbodybytes: 'bodies',
  requestbytes: 'bodies',
  requestsize: 'bodies',
  responsebodybytes: 'bodies',
  responsebytes: 'bodies',
  responsesize: 'bodies',
  consoleoutput: 'scriptConsole',
  logs: 'scriptConsole',
  scriptconsole: 'scriptConsole',
  scriptlogs: 'scriptConsole',
  idfrompayload: 'payloadIdentifiers',
  payloadderivedidentifier: 'payloadIdentifiers',
  payloadidentifier: 'payloadIdentifiers',
  requestidfrompayload: 'payloadIdentifiers'
});
const REQUEST_RESPONSE_CONTEXT_KEY_CATEGORIES = Object.freeze({
  bodybytes: 'bodies',
  bodysize: 'bodies',
  bytes: 'bodies',
  contentbytes: 'bodies',
  contentlength: 'bodies',
  reason: 'headers',
  reasonphrase: 'headers',
  size: 'bodies',
  status: 'headers',
  statuscategory: 'headers',
  statuscode: 'headers',
  statustext: 'headers'
});

const SECRET_KEY_PATTERN = /(?:^|[_-])(access|api|auth|authorization|bearer|client|cookie|credential|credentials|csrf|device|id|jwt|key|passphrase|passwd|password|private|refresh|secret|session|token|vault)(?:[_-]|$)/i;
const AUTH_SCHEME_NAMES = 'Bearer|Basic|Digest|Hawk|Token|OAuth|NTLM|Negotiate|AWS4-HMAC-SHA256|EG1-HMAC-SHA256';
const SIMPLE_AUTH_SCHEME_NAMES = 'Bearer|Basic|Digest|Hawk|Token|OAuth|NTLM|Negotiate';
const AUTH_PARAMETER_PAIR_PATTERN = String.raw`[A-Za-z][A-Za-z0-9_-]*\s*=\s*(?:"(?:\\.|[^"\\\r\n<>])*"|'(?:\\.|[^'\\\r\n<>])*'|[^\s"',;<>}\])]+)`;
const AUTH_PARAMETER_PAIR_LIST_PATTERN = String.raw`${AUTH_PARAMETER_PAIR_PATTERN}(?:\s*[,;]\s*${AUTH_PARAMETER_PAIR_PATTERN})*`;
const AUTH_PARAMETER_VALUE_PATTERN = String.raw`(?:[A-Za-z][A-Za-z0-9_-]*\s*=\s*(?:"(?:\\.|[^"\\\r\n<>])*"|'(?:\\.|[^'\\\r\n<>])*'|[^\s"',;<>}\])]+)|"(?:\\.|[^"\\\r\n<>])*"|'(?:\\.|[^'\\\r\n<>])*'|[^\s"',;<>}\])]+)(?:\s*[,;]\s*[A-Za-z][A-Za-z0-9_-]*\s*=\s*(?:"(?:\\.|[^"\\\r\n<>])*"|'(?:\\.|[^'\\\r\n<>])*'|[^\s"',;<>}\])]+))*`;
const AUTH_HEADER_PATTERN = new RegExp(String.raw`\b(Authorization|Proxy-Authorization)(\s*[:=]\s*)(?:(?:${AUTH_SCHEME_NAMES})\s+)?${AUTH_PARAMETER_VALUE_PATTERN}`, 'gi');
const AUTH_SCHEME_START_PATTERN = String.raw`(?<![A-Za-z0-9_-])`;
const AUTH_SCHEME_SAFE_VALUE_PATTERN = String.raw`(?:2\.0|\[redacted\]|redacted|endpoint|app|application|auth|authentication|authenticated|token|bearer|basic|digest|hawk|oauth|ntlm|negotiate|username|required|provider|returned|failed|failure|missing|empty|unset|invalid|expired|denied|enabled|disabled|available|unavailable|status|code|flow|grant|scope|scopes|setting|settings|policy|policies|field|fields|value|values|metadata|header|headers|cookie|cookies|jar)(?=\s|$|[.,;:!?)}\]])`;
const SCHEME_SECRET_PATTERN = new RegExp(String.raw`${AUTH_SCHEME_START_PATTERN}(?:${AUTH_SCHEME_NAMES})\s+${AUTH_PARAMETER_PAIR_LIST_PATTERN}`, 'gi');
const SIMPLE_SCHEME_SECRET_PATTERN = new RegExp(String.raw`${AUTH_SCHEME_START_PATTERN}(?:${SIMPLE_AUTH_SCHEME_NAMES})\s+(?!(?:${AUTH_SCHEME_SAFE_VALUE_PATTERN}))[A-Za-z0-9._~+/=-]{1,}`, 'gi');
const COOKIE_SAFE_CONTEXT_PATTERN = String.raw`OAuth\s+2\.0\b|token\s+endpoint\b|provider\s+(?:returned|failed|denied|reported)\b|HTTP\s+\d{3}\b|status\s*[:=]?\s*\d{3}\b|error(?:[-_\s]*description)?\s*[:=]|Basic\s+authentication\b|Bearer\s+authentication\b|Digest\s+auth\b|authentication\s+(?:failed|required)\b`;
const COOKIE_NEXT_LABEL_PATTERN = String.raw`(?:Cookie|Set-Cookie|cookieHeader|setCookieHeader)\b(?:\s*[:=]|\s+(?=[^\r\n"'<>]{1,2048}=))`;
const COOKIE_VALUE_TERMINATOR_PATTERN = String.raw`(?=\s+(?:(?:${COOKIE_SAFE_CONTEXT_PATTERN})|${COOKIE_NEXT_LABEL_PATTERN})|[\r\n]|$)`;
const COOKIE_PATTERN = new RegExp(String.raw`\b(Cookie|Set-Cookie)(\s*[:=]\s*["']?)([^\n\r'"<>]*?)${COOKIE_VALUE_TERMINATOR_PATTERN}`, 'gi');
const BARE_COOKIE_PATTERN = new RegExp(String.raw`\b(Cookie|Set-Cookie|cookieHeader|setCookieHeader)(\s+)(?!(?:authentication|authenticated|auth|jar|jars|handling|handler|helpers?|access|disabled|enabled|unavailable|available|failed|failure|required|provider|returned|setting|settings|policy|policies|headers?|values?|metadata)\b)(?=[^\r\n"'<>]{1,2048}=)([^\r\n"'<>]*?)${COOKIE_VALUE_TERMINATOR_PATTERN}`, 'gi');
const COOKIE_SAFE_CONTEXT_BOUNDARY_PATTERN = new RegExp(String.raw`\s+(?=(?:${COOKIE_SAFE_CONTEXT_PATTERN}))`, 'i');
const SECRET_TEXT_FIELD_NAMES = String.raw`access[-_\s]*token|refresh[-_\s]*token|id[-_\s]*token|auth[-_\s]*token|authentication[-_\s]*token|authorization[-_\s]*token|bearer[-_\s]*token|client[-_\s]*token|oauth[-_\s]*token|csrf[-_\s]*token|xsrf[-_\s]*token|jwt[-_\s]*token|[A-Za-z][A-Za-z0-9]{0,80}[-_\s]*(?:token|secret|password|passwd|passphrase|credential|credentials)|x[-_\s]*(?:api[-_\s]*key|access[-_\s]*token|auth[-_\s]*token|authorization[-_\s]*token|csrf[-_\s]*token|xsrf[-_\s]*token)|client[-_\s]*secret|client[-_\s]*assertion|authorization[-_\s]*code|code[-_\s]*verifier|device[-_\s]*code|user[-_\s]*code|auth[-_\s]*header|authorization[-_\s]*header|proxy[-_\s]*authorization[-_\s]*header|proxy[-_\s]*authorization|authorization|session[-_\s]*(?:token|id)|api[-_\s]*(?:key|secret)|secret[-_\s]*(?:key|access[-_\s]*key)|subscription[-_\s]*key|ocp[-_\s]*apim[-_\s]*subscription[-_\s]*key|access[-_\s]*key(?:[-_\s]*id)?|shared[-_\s]*access[-_\s]*key|(?:account|consumer|license|public|private|signing|storage|webhook)[-_\s]*key(?:[-_\s]*id)?|consumer[-_\s]*(?:key|secret)|oauth[-_\s]*consumer[-_\s]*(?:key|secret)|x[-_\s]*amz[-_\s]*credential|x[-_\s]*amz[-_\s]*signature|x[-_\s]*amz[-_\s]*security[-_\s]*token|aws[-_\s]*credential|aws[-_\s]*signature|oauth[-_\s]*signature|cert(?:ificate)?[-_\s]*passphrase|private[-_\s]*key|secret[-_\s]*value|signature|mac|token|secret|password|passwd|passphrase|credential|credentials|code|state`;
const SECRET_TEXT_FIELD_NAME_PATTERN = new RegExp(String.raw`(?<![A-Za-z0-9_-])(["']?)(${SECRET_TEXT_FIELD_NAMES})\1\s*[:=]\s*`, 'gi');
const FOLLOWING_SECRET_BOUNDARY_PATTERN = new RegExp(String.raw`^(?:${SECRET_TEXT_FIELD_NAMES})\s*[:=]`, 'i');
const SECRET_ESCAPED_FIELD_NAME_PATTERN = new RegExp(String.raw`(?:\\)+["'](${SECRET_TEXT_FIELD_NAMES})(?:\\)+["']\s*:`, 'gi');
const DOUBLE_QUOTED_SECRET_TEXT_FIELD_PATTERN = new RegExp(String.raw`"(${SECRET_TEXT_FIELD_NAMES})"\s*:\s*"((?:\\.|[^"\\])*)"`, 'gi');
const SINGLE_QUOTED_SECRET_TEXT_FIELD_PATTERN = new RegExp(String.raw`'(${SECRET_TEXT_FIELD_NAMES})'\s*:\s*'((?:\\.|[^'\\])*)'`, 'gi');
const HIGH_RISK_SECRET_ASSIGNMENT_PATTERN = new RegExp(String.raw`(?<![A-Za-z0-9_-])((?:client[-_\s]*secret|client[-_\s]*assertion|code[-_\s]*verifier|cert(?:ificate)?[-_\s]*passphrase|private[-_\s]*key|secret[-_\s]*value|password|passphrase|credential|credentials))(\s*[:=]\s*["']?)[^\r\n"',;<>}\])]+?(?=\s+(?:(?:${SECRET_TEXT_FIELD_NAMES})|[A-Za-z][A-Za-z0-9_.-]{0,128})\s*[:=]|\s+POSTMETER_DIAGNOSTIC_URL_\d+_PLACEHOLDER|[\r\n"',;<>}\])]|$)`, 'gi');
const BARE_SECRET_LABEL_NAMES = String.raw`access[-_\s]*token|refresh[-_\s]*token|id[-_\s]*token|csrf[-_\s]*token|xsrf[-_\s]*token|jwt[-_\s]*token|[A-Za-z][A-Za-z0-9]{0,80}[-_\s]*(?:token|secret|password|passwd|passphrase|credential|credentials)|x[-_\s]*(?:api[-_\s]*key|access[-_\s]*token|auth[-_\s]*token|authorization[-_\s]*token|csrf[-_\s]*token|xsrf[-_\s]*token)|client[-_\s]*secret|client[-_\s]*assertion|authorization[-_\s]*code|code[-_\s]*verifier|device[-_\s]*code|user[-_\s]*code|api[-_\s]*(?:key|secret)|secret[-_\s]*(?:key|access[-_\s]*key)|subscription[-_\s]*key|ocp[-_\s]*apim[-_\s]*subscription[-_\s]*key|access[-_\s]*key(?:[-_\s]*id)?|shared[-_\s]*access[-_\s]*key|(?:account|consumer|license|public|private|signing|storage|webhook)[-_\s]*key(?:[-_\s]*id)?|consumer[-_\s]*(?:key|secret)|oauth[-_\s]*consumer[-_\s]*(?:key|secret)|session[-_\s]*(?:token|id)|auth[-_\s]*header|authorization[-_\s]*header|proxy[-_\s]*authorization(?:[-_\s]*header)?|cert(?:ificate)?[-_\s]*passphrase|private[-_\s]*key|secret[-_\s]*value|password|passwd|passphrase|credential|credentials|token|secret`;
const BARE_SECRET_LABEL_SAFE_WORDS = String.raw`is|are|was|were|be|must|should|may|can|cannot|not|endpoint|auth|authentication|authenticated|required|provider|returned|failed|failure|missing|empty|unset|invalid|expired|denied|enabled|disabled|available|unavailable|username|bearer|basic|digest|hawk|oauth|ntlm|negotiate|status|code|flow|grant|scope|scopes|setting|settings|policy|policies|field|fields|value|values|metadata|header|headers|cookie|cookies|jar`;
const BARE_SAFE_WORD_FOLLOW_PATTERN = String.raw`(?:\s|$|[.,;:!?)}\]])`;
const BARE_SECRET_LABEL_PATTERN = new RegExp(String.raw`(?<![A-Za-z0-9_-])(${BARE_SECRET_LABEL_NAMES})(\s+)(?!\[redacted\]\b|redacted\b)(?!(?:${BARE_SECRET_LABEL_SAFE_WORDS})${BARE_SAFE_WORD_FOLLOW_PATTERN})[A-Za-z0-9._~+/=-]{4,}`, 'gi');
const AWS_QUERY_FIELD_PATTERN = /\b((?:x[-_]?amz[-_]?credential|x[-_]?amz[-_]?signature|x[-_]?amz[-_]?security[-_]?token|aws[-_]?credential|aws[-_]?signature))(\s*[:=]\s*["']?)[^\s&"',;<>}\])]+/gi;
const REQUEST_RESPONSE_BARE_FIELD_NAMES = String.raw`request[-_\s]*body(?:[-_\s]*text)?|response[-_\s]*body(?:[-_\s]*text)?|body[-_\s]*preview|rendered[-_\s]*response(?:[-_\s]*text)?|response[-_\s]*text|graphql[-_\s]*variables|form[-_\s]*data(?:[-_\s]*parts)?|protocol[-_\s]*messages?|grpc[-_\s]*messages?|websocket[-_\s]*messages?|socketio[-_\s]*messages?|console[-_\s]*output|script[-_\s]*console|script[-_\s]*logs?|payload[-_\s]*derived[-_\s]*identifier|payload[-_\s]*identifier|request[-_\s]*id[-_\s]*from[-_\s]*payload|id[-_\s]*from[-_\s]*payload|request[-_\s]*url|response[-_\s]*url|final[-_\s]*url|full[-_\s]*url|url[-_\s]*parameters?|url[-_\s]*params?|query[-_\s]*parameters?|query[-_\s]*params?|search[-_\s]*params?|path[-_\s]*parameters?|path[-_\s]*params?|request[-_\s]*headers?|response[-_\s]*headers?|headers?[-_\s]*text|grpc[-_\s]*metadata|request[-_\s]*metadata|response[-_\s]*metadata|metadata|http[-_\s]*status(?:[-_\s]*code)?|status[-_\s]*category|status[-_\s]*code|request[-_\s]*method|method|protocol|parameters?|variables|headers?|body|data|text|query|path|pathname|uri|url`;
const REQUEST_RESPONSE_CONTEXT_CONTAINER_NAMES = String.raw`requests?|responses?|http[-_\s]*requests?|http[-_\s]*responses?|request[-_\s]*infos?|response[-_\s]*infos?|request[-_\s]*details|response[-_\s]*details`;
const REQUEST_RESPONSE_BARE_FIELD_TERMINATOR_PATTERN = String.raw`(?=\s+(?:${REQUEST_RESPONSE_BARE_FIELD_NAMES})\b|[\r\n;,.]|$)`;
const REQUEST_RESPONSE_BARE_FIELD_PATTERN = new RegExp(String.raw`(?<![A-Za-z0-9_-])(${REQUEST_RESPONSE_BARE_FIELD_NAMES})(\s+)(?!\[redacted\]|redacted\b|\[omitted:[A-Za-z]+\])(?!(?:${BARE_SECRET_LABEL_SAFE_WORDS})${BARE_SAFE_WORD_FOLLOW_PATTERN})([^\r\n;,.]*?)${REQUEST_RESPONSE_BARE_FIELD_TERMINATOR_PATTERN}`, 'gi');
const REQUEST_RESPONSE_CONTEXT_CONTAINER_PATTERN = new RegExp(String.raw`(?<![A-Za-z0-9_-])(${REQUEST_RESPONSE_CONTEXT_CONTAINER_NAMES})((?:\s+(?:(?::(?!\/\/)|=)\s*)?)|(?:\s*(?::(?!\/\/)|=)\s*))(?:\[[^\]\r\n]{0,160}\]\s*)?(?:[A-Za-z_$][A-Za-z0-9_$]*(?:\s+[A-Za-z_$][A-Za-z0-9_$]*){0,4}(?:\([^\)\r\n]{0,80}\))?\s*)?(?=[{\[])`, 'gi');
const REQUEST_RESPONSE_QUOTED_CONTEXT_CONTAINER_PATTERN = new RegExp(String.raw`(?<![A-Za-z0-9_-])(["'])(${REQUEST_RESPONSE_CONTEXT_CONTAINER_NAMES})\1(\s*:(?!\/\/)\s*)(?=[{\[])`, 'gi');
const REQUEST_RESPONSE_BARE_CONTAINER_PATTERN = new RegExp(String.raw`(?<![A-Za-z0-9_-])(${REQUEST_RESPONSE_BARE_FIELD_NAMES})((?:\s+(?:(?::(?!\/\/)|=)\s*)?)|(?:\s*(?::(?!\/\/)|=)\s*))(?:\[[^\]\r\n]{0,160}\]\s*)?(?:[A-Za-z_$][A-Za-z0-9_$]*(?:\s+[A-Za-z_$][A-Za-z0-9_$]*){0,4}(?:\([^\)\r\n]{0,80}\))?\s*)?(?=[{\[])`, 'gi');
const REQUEST_RESPONSE_ESCAPED_FIELD_NAMES = String.raw`${REQUEST_RESPONSE_BARE_FIELD_NAMES}|${REQUEST_RESPONSE_CONTEXT_CONTAINER_NAMES}`;
const REQUEST_RESPONSE_ESCAPED_FIELD_NAME_PATTERN = new RegExp(String.raw`(?:\\)+["'](${REQUEST_RESPONSE_ESCAPED_FIELD_NAMES})(?:\\)+["']\s*:`, 'gi');
const REQUEST_RESPONSE_TEXT_FIELD_NAME_PATTERN = /(?<![A-Za-z0-9_-])(["']?)([A-Za-z][A-Za-z0-9_-]{0,128})\1(\s*(?::(?!\/\/)|=)\s*)/g;
const PRIVATE_KEY_PATTERN = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;
const FILE_URL_WITH_SPACES_PATTERN = /\bfile:\/\/(?:(?![\r\n"',;<>})\]]).)*?(?=$|[\r\n"',;<>})\]]|\s+(?=(?:and|or|then|with|from|to|at|in)\s+(?:[A-Za-z][A-Za-z0-9+.-]*:\/\/|[A-Za-z]:\\|\\\\|\/|\[path\]|\[host\]|POSTMETER_DIAGNOSTIC_URL_\d+_PLACEHOLDER)\b)|\s+(?=[A-Za-z][A-Za-z0-9_.-]{0,128}\s*[:=])|\s+(?=(?:Authorization|Proxy-Authorization|Cookie|Set-Cookie|Bearer|Basic|Digest|Hawk|Token|OAuth|NTLM|Negotiate|AWS4-HMAC-SHA256|EG1-HMAC-SHA256)\b)|\s+(?=(?:[A-Za-z][A-Za-z0-9+.-]*:\/\/|[A-Za-z]:\\|\\\\|\/|\[path\]|\[host\]|POSTMETER_DIAGNOSTIC_URL_\d+_PLACEHOLDER)\b))/gi;
const ESCAPED_FILE_URL_WITH_SPACES_PATTERN = /\bfile:(?:\\+\/){2,3}(?:(?![\r\n"',;<>})\]]).)*?(?=$|[\r\n"',;<>})\]]|\s+(?=(?:and|or|then|with|from|to|at|in)\s+(?:[A-Za-z][A-Za-z0-9+.-]*:|\\+\/|[A-Za-z]:\\|\\\\|\/|\[path\]|\[host\]|POSTMETER_DIAGNOSTIC_URL_\d+_PLACEHOLDER)\b)|\s+(?=[A-Za-z][A-Za-z0-9_.-]{0,128}\s*[:=])|\s+(?=(?:Authorization|Proxy-Authorization|Cookie|Set-Cookie|Bearer|Basic|Digest|Hawk|Token|OAuth|NTLM|Negotiate|AWS4-HMAC-SHA256|EG1-HMAC-SHA256)\b)|\s+(?=(?:[A-Za-z][A-Za-z0-9+.-]*:|\\+\/|[A-Za-z]:\\|\\\\|\/|\[path\]|\[host\]|POSTMETER_DIAGNOSTIC_URL_\d+_PLACEHOLDER)\b))/gi;
const URL_PATTERN = /\b[A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s",<>})\]\\]+/g;
const EXTENDED_UNC_PATH_PATTERN = /\\\\\?\\UNC\\[A-Za-z0-9._$-]+\\(?:(?![\r\n"<>|]).)*?(?=$|[\r\n"',;<>})\]]|\s+(?=(?:and|or|then|with|from|to|at|in)\s+(?:[A-Za-z]:\\|\\\\|\/|\[path\]|\[host\]|POSTMETER_DIAGNOSTIC_URL_\d+_PLACEHOLDER)\b)|\s+(?=[A-Za-z][A-Za-z0-9_.-]{0,128}\s*[:=])|\s+(?=(?:Authorization|Proxy-Authorization|Cookie|Set-Cookie|Bearer|Basic|Digest|Hawk|Token|OAuth|NTLM|Negotiate|AWS4-HMAC-SHA256|EG1-HMAC-SHA256)\b)|\s+(?=[A-Za-z]:\\|\\\\|\/|\[path\]|\[host\]|POSTMETER_DIAGNOSTIC_URL_\d+_PLACEHOLDER\b))/g;
const EXTENDED_WINDOWS_PATH_PATTERN = /\\\\\?\\[A-Za-z]:\\(?:(?![\r\n"<>|]).)*?(?=$|[\r\n"',;<>})\]]|\s+(?=(?:and|or|then|with|from|to|at|in)\s+(?:[A-Za-z]:\\|\\\\|\/|\[path\]|\[host\]|POSTMETER_DIAGNOSTIC_URL_\d+_PLACEHOLDER)\b)|\s+(?=[A-Za-z][A-Za-z0-9_.-]{0,128}\s*[:=])|\s+(?=(?:Authorization|Proxy-Authorization|Cookie|Set-Cookie|Bearer|Basic|Digest|Hawk|Token|OAuth|NTLM|Negotiate|AWS4-HMAC-SHA256|EG1-HMAC-SHA256)\b)|\s+(?=[A-Za-z]:\\|\\\\|\/|\[path\]|\[host\]|POSTMETER_DIAGNOSTIC_URL_\d+_PLACEHOLDER\b))/g;
const UNC_PATH_PATTERN = /\\\\[A-Za-z0-9._$-]+\\(?:(?![\r\n"<>|]).)*?(?=$|[\r\n"',;<>})\]]|\s+(?=(?:and|or|then|with|from|to|at|in)\s+(?:[A-Za-z]:\\|\\\\|\/|\[path\]|\[host\]|POSTMETER_DIAGNOSTIC_URL_\d+_PLACEHOLDER)\b)|\s+(?=[A-Za-z][A-Za-z0-9_.-]{0,128}\s*[:=])|\s+(?=(?:Authorization|Proxy-Authorization|Cookie|Set-Cookie|Bearer|Basic|Digest|Hawk|Token|OAuth|NTLM|Negotiate|AWS4-HMAC-SHA256|EG1-HMAC-SHA256)\b)|\s+(?=[A-Za-z]:\\|\\\\|\/|\[path\]|\[host\]|POSTMETER_DIAGNOSTIC_URL_\d+_PLACEHOLDER\b))/g;
const URL_PLACEHOLDER_PREFIX = 'POSTMETER_DIAGNOSTIC_URL';
const WINDOWS_PATH_PATTERN = /\b[A-Za-z]:\\(?:(?![\r\n"<>|]).)*?(?=$|[\r\n"',;<>})\]]|\s+(?=(?:and|or|then|with|from|to|at|in)\s+(?:[A-Za-z]:\\|\\\\|\/|\[path\]|POSTMETER_DIAGNOSTIC_URL_\d+_PLACEHOLDER)\b)|\s+(?=(?:Authorization|Proxy-Authorization|Cookie|Set-Cookie|Bearer|Basic|Digest|Hawk|Token|OAuth|NTLM|Negotiate|AWS4-HMAC-SHA256|EG1-HMAC-SHA256)\b)|\s+(?=[A-Za-z]:\\|\\\\|\/|\[path\]|POSTMETER_DIAGNOSTIC_URL_\d+_PLACEHOLDER\b))/g;
const POSIX_PATH_PATTERN = /(^|[\s"'=:(,\[{\]]|\[host\])\/(?!\/)(?:(?![\r\n"',;<>})]).)*?(?=$|[\r\n"',;<>})]|\s+(?=(?:and|or|then|with|from|to|at|in)\s+(?:[A-Za-z]:\\|\\\\|\/|\[path\]|\[host\]|POSTMETER_DIAGNOSTIC_URL_\d+_PLACEHOLDER)\b)|\s+(?=[A-Za-z][A-Za-z0-9_.-]{0,128}\s*[:=])|\s+(?=(?:Authorization|Proxy-Authorization|Cookie|Set-Cookie|Bearer|Basic|Digest|Hawk|Token|OAuth|NTLM|Negotiate|AWS4-HMAC-SHA256|EG1-HMAC-SHA256)\b)|\s+(?=(?:[A-Za-z]:\\|\\\\|\/|\[path\]|\[host\]|POSTMETER_DIAGNOSTIC_URL_\d+_PLACEHOLDER)\b))/g;
const ESCAPED_SLASH_URL_PATTERN = /\b[A-Za-z][A-Za-z0-9+.-]*:(?:\\+\/){2,3}[^\s",<>})\]]+/g;
const ESCAPED_POSIX_PATH_PATTERN = /(?:\\+\/)(?!\\+\/)[A-Za-z0-9._-]+(?:(?![\r\n"',;<>})\]]).)*?(?=$|[\r\n"',;<>})\]]|\s+(?=(?:and|or|then|with|from|to|at|in)\s+(?:\\+\/|[A-Za-z]:\\|\\\\|\/|\[path\]|\[host\]|POSTMETER_DIAGNOSTIC_URL_\d+_PLACEHOLDER)\b)|\s+(?=[A-Za-z][A-Za-z0-9_.-]{0,128}\s*[:=])|\s+(?=(?:Authorization|Proxy-Authorization|Cookie|Set-Cookie|Bearer|Basic|Digest|Hawk|Token|OAuth|NTLM|Negotiate|AWS4-HMAC-SHA256|EG1-HMAC-SHA256)\b)|\s+(?=(?:\\+\/|[A-Za-z]:\\|\\\\|\/|\[path\]|\[host\]|POSTMETER_DIAGNOSTIC_URL_\d+_PLACEHOLDER)\b))/g;
const ENCODED_URL_PARAM_TEXT_PATTERN = /(?<![A-Za-z0-9%])(?=[^\s"',;<>}\])]*%(?:25)*3d)[^\s"',;<>}\])]+/gi;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const IPV4_ENDPOINT_PATTERN = /\b(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?::\d{1,5})?\b/g;
const BRACKETED_IPV6_ENDPOINT_PATTERN = /\[(?:[0-9A-Fa-f]{0,4}:){2,}[0-9A-Fa-f:.]{0,39}\](?::\d{1,5})?/g;
const LOCALHOST_ENDPOINT_PATTERN = /\blocalhost(?::\d{1,5})?\b/gi;
const BARE_HOST_ENDPOINT_PATTERN = /\b(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+(?:[A-Za-z][A-Za-z0-9-]{1,62}|local|localhost)(?::\d{1,5})?\b/g;
const SAFE_DIAGNOSTIC_ERROR_CODES = new Set([
  'ABORT_ERR',
  'COLLECTION_IMPORT_FAILED',
  'EACCES',
  'EADDRINUSE',
  'EADDRNOTAVAIL',
  'EAFNOSUPPORT',
  'EAGAIN',
  'EBADF',
  'EBUSY',
  'ECANCELED',
  'ECONNABORTED',
  'ECONNREFUSED',
  'ECONNRESET',
  'EEXIST',
  'EHOSTUNREACH',
  'EINVAL',
  'EIO',
  'EISDIR',
  'EMFILE',
  'ENFILE',
  'ENOENT',
  'ENOMEM',
  'ENOSPC',
  'ENOTDIR',
  'ENOTEMPTY',
  'ENOTFOUND',
  'ENOTSUP',
  'EPERM',
  'EPIPE',
  'ETIMEDOUT',
  'LOAD_START_FAILED',
  'OAUTH_CALLBACKREJECTED',
  'OAUTH_DEVICE_FAILED',
  'OAUTH_FAILED',
  'OAUTH_PKCE_FAILED',
  'OPERATION_CANCELLED',
  'OPERATION_TIMEOUT',
  'OS_SANDBOX_BACKEND_LAUNCH_FAILED',
  'OS_SANDBOX_BACKEND_REQUIRED_UNAVAILABLE',
  'OS_SANDBOX_BACKEND_UNAVAILABLE',
  'PRE_REQUEST_SCRIPT_FAILED',
  'PROGRESS_DELIVERY_FAILED',
  'REQUEST_SEND_FAILED',
  'RUNNER_START_FAILED',
  'SANDBOX_PACKAGE_FETCH_FAILED',
  'SANDBOX_RUNTIME_VALIDATION_FAILED',
  'SCRIPT_COOKIE_DENIED_OR_FAILED',
  'SCRIPT_COOKIES_DISABLED',
  'SCRIPT_SEND_REQUEST_DENIED_OR_FAILED',
  'SCRIPT_SEND_REQUEST_DISABLED',
  'SCRIPT_VAULT_DENIED_OR_FAILED',
  'SCRIPT_VAULT_DISABLED',
  'SCRIPT_VAULT_PROMPT_DENIED',
  'SCRIPT_VAULT_UNAVAILABLE',
  'STARTUP_FAILED',
  'UPDATES_CHECK_FAILED',
  'VAULT_PROMPT_DENIED',
  'WORKSPACE_IMPORT_FAILED',
  'WORKSPACE_RECOVERED_FROM_UNREADABLE_FILE'
]);
const SENSITIVE_ERROR_CODE_PATTERN = /(?:ACCESS|API|ASSERTION|AUTH|AUTHORIZATION|BEARER|CLIENT|CODE|COOKIE|CREDENTIAL|CSRF|DEVICE|ID_TOKEN|JWT|KEY|OAUTH|PASS|PASSWORD|PRIVATE|REFRESH|SECRET|SESSION|SIGNATURE|STATE|TOKEN|USER_CODE|VAULT|VERIFIER)/i;
const SAFE_DIAGNOSTIC_LABEL_PATTERN = /^[a-z][a-z0-9_.:-]{0,127}$/;
const SENSITIVE_DIAGNOSTIC_METADATA_ASSIGNMENT_PATTERN = new RegExp(String.raw`(?:${SECRET_TEXT_FIELD_NAMES})\s*[:=]`, 'i');
const SECRET_SHAPED_DIAGNOSTIC_LABEL_PATTERN = /(?:^|[_.:-])(?:access[_-]?token|refresh[_-]?token|id[_-]?token|auth[_-]?token|authorization[_-]?token|csrf[_-]?token|xsrf[_-]?token|jwt[_-]?token|api[_-]?key|secret[_-]?key|client[_-]?secret|password|passwd|passphrase|credential|credentials|secret|token|state|code)(?:[_.:-]+[a-z0-9]*secret[a-z0-9]*|[_.:-]+(?=[a-z0-9]{8,}(?:$|[_.:-]))(?=[a-z0-9]*[0-9])[a-z0-9]+)(?:$|[_.:-])/i;
const COMPACT_SECRET_SHAPED_DIAGNOSTIC_LABEL_PATTERN = /(?:(?:accesstoken|refreshtoken|idtoken|authtoken|authenticationtoken|authorizationtoken|csrftoken|xsrftoken|jwttoken|apikey|secretkey|clientsecret|password|passwd|passphrase|credential|credentials|secret|state|code)(?:[a-z0-9]*secret[a-z0-9]*|[a-z0-9]{8,})|token(?:[a-z0-9]*secret[a-z0-9]*|(?=[a-z0-9]{8,})(?=[a-z0-9]*[0-9])[a-z0-9]+))/i;
const DIAGNOSTIC_SECRET_LABEL_TEXT_PATTERN = /(?<![A-Za-z0-9])(?:[A-Za-z][A-Za-z0-9]{0,80}[-_.:]?)?(?:(?:access[-_]?token|refresh[-_]?token|id[-_]?token|auth[-_]?token|authentication[-_]?token|authorization[-_]?token|csrf[-_]?token|xsrf[-_]?token|jwt[-_]?token|api[-_]?key|secret[-_]?key|client[-_]?secret|password|passwd|passphrase|credential|credentials|secret|token|state|code)(?:[-_.:]+[A-Za-z0-9]*secret[A-Za-z0-9]*|[-_.:]+(?=[A-Za-z0-9]{8,}(?![A-Za-z0-9]))(?=[A-Za-z0-9]*[0-9])[A-Za-z0-9]+|[A-Za-z0-9]*secret[A-Za-z0-9]*|(?=[A-Za-z0-9]{8,}(?![A-Za-z0-9]))(?=[A-Za-z0-9]*[0-9])[A-Za-z0-9]+))(?![A-Za-z0-9])/gi;

function diagnosticsLoggingEnabled(settings, level = 'info') {
  const normalized = normalizeDiagnosticsSettings(settings);
  if (normalized.logging.enabled !== true) {
    return false;
  }
  return LOG_LEVEL_WEIGHT[normalizeDiagnosticLevel(level)] >= LOG_LEVEL_WEIGHT[normalized.logging.level];
}

function sanitizeDiagnosticEvent(event = {}, settings = {}) {
  const normalizedSettings = normalizeDiagnosticsSettings(settings);
  const timestamp = safeIsoTimestamp(event.timestamp || new Date().toISOString());
  const level = normalizeDiagnosticLevel(event.level);
  const type = safeRedactedToken(event.type || event.event || 'diagnostic.event', 128, 'diagnostic.event');
  const record = {
    schemaVersion: DIAGNOSTICS_SCHEMA_VERSION,
    timestamp,
    level,
    type
  };
  const fields = event.fields && typeof event.fields === 'object' && !Array.isArray(event.fields)
    ? event.fields
    : {};
  const sanitizedFields = sanitizeDiagnosticValue(fields, normalizedSettings, []);
  if (sanitizedFields && typeof sanitizedFields === 'object' && Object.keys(sanitizedFields).length) {
    record.fields = sanitizedFields;
  }
  if (event.outcome != null) {
    record.outcome = safeRedactedToken(event.outcome, 64, 'redacted');
  }
  if (event.failureCode != null) {
    record.failureCode = sanitizeDiagnosticFailureCode(event.failureCode);
  }
  if (Number.isFinite(Number(event.durationMillis))) {
    record.durationMillis = Math.max(0, Math.round(Number(event.durationMillis)));
  }
  return enforceRecordSize(record);
}

function sanitizeDiagnosticValue(value, settings, pathParts) {
  if (value == null) {
    return value;
  }
  const key = pathParts.at(-1) || '';
  const exactKeyCategory = exactRequestResponseCategoryForKey(key);
  const keyCategory = requestResponseCategoryForKey(key) || contextualRequestResponseCategoryForKey(key, pathParts);
  if (key && isSensitiveKeyName(key) && !exactKeyCategory) {
    return '[redacted]';
  }
  if (keyCategory && !settings.requestResponseLogging[keyCategory]) {
    return omittedValue(keyCategory);
  }
  if (keyCategory === 'cookies') {
    return '[redacted-cookie]';
  }
  if (typeof value === 'string') {
    return redactText(value, { allowUrl: keyCategory === 'urls' && settings.requestResponseLogging.urls === true });
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : '[invalid-number]';
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 100).map((item, index) => sanitizeDiagnosticValue(item, settings, [...pathParts, String(index)]));
  }
  if (typeof value === 'object') {
    const structuredUrlParamName = structuredUrlParameterName(value, pathParts);
    const structuredUrlParamValue = structuredUrlParameterValue(value);
    const structuredUrlParamIsSensitive = structuredUrlParamName
      && (isSensitiveUrlParamName(structuredUrlParamName) || containsJwt(structuredUrlParamValue));
    const structuredHeaderName = structuredHeaderMetadataName(value, pathParts);
    const structuredHeaderValue = structuredHeaderMetadataValue(value);
    const structuredHeaderIsSensitive = structuredHeaderName
      && (isSensitiveKeyName(structuredHeaderName) || containsJwt(structuredHeaderValue));
    const output = {};
    for (const [rawKey, rawValue] of Object.entries(value).slice(0, 100)) {
      const decisionKey = safeToken(rawKey, 128);
      if (!decisionKey) {
        continue;
      }
      const childKey = diagnosticOutputKey(rawKey, decisionKey, output);
      if (structuredUrlParamIsSensitive && isStructuredUrlParamValueKey(decisionKey)) {
        output[childKey] = '[redacted]';
        continue;
      }
      if (structuredHeaderIsSensitive && isStructuredHeaderMetadataValueKey(decisionKey)) {
        output[childKey] = '[redacted]';
        continue;
      }
      if (isSensitiveKeyName(decisionKey) && !exactRequestResponseCategoryForKey(decisionKey)) {
        output[childKey] = '[redacted]';
        continue;
      }
      const childCategory = requestResponseCategoryForKey(decisionKey);
      if (childCategory && !settings.requestResponseLogging[childCategory]) {
        output[childKey] = omittedValue(childCategory);
        continue;
      }
      if (childCategory === 'cookies') {
        output[childKey] = '[redacted-cookie]';
        continue;
      }
      output[childKey] = sanitizeDiagnosticValue(rawValue, settings, [...pathParts, decisionKey]);
    }
    return output;
  }
  return String(value);
}

function diagnosticOutputKey(rawKey, fallbackKey, output) {
  const raw = String(rawKey || '');
  if (!diagnosticKeyContainsSensitiveMaterial(raw)) {
    return fallbackKey;
  }
  let candidate = '[redacted-key]';
  let counter = 2;
  while (Object.prototype.hasOwnProperty.call(output, candidate)) {
    candidate = `[redacted-key-${counter}]`;
    counter += 1;
  }
  return candidate;
}

function diagnosticKeyContainsSensitiveMaterial(rawKey) {
  const raw = String(rawKey || '');
  if (!raw) {
    return false;
  }
  const redacted = redactText(raw);
  return (redacted !== raw
    && /\[(?:redacted|omitted|path|url|host)/.test(redacted))
    || looksLikeSensitiveObjectKeyPayload(raw);
}

function looksLikeSensitiveObjectKeyPayload(rawKey) {
  const normalized = normalizeDiagnosticKey(rawKey);
  if (!normalized
    || exactRequestResponseCategoryForKey(rawKey)
    || SENSITIVE_OBJECT_KEY_NAME_ALLOWLIST.has(normalized)) {
    return false;
  }
  return isSensitiveKeyName(rawKey)
    && /(?:authorization|bearer|credential|key|password|passphrase|secret|signature|token|vault|\d{4,})/i.test(normalized);
}

function redactText(value, options = {}) {
  let text = String(value || '');
  text = text.replace(PRIVATE_KEY_PATTERN, '[redacted-private-key]');
  const urls = [];
  text = text.replace(ESCAPED_FILE_URL_WITH_SPACES_PATTERN, () => {
    const token = `${URL_PLACEHOLDER_PREFIX}_${urls.length}_PLACEHOLDER`;
    urls.push('file://[path]');
    return token;
  });
  text = text.replace(FILE_URL_WITH_SPACES_PATTERN, () => {
    const token = `${URL_PLACEHOLDER_PREFIX}_${urls.length}_PLACEHOLDER`;
    urls.push('file://[path]');
    return token;
  });
  text = text.replace(ESCAPED_SLASH_URL_PATTERN, (rawUrl) => {
    const token = `${URL_PLACEHOLDER_PREFIX}_${urls.length}_PLACEHOLDER`;
    urls.push(options.allowUrl === true ? redactUrl(unescapeEscapedSlashes(rawUrl)) : '[url]');
    return token;
  });
  text = text.replace(URL_PATTERN, (rawUrl) => {
    const token = `${URL_PLACEHOLDER_PREFIX}_${urls.length}_PLACEHOLDER`;
    urls.push(options.allowUrl === true ? redactUrl(rawUrl) : '[url]');
    return token;
  });
  text = redactEscapedSecretFieldsInText(text);
  text = redactQuotedSecretFieldsInText(text);
  text = text.replace(AUTH_HEADER_PATTERN, '$1$2[redacted]');
  text = text.replace(COOKIE_PATTERN, redactCookieHeaderValue);
  text = text.replace(BARE_COOKIE_PATTERN, redactCookieHeaderValue);
  text = text.replace(SCHEME_SECRET_PATTERN, '[redacted-auth]');
  text = text.replace(SIMPLE_SCHEME_SECRET_PATTERN, '[redacted-auth]');
  text = redactHighRiskSecretAssignmentsInText(text);
  text = redactAwsQueryFieldsInText(text);
  text = redactEncodedUrlParamTextInText(text);
  text = redactDiagnosticSecretLabelsInText(text);
  text = redactSecretFieldsInText(text);
  text = redactRequestResponseAliasesInText(text);
  text = redactBareSecretLabelsInText(text);
  text = text.replace(JWT_PATTERN, '[redacted-jwt]');
  text = text.replace(EXTENDED_UNC_PATH_PATTERN, '[path]');
  text = text.replace(EXTENDED_WINDOWS_PATH_PATTERN, '[path]');
  text = text.replace(UNC_PATH_PATTERN, '[path]');
  text = text.replace(ESCAPED_POSIX_PATH_PATTERN, '[path]');
  text = text.replace(WINDOWS_PATH_PATTERN, '[path]');
  text = text.replace(POSIX_PATH_PATTERN, (match, prefix = '') => `${prefix}[path]`);
  text = redactBareNetworkEndpoints(text);
  text = text.replace(POSIX_PATH_PATTERN, (match, prefix = '') => `${prefix}[path]`);
  for (const [index, replacement] of urls.entries()) {
    text = text.replaceAll(`${URL_PLACEHOLDER_PREFIX}_${index}_PLACEHOLDER`, replacement);
  }
  return truncateString(text, 2048);
}

function redactTransportReferences(value, options = {}) {
  let text = String(value || '');
  text = text.replace(PRIVATE_KEY_PATTERN, '[redacted-private-key]');
  const urls = [];
  text = text.replace(ESCAPED_FILE_URL_WITH_SPACES_PATTERN, () => {
    const token = `${URL_PLACEHOLDER_PREFIX}_${urls.length}_PLACEHOLDER`;
    urls.push('file://[path]');
    return token;
  });
  text = text.replace(FILE_URL_WITH_SPACES_PATTERN, () => {
    const token = `${URL_PLACEHOLDER_PREFIX}_${urls.length}_PLACEHOLDER`;
    urls.push('file://[path]');
    return token;
  });
  text = text.replace(ESCAPED_SLASH_URL_PATTERN, (rawUrl) => {
    const token = `${URL_PLACEHOLDER_PREFIX}_${urls.length}_PLACEHOLDER`;
    urls.push(options.allowUrl === true ? redactUrl(unescapeEscapedSlashes(rawUrl)) : '[url]');
    return token;
  });
  text = text.replace(URL_PATTERN, (rawUrl) => {
    const token = `${URL_PLACEHOLDER_PREFIX}_${urls.length}_PLACEHOLDER`;
    urls.push(options.allowUrl === true ? redactUrl(rawUrl) : '[url]');
    return token;
  });
  text = redactEscapedSecretFieldsInText(text);
  text = redactQuotedSecretFieldsInText(text);
  text = text.replace(AUTH_HEADER_PATTERN, '$1$2[redacted]');
  text = text.replace(SCHEME_SECRET_PATTERN, '[redacted-auth]');
  text = text.replace(SIMPLE_SCHEME_SECRET_PATTERN, '[redacted-auth]');
  text = redactEncodedUrlParamTextInText(text);
  text = redactDiagnosticSecretLabelsInText(text);
  text = text.replace(JWT_PATTERN, '[redacted-jwt]');
  text = text.replace(EXTENDED_UNC_PATH_PATTERN, '[path]');
  text = text.replace(EXTENDED_WINDOWS_PATH_PATTERN, '[path]');
  text = text.replace(UNC_PATH_PATTERN, '[path]');
  text = text.replace(ESCAPED_POSIX_PATH_PATTERN, '[path]');
  text = text.replace(WINDOWS_PATH_PATTERN, '[path]');
  text = text.replace(POSIX_PATH_PATTERN, (match, prefix = '') => `${prefix}[path]`);
  text = redactBareNetworkEndpoints(text);
  text = text.replace(POSIX_PATH_PATTERN, (match, prefix = '') => `${prefix}[path]`);
  for (const [index, replacement] of urls.entries()) {
    text = text.replaceAll(`${URL_PLACEHOLDER_PREFIX}_${index}_PLACEHOLDER`, replacement);
  }
  return truncateString(text, 2048);
}

function redactHighRiskSecretAssignmentsInText(value) {
  return String(value || '').replace(HIGH_RISK_SECRET_ASSIGNMENT_PATTERN, '$1$2[redacted]');
}

function redactCookieHeaderValue(_match, key, separator, value = '') {
  const text = String(value || '');
  const safeBoundary = COOKIE_SAFE_CONTEXT_BOUNDARY_PATTERN.exec(text);
  return safeBoundary
    ? `${key}${separator}[redacted]${text.slice(safeBoundary.index)}`
    : `${key}${separator}[redacted]`;
}

function redactAwsQueryFieldsInText(value) {
  return String(value || '').replace(AWS_QUERY_FIELD_PATTERN, '$1$2[redacted];');
}

function redactEncodedUrlParamTextInText(value) {
  return String(value || '').replace(ENCODED_URL_PARAM_TEXT_PATTERN, (match) => {
    if (!containsSensitiveUrlParamText(match)) {
      return match;
    }
    return redactUrlParamText(match).replace(/%5Bredacted%5D/gi, '[redacted]');
  });
}

function redactDiagnosticSecretLabelsInText(value) {
  return String(value || '').replace(DIAGNOSTIC_SECRET_LABEL_TEXT_PATTERN, '[redacted]');
}

function redactQuotedSecretFieldsInText(value) {
  return String(value || '')
    .replace(DOUBLE_QUOTED_SECRET_TEXT_FIELD_PATTERN, (_match, key) => `"${key}":"[redacted]"`)
    .replace(SINGLE_QUOTED_SECRET_TEXT_FIELD_PATTERN, (_match, key) => `'${key}':'[redacted]'`);
}

function redactSecretFieldsInText(value) {
  const text = String(value || '');
  let output = '';
  let cursor = 0;
  SECRET_TEXT_FIELD_NAME_PATTERN.lastIndex = 0;
  let match;
  while ((match = SECRET_TEXT_FIELD_NAME_PATTERN.exec(text)) !== null) {
    if (match.index < cursor) {
      continue;
    }
    output += text.slice(cursor, match.index);
    output += `${match[2]}=[redacted]`;
    const valueEnd = secretFieldValueEnd(text, SECRET_TEXT_FIELD_NAME_PATTERN.lastIndex);
    cursor = valueEnd;
    SECRET_TEXT_FIELD_NAME_PATTERN.lastIndex = valueEnd;
  }
  return output + text.slice(cursor);
}

function redactBareSecretLabelsInText(value) {
  return String(value || '').replace(BARE_SECRET_LABEL_PATTERN, '$1$2[redacted]');
}

function redactEscapedSecretFieldsInText(value, replacement = '[redacted]') {
  const text = String(value || '');
  let output = '';
  let cursor = 0;
  SECRET_ESCAPED_FIELD_NAME_PATTERN.lastIndex = 0;
  let match;
  while ((match = SECRET_ESCAPED_FIELD_NAME_PATTERN.exec(text)) !== null) {
    if (match.index < cursor) {
      continue;
    }
    const valueStart = skipWhitespace(text, SECRET_ESCAPED_FIELD_NAME_PATTERN.lastIndex);
    const value = escapedFieldValueBounds(text, valueStart, { allowCommaDelimiter: false });
    if (!value) {
      continue;
    }
    output += text.slice(cursor, valueStart);
    output += `${value.prefix}${replacement}${value.suffix}`;
    cursor = value.end;
    SECRET_ESCAPED_FIELD_NAME_PATTERN.lastIndex = cursor;
  }
  return output + text.slice(cursor);
}

function requestResponseReplacementFor(replacementForKey) {
  return typeof replacementForKey === 'function'
    ? replacementForKey
    : (key) => replacementForKey || omittedValue(requestResponseCategoryForKey(key) || 'bodies');
}

function redactRequestResponseAliasesInText(value, replacementForKey = null) {
  let text = redactQuotedRequestResponseContextContainersInText(value, replacementForKey);
  text = redactRequestResponseContextContainersInText(text, replacementForKey);
  text = redactBareRequestResponseContainersInText(text, replacementForKey);
  text = redactBareRequestResponseLabelsInText(text, replacementForKey);
  text = redactEscapedRequestResponseFieldsInText(text, replacementForKey);
  return redactRequestResponseFieldsInText(text, replacementForKey);
}

function redactQuotedRequestResponseContextContainersInText(value, replacementForKey = null) {
  const text = String(value || '');
  const replacement = requestResponseReplacementFor(replacementForKey);
  let output = '';
  let cursor = 0;
  REQUEST_RESPONSE_QUOTED_CONTEXT_CONTAINER_PATTERN.lastIndex = 0;
  let match;
  while ((match = REQUEST_RESPONSE_QUOTED_CONTEXT_CONTAINER_PATTERN.exec(text)) !== null) {
    if (match.index < cursor) {
      continue;
    }
    const [, quote, key, separator] = match;
    const containerStart = REQUEST_RESPONSE_QUOTED_CONTEXT_CONTAINER_PATTERN.lastIndex;
    const containerEnd = balancedValueEnd(text, containerStart);
    const expectedClose = text[containerStart] === '[' ? ']' : '}';
    if (text[containerEnd - 1] !== expectedClose) {
      continue;
    }
    output += text.slice(cursor, match.index);
    output += `${quote}${key}${quote}${separator}${quote}${replacement(key)}${quote}`;
    cursor = containerEnd;
    REQUEST_RESPONSE_QUOTED_CONTEXT_CONTAINER_PATTERN.lastIndex = cursor;
  }
  return output + text.slice(cursor);
}

function redactRequestResponseContextContainersInText(value, replacementForKey = null) {
  return redactBalancedRequestResponseContainersInText(
    value,
    REQUEST_RESPONSE_CONTEXT_CONTAINER_PATTERN,
    replacementForKey
  );
}

function redactBareRequestResponseContainersInText(value, replacementForKey = null) {
  return redactBalancedRequestResponseContainersInText(
    value,
    REQUEST_RESPONSE_BARE_CONTAINER_PATTERN,
    replacementForKey,
    { skipSensitiveNonExactKeys: true }
  );
}

function redactBalancedRequestResponseContainersInText(value, pattern, replacementForKey = null, options = {}) {
  const text = String(value || '');
  const replacement = requestResponseReplacementFor(replacementForKey);
  let output = '';
  let cursor = 0;
  pattern.lastIndex = 0;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index < cursor) {
      continue;
    }
    const key = match[1];
    if (options.skipSensitiveNonExactKeys === true && isSensitiveKeyName(key) && !exactRequestResponseCategoryForKey(key)) {
      continue;
    }
    let containerStart = pattern.lastIndex;
    let containerEnd = balancedValueEnd(text, containerStart);
    let expectedClose = text[containerStart] === '[' ? ']' : '}';
    const objectAfterBracketAnnotation = text[containerStart] === '['
      ? skipWhitespace(text, containerEnd)
      : -1;
    if (objectAfterBracketAnnotation >= 0 && (text[objectAfterBracketAnnotation] === '{' || text[objectAfterBracketAnnotation] === '[')) {
      containerStart = objectAfterBracketAnnotation;
      containerEnd = balancedValueEnd(text, containerStart);
      expectedClose = text[containerStart] === '[' ? ']' : '}';
    }
    if (text[containerEnd - 1] !== expectedClose) {
      continue;
    }
    output += text.slice(cursor, match.index);
    output += `${key} ${replacement(key)}`;
    cursor = containerEnd;
    pattern.lastIndex = cursor;
  }
  return output + text.slice(cursor);
}

function redactBareRequestResponseLabelsInText(value, replacementForKey = null) {
  const replacement = requestResponseReplacementFor(replacementForKey);
  return String(value || '').replace(REQUEST_RESPONSE_BARE_FIELD_PATTERN, (_match, key, separator) => (
    `${key}${separator}${replacement(key)}`
  ));
}

function redactEscapedRequestResponseFieldsInText(value, replacementForKey = null) {
  const replacement = requestResponseReplacementFor(replacementForKey);
  return redactEscapedRequestResponseFieldAssignmentsInText(
    redactEscapedJsonRequestResponseFragmentsInText(value, replacement),
    replacement
  );
}

function redactEscapedRequestResponseFieldAssignmentsInText(value, replacement) {
  const text = String(value || '');
  let output = '';
  let cursor = 0;
  REQUEST_RESPONSE_ESCAPED_FIELD_NAME_PATTERN.lastIndex = 0;
  let match;
  while ((match = REQUEST_RESPONSE_ESCAPED_FIELD_NAME_PATTERN.exec(text)) !== null) {
    if (match.index < cursor) {
      continue;
    }
    const key = match[1];
    if (isSensitiveKeyName(key) && !exactRequestResponseCategoryForKey(key)) {
      continue;
    }
    const valueStart = skipWhitespace(text, REQUEST_RESPONSE_ESCAPED_FIELD_NAME_PATTERN.lastIndex);
    const value = escapedFieldValueBounds(text, valueStart, { allowCommaDelimiter: true });
    if (!value) {
      continue;
    }
    output += text.slice(cursor, valueStart);
    output += `${value.prefix}${replacement(key)}${value.suffix}`;
    cursor = value.end;
    REQUEST_RESPONSE_ESCAPED_FIELD_NAME_PATTERN.lastIndex = cursor;
  }
  return output + text.slice(cursor);
}

function redactEscapedJsonRequestResponseFragmentsInText(value, replacement) {
  const text = String(value || '');
  let output = '';
  let cursor = 0;
  REQUEST_RESPONSE_ESCAPED_FIELD_NAME_PATTERN.lastIndex = 0;
  let match;
  while ((match = REQUEST_RESPONSE_ESCAPED_FIELD_NAME_PATTERN.exec(text)) !== null) {
    if (match.index < cursor) {
      continue;
    }
    const fragmentStart = text.lastIndexOf('{', match.index);
    if (fragmentStart < cursor) {
      continue;
    }
    const redacted = redactFirstEscapedJsonRequestResponseFragment(text, fragmentStart, match.index, replacement);
    if (!redacted) {
      continue;
    }
    output += text.slice(cursor, fragmentStart);
    output += redacted.text;
    cursor = redacted.end;
    REQUEST_RESPONSE_ESCAPED_FIELD_NAME_PATTERN.lastIndex = cursor;
  }
  return output + text.slice(cursor);
}

function redactFirstEscapedJsonRequestResponseFragment(text, fragmentStart, requiredFieldIndex, replacement) {
  let candidateEnd = text.indexOf('}', requiredFieldIndex);
  let attempts = 0;
  while (candidateEnd >= 0 && attempts < 200) {
    const fragment = text.slice(fragmentStart, candidateEnd + 1);
    const redacted = redactEscapedJsonRequestResponseFragment(fragment, replacement);
    if (redacted != null) {
      return { text: redacted, end: candidateEnd + 1 };
    }
    candidateEnd = text.indexOf('}', candidateEnd + 1);
    attempts += 1;
  }
  return null;
}

function redactEscapedJsonRequestResponseFragment(fragment, replacement) {
  let decoded = String(fragment || '');
  for (let depth = 0; depth <= 6; depth += 1) {
    const parsed = tryParseJson(decoded);
    if (parsed.ok && isJsonContainer(parsed.value)) {
      let rendered = JSON.stringify(redactParsedJsonRequestResponseValue(parsed.value, replacement));
      for (let index = 0; index < depth; index += 1) {
        rendered = JSON.stringify(rendered).slice(1, -1);
      }
      return rendered;
    }
    const unescaped = tryParseJsonStringLiteral(decoded);
    if (!unescaped.ok || unescaped.value === decoded) {
      return null;
    }
    decoded = unescaped.value;
  }
  return null;
}

function redactParsedJsonRequestResponseValue(value, replacement) {
  if (Array.isArray(value)) {
    return value.map((item) => redactParsedJsonRequestResponseValue(item, replacement));
  }
  if (value && typeof value === 'object') {
    const output = {};
    for (const [rawKey, rawValue] of Object.entries(value)) {
      const category = requestResponseCategoryForKey(rawKey);
      const shouldReplace = category && !(isSensitiveKeyName(rawKey) && !exactRequestResponseCategoryForKey(rawKey));
      output[rawKey] = shouldReplace
        ? replacement(rawKey)
        : redactParsedJsonRequestResponseValue(rawValue, replacement);
    }
    return output;
  }
  if (typeof value !== 'string') {
    return value;
  }
  const nested = redactNestedJsonStringRequestResponseFields(value, replacement);
  if (nested != null) {
    return nested;
  }
  return redactRequestResponseFieldsInText(redactBareRequestResponseLabelsInText(value));
}

function redactNestedJsonStringRequestResponseFields(value, replacement) {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return null;
  }
  let decoded = trimmed;
  for (let depth = 0; depth <= 4; depth += 1) {
    const parsed = tryParseJson(decoded);
    if (parsed.ok && isJsonContainer(parsed.value)) {
      let rendered = JSON.stringify(redactParsedJsonRequestResponseValue(parsed.value, replacement));
      for (let index = 0; index < depth; index += 1) {
        rendered = JSON.stringify(rendered).slice(1, -1);
      }
      return rendered;
    }
    const unescaped = tryParseJsonStringLiteral(decoded);
    if (!unescaped.ok || unescaped.value === decoded) {
      return null;
    }
    decoded = unescaped.value;
  }
  return null;
}

function tryParseJson(value) {
  try {
    return { ok: true, value: JSON.parse(value) };
  } catch {
    return { ok: false, value: null };
  }
}

function tryParseJsonStringLiteral(value) {
  try {
    return { ok: true, value: JSON.parse(`"${value}"`) };
  } catch {
    return { ok: false, value: null };
  }
}

function isJsonContainer(value) {
  return value != null && typeof value === 'object';
}

function escapedFieldValueBounds(text, valueStart, options = {}) {
  const start = Math.max(0, Number(valueStart) || 0);
  const escapedQuote = escapedQuoteSequenceAt(text, start);
  if (escapedQuote) {
    return {
      end: escapedQuotedValueEnd(text, start, escapedQuote.sequence, options),
      prefix: escapedQuote.sequence,
      suffix: escapedQuote.sequence
    };
  }
  const valueChar = text[start];
  if (valueChar === '{' || valueChar === '[') {
    return {
      end: escapedBalancedValueEnd(text, start),
      prefix: '\\"',
      suffix: '\\"'
    };
  }
  if (!valueChar) {
    return null;
  }
  return {
    end: unquotedEscapedRequestResponseValueEnd(text, start),
    prefix: '',
    suffix: ''
  };
}

function escapedQuoteSequenceAt(text, start) {
  let index = Math.max(0, Number(start) || 0);
  let backslashes = 0;
  while (text[index] === '\\') {
    backslashes += 1;
    index += 1;
  }
  if (backslashes > 0 && (text[index] === '"' || text[index] === "'")) {
    return { length: backslashes + 1, quote: text[index], sequence: text.slice(start, index + 1) };
  }
  return null;
}

function escapedQuotedValueEnd(text, start, openSequence, options = {}) {
  const quotePattern = /\\+["']/g;
  quotePattern.lastIndex = start + openSequence.length;
  let match;
  while ((match = quotePattern.exec(text)) !== null) {
    if (looksLikeEscapedJsonValueDelimiter(text, match.index + match[0].length, options)) {
      return match.index + match[0].length;
    }
  }
  return text.length;
}

function escapedBalancedValueEnd(text, start) {
  const stack = [text[start]];
  let inString = false;
  for (let index = start + 1; index < text.length; index += 1) {
    const escapedQuote = escapedQuoteSequenceAt(text, index);
    if (escapedQuote) {
      if (!inString || looksLikeEscapedJsonStringDelimiter(text, index + escapedQuote.length)) {
        inString = !inString;
      }
      index += escapedQuote.length - 1;
      continue;
    }
    if (inString) {
      continue;
    }
    const char = text[index];
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

function unquotedEscapedRequestResponseValueEnd(text, start) {
  for (let index = start; index < text.length; index += 1) {
    if (/[\r\n,}\]]/.test(text[index])) {
      return index;
    }
  }
  return text.length;
}

function looksLikeEscapedJsonValueDelimiter(text, index, options = {}) {
  const next = nextNonWhitespace(text, index);
  return !next.char
    || (options.allowCommaDelimiter !== false && next.char === ',')
    || next.char === '}'
    || next.char === ']'
    || next.char === '\r'
    || next.char === '\n';
}

function looksLikeEscapedJsonStringDelimiter(text, index) {
  const next = nextNonWhitespace(text, index);
  return !next.char || next.char === ':' || next.char === ',' || next.char === '}' || next.char === ']' || next.char === '\r' || next.char === '\n';
}

function nextNonWhitespace(text, start) {
  for (let index = Math.max(0, Number(start) || 0); index < text.length; index += 1) {
    if (!/\s/.test(text[index])) {
      return { char: text[index], index };
    }
  }
  return { char: '', index: text.length };
}

function skipWhitespace(text, start) {
  return nextNonWhitespace(text, start).index;
}

function secretFieldValueEnd(text, valueStart) {
  const start = Math.max(0, Number(valueStart) || 0);
  if (text.startsWith('[redacted]', start)) {
    return start + '[redacted]'.length;
  }
  const valueChar = text[start];
  if (valueChar === '"' || valueChar === "'") {
    return quotedValueEnd(text, start, valueChar);
  }
  if (valueChar === '{' || valueChar === '[') {
    return balancedValueEnd(text, start);
  }
  return unquotedSecretValueEnd(text, start);
}

function unquotedSecretValueEnd(text, start) {
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (/[\r\n&"',;<>}\])]/.test(char)) {
      return index;
    }
    if (/\s/.test(char) && looksLikeFollowingSecretBoundary(text, index + 1)) {
      return index;
    }
  }
  return text.length;
}

function looksLikeFollowingSecretBoundary(text, start) {
  const remaining = text.slice(start);
  return FOLLOWING_SECRET_BOUNDARY_PATTERN.test(remaining)
    || /^[A-Za-z][A-Za-z0-9_.-]{0,128}\s*[:=]/.test(remaining)
    || /^POSTMETER_DIAGNOSTIC_URL_\d+_PLACEHOLDER/.test(remaining);
}

function redactBareNetworkEndpoints(value) {
  return String(value || '')
    .replace(BRACKETED_IPV6_ENDPOINT_PATTERN, '[host]')
    .replace(IPV4_ENDPOINT_PATTERN, '[host]')
    .replace(LOCALHOST_ENDPOINT_PATTERN, '[host]')
    .replace(BARE_HOST_ENDPOINT_PATTERN, '[host]');
}

function unescapeEscapedSlashes(value) {
  return String(value || '').replace(/\\+\//g, '/');
}

function redactRequestResponseFieldsInText(value, replacementForKey = null) {
  const text = String(value || '');
  const replacement = requestResponseReplacementFor(replacementForKey);
  const skipCookieCategory = replacementForKey != null;
  let output = '';
  let cursor = 0;
  REQUEST_RESPONSE_TEXT_FIELD_NAME_PATTERN.lastIndex = 0;
  let match;
  while ((match = REQUEST_RESPONSE_TEXT_FIELD_NAME_PATTERN.exec(text)) !== null) {
    if (match.index < cursor) {
      continue;
    }
    const category = requestResponseCategoryForKey(match[2]);
    if (!category) {
      continue;
    }
    if (skipCookieCategory && category === 'cookies') {
      continue;
    }
    if (isSensitiveKeyName(match[2]) && !exactRequestResponseCategoryForKey(match[2])) {
      continue;
    }
    output += text.slice(cursor, match.index);
    const valueStart = REQUEST_RESPONSE_TEXT_FIELD_NAME_PATTERN.lastIndex;
    const valueQuote = text[valueStart] === '"' || text[valueStart] === "'" ? text[valueStart] : '';
    const redactedValue = valueQuote ? `${valueQuote}${replacement(match[2])}${valueQuote}` : replacement(match[2]);
    output += `${match[1] || ''}${match[2]}${match[1] || ''}${match[3]}${redactedValue}`;
    const valueEnd = requestResponseTextFieldValueEnd(text, valueStart);
    cursor = valueEnd;
    REQUEST_RESPONSE_TEXT_FIELD_NAME_PATTERN.lastIndex = valueEnd;
  }
  return output + text.slice(cursor);
}

function requestResponseTextFieldValueEnd(text, valueStart) {
  const start = Math.max(0, Number(valueStart) || 0);
  const valueChar = text[start];
  if (valueChar === '"' || valueChar === "'") {
    return quotedValueEnd(text, start, valueChar);
  }
  if (valueChar === '{' || valueChar === '[') {
    return balancedValueEnd(text, start);
  }
  return unquotedRequestResponseValueEnd(text, start);
}

function unquotedRequestResponseValueEnd(text, start) {
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (/[\r\n"',;<>}\])]/.test(char)) {
      return index;
    }
    if (/\s/.test(char) && looksLikeFollowingRequestResponseBoundary(text, index + 1)) {
      return index;
    }
  }
  return text.length;
}

function looksLikeFollowingRequestResponseBoundary(text, start) {
  const remaining = text.slice(start);
  return new RegExp(String.raw`^(?:${REQUEST_RESPONSE_BARE_FIELD_NAMES})\b(?:\s*[:=]|\s+)`, 'i').test(remaining)
    || /^[A-Za-z][A-Za-z0-9_.-]{0,128}\s*[:=]/.test(remaining)
    || /^[{[]/.test(remaining)
    || /^POSTMETER_DIAGNOSTIC_URL_\d+_PLACEHOLDER/.test(remaining);
}

function quotedValueEnd(text, start, quote) {
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

function balancedValueEnd(text, start) {
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

function redactUrl(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl));
    if (parsed.protocol === 'file:') {
      return 'file://[path]';
    }
    parsed.username = '';
    parsed.password = '';
    parsed.pathname = redactUrlPathname(parsed.pathname);
    parsed.search = redactUrlParamText(parsed.search.slice(1));
    parsed.hash = redactUrlHash(parsed.hash);
    return parsed.toString();
  } catch {
    return '[url]';
  }
}

function redactUrlPathname(pathname) {
  const segments = normalizeUrlPathSeparators(pathname).replace(/\\/g, '/').split('/');
  let redactNextSegment = false;
  return segments.map((segment) => {
    if (!segment) {
      return segment;
    }
    const decodedSegment = safeDecodeUrlComponent(segment);
    if (redactNextSegment) {
      redactNextSegment = false;
      return '[redacted]';
    }
    if (looksLikeUrlParamText(decodedSegment)) {
      return redactUrlParamText(decodedSegment);
    }
    if (containsJwt(decodedSegment) || containsJwt(segment)) {
      return '[redacted-jwt]';
    }
    const inlineSensitiveSegment = redactInlineSensitiveUrlPathSegment(decodedSegment);
    if (inlineSensitiveSegment != null) {
      return inlineSensitiveSegment;
    }
    if (isSensitiveUrlPathParamName(decodedSegment)) {
      redactNextSegment = true;
    }
    return segment;
  }).join('/');
}

function redactUrlSearchParams(searchParams) {
  const redactedSearchParams = new URLSearchParams();
  for (const [key, value] of searchParams.entries()) {
    const keyContainsJwt = containsJwt(key);
    const keyContainsNestedSecret = containsSensitiveUrlParamText(key);
    const redactedKey = keyContainsJwt || keyContainsNestedSecret ? '[redacted]' : key;
    const redactedValue = isSensitiveUrlParamName(key)
      || keyContainsJwt
      || keyContainsNestedSecret
      || containsJwt(value)
      || containsSensitiveUrlParamText(value)
      ? '[redacted]'
      : value;
    redactedSearchParams.append(redactedKey, redactedValue);
  }
  return redactedSearchParams;
}

function redactUrlParamText(paramText) {
  const text = String(paramText || '');
  if (!text) {
    return '';
  }
  return redactUrlSearchParams(new URLSearchParams(normalizeUrlParamText(text))).toString();
}

function redactUrlHash(rawHash) {
  const hash = String(rawHash || '');
  if (!hash) {
    return '';
  }
  const marker = hash.startsWith('#') ? '#' : '';
  const body = marker ? hash.slice(1) : hash;
  if (!body) {
    return marker;
  }
  const normalizedBody = normalizeUrlHashRouteDelimiters(body);
  const queryIndex = normalizedBody.indexOf('?');
  if (queryIndex >= 0) {
    const prefix = redactUrlHashPathPrefix(normalizedBody.slice(0, queryIndex + 1));
    const params = redactUrlParamText(normalizedBody.slice(queryIndex + 1));
    return `${marker}${prefix}${params}`;
  }
  if (looksLikeUrlParamText(normalizedBody)) {
    return `${marker}${redactUrlParamText(normalizedBody)}`;
  }
  return `${marker}${redactUrlHashPathPrefix(normalizedBody)}`;
}

function redactUrlHashPathPrefix(prefix) {
  const suffix = prefix.endsWith('?') ? '?' : '';
  const body = suffix ? prefix.slice(0, -1) : prefix;
  if (!body) {
    return suffix;
  }
  return `${redactUrlPathname(body)}${suffix}`;
}

function containsSensitiveUrlParamText(value, depth = 0) {
  const text = String(value || '');
  if (!looksLikeUrlParamText(text)) {
    return false;
  }
  const params = new URLSearchParams(normalizeUrlParamText(text));
  for (const [key, nestedValue] of params.entries()) {
    if (isSensitiveUrlParamName(key) || containsJwt(key) || containsJwt(nestedValue)) {
      return true;
    }
    if (depth >= MAX_URL_DECODE_DEPTH) {
      if (looksLikeUrlParamText(nestedValue)) {
        return true;
      }
      continue;
    }
    if (containsSensitiveUrlParamText(nestedValue, depth + 1)) {
      return true;
    }
  }
  return false;
}

function looksLikeUrlParamText(value) {
  const text = String(value || '');
  return /[=&]/.test(text) || hasEncodedUrlParamDelimiter(text);
}

function normalizeUrlParamText(value) {
  let text = String(value || '');
  if (/[=&]/.test(text)) {
    return text;
  }
  for (let depth = 0; depth < MAX_URL_DECODE_DEPTH; depth += 1) {
    if (!/%(?:25|3d|26)/i.test(text)) {
      return text;
    }
    const decoded = safeDecodeUrlComponent(text);
    if (decoded === text) {
      return text;
    }
    text = decoded;
    if (/[=&]/.test(text)) {
      return text;
    }
  }
  return /%(?:25|3d|26)/i.test(text) ? 'token=[redacted]' : text;
}

function hasEncodedUrlParamDelimiter(value) {
  let text = String(value || '');
  for (let depth = 0; depth < MAX_URL_DECODE_DEPTH; depth += 1) {
    if (/%(?:3d|26)/i.test(text)) {
      return true;
    }
    if (!/%25/i.test(text)) {
      return false;
    }
    const decoded = safeDecodeUrlComponent(text);
    if (decoded === text) {
      return false;
    }
    text = decoded;
  }
  return /%(?:25|3d|26)/i.test(text);
}

function normalizeUrlPathSeparators(value) {
  return hasEncodedUrlRouteDelimiter(value, /%(?:2f|5c)/i)
    ? normalizeEncodedUrlRouteDelimiters(value)
    : String(value || '');
}

function normalizeUrlHashRouteDelimiters(value) {
  return hasEncodedUrlRouteDelimiter(value, /%(?:2f|5c|3f)/i)
    ? normalizeEncodedUrlRouteDelimiters(value)
    : String(value || '');
}

function normalizeEncodedUrlRouteDelimiters(value) {
  let text = String(value || '');
  for (let depth = 0; depth < MAX_URL_DECODE_DEPTH; depth += 1) {
    if (!/%(?:25|2f|5c|3f)/i.test(text)) {
      return text;
    }
    const decoded = safeDecodeUrlComponent(text);
    if (decoded === text) {
      return text;
    }
    text = decoded;
  }
  return /%(?:25|2f|5c|3f)/i.test(text) ? '/[redacted]' : text;
}

function hasEncodedUrlRouteDelimiter(value, delimiterPattern) {
  let text = String(value || '');
  for (let depth = 0; depth < MAX_URL_DECODE_DEPTH; depth += 1) {
    if (delimiterPattern.test(text)) {
      return true;
    }
    if (!/%25/i.test(text)) {
      return false;
    }
    const decoded = safeDecodeUrlComponent(text);
    if (decoded === text) {
      return false;
    }
    text = decoded;
  }
  return delimiterPattern.test(text) || /%25/i.test(text);
}

function isSensitiveUrlPathParamName(value) {
  const normalized = normalizeDiagnosticKey(value);
  return SENSITIVE_URL_PATH_PARAM_NAMES.has(normalized)
    || normalized.endsWith('token')
    || normalized.endsWith('secret')
    || normalized.endsWith('password')
    || normalized.endsWith('passphrase')
    || normalized.endsWith('signature')
    || normalized.endsWith('credential')
    || normalized.endsWith('credentials');
}

function redactInlineSensitiveUrlPathSegment(value) {
  return hasInlineSensitiveUrlPathValue(value) ? '[redacted]' : null;
}

function hasInlineSensitiveUrlPathValue(value) {
  const text = String(value || '');
  if (!text) {
    return false;
  }
  const assignment = /^(.{1,160}?)([:=])(.+)$/.exec(text);
  if (assignment && isSensitiveUrlPathParamName(assignment[1])) {
    return true;
  }
  const parts = text.split(/[:=_-]+/).filter(Boolean);
  if (parts.length < 2) {
    return false;
  }
  for (let start = 0; start < parts.length - 1; start += 1) {
    const maxEnd = Math.min(parts.length - 1, start + 4);
    for (let end = start + 1; end <= maxEnd; end += 1) {
      const candidate = parts.slice(start, end).join('');
      if (SENSITIVE_URL_PATH_PARAM_NAMES.has(normalizeDiagnosticKey(candidate))) {
        return true;
      }
    }
  }
  return false;
}

function safeDecodeUrlComponent(value) {
  try {
    return decodeURIComponent(String(value || ''));
  } catch {
    return String(value || '');
  }
}

function containsJwt(value) {
  JWT_PATTERN.lastIndex = 0;
  return JWT_PATTERN.test(String(value || ''));
}

function isSensitiveUrlParamName(key) {
  return urlParamNameCandidates(key).some((candidate) => {
    const normalized = String(candidate || '').replace(/[^A-Za-z0-9]/g, '').toLowerCase();
    return normalized === 'code'
      || normalized === 'state'
      || isSensitiveKeyName(candidate);
  });
}

function urlParamNameCandidates(key) {
  const raw = String(key || '');
  const candidates = [raw];
  for (const separator of ['?', '#', '&', ';', '/', '\\']) {
    const index = raw.lastIndexOf(separator);
    if (index >= 0 && index < raw.length - 1) {
      candidates.push(raw.slice(index + 1));
    }
  }
  return candidates;
}

function structuredUrlParameterName(value, pathParts = []) {
  if (!isUrlParameterContext(pathParts) || !value || typeof value !== 'object' || Array.isArray(value)) {
    return '';
  }
  for (const key of ['key', 'name', 'param', 'parameter']) {
    if (value[key] != null) {
      return String(value[key]);
    }
  }
  return '';
}

function structuredUrlParameterValue(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return '';
  }
  for (const key of ['value', 'rawValue', 'valueRaw', 'raw', 'currentValue', 'values', 'example', 'examples', 'default', 'defaults']) {
    if (value[key] != null) {
      return Array.isArray(value[key]) ? value[key].join(' ') : String(value[key]);
    }
  }
  if (value.schema && typeof value.schema === 'object' && !Array.isArray(value.schema)) {
    return structuredUrlParameterValue(value.schema);
  }
  return '';
}

function structuredHeaderMetadataName(value, pathParts = []) {
  if (!isHeaderMetadataContext(pathParts) || !value || typeof value !== 'object' || Array.isArray(value)) {
    return '';
  }
  for (const key of ['key', 'name', 'header', 'metadata']) {
    if (value[key] != null) {
      return String(value[key]);
    }
  }
  return '';
}

function structuredHeaderMetadataValue(value) {
  return structuredUrlParameterValue(value);
}

function isHeaderMetadataContext(pathParts = []) {
  return pathParts.some((part) => requestResponseCategoryForKey(part) === 'headers');
}

function isUrlParameterContext(pathParts = []) {
  return pathParts.some((part) => {
    const normalized = normalizeDiagnosticKey(part);
    return normalized === 'query'
      || normalized === 'queryparam'
      || normalized === 'queryparams'
      || normalized === 'searchparam'
      || normalized === 'searchparams'
      || normalized === 'urlparam'
      || normalized === 'urlparams'
      || normalized === 'urlparameter'
      || normalized === 'urlparameters'
      || normalized === 'pathparam'
      || normalized === 'pathparams'
      || normalized === 'pathparameter'
      || normalized === 'pathparameters'
      || normalized === 'parameter'
      || normalized === 'parameters'
      || requestResponseCategoryForKey(part) === 'urls';
  });
}

function isStructuredUrlParamValueKey(key) {
  const normalized = normalizeDiagnosticKey(key);
  return normalized === 'value'
    || normalized === 'rawvalue'
    || normalized === 'valueraw'
    || normalized === 'raw'
    || normalized === 'currentvalue'
    || normalized === 'values'
    || normalized === 'example'
    || normalized === 'examples'
    || normalized === 'default'
    || normalized === 'defaults'
    || normalized === 'schema';
}

function isStructuredHeaderMetadataValueKey(key) {
  return isStructuredUrlParamValueKey(key);
}

class LocalDiagnosticsLogger {
  constructor(options = {}) {
    this.logDirectory = path.resolve(options.logDirectory || path.join(process.cwd(), '.postmeter-diagnostics'));
    this.maxFileBytes = boundedInteger(options.maxFileBytes, DEFAULT_MAX_LOG_FILE_BYTES, 4096, 10 * 1024 * 1024);
    this.maxFiles = boundedInteger(options.maxFiles, DEFAULT_MAX_LOG_FILES, 1, 20);
    this.maxRecordBytes = boundedInteger(options.maxRecordBytes, DEFAULT_MAX_RECORD_BYTES, 1024, 1024 * 1024);
    this.clock = typeof options.clock === 'function' ? options.clock : () => new Date();
    this.settingsProvider = typeof options.settingsProvider === 'function' ? options.settingsProvider : () => ({});
    this.pending = Promise.resolve();
  }

  currentLogPath() {
    return path.join(this.logDirectory, 'postmeter.log.jsonl');
  }

  async log(event = {}) {
    const settings = normalizeDiagnosticsSettings(this.settingsProvider());
    if (!diagnosticsLoggingEnabled(settings, event.level || 'info')) {
      return null;
    }
    const record = sanitizeDiagnosticEvent({
      ...event,
      timestamp: event.timestamp || this.clock().toISOString()
    }, settings);
    const line = `${JSON.stringify(enforceRecordSize(record, this.maxRecordBytes))}\n`;
    this.pending = this.pending
      .catch(() => {})
      .then(async () => {
        await fs.mkdir(this.logDirectory, { recursive: true, mode: 0o700 });
        await this.rotateIfNeeded(Buffer.byteLength(line, 'utf8'));
        await fs.appendFile(this.currentLogPath(), line, { mode: 0o600 });
      });
    await this.pending;
    return record;
  }

  async rotateIfNeeded(nextBytes) {
    const target = this.currentLogPath();
    const stat = await fs.stat(target).catch(() => null);
    if (!stat || stat.size + nextBytes <= this.maxFileBytes) {
      return;
    }
    if (this.maxFiles <= 1) {
      await fs.rm(target, { force: true });
      return;
    }
    for (let index = this.maxFiles - 1; index >= 1; index -= 1) {
      const source = index === 1 ? target : rotatedLogPath(this.logDirectory, index - 1);
      const destination = rotatedLogPath(this.logDirectory, index);
      await fs.rm(destination, { force: true }).catch(() => {});
      await fs.rename(source, destination).catch((error) => {
        if (error?.code !== 'ENOENT') {
          throw error;
        }
      });
    }
  }

  async readRecentEntries(limit = DEFAULT_RECENT_LOG_LIMIT) {
    const entries = [];
    const paths = [
      ...Array.from({ length: this.maxFiles - 1 }, (_value, index) => rotatedLogPath(this.logDirectory, this.maxFiles - index - 1)),
      this.currentLogPath()
    ];
    for (const filePath of paths) {
      const text = await fs.readFile(filePath, 'utf8').catch((error) => {
        if (error?.code === 'ENOENT') {
          return '';
        }
        throw error;
      });
      for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) {
          continue;
        }
        try {
          entries.push(JSON.parse(line));
        } catch {
          entries.push({
            schemaVersion: DIAGNOSTICS_SCHEMA_VERSION,
            timestamp: safeIsoTimestamp(new Date(0).toISOString()),
            level: 'warn',
            type: 'diagnostics.log.corrupt-record'
          });
        }
      }
    }
    return entries.slice(-boundedInteger(limit, DEFAULT_RECENT_LOG_LIMIT, 0, MAX_BUNDLE_LOGS));
  }
}

async function exportDiagnosticBundle(options = {}) {
  const targetPath = String(options.targetPath || '').trim();
  if (!targetPath) {
    throw new Error('Diagnostic bundle export path is required.');
  }
  const logger = options.logger;
  const workspace = options.workspace || {};
  const settings = normalizeDiagnosticsSettings(workspace.settings?.diagnostics || options.settings || {});
  const logs = logger && typeof logger.readRecentEntries === 'function'
    ? await logger.readRecentEntries(options.recentLogLimit || DEFAULT_RECENT_LOG_LIMIT)
    : [];
  const readinessMatrix = buildProductionReadinessMatrix();
  const bundle = {
    schemaVersion: DIAGNOSTICS_SCHEMA_VERSION,
    generatedAt: safeIsoTimestamp(options.generatedAt || new Date().toISOString()),
    privacy: {
      automaticTelemetry: false,
      cloudUpload: false,
      userControlledLocalExportOnly: true,
      requestResponseLogging: settings.requestResponseLogging
    },
    app: sanitizeAppInfo(options.appInfo || {}),
    runtime: sanitizeRuntimeInfo(options.runtimeInfo || runtimeInfo()),
    settings: sanitizeSettingsSummary(workspace.settings || {}),
    workspace: workspaceSummary(workspace),
    readiness: sanitizeReadinessSummary(productionReadinessSummary(readinessMatrix)),
    logs: logs.map((entry) => sanitizeDiagnosticEvent(entry, settings)).slice(-DEFAULT_RECENT_LOG_LIMIT)
  };
  await writeTextFileAtomic(targetPath, `${JSON.stringify(bundle, null, 2)}\n`, { prefix: 'postmeter-diagnostics-export', mode: 0o600 });
  return targetPath;
}

function sanitizeAppInfo(value = {}) {
  return {
    version: truncateString(value.version || value.app || '', 128),
    releaseChannel: truncateString(value.releaseChannel || '', 32),
    name: truncateString(value.name || 'PostMeter', 128)
  };
}

function runtimeInfo() {
  return {
    node: process.versions.node,
    electron: process.versions.electron || '',
    chrome: process.versions.chrome || '',
    platform: process.platform,
    arch: process.arch
  };
}

function sanitizeRuntimeInfo(value = {}) {
  return {
    arch: truncateString(value.arch || process.arch, 32),
    chrome: truncateString(value.chrome || '', 64),
    electron: truncateString(value.electron || '', 64),
    node: truncateString(value.node || process.versions.node, 64),
    platform: truncateString(value.platform || process.platform, 32)
  };
}

function sanitizeSettingsSummary(settings = {}) {
  const diagnostics = normalizeDiagnosticsSettings(settings.diagnostics);
  return {
    appearance: {
      theme: truncateString(settings.appearance?.theme || 'system', 32)
    },
    diagnostics,
    sandbox: {
      fileBindingCount: Array.isArray(settings.sandbox?.fileBindings) ? settings.sandbox.fileBindings.length : 0,
      packageCacheCount: Array.isArray(settings.sandbox?.packageCache) ? settings.sandbox.packageCache.length : 0,
      trustedCapabilities: {
        cookies: settings.sandbox?.trustedCapabilities?.cookies !== false,
        sendRequest: settings.sandbox?.trustedCapabilities?.sendRequest !== false,
        vault: settings.sandbox?.trustedCapabilities?.vault === true
      }
    },
    updates: {
      includePrereleases: settings.updates?.includePrereleases === true
    }
  };
}

function workspaceSummary(workspace = {}) {
  const collections = Array.isArray(workspace.collections) ? workspace.collections : [];
  const environments = Array.isArray(workspace.environments) ? workspace.environments : [];
  const cookies = Array.isArray(workspace.cookies) ? workspace.cookies : [];
  const history = Array.isArray(workspace.history) ? workspace.history : [];
  const requestCounts = countRequests(collections);
  return {
    schemaVersion: Number.isFinite(Number(workspace.schemaVersion)) ? Number(workspace.schemaVersion) : 0,
    collectionCount: collections.length,
    folderCount: requestCounts.folders,
    requestCount: requestCounts.requests,
    environmentCount: environments.length,
    cookieCount: cookies.length,
    historyCount: history.length
  };
}

function sanitizeReadinessSummary(summary = {}) {
  const statusCounts = summary.statusCounts && typeof summary.statusCounts === 'object'
    ? summary.statusCounts
    : summary.byStatus && typeof summary.byStatus === 'object'
      ? summary.byStatus
      : {};
  return {
    releaseLevel: truncateString(summary.releaseLevel || 'stable', 32),
    releaseBlockerCount: Number.isFinite(Number(summary.releaseBlockerCount)) ? Number(summary.releaseBlockerCount) : 0,
    releaseBlockers: Array.isArray(summary.releaseBlockers) ? summary.releaseBlockers.map((item) => safeToken(item, 128)).filter(Boolean) : [],
    statusCounts: { ...statusCounts }
  };
}

function countRequests(collections) {
  const counts = { folders: 0, requests: 0 };
  const visitFolder = (folder) => {
    counts.folders += 1;
    counts.requests += Array.isArray(folder.requests) ? folder.requests.length : 0;
    for (const child of folder.folders || []) {
      visitFolder(child);
    }
  };
  for (const collection of collections) {
    counts.requests += Array.isArray(collection.requests) ? collection.requests.length : 0;
    for (const folder of collection.folders || []) {
      visitFolder(folder);
    }
  }
  return counts;
}

function requestResponseCategoryForKey(key) {
  const normalized = normalizeDiagnosticKey(key);
  if (!normalized) {
    return '';
  }
  const exactCategory = exactRequestResponseCategoryForKey(key);
  if (exactCategory) {
    return exactCategory;
  }
  if (/metadata|header/.test(normalized)) {
    return 'headers';
  }
  if (/cookie/.test(normalized)) {
    return 'cookies';
  }
  if (/body|formdata|graphqlvariables|payload|renderedresponse|renderedresponsetext|responsetext/.test(normalized)) {
    return 'bodies';
  }
  if (/protocolmessage|grpcmessage|websocketmessage|socketiomessage/.test(normalized)) {
    return 'protocolMessages';
  }
  if (/consoleoutput|scriptconsole|scriptlog/.test(normalized)) {
    return 'scriptConsole';
  }
  if (/payloadidentifier|idfrompayload/.test(normalized)) {
    return 'payloadIdentifiers';
  }
  if (/queryparam|searchparam|urlparam|urlparameter|pathparam|pathparameter|requesturi|responseuri|requestpath|responsepath|finaluri|fulluri/.test(normalized) || normalized.endsWith('url') || normalized.endsWith('uri')) {
    return 'urls';
  }
  return '';
}

function contextualRequestResponseCategoryForKey(key, pathParts = []) {
  const normalized = normalizeDiagnosticKey(key);
  if (!normalized || !isRequestResponseContext(pathParts)) {
    return '';
  }
  return REQUEST_RESPONSE_CONTEXT_KEY_CATEGORIES[normalized] || '';
}

function isRequestResponseContext(pathParts = []) {
  if (!Array.isArray(pathParts) || pathParts.length < 2) {
    return false;
  }
  for (let index = pathParts.length - 2; index >= 0; index -= 1) {
    const parent = normalizeDiagnosticKey(pathParts[index]);
    if (!parent || /^\d+$/.test(parent)) {
      continue;
    }
    if (parent === 'request'
      || parent === 'requests'
      || parent === 'response'
      || parent === 'responses'
      || parent === 'httprequest'
      || parent === 'httprequests'
      || parent === 'httpresponse'
      || parent === 'httpresponses'
      || parent === 'requestinfo'
      || parent === 'requestinfos'
      || parent === 'responseinfo'
      || parent === 'responseinfos'
      || parent === 'requestdetails'
      || parent === 'responsedetails') {
      return true;
    }
  }
  return false;
}

function exactRequestResponseCategoryForKey(key) {
  const normalized = normalizeDiagnosticKey(key);
  return REQUEST_RESPONSE_KEY_CATEGORIES[normalized] || '';
}

function normalizeDiagnosticKey(key) {
  return String(key || '').replace(/[^A-Za-z0-9]/g, '').toLowerCase();
}

function isSensitiveKeyName(key) {
  const raw = String(key || '');
  const normalized = raw.replace(/[^A-Za-z0-9]/g, '').toLowerCase();
  return SECRET_KEY_PATTERN.test(raw)
    || normalized === 'code'
    || normalized === 'state'
    || /(?:authorization|auth|bearer|cookie|credential|credentials|csrf|xsrf|jwt|passphrase|passwd|password|privatekey|publickey|accountkey|storagekey|signingkey|webhookkey|licensekey|secret|secretkey|apisecret|session|sessiontoken|sessionid|token|vault|apikey|xapikey|subscriptionkey|ocpapimsubscriptionkey|accesskey|accesskeyid|secretaccesskey|sharedaccesskey|consumerkey|consumersecret|oauthconsumerkey|oauthconsumersecret|xauthtoken|xaccesstoken|xauthorizationtoken|xcsrftoken|xxsrftoken|clientassertion|codeverifier|devicecode|usercode|authorizationcode|authorizationtoken|accesstoken|refreshtoken|idtoken|authheader|authorizationheader|proxyauthorizationheader|signature|oauthsignature|awssignature|xamzsignature|mac|nonce|oauthnonce)/.test(normalized);
}

function omittedValue(category) {
  return `[omitted:${category}]`;
}

function normalizeDiagnosticLevel(level) {
  const normalized = String(level || 'info').trim().toLowerCase();
  return DIAGNOSTIC_LEVELS.includes(normalized) ? normalized : 'info';
}

function safeToken(value, maxLength) {
  return String(value == null ? '' : value)
    .replace(/[^\w:.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength);
}

function safeRedactedToken(value, maxLength, fallback) {
  const raw = String(value == null ? '' : value);
  const safeLabel = SAFE_DIAGNOSTIC_LABEL_PATTERN.test(raw) && raw.length <= maxLength;
  const hasSensitiveAssignment = SENSITIVE_DIAGNOSTIC_METADATA_ASSIGNMENT_PATTERN.test(raw);
  const hasSecretShapedLabel = SECRET_SHAPED_DIAGNOSTIC_LABEL_PATTERN.test(raw)
    || COMPACT_SECRET_SHAPED_DIAGNOSTIC_LABEL_PATTERN.test(raw);
  const shouldRedact = hasSensitiveAssignment
    || hasSecretShapedLabel
    || (!safeLabel && SENSITIVE_ERROR_CODE_PATTERN.test(raw));
  if (safeLabel && !shouldRedact) {
    return raw;
  }
  if (shouldRedact) {
    if (hasSecretShapedLabel && !hasSensitiveAssignment) {
      return fallback;
    }
    const redacted = redactText(raw);
    return redacted !== raw ? safeToken(redacted, maxLength) || fallback : fallback;
  }
  const token = safeToken(raw, maxLength);
  return token || fallback;
}

function sanitizeDiagnosticErrorCode(code) {
  if (typeof code !== 'string') {
    return '';
  }
  const raw = code.trim();
  if (!raw || raw.length > 128 || !/^[A-Za-z0-9_.:-]+$/.test(raw)) {
    return '';
  }
  const upper = raw.toUpperCase();
  if (SAFE_DIAGNOSTIC_ERROR_CODES.has(upper)) {
    return raw;
  }
  return SENSITIVE_ERROR_CODE_PATTERN.test(raw) || redactText(raw) !== raw
    ? '[redacted]'
    : raw;
}

function sanitizeDiagnosticFailureCode(code) {
  const raw = String(code == null ? '' : code).trim();
  const sanitized = sanitizeDiagnosticErrorCode(raw);
  if (sanitized) {
    return sanitized;
  }
  return redactText(raw) !== raw || SENSITIVE_ERROR_CODE_PATTERN.test(raw)
    ? '[redacted]'
    : safeToken(raw, 128) || 'diagnostic.failure';
}

function safeIsoTimestamp(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return new Date(0).toISOString();
  }
  return date.toISOString();
}

function enforceRecordSize(record, maxBytes = DEFAULT_MAX_RECORD_BYTES) {
  const text = JSON.stringify(record);
  if (Buffer.byteLength(text, 'utf8') <= maxBytes) {
    return record;
  }
  return {
    schemaVersion: DIAGNOSTICS_SCHEMA_VERSION,
    timestamp: record.timestamp,
    level: record.level || 'info',
    type: record.type || 'diagnostic.event',
    truncated: true
  };
}

function truncateString(value, maxLength) {
  const text = String(value == null ? '' : value);
  return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 3))}...` : text;
}

function boundedInteger(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.floor(numeric)));
}

function rotatedLogPath(logDirectory, index) {
  return path.join(logDirectory, `postmeter.${index}.log.jsonl`);
}

module.exports = {
  DEFAULT_MAX_LOG_FILE_BYTES,
  DEFAULT_MAX_LOG_FILES,
  DIAGNOSTICS_SCHEMA_VERSION,
  DIAGNOSTIC_LEVELS,
  LocalDiagnosticsLogger,
  REQUEST_RESPONSE_LOGGING_FIELDS,
  defaultDiagnosticsSettings,
  diagnosticsLoggingEnabled,
  exportDiagnosticBundle,
  normalizeDiagnosticsSettings,
  redactRequestResponseAliasesInText,
  redactEscapedRequestResponseFieldsInText,
  redactTransportReferences,
  redactText,
  sanitizeDiagnosticEvent,
  sanitizeDiagnosticErrorCode,
  sanitizeDiagnosticValue,
  sanitizeSettingsSummary,
  workspaceSummary
};
