#!/usr/bin/env node

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { WAIVER_ENV, withCiNoSandboxArgs } = require('./electronCiSandboxWaiver');
const { spawnWithTimeout } = require('./smokeProcess');
const {
  redactRequestResponseAliasesInText,
  redactTransportReferences
} = require('../src/core/diagnostics');

const PROJECT_ROOT = path.join(__dirname, '..');
const RELEASE_DIR = process.env.POSTMETER_RELEASE_DIR
  ? path.resolve(process.env.POSTMETER_RELEASE_DIR)
  : path.join(PROJECT_ROOT, 'release');
const TIMEOUT_MILLIS = Number(process.env.POSTMETER_PACKAGED_SMOKE_TIMEOUT_MS || 30000);
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

async function main() {
  const executable = await findPackagedExecutable();
  await validateExecutable(executable);
  await runStartupSmoke(executable);
  console.log(`Packaged app smoke passed: ${redactPackagedSmokeLogText(executable, executable)}`);
}

async function findPackagedExecutable() {
  if (process.env.POSTMETER_PACKAGED_APP_PATH) {
    return path.resolve(process.env.POSTMETER_PACKAGED_APP_PATH);
  }
  const candidates = platformCandidates();
  for (const candidate of candidates) {
    if (await executableExists(candidate)) {
      return candidate;
    }
  }
  throw new Error(`No packaged PostMeter executable found for ${process.platform} under ${RELEASE_DIR}.`);
}

function platformCandidates() {
  if (process.platform === 'win32') {
    return [
      path.join(RELEASE_DIR, 'win-unpacked', 'PostMeter.exe'),
      path.join(RELEASE_DIR, 'win-unpacked', 'postmeter.exe')
    ];
  }
  if (process.platform === 'darwin') {
    return [
      path.join(RELEASE_DIR, 'mac', 'PostMeter.app', 'Contents', 'MacOS', 'PostMeter'),
      path.join(RELEASE_DIR, 'mac-arm64', 'PostMeter.app', 'Contents', 'MacOS', 'PostMeter'),
      path.join(RELEASE_DIR, 'PostMeter.app', 'Contents', 'MacOS', 'PostMeter')
    ];
  }
  return [
    path.join(RELEASE_DIR, 'linux-unpacked', 'postmeter'),
    path.join(RELEASE_DIR, 'linux-unpacked', 'PostMeter')
  ];
}

async function validateExecutable(executable) {
  const stat = await fs.stat(executable);
  if (!stat.isFile()) {
    throw new Error(`Packaged app executable is not a file: ${executable}`);
  }
  if (process.platform !== 'win32' && (stat.mode & 0o111) === 0) {
    throw new Error(`Packaged app executable is not executable: ${executable}`);
  }
}

async function runStartupSmoke(executable) {
  await runDefaultPersistencePathSmoke(executable);
  const userData = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-packaged-smoke-'));
  const dataPath = path.join(userData, 'workspace.json');
  const marker = `packaged-smoke-${Date.now()}`;
  try {
    await runStartupSmokeOnce(executable, {
      dataPath,
      marker,
      expectReload: false,
      label: 'initial'
    });
    await runStartupSmokeOnce(executable, {
      dataPath,
      marker,
      expectReload: true,
      label: 'reload'
    });
    await validatePersistenceArtifacts(userData, dataPath, marker);
  } finally {
    await fs.rm(userData, { recursive: true, force: true });
  }
}

