const { spawn } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');

const DEFAULT_KILL_GRACE_MILLIS = 2_000;
const DEFAULT_MAX_OUTPUT_BYTES = 256 * 1024;
const PROJECT_ROOT = path.join(__dirname, '..');

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
  let redacted = String(text || '');
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
  return redacted
    .replace(/\b(set-cookie|cookie)\b(\s*[:=]\s*["']?)[^\n\r'"<>]+/gi, '$1$2[redacted]')
    .replace(/\b(bearer|basic|digest|hawk|token|oauth|ntlm|negotiate)\s+[A-Za-z0-9._~+/=-]{6,}/gi, '$1 [redacted]')
    .replace(/\b(access[-_\s]?token|refresh[-_\s]?token|id[-_\s]?token|authorization[-_\s]?code|device[-_\s]?code|user[-_\s]?code|code[-_\s]?verifier|client[-_\s]?secret|client[-_\s]?assertion|api[-_\s]?key|password|secret)\b(\s*[:=]\s*["']?)[^\s,;'"<>]+/gi, '$1$2[redacted]')
    .replace(/[A-Za-z]:\\(?:[^\\\r\n]+\\)*[^\\\r\n\s'"]+/g, '[path]')
    .replace(/\/(?:home|Users|tmp|var|private|workspace)\/[^\s'"]+/g, '[path]');
}

module.exports = {
  appendBoundedText,
  redactSmokeOutputText,
  spawnWithTimeout
};
