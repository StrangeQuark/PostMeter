const { spawn } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');
const {
  redactRequestResponseAliasesInText,
  redactTransportReferences
} = require('../src/core/diagnostics-release/diagnostics');

const DEFAULT_KILL_GRACE_MILLIS = 2_000;
const DEFAULT_MAX_OUTPUT_BYTES = 256 * 1024;
const PROJECT_ROOT = path.join(__dirname, '..');
const AUTH_SCHEME_NAMES = 'bearer|basic|digest|hawk|token|oauth|ntlm|negotiate|aws4-hmac-sha256|eg1-hmac-sha256';
const SIMPLE_AUTH_SCHEME_NAMES = 'bearer|basic|digest|hawk|token|oauth|ntlm|negotiate';
const AUTH_PARAMETER_PAIR_PATTERN = '[A-Za-z][A-Za-z0-9_-]*\\s*=\\s*(?:"[^"\\r\\n<>]*"|[^\\s,;\\[\\]\\\'"<>]+)';
const AUTH_PARAMETER_PAIR_LIST_PATTERN = `${AUTH_PARAMETER_PAIR_PATTERN}(?:\\s*[,;]\\s*${AUTH_PARAMETER_PAIR_PATTERN})*`;
const AUTH_PARAMETER_VALUE_PATTERN = '(?:[A-Za-z][A-Za-z0-9_-]*\\s*=\\s*(?:"[^"\\r\\n<>]*"|[^\\s,;\\[\\]\\\'"<>]+)|"[^"\\r\\n<>]*"|[^\\s,;\\[\\]\\\'"<>]+)(?:\\s*[,;]\\s*[A-Za-z][A-Za-z0-9_-]*\\s*=\\s*(?:"[^"\\r\\n<>]*"|[^\\s,;\\[\\]\\\'"<>]+))*';
const AUTH_HEADER_VALUE_PATTERN = `(?:(?:${AUTH_SCHEME_NAMES})\\s+)?${AUTH_PARAMETER_VALUE_PATTERN}`;
const AUTH_SCHEME_SAFE_VALUE_PATTERN = String.raw`(?:2\.0|\[redacted\]|redacted|endpoint|app|application|auth|authentication|authenticated|token|bearer|basic|digest|hawk|oauth|ntlm|negotiate|username|required|provider|returned|failed|failure|missing|empty|unset|invalid|expired|denied|enabled|disabled|available|unavailable|status|code|flow|grant|scope|scopes|setting|settings|policy|policies|field|fields|value|values|metadata|header|headers|cookie|cookies|jar)(?=\s|$|[.,;:!?)}\]])`;
const AUTH_HEADER_FIELD_NAMES = 'authorization[-_\\s]*header|auth[-_\\s]*header|proxy[-_\\s]*authorization(?:[-_\\s]*header)?';
const COOKIE_FIELD_NAMES = 'cookie[-_\\s]*header|cookieHeader|set[-_\\s]*cookie[-_\\s]*header|setCookieHeader|set[-_\\s]*cookie|cookie';
const SECRET_FIELD_NAMES = `access[-_\\s]*token|refresh[-_\\s]*token|id[-_\\s]*token|auth[-_\\s]*token|authentication[-_\\s]*token|authorization[-_\\s]*token|bearer[-_\\s]*token|client[-_\\s]*token|oauth[-_\\s]*token|csrf[-_\\s]*token|xsrf[-_\\s]*token|jwt[-_\\s]*token|[A-Za-z][A-Za-z0-9]{0,80}[-_\\s]*(?:token|secret|password|passwd|passphrase|credential|credentials)|x[-_\\s]*(?:api[-_\\s]*key|access[-_\\s]*token|auth[-_\\s]*token|authorization[-_\\s]*token|csrf[-_\\s]*token|xsrf[-_\\s]*token)|authorization[-_\\s]*code|device[-_\\s]*code|user[-_\\s]*code|code[-_\\s]*verifier|client[-_\\s]*secret|client[-_\\s]*assertion|api[-_\\s]*(?:key|secret)|secret[-_\\s]*(?:key|access[-_\\s]*key)|subscription[-_\\s]*key|ocp[-_\\s]*apim[-_\\s]*subscription[-_\\s]*key|access[-_\\s]*key(?:[-_\\s]*id)?|shared[-_\\s]*access[-_\\s]*key|(?:account|consumer|license|public|private|signing|storage|webhook)[-_\\s]*key(?:[-_\\s]*id)?|consumer[-_\\s]*(?:key|secret)|oauth[-_\\s]*consumer[-_\\s]*(?:key|secret)|session[-_\\s]*(?:token|id)|${COOKIE_FIELD_NAMES}|x[-_\\s]*amz[-_\\s]*credential|x[-_\\s]*amz[-_\\s]*signature|x[-_\\s]*amz[-_\\s]*security[-_\\s]*token|aws[-_\\s]*credential|aws[-_\\s]*signature|oauth[-_\\s]*signature|oauth[-_\\s]*nonce|cert(?:ificate)?[-_\\s]*passphrase|private[-_\\s]*key|secret[-_\\s]*value|signature|nonce|mac|token|code|state|password|passwd|passphrase|credential|credentials|secret`;
const COOKIE_BARE_SAFE_WORDS = 'authentication|authenticated|auth|jar|jars|handling|handler|helpers?|access|disabled|enabled|unavailable|available|failed|failure|required|provider|returned|setting|settings|policy|policies|headers?|values?|metadata';
const COOKIE_SAFE_CONTEXT_PATTERN = String.raw`OAuth\s+2\.0\b|token\s+endpoint\b|provider\s+(?:returned|failed|denied|reported)\b|HTTP\s+\d{3}\b|status\s*[:=]?\s*\d{3}\b|error(?:[-_\s]*description)?\s*[:=]|Basic\s+authentication\b|Bearer\s+authentication\b|Digest\s+auth\b|authentication\s+(?:failed|required)\b`;
const COOKIE_NEXT_LABEL_PATTERN = String.raw`(?:${COOKIE_FIELD_NAMES})\b(?:\s*[:=]|\s+(?=[^\r\n"'<>]{1,2048}=))`;
const COOKIE_VALUE_TERMINATOR_PATTERN = String.raw`(?=\s+(?:(?:${COOKIE_SAFE_CONTEXT_PATTERN})|${COOKIE_NEXT_LABEL_PATTERN})|[\r\n]|$)`;
const COOKIE_BARE_VALUE_PATTERN = String.raw`(?=[^\r\n"'<>]{1,2048}=)[^\r\n"'<>]*?`;
const COOKIE_FIELD_VALUE_PATTERN = String.raw`[^\r\n"'<>]*?`;
const COOKIE_HEADER_SAFE_CONTEXT_BOUNDARY_PATTERN = new RegExp(String.raw`\s+(?=(?:${COOKIE_SAFE_CONTEXT_PATTERN}))`, 'i');
const SECRET_FIELD_VALUE_PATTERN = `[^\\r\\n"',;<>}\\])]+?(?=\\s+(?:${SECRET_FIELD_NAMES}|[A-Za-z][A-Za-z0-9_.-]{0,128})\\s*[:=]|[\\r\\n"',;<>}\\])]|$)`;
const QUOTED_SECRET_FIELD_NAMES = `${SECRET_FIELD_NAMES}|${AUTH_HEADER_FIELD_NAMES}`;
const DOUBLE_QUOTED_SECRET_FIELD_PATTERN = new RegExp(`"(${QUOTED_SECRET_FIELD_NAMES})"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, 'gi');
const SINGLE_QUOTED_SECRET_FIELD_PATTERN = new RegExp(`'(${QUOTED_SECRET_FIELD_NAMES})'\\s*:\\s*'((?:\\\\.|[^'\\\\])*)'`, 'gi');
const BARE_SECRET_LABEL_NAMES = String.raw`access[-_\s]*token|refresh[-_\s]*token|id[-_\s]*token|csrf[-_\s]*token|xsrf[-_\s]*token|jwt[-_\s]*token|[A-Za-z][A-Za-z0-9]{0,80}[-_\s]*(?:token|secret|password|passwd|passphrase|credential|credentials)|x[-_\s]*(?:api[-_\s]*key|access[-_\s]*token|auth[-_\s]*token|authorization[-_\s]*token|csrf[-_\s]*token|xsrf[-_\s]*token)|client[-_\s]*secret|client[-_\s]*assertion|authorization[-_\s]*code|code[-_\s]*verifier|device[-_\s]*code|user[-_\s]*code|api[-_\s]*(?:key|secret)|secret[-_\s]*(?:key|access[-_\s]*key)|subscription[-_\s]*key|ocp[-_\s]*apim[-_\s]*subscription[-_\s]*key|access[-_\s]*key(?:[-_\s]*id)?|shared[-_\s]*access[-_\s]*key|(?:account|consumer|license|public|private|signing|storage|webhook)[-_\s]*key(?:[-_\s]*id)?|consumer[-_\s]*(?:key|secret)|oauth[-_\s]*consumer[-_\s]*(?:key|secret)|session[-_\s]*(?:token|id)|auth[-_\s]*header|authorization[-_\s]*header|proxy[-_\s]*authorization(?:[-_\s]*header)?|cert(?:ificate)?[-_\s]*passphrase|private[-_\s]*key|secret[-_\s]*value|password|passwd|passphrase|credential|credentials|token|secret`;
const BARE_SECRET_LABEL_SAFE_WORDS = String.raw`is|are|was|were|be|must|should|may|can|cannot|not|endpoint|auth|authentication|authenticated|required|provider|returned|failed|failure|missing|empty|unset|invalid|expired|denied|enabled|disabled|available|unavailable|username|bearer|basic|digest|hawk|oauth|ntlm|negotiate|status|code|flow|grant|scope|scopes|setting|settings|policy|policies|field|fields|value|values|metadata|header|headers|cookie|cookies|jar`;
const BARE_SAFE_WORD_FOLLOW_PATTERN = String.raw`(?:\s|$|[.,;:!?)}\]])`;
const BARE_SECRET_LABEL_PATTERN = new RegExp(String.raw`(?<![A-Za-z0-9_-])(${BARE_SECRET_LABEL_NAMES})(\s+)(?!\[redacted\]|redacted\b)(?!(?:${BARE_SECRET_LABEL_SAFE_WORDS})${BARE_SAFE_WORD_FOLLOW_PATTERN})[A-Za-z0-9._~+/=-]{4,}`, 'gi');
const AWS_QUERY_FIELD_PATTERN = String.raw`\b((?:x[-_]?amz[-_]?credential|x[-_]?amz[-_]?signature|x[-_]?amz[-_]?security[-_]?token|aws[-_]?credential|aws[-_]?signature))(\s*[:=]\s*["']?)[^\s&"',;<>}\])]+`;
const REQUEST_RESPONSE_FIELD_NAMES = String.raw`request[-_\s]*body(?:[-_\s]*text)?|response[-_\s]*body(?:[-_\s]*text)?|body[-_\s]*preview|rendered[-_\s]*response(?:[-_\s]*text)?|response[-_\s]*text|graphql[-_\s]*variables|form[-_\s]*data(?:[-_\s]*parts)?|protocol[-_\s]*messages?|grpc[-_\s]*messages?|websocket[-_\s]*messages?|socketio[-_\s]*messages?|console[-_\s]*output|script[-_\s]*console|script[-_\s]*logs?|payload[-_\s]*derived[-_\s]*identifier|payload[-_\s]*identifier|request[-_\s]*id[-_\s]*from[-_\s]*payload|id[-_\s]*from[-_\s]*payload|variables|body|data|text`;
const REQUEST_RESPONSE_FIELD_VALUE_PATTERN = SECRET_FIELD_VALUE_PATTERN;
const REQUEST_RESPONSE_BARE_FIELD_TERMINATOR_PATTERN = String.raw`(?=\s+(?:${REQUEST_RESPONSE_FIELD_NAMES})\b|[\r\n;,.]|$)`;
const REQUEST_RESPONSE_BARE_FIELD_PATTERN = new RegExp(String.raw`(?<![A-Za-z0-9_-])(${REQUEST_RESPONSE_FIELD_NAMES})(\s+)(?!\[redacted\]|redacted\b)(?!(?:${BARE_SECRET_LABEL_SAFE_WORDS})${BARE_SAFE_WORD_FOLLOW_PATTERN})([^\r\n;,.]*?)${REQUEST_RESPONSE_BARE_FIELD_TERMINATOR_PATTERN}`, 'gi');