async function runDefaultPersistencePathSmoke(executable) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'postmeter-packaged-default-path-'));
  const envOverrides = await isolatedDefaultPathEnv(root);
  const marker = `packaged-default-path-${Date.now()}`;
  try {
    await runStartupSmokeOnce(executable, {
      marker,
      expectReload: false,
      label: 'default-path',
      defaultUserData: true,
      envOverrides
    });
    await runStartupSmokeOnce(executable, {
      marker,
      expectReload: true,
      label: 'default-path-reload',
      defaultUserData: true,
      envOverrides
    });
    await validateDefaultPersistenceArtifacts(envOverrides, marker);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

async function runStartupSmokeOnce(executable, options = {}) {
  const env = {
    ...minimalEnv(),
    ...(options.envOverrides || {}),
    POSTMETER_STARTUP_SMOKE: '1',
    POSTMETER_PACKAGED_SMOKE: '1',
    POSTMETER_PACKAGED_SMOKE_MARKER: options.marker,
    POSTMETER_PACKAGED_SMOKE_EXPECT_RELOAD: options.expectReload ? '1' : '',
    POSTMETER_VALIDATION_ARTIFACT_DIR: process.env.POSTMETER_VALIDATION_ARTIFACT_DIR || ''
  };
  if (options.dataPath) {
    env.POSTMETER_DATA_PATH = options.dataPath;
  }
  if (options.defaultUserData) {
    env.POSTMETER_PACKAGED_SMOKE_DEFAULT_PATH = '1';
  }
  const result = await spawnWithTimeout(executable, withCiNoSandboxArgs([], env), {
    env,
    timeoutMillis: TIMEOUT_MILLIS,
    timeoutMessage: `Packaged app startup smoke timed out after ${TIMEOUT_MILLIS} ms.`
  });
  await writeSmokeLog(options.label || 'run', executable, result);
  if (result.code !== 0) {
    throw new Error(packagedSmokeFailureMessage(result, executable));
  }
}

async function validatePersistenceArtifacts(userData, dataPath, marker = '') {
  const workspace = await loadPersistedSmokeWorkspace(dataPath, marker);
  if (!Array.isArray(workspace.globals) || !workspace.globals.some((item) => (
    item.key === '__postmeter_packaged_smoke' && (!marker || item.value === marker)
  ))) {
    throw new Error('Packaged app smoke did not persist the workspace marker.');
  }
  await fs.stat(path.join(userData, 'userData'));
}

async function validateDefaultPersistenceArtifacts(env, marker = '') {
  const userDataPath = expectedDefaultUserDataPath(env, process.platform);
  const stat = await fs.stat(userDataPath);
  if (!stat.isDirectory()) {
    throw new Error(`Default packaged userData path is not a directory: ${userDataPath}`);
  }
  const workspacePath = path.join(env.USERPROFILE || env.HOME, '.postmeter', 'workspace.json');
  await loadPersistedSmokeWorkspace(workspacePath, marker);
}

async function loadPersistedSmokeWorkspace(dataPath, marker = '') {
  const candidates = [dataPath];
  const directory = path.dirname(dataPath);
  let entries = [];
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    entries = [];
  }
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.json')) {
      const candidate = path.join(directory, entry.name);
      if (!candidates.includes(candidate)) {
        candidates.push(candidate);
      }
    }
  }
  for (const candidate of candidates) {
    try {
      const workspace = JSON.parse(await fs.readFile(candidate, 'utf8'));
      if (Array.isArray(workspace?.globals) && workspace.globals.some((item) => (
        item.key === '__postmeter_packaged_smoke' && (!marker || item.value === marker)
      ))) {
        return workspace;
      }
    } catch {
      continue;
    }
  }
  throw new Error(`Packaged app smoke workspace marker was not found under ${directory}.`);
}

async function writeSmokeLog(label, executable, result) {
  const directory = process.env.POSTMETER_VALIDATION_ARTIFACT_DIR;
  if (!directory) {
    return;
  }
  await fs.mkdir(directory, { recursive: true });
  const safeLabel = String(label || 'run').replace(/[^a-z0-9._-]+/gi, '-').slice(0, 64) || 'run';
  const logPath = path.join(directory, `packaged-app-smoke-${process.platform}-${safeLabel}.log`);
  const body = [
    `executable=${path.basename(String(executable || '')) || '[unknown]'}`,
    `platform=${process.platform}`,
    `exitCode=${result.code}`,
    '',
    '[stdout]',
    redactPackagedSmokeLogText(result.stdout || '', executable),
    '',
    '[stderr]',
    redactPackagedSmokeLogText(result.stderr || '', executable)
  ].join('\n');
  await fs.writeFile(logPath, body);
}

function redactPackagedSmokeLogText(text, executable = '') {
  let redacted = redactQuotedSecretFieldsInText(text);
  const executablePath = String(executable || '');
  const sensitivePaths = [
    executablePath,
    executablePath ? path.dirname(executablePath) : '',
    RELEASE_DIR,
    PROJECT_ROOT,
    os.homedir(),
    process.cwd()
  ].filter((value) => value && value !== '.');
  for (const sensitivePath of sensitivePaths) {
    redacted = redacted.split(String(sensitivePath)).join('[path]');
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

function packagedSmokeFailureMessage(result = {}, executable = '') {
  const output = redactPackagedSmokeLogText(result.stderr || result.stdout || '', executable).trim();
  return output
    ? `Packaged app startup smoke exited with ${result.code}: ${output}`
    : `Packaged app startup smoke exited with ${result.code}.`;
}

function packagedSmokeCliErrorText(error, executable = '') {
  return redactPackagedSmokeLogText(error?.stack || error?.message || String(error), executable);
}

function minimalEnv() {
  const keep = {};
  for (const key of ['APPDATA', 'HOME', 'LOCALAPPDATA', 'PATH', 'SystemRoot', 'TEMP', 'TMP', 'USERPROFILE', 'XAUTHORITY', 'XDG_CONFIG_HOME', 'DISPLAY', 'WAYLAND_DISPLAY', WAIVER_ENV]) {
    if (process.env[key]) {
      keep[key] = process.env[key];
    }
  }
  if (process.platform === 'linux') {
    keep.ELECTRON_DISABLE_SECURITY_WARNINGS = '1';
  }
  return keep;
}

async function isolatedDefaultPathEnv(root) {
  const home = path.join(root, 'home');
  const xdgConfig = path.join(root, 'xdg-config');
  const appData = path.join(root, 'AppData', 'Roaming');
  const localAppData = path.join(root, 'AppData', 'Local');
  const temp = path.join(root, 'tmp');
  await Promise.all([
    fs.mkdir(home, { recursive: true }),
    fs.mkdir(xdgConfig, { recursive: true }),
    fs.mkdir(appData, { recursive: true }),
    fs.mkdir(localAppData, { recursive: true }),
    fs.mkdir(temp, { recursive: true })
  ]);
  return {
    APPDATA: appData,
    HOME: home,
    LOCALAPPDATA: localAppData,
    TEMP: temp,
    TMP: temp,
    USERPROFILE: home,
    XDG_CONFIG_HOME: xdgConfig
  };
}

function expectedDefaultUserDataPath(env, platform = process.platform) {
  return path.join(expectedDefaultUserDataRoot(env, platform), 'PostMeter');
}

function expectedDefaultUserDataRoot(env, platform = process.platform) {
  if (platform === 'win32') {
    return path.resolve(env.APPDATA || path.join(env.USERPROFILE || env.HOME || os.homedir(), 'AppData', 'Roaming'));
  }
  if (platform === 'darwin') {
    return path.resolve(env.HOME || os.homedir(), 'Library', 'Application Support');
  }
  return path.resolve(env.XDG_CONFIG_HOME || path.join(env.HOME || os.homedir(), '.config'));
}

async function executableExists(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(packagedSmokeCliErrorText(error, process.env.POSTMETER_PACKAGED_APP_PATH || ''));
    process.exit(1);
  });
}

module.exports = {
  expectedDefaultUserDataPath,
  expectedDefaultUserDataRoot,
  findPackagedExecutable,
  isolatedDefaultPathEnv,
  loadPersistedSmokeWorkspace,
  packagedSmokeCliErrorText,
  packagedSmokeFailureMessage,
  platformCandidates,
  redactPackagedSmokeLogText,
  runDefaultPersistencePathSmoke,
  runStartupSmoke,
  writeSmokeLog,
  validateDefaultPersistenceArtifacts,
  validatePersistenceArtifacts,
  validateExecutable
};