function spawnWithTimeout(command, args = [], options = {}) {
  const timeoutMillis = Number(options.timeoutMillis || 30_000);
  const killGraceMillis = Number(options.killGraceMillis || DEFAULT_KILL_GRACE_MILLIS);
  const maxOutputBytes = Number(options.maxOutputBytes || DEFAULT_MAX_OUTPUT_BYTES);
  const timeoutMessage = options.timeoutMessage || `${command} timed out after ${timeoutMillis} ms.`;
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: options.stdio || ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    let stdoutTruncated = false;
    let stderrTruncated = false;
    let timedOut = false;
    let forceKilled = false;
    let forceKillTimer = null;
    const clearTimers = () => {
      clearTimeout(timeout);
      if (forceKillTimer) {
        clearTimeout(forceKillTimer);
      }
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      forceKillTimer = setTimeout(() => {
        forceKilled = true;
        child.kill('SIGKILL');
      }, killGraceMillis);
    }, timeoutMillis);
    child.stdout?.on('data', (chunk) => {
      const next = appendBoundedText(stdout, chunk, maxOutputBytes);
      stdout = next.text;
      stdoutTruncated ||= next.truncated;
    });
    child.stderr?.on('data', (chunk) => {
      const next = appendBoundedText(stderr, chunk, maxOutputBytes);
      stderr = next.text;
      stderrTruncated ||= next.truncated;
    });
    child.on('error', (error) => {
      clearTimers();
      reject(error);
    });
    child.on('exit', (code, signal) => {
      clearTimers();
      const timeoutStderr = timedOut ? appendBoundedText(stderr, `\n${timeoutMessage}`, maxOutputBytes) : null;
      if (timeoutStderr?.truncated) {
        stderrTruncated = true;
      }
      const finalStderr = timeoutStderr ? timeoutStderr.text.trim() : stderr;
      resolve({
        code: timedOut ? 124 : signal ? 128 : code ?? 1,
        forceKilled,
        signal,
        stderr: finalStderr,
        stderrTruncated,
        stdout,
        stdoutTruncated,
        timedOut
      });
    });
  });
}

function appendBoundedText(current, chunk, maxBytes = DEFAULT_MAX_OUTPUT_BYTES) {
  const limit = Math.max(1024, Number(maxBytes) || DEFAULT_MAX_OUTPUT_BYTES);
  const combined = Buffer.concat([
    Buffer.from(String(current || ''), 'utf8'),
    Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk || ''), 'utf8')
  ]);
  if (combined.length <= limit) {
    return { text: combined.toString('utf8'), truncated: false };
  }
  const marker = Buffer.from('[output truncated]\n', 'utf8');
  const tailLength = Math.max(0, limit - marker.length);
  return {
    text: Buffer.concat([marker, combined.subarray(combined.length - tailLength)]).toString('utf8'),
    truncated: true
  };
}

function redactSmokeOutputText(text, extraSensitiveValues = []) {
  let redacted = redactQuotedSecretFieldsInText(text);
  const sensitiveValues = [
    PROJECT_ROOT,
    process.cwd(),
    os.homedir(),
    os.tmpdir(),
    ...extraSensitiveValues
  ].filter(Boolean);
  for (const value of sensitiveValues) {
    redacted = redacted.split(String(value)).join('[path]');
  }
  redacted = redactTransportReferences(redacted);
  return redacted
    .replace(new RegExp(`\\b(set-cookie|cookie)\\b(\\s*[:=]\\s*["']?)([^\\n\\r'"<>]*?)${COOKIE_VALUE_TERMINATOR_PATTERN}`, 'gi'), redactCookieHeaderValue)
    .replace(new RegExp(`(?<![A-Za-z0-9_-])(["']?)\\b(${COOKIE_FIELD_NAMES})\\b\\1(\\s*[:=]\\s*["']?)(?!\\s*\\[redacted\\])${COOKIE_FIELD_VALUE_PATTERN}${COOKIE_VALUE_TERMINATOR_PATTERN}`, 'gi'), '$1$2$1$3[redacted]')
    .replace(new RegExp(`(?<![A-Za-z0-9_-])\\b(${COOKIE_FIELD_NAMES})\\b(\\s+)(?!(?:${COOKIE_BARE_SAFE_WORDS})\\b)(?!\\[redacted\\])${COOKIE_BARE_VALUE_PATTERN}${COOKIE_VALUE_TERMINATOR_PATTERN}`, 'gi'), '$1$2[redacted]')
    .replace(new RegExp(`(["']?\\b(?:proxy[-_\\s]*authorization(?:[-_\\s]*header)?|authorization(?:[-_\\s]*header)?|auth[-_\\s]*header)\\b["']?\\s*[:=]\\s*")((?:\\\\.|[^"\\\\])*)(")`, 'gi'), '$1[redacted]$3')
    .replace(new RegExp(`(['"]?\\b(?:proxy[-_\\s]*authorization(?:[-_\\s]*header)?|authorization(?:[-_\\s]*header)?|auth[-_\\s]*header)\\b['"]?\\s*[:=]\\s*')((?:\\\\.|[^'\\\\])*)(')`, 'gi'), '$1[redacted]$3')
    .replace(new RegExp(`\\b((?:proxy[-_\\s]*authorization(?:[-_\\s]*header)?|authorization(?:[-_\\s]*header)?|auth[-_\\s]*header)\\b)(\\s*[:=]\\s*["']?)(?!["']?\\[redacted\\])${AUTH_HEADER_VALUE_PATTERN}["']?`, 'gi'), '$1$2[redacted]')
    .replace(new RegExp(`(?<![A-Za-z0-9_-])(${AUTH_SCHEME_NAMES})\\s+${AUTH_PARAMETER_PAIR_LIST_PATTERN}`, 'gi'), '$1 [redacted]')
    .replace(new RegExp(`(?<![A-Za-z0-9_-])(${SIMPLE_AUTH_SCHEME_NAMES})\\s+(?!(?:${AUTH_SCHEME_SAFE_VALUE_PATTERN}))[A-Za-z0-9._~+/=-]{1,}`, 'gi'), '$1 [redacted]')
    .replace(new RegExp(AWS_QUERY_FIELD_PATTERN, 'gi'), '$1$2[redacted];')
    .replace(/[\s\S]*/, (value) => redactRequestResponseAliasesInText(value, '[redacted]'))
    .replace(new RegExp(`(?<![A-Za-z0-9_-])(["']?)\\b(${REQUEST_RESPONSE_FIELD_NAMES})\\b\\1(\\s*[:=]\\s*["']?)(?!\\s*\\[redacted\\])${REQUEST_RESPONSE_FIELD_VALUE_PATTERN}`, 'gi'), '$1$2$1$3[redacted]')
    .replace(REQUEST_RESPONSE_BARE_FIELD_PATTERN, '$1$2[redacted]')
    .replace(new RegExp(`(?<![A-Za-z0-9_-])(["']?)\\b(${SECRET_FIELD_NAMES})\\b\\1(\\s*[:=]\\s*["']?)(?!\\s*\\[redacted\\])${SECRET_FIELD_VALUE_PATTERN}`, 'gi'), '$1$2$1$3[redacted]')
    .replace(BARE_SECRET_LABEL_PATTERN, '$1$2[redacted]')
    .replace(/[A-Za-z]:\\(?:[^\\\r\n]+\\)*[^\\\r\n\s'"]+/g, '[path]')
    .replace(/\/(?:home|Users|tmp|var|private|workspace)\/[^\s'"]+/g, '[path]');
}

function redactQuotedSecretFieldsInText(value) {
  return String(value || '')
    .replace(DOUBLE_QUOTED_SECRET_FIELD_PATTERN, (_match, key) => `"${key}":"[redacted]"`)
    .replace(SINGLE_QUOTED_SECRET_FIELD_PATTERN, (_match, key) => `'${key}':'[redacted]'`);
}

function redactCookieHeaderValue(_match, key, separator, value = '') {
  const text = String(value || '');
  const safeBoundary = COOKIE_HEADER_SAFE_CONTEXT_BOUNDARY_PATTERN.exec(text);
  return safeBoundary
    ? `${key}${separator}[redacted]${text.slice(safeBoundary.index)}`
    : `${key}${separator}[redacted]`;
}

module.exports = {
  appendBoundedText,
  redactSmokeOutputText,
  spawnWithTimeout
};
