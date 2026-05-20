const fs = require('node:fs/promises');
const http = require('node:http');
const https = require('node:https');
const path = require('node:path');
const {
  NEWMAN_TARGET,
  NEWMAN_RUNTIME_TARGET,
  POSTMAN_DESKTOP_RUNTIME_TARGET,
  POSTMAN_DESKTOP_TARGET,
  POSTMAN_SANDBOX_TARGET,
  buildPostmanParityMatrix
} = require('./postmanParityMatrix');

const PROJECT_ROOT = path.join(__dirname, '..', '..', '..');
const DOCS_AUDIT_PATH = path.join(PROJECT_ROOT, 'docs', 'postman-docs-coverage-audit.json');
const POSTMAN_DOCS_SITEMAP_URL = 'https://learning.postman.com/sitemap.xml';
const NEWMAN_LATEST_URL = 'https://registry.npmjs.org/newman/latest';
const SDK_REFERENCE_BASE_URL = 'https://www.postmanlabs.com/postman-collection/';
const FETCH_TIMEOUT_MILLIS = 30_000;
const FETCH_MAX_BYTES = 4 * 1024 * 1024;
const FETCH_CONCURRENCY = 8;

const LEARNING_DOC_PATH_PATTERNS = Object.freeze([
  '/docs/tests-and-scripts/',
  '/docs/collections/running-collections/',
  '/docs/collections/using-newman-cli/',
  '/docs/developer/vs-code-extension/tests-and-scripts/',
  '/docs/sending-requests/authorization/',
  '/docs/sending-requests/create-requests/',
  '/docs/sending-requests/graphql/',
  '/docs/sending-requests/grpc/',
  '/docs/sending-requests/mqtt-client/',
  '/docs/sending-requests/postman-vault/',
  '/docs/sending-requests/soap/',
  '/docs/sending-requests/uds-named-pipes/',
  '/docs/sending-requests/variables/',
  '/docs/sending-requests/websocket/'
]);

const SDK_REFERENCE_CLASSES = Object.freeze([
  'Cookie',
  'CookieList',
  'Header',
  'HeaderList',
  'Property',
  'PropertyList',
  'QueryParam',
  'Request',
  'RequestAuth',
  'RequestBody',
  'Response',
  'Url',
  'Variable',
  'VariableList',
  'VariableScope'
]);

const SDK_LIST_CLASSES = new Set([
  'CookieList',
  'HeaderList',
  'PropertyList',
  'QueryParamList',
  'VariableList'
]);

const SDK_LIST_METHOD_ROW_MAP = Object.freeze({
  add: 'sdk.list.add',
  all: 'sdk.list.all',
  append: 'sdk.list.append',
  clear: 'sdk.list.clear',
  clone: 'sdk.list.clone',
  count: 'sdk.list.count',
  each: 'sdk.list.each',
  filter: 'sdk.list.filter-callback',
  find: 'sdk.list.find',
  get: 'sdk.list.get',
  has: 'sdk.list.has',
  idx: 'sdk.list.idx',
  indexOf: 'sdk.list.indexof',
  insert: 'sdk.list.insert',
  insertAfter: 'sdk.list.insertafter',
  map: 'sdk.list.map',
  one: 'sdk.list.one',
  populate: 'sdk.list.populate',
  prepend: 'sdk.list.prepend',
  reduce: 'sdk.list.reduce',
  remove: 'sdk.list.remove',
  repopulate: 'sdk.list.repopulate',
  toJSON: 'sdk.list.tojson',
  toObject: 'sdk.list.toobject',
  toString: 'sdk.list.tostring',
  upsert: 'sdk.list.upsert',
  valueOf: 'sdk.list.valueof'
});

const SDK_URL_METHOD_ROW_MAP = Object.freeze({
  addQueryParams: 'sdk.url.addqueryparams',
  clone: 'sdk.url.clone',
  getHost: 'sdk.url.gethost',
  getPath: 'sdk.url.getpath',
  getQueryString: 'sdk.url.getquerystring',
  toJSON: 'sdk.url.tojson',
  toString: 'sdk.url.tostring',
  update: 'sdk.url.update'
});

const EXACT_TOKEN_ROW_MAP = Object.freeze({
  'postman.setNextRequest': 'execution.setNextRequest',
  'pm.cookies.jar': 'cookies.jar.get',
  'pm.environment.name': 'variables.pm.environment.name',
  'pm.expect': 'assertion.pm.expect.full-chai-bdd-surface',
  'pm.expect.to.have.jsonSchema': 'assertion.pm.expect.to.have.jsonSchema',
  'pm.getData': 'visualizer.pm.getData',
  'pm.iterationData': 'variables.pm.iterationData.toObject',
  'pm.request.headers.add': 'request.headers.add',
  'pm.request.headers.remove': 'request.headers.remove',
  'pm.request.headers.upsert': 'request.headers.upsert',
  'pm.request.messages.idx': 'request.messages.idx',
  'pm.response.<bdd-syntax>.jsonSchema': 'assertion.pm.response.to.have.jsonSchema',
  'pm.response.headers.get': 'response.headers.get',
  'pm.response.messages.idx': 'assertion.pm.response.messages.idx',
  'pm.response.to.be.badRequest': 'assertion.pm.response.to.be.badRequest',
  'pm.response.to.be.clientError': 'assertion.pm.response.to.be.clientError',
  'pm.response.to.be.error': 'assertion.pm.response.to.be.error',
  'pm.response.to.be.forbidden': 'assertion.pm.response.to.be.forbidden',
  'pm.response.to.be.notFound': 'assertion.pm.response.to.be.notFound',
  'pm.response.to.be.ok': 'assertion.pm.response.to.be.ok',
  'pm.response.to.be.serverError': 'assertion.pm.response.to.be.serverError',
  'pm.response.to.be.success': 'assertion.pm.response.to.be.success',
  'pm.response.to.be.unauthorized': 'assertion.pm.response.to.be.unauthorized',
  'pm.response.to.have.body': 'assertion.pm.response.to.have.body',
  'pm.response.to.have.header': 'assertion.pm.response.to.have.header',
  'pm.response.to.have.jsonBody': 'assertion.pm.response.to.have.jsonBody',
  'pm.response.to.have.jsonSchema': 'assertion.pm.response.to.have.jsonSchema',
  'pm.response.to.have.metadata': 'assertion.pm.response.to.have.metadata',
  'pm.response.to.have.message': 'assertion.pm.response.to.have.message',
  'pm.response.to.have.responseTime': 'assertion.pm.response.to.have.responseTime',
  'pm.response.to.have.responseTime.not.above': 'assertion.pm.response.to.have.responseTime.not.above',
  'pm.response.to.have.status': 'assertion.pm.response.to.have.status',
  'pm.response.to.have.trailer': 'assertion.pm.response.to.have.trailer',
  'pm.response.to.not.be.error': 'assertion.pm.response.to.not.be.error',
  'pm.test': 'test.pm.test',
  'pm.test.skip': 'test.pm.test.skip',
  'require(moduleName)': 'require.builtin.full-library-parity'
});

const LEGACY_VARIABLE_ROW_MAP = Object.freeze({
  'postman.clearEnvironmentVariable': 'variables.pm.environment.unset',
  'postman.clearGlobalVariable': 'variables.pm.globals.unset',
  'postman.getEnvironmentVariable': 'variables.pm.environment.get',
  'postman.getGlobalVariable': 'variables.pm.globals.get',
  'postman.setEnvironmentVariable': 'variables.pm.environment.set',
  'postman.setGlobalVariable': 'variables.pm.globals.set'
});

const EXCLUDED_TOKEN_PATTERNS = Object.freeze([
  {
    pattern: /^require\(['"](?:\.{1,2}\/|\/|[A-Za-z]:\\)/,
    reason: 'Host-side Newman example code can require local files, but imported Postman sandbox scripts cannot require local filesystem paths.'
  },
  {
    pattern: /^require\(['"]newman['"]\)$/,
    reason: 'The Newman Node.js library is a host runner API, not an imported Postman sandbox script API.'
  }
]);

async function writeDocsCoverageAudit(options = {}) {
  const audit = options.live === false
    ? buildDocsCoverageAuditFromSources(options.sources || [], options)
    : await runLiveDocsCoverageAudit(options);
  const filePath = options.filePath || DOCS_AUDIT_PATH;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(audit, null, 2)}\n`);
  return audit;
}

async function validateCommittedDocsCoverageAudit(filePath = DOCS_AUDIT_PATH) {
  const audit = JSON.parse(await fs.readFile(filePath, 'utf8'));
  return validateDocsCoverageAudit(audit);
}

async function runLiveDocsCoverageAudit(options = {}) {
  const sources = await fetchOfficialDocsSources(options);
  return buildDocsCoverageAuditFromSources(sources, options);
}

async function fetchOfficialDocsSources(options = {}) {
  const matrix = options.matrix || buildPostmanParityMatrix();
  const sitemapText = await fetchText(POSTMAN_DOCS_SITEMAP_URL);
  const learningUrls = selectLearningDocsUrls(sitemapText, matrix);
  const sdkUrls = SDK_REFERENCE_CLASSES.map((className) => `${SDK_REFERENCE_BASE_URL}${className}.html`);
  const sourceRequests = [
    ...learningUrls.map((url) => ({
      id: sourceIdForUrl(url, 'learning'),
      kind: 'postman-learning-doc',
      title: titleForUrl(url),
      url,
      fetchUrl: markdownUrlForLearningDoc(url)
    })),
    ...sdkUrls.map((url) => ({
      id: sourceIdForUrl(url, 'sdk'),
      kind: 'postman-collection-sdk-reference',
      title: `Postman Collection SDK ${path.basename(new URL(url).pathname, '.html')}`,
      url,
      fetchUrl: url
    })),
    ...externalMatrixSources(matrix).map((source) => ({
      id: source.id,
      kind: 'postman-external-official-source',
      title: source.title || titleForUrl(source.url),
      url: source.url,
      fetchUrl: source.url
    }))
  ];
  const uniqueRequests = uniqueBy(sourceRequests, (source) => source.url).sort((left, right) => left.url.localeCompare(right.url));
  const fetched = await mapConcurrent(uniqueRequests, FETCH_CONCURRENCY, async (source) => {
    try {
      return {
        ...source,
        content: await fetchText(source.fetchUrl)
      };
    } catch (error) {
      if (source.kind !== 'postman-external-official-source') {
        throw error;
      }
      return {
        ...source,
        content: '',
        fetchError: error.message || String(error)
      };
    }
  });
  const newmanLatest = await fetchNewmanLatestVersion();
  return [
    ...fetched,
    {
      id: 'newman:npm-latest',
      kind: 'newman-registry',
      title: 'Newman npm latest dist-tag',
      url: NEWMAN_LATEST_URL,
      content: JSON.stringify(newmanLatest)
    }
  ];
}

function buildDocsCoverageAuditFromSources(sources = [], options = {}) {
  const matrix = options.matrix || buildPostmanParityMatrix();
  const tokenEntries = extractSourceTokens(sources);
  const tokens = tokenEntries.map((entry) => ({
    ...entry,
    coverage: resolveDocsCoverage(entry.token, matrix)
  }));
  return {
    schemaVersion: 1,
    generatedFrom: 'src/core/diagnostics-release/postmanDocsCoverageAudit.js',
    generatedAtPolicy: 'Live artifact. Regenerate with npm run postman:docs:write after official Postman/Newman docs sweeps.',
    target: {
      postmanDocs: 'Official learning.postman.com scripting/Newman docs plus official postmanlabs.com/postman-collection SDK references discovered from the live sitemap.',
      postmanDesktop: POSTMAN_DESKTOP_TARGET,
      postmanSandbox: POSTMAN_SANDBOX_TARGET,
      postmanDesktopRuntime: POSTMAN_DESKTOP_RUNTIME_TARGET,
      newman: NEWMAN_TARGET,
      newmanRuntime: NEWMAN_RUNTIME_TARGET
    },
    discovery: {
      learningSitemapUrl: POSTMAN_DOCS_SITEMAP_URL,
      learningPathPrefixes: [...LEARNING_DOC_PATH_PATTERNS],
      newmanLatestUrl: NEWMAN_LATEST_URL,
      sdkReferenceBaseUrl: SDK_REFERENCE_BASE_URL,
      sdkReferenceClasses: [...SDK_REFERENCE_CLASSES]
    },
    sources: sources.map((source) => ({
      fetchError: source.fetchError || undefined,
      id: source.id,
      kind: source.kind,
      title: source.title,
      url: source.url,
      tokenCount: tokenEntries.filter((entry) => entry.sourceRefs.includes(source.id)).length
    })).sort((left, right) => left.id.localeCompare(right.id)),
    summary: coverageSummary(tokens, sources),
    tokens
  };
}

function validateDocsCoverageAudit(audit, options = {}) {
  const errors = [];
  const matrix = options.matrix || buildPostmanParityMatrix();
  const rowIds = new Set((matrix.rows || []).map((row) => row.id));
  if (!audit || typeof audit !== 'object' || Array.isArray(audit)) {
    return { audit, errors: ['Postman docs coverage audit must be an object.'], ok: false };
  }
  if (audit.schemaVersion !== 1) {
    errors.push('Postman docs coverage audit schemaVersion must be 1.');
  }
  if (audit.target?.newman !== NEWMAN_TARGET) {
    errors.push(`Postman docs coverage audit must target newman@${NEWMAN_TARGET}.`);
  }
  if (audit.target?.postmanDesktop !== POSTMAN_DESKTOP_TARGET) {
    errors.push(`Postman docs coverage audit must target Postman Desktop ${POSTMAN_DESKTOP_TARGET}.`);
  }
  if (audit.target?.postmanSandbox !== POSTMAN_SANDBOX_TARGET) {
    errors.push(`Postman docs coverage audit must target postman-sandbox@${POSTMAN_SANDBOX_TARGET}.`);
  }
  if (audit.target?.postmanDesktopRuntime !== POSTMAN_DESKTOP_RUNTIME_TARGET) {
    errors.push(`Postman docs coverage audit must target Postman Desktop runtime ${POSTMAN_DESKTOP_RUNTIME_TARGET}.`);
  }
  if (audit.target?.newmanRuntime !== NEWMAN_RUNTIME_TARGET) {
    errors.push(`Postman docs coverage audit must target Newman runtime ${NEWMAN_RUNTIME_TARGET}.`);
  }
  if (!Array.isArray(audit.sources) || audit.sources.length < 40) {
    errors.push('Postman docs coverage audit must include a broad official docs source inventory.');
  }
  if (!Array.isArray(audit.tokens) || audit.tokens.length < 150) {
    errors.push('Postman docs coverage audit must include the extracted scripting/Newman token inventory.');
  }
  const sourceIds = new Set((audit.sources || []).map((source) => source.id));
  for (const token of audit.tokens || []) {
    if (!token.id || !token.token || !token.kind) {
      errors.push('Every docs coverage token must include id, token, and kind.');
      continue;
    }
    if (!Array.isArray(token.sourceRefs) || !token.sourceRefs.length) {
      errors.push(`Docs coverage token ${token.token} must cite at least one source.`);
    } else {
      for (const sourceRef of token.sourceRefs) {
        if (!sourceIds.has(sourceRef)) {
          errors.push(`Docs coverage token ${token.token} references unknown source ${sourceRef}.`);
        }
      }
    }
    const coverage = token.coverage || {};
    if (coverage.type === 'unmatched') {
      errors.push(`Official docs token ${token.token} is not mapped to the parity matrix.`);
    }
    if (coverage.type === 'matrix-row') {
      if (!Array.isArray(coverage.rowIds) || !coverage.rowIds.length) {
        errors.push(`Docs coverage token ${token.token} has matrix-row coverage without rowIds.`);
      }
      for (const rowId of coverage.rowIds || []) {
        if (!rowIds.has(rowId)) {
          errors.push(`Docs coverage token ${token.token} maps to missing parity row ${rowId}.`);
        }
      }
    }
    if (coverage.type === 'excluded' && !coverage.reason) {
      errors.push(`Docs coverage token ${token.token} exclusion must explain why it is outside imported script parity.`);
    }
  }
  const liveNewman = (audit.tokens || []).find((token) => token.id === 'newman.latest');
  if (liveNewman?.coverage?.newmanLatestVersion && liveNewman.coverage.newmanLatestVersion !== NEWMAN_TARGET) {
    errors.push(`Official Newman latest is ${liveNewman.coverage.newmanLatestVersion}, but the parity target is ${NEWMAN_TARGET}.`);
  }
  return {
    audit,
    errors,
    ok: errors.length === 0,
    summary: audit.summary || coverageSummary(audit.tokens || [], audit.sources || [])
  };
}

function extractSourceTokens(sources = []) {
  const sourceTokens = new Map();
  for (const source of sources) {
    const tokens = extractDocsTokens(source);
    for (const token of tokens) {
      const id = tokenId(token.token);
      const existing = sourceTokens.get(id);
      if (existing) {
        existing.sourceRefs.push(source.id);
        existing.sourceRefs = [...new Set(existing.sourceRefs)].sort();
        continue;
      }
      sourceTokens.set(id, {
        id,
        kind: token.kind,
        sourceRefs: [source.id],
        token: token.token
      });
    }
  }
  return [...sourceTokens.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function extractDocsTokens(source = {}) {
  if (source.kind === 'newman-registry') {
    const latest = parseNewmanLatestVersion(source.content);
    return latest ? [{ kind: 'newman-version', token: `newman@${latest}` }] : [];
  }
  if (source.kind === 'postman-collection-sdk-reference') {
    return extractSdkReferenceTokens(source);
  }
  const text = decodeHtmlEntities(String(source.content || ''));
  const tokens = new Map();
  addPatternTokens(tokens, text, /\bpm\s*(?:\.\s*[A-Za-z_$][\w$]*\s*(?:\(\s*\))?){1,8}/g, 'pm-api', normalizePmToken);
  addPatternTokens(tokens, text, /\bpm\.response\.<bdd-syntax>\.jsonSchema/g, 'pm-api', (match) => match[0]);
  addPatternTokens(tokens, text, /\bpostman\.(?:setNextRequest|clearEnvironmentVariable|clearGlobalVariable|getEnvironmentVariable|getGlobalVariable|setEnvironmentVariable|setGlobalVariable)\b/g, 'legacy-api', normalizeLegacyPostmanToken);
  addPatternTokens(tokens, text, /\b(?:pm\.)?require\s*\(\s*(['"`])([^'"`]+)\1\s*\)/g, 'require', normalizeRequireToken);
  addPatternTokens(tokens, text, /\brequire\s*\(\s*moduleName(?::String)?\s*\)/g, 'require-api', () => 'require(moduleName)');
  return [...tokens.values()].sort((left, right) => left.token.localeCompare(right.token));
}

function extractSdkReferenceTokens(source = {}) {
  const className = path.basename(new URL(source.url).pathname, '.html');
  const text = String(source.content || '');
  const tokens = new Map();
  const methodPattern = new RegExp(`${escapeRegExp(className)}\\.html#(?:\\.|)([A-Za-z_$][\\w$]*)`, 'g');
  for (const match of text.matchAll(methodPattern)) {
    const method = match[1];
    if (!method || method.startsWith('is')) {
      continue;
    }
    tokens.set(`sdk.${className}.${method}`, {
      kind: 'sdk-reference',
      token: `sdk.${className}.${method}`
    });
  }
  tokens.set(`sdk.${className}.constructor`, {
    kind: 'sdk-reference',
    token: `sdk.${className}.constructor`
  });
  return [...tokens.values()].sort((left, right) => left.token.localeCompare(right.token));
}

function addPatternTokens(tokens, text, pattern, kind, normalize) {
  for (const match of text.matchAll(pattern)) {
    const token = normalize(match);
    if (!token || shouldIgnoreExtractedToken(token)) {
      continue;
    }
    tokens.set(tokenId(token), { kind, token });
  }
}

function normalizePmToken(match) {
  const value = Array.isArray(match) ? match[0] : match;
  return cleanupToken(value)
    .replace(/\(\)/g, '')
    .replace(/\.$/, '');
}

function normalizeLegacyPostmanToken(match) {
  const value = Array.isArray(match) ? match[0] : match;
  return cleanupToken(value);
}

function normalizeRequireToken(match) {
  const full = match[0] || '';
  const specifier = match[2] || '';
  const prefix = /^\s*pm\s*\./.test(full) ? 'pm.require' : 'require';
  return `${prefix}('${specifier}')`;
}

function cleanupToken(value) {
  return String(value || '')
    .replace(/\s+/g, '')
    .replace(/:Function$|:Number$|:String$|:Object$|:Boolean$|:Array$/i, '')
    .replace(/[;,.]+$/g, '');
}

function shouldIgnoreExtractedToken(token) {
  return token === 'pm' || token === 'pm.' || token.includes('pm.collection.');
}

function resolveDocsCoverage(token, matrix = buildPostmanParityMatrix()) {
  const rowById = new Map((matrix.rows || []).map((row) => [row.id, row]));
  const excluded = excludedCoverage(token);
  if (excluded) {
    return excluded;
  }
  if (/^newman@/.test(token)) {
    const version = token.slice('newman@'.length);
    if (version === NEWMAN_TARGET) {
      return {
        type: 'matrix-row',
        rowIds: ['harness.differential.newman'],
        reason: `Official npm latest Newman version matches the parity target newman@${NEWMAN_TARGET}.`,
        newmanLatestVersion: version
      };
    }
    return {
      type: 'unmatched',
      rowIds: [],
      reason: `Official npm latest Newman version is ${version}; update NEWMAN_TARGET and rerun the Newman differential corpus.`,
      newmanLatestVersion: version
    };
  }
  const explicit = explicitCoverage(token, rowById);
  if (explicit) {
    return explicit;
  }
  const sdk = sdkCoverage(token, rowById);
  if (sdk) {
    return sdk;
  }
  const packageCoverage = requireCoverage(token, rowById);
  if (packageCoverage) {
    return packageCoverage;
  }
  const fuzzy = fuzzyCoverage(token, matrix);
  if (fuzzy) {
    return fuzzy;
  }
  return {
    type: 'unmatched',
    rowIds: [],
    reason: 'No parity matrix row or documented exclusion matched this official docs token.'
  };
}

function excludedCoverage(token) {
  for (const item of EXCLUDED_TOKEN_PATTERNS) {
    if (item.pattern.test(token)) {
      return {
        type: 'excluded',
        rowIds: [],
        reason: item.reason
      };
    }
  }
  return null;
}

function explicitCoverage(token, rowById) {
  const rowId = EXACT_TOKEN_ROW_MAP[token] || LEGACY_VARIABLE_ROW_MAP[token];
  if (rowId && rowById.has(rowId)) {
    return {
      type: 'matrix-row',
      rowIds: [rowId],
      reason: 'Exact documented token maps to an explicit parity row.'
    };
  }
  if (/^pm\.response\.to\./.test(token) && rowById.has('assertion.pm.expect.full-chai-bdd-surface')) {
    return {
      type: 'matrix-row',
      rowIds: ['assertion.pm.expect.full-chai-bdd-surface'],
      reason: 'Postman response assertion chain is covered by the full Chai BDD/assertion surface row when no narrower row is required.'
    };
  }
  if (/^pm\.response\.json\./.test(token) && rowById.has('response.method.json')) {
    return {
      type: 'matrix-row',
      rowIds: ['response.method.json'],
      reason: 'Property access after pm.response.json() is covered by the pm.response.json() body parsing row; the trailing property is response payload shape, not a sandbox API.'
    };
  }
  if (/^pm\.response\.text\./.test(token) && rowById.has('response.method.text')) {
    return {
      type: 'matrix-row',
      rowIds: ['response.method.text'],
      reason: 'Property access after pm.response.text() is covered by the pm.response.text() body parsing row; the trailing property is a normal string property.'
    };
  }
  if (/^pm\.expect\./.test(token) && rowById.has('assertion.pm.expect.full-chai-bdd-surface')) {
    return {
      type: 'matrix-row',
      rowIds: ['assertion.pm.expect.full-chai-bdd-surface'],
      reason: 'Postman pm.expect Chai chain is covered by the full Chai BDD/assertion surface row.'
    };
  }
  return null;
}

function sdkCoverage(token, rowById) {
  const match = /^sdk\.([^.]+)\.([^.]+)$/.exec(token);
  if (!match) {
    return null;
  }
  const [, className, method] = match;
  const rowIds = [];
  if (className === 'Url' && SDK_URL_METHOD_ROW_MAP[method]) {
    rowIds.push(SDK_URL_METHOD_ROW_MAP[method]);
  }
  if (SDK_LIST_CLASSES.has(className) && SDK_LIST_METHOD_ROW_MAP[method]) {
    rowIds.push(SDK_LIST_METHOD_ROW_MAP[method]);
  }
  if (rowById.has('require.builtin.postman-collection')) {
    rowIds.push('require.builtin.postman-collection');
  }
  if (['Request', 'Response', 'Url', 'HeaderList', 'CookieList', 'PropertyList', 'QueryParamList', 'VariableList', 'VariableScope'].includes(className)
    && rowById.has('sdk.live-object.constructor-prototype-parity')) {
    rowIds.push('sdk.live-object.constructor-prototype-parity');
  }
  const existingRowIds = [...new Set(rowIds)].filter((rowId) => rowById.has(rowId));
  if (!existingRowIds.length) {
    return null;
  }
  return {
    type: 'matrix-row',
    rowIds: existingRowIds,
    reason: 'Official Postman Collection SDK reference token is covered by the pinned postman-collection bundle and, where applicable, explicit live SDK facade rows.'
  };
}

function requireCoverage(token, rowById) {
  const match = /^(pm\.)?require\('([^']+)'\)$/.exec(token);
  if (!match) {
    return null;
  }
  const isPmRequire = Boolean(match[1]);
  const specifier = match[2];
  const rowIds = [];
  if (!isPmRequire) {
    const rowId = `require.builtin.${slug(specifier)}`;
    if (rowById.has(rowId)) {
      rowIds.push(rowId);
    }
    if (rowById.has('require.builtin.full-library-parity')) {
      rowIds.push('require.builtin.full-library-parity');
    }
  } else if (/^@[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(specifier)) {
    rowIds.push('require.pm.team-package');
  } else if (/^npm:@[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+@\S+$/.test(specifier)) {
    rowIds.push('require.pm.npm-scoped-package');
  } else if (/^npm:@[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(specifier)) {
    rowIds.push('require.pm.npm-scoped-package', 'require.pm.latest-package');
  } else if (/^npm:[A-Za-z0-9._-]+@\S+$/.test(specifier)) {
    rowIds.push('require.pm.npm-package');
  } else if (/^npm:[A-Za-z0-9._-]+$/.test(specifier)) {
    rowIds.push('require.pm.npm-package', 'require.pm.latest-package');
  } else if (/^jsr:/.test(specifier)) {
    rowIds.push('require.pm.jsr-package');
    if (!/@\d/.test(specifier.replace(/^jsr:/, ''))) {
      rowIds.push('require.pm.latest-package');
    }
    rowIds.push('require.pm.jsr-esm-module-semantics');
  }
  const existingRowIds = [...new Set(rowIds)].filter((rowId) => rowById.has(rowId));
  if (!existingRowIds.length) {
    return null;
  }
  return {
    type: 'matrix-row',
    rowIds: existingRowIds,
    reason: isPmRequire
      ? 'Postman package import token maps to the reviewed package workflow rows.'
      : 'Built-in require token maps to the pinned Postman sandbox bundled library rows.'
  };
}

function fuzzyCoverage(token, matrix) {
  const normalizedToken = normalizeForSearch(token);
  const exactTarget = (matrix.rows || []).find((row) => normalizeForSearch(row.target) === normalizedToken);
  if (exactTarget) {
    return {
      type: 'matrix-row',
      rowIds: [exactTarget.id],
      reason: 'Token exactly matches a parity matrix row target.'
    };
  }
  const targetMatch = (matrix.rows || []).find((row) => normalizeForSearch(row.target).includes(normalizedToken));
  if (targetMatch) {
    return {
      type: 'matrix-row',
      rowIds: [targetMatch.id],
      reason: 'Token is contained in a parity matrix row target.'
    };
  }
  const rowTextMatch = (matrix.rows || []).find((row) => normalizeForSearch([
    row.id,
    row.area,
    row.kind,
    row.target,
    row.notes || ''
  ].join(' ')).includes(normalizedToken));
  if (rowTextMatch) {
    return {
      type: 'matrix-row',
      rowIds: [rowTextMatch.id],
      reason: 'Token is covered by a parity matrix row id/notes match.'
    };
  }
  return null;
}

function coverageSummary(tokens = [], sources = []) {
  const byCoverage = {};
  const byKind = {};
  const rowIds = new Set();
  const unmatched = [];
  for (const token of tokens) {
    const type = token.coverage?.type || 'unmatched';
    byCoverage[type] = (byCoverage[type] || 0) + 1;
    byKind[token.kind] = (byKind[token.kind] || 0) + 1;
    for (const rowId of token.coverage?.rowIds || []) {
      rowIds.add(rowId);
    }
    if (type === 'unmatched') {
      unmatched.push(token.token);
    }
  }
  return {
    coveredRowCount: rowIds.size,
    sourceCount: sources.length,
    tokenCount: tokens.length,
    unmatched,
    byCoverage,
    byKind
  };
}

function selectLearningDocsUrls(sitemapText, matrix) {
  const urls = [...String(sitemapText || '').matchAll(/<loc>(https:\/\/learning\.postman\.com\/docs\/[^<]+)<\/loc>/g)]
    .map((match) => stripTrailingSlash(match[1]))
    .filter((url) => LEARNING_DOC_PATH_PATTERNS.some((pattern) => new URL(url).pathname.startsWith(pattern)));
  for (const source of Object.values(matrix.sources || {})) {
    if (source?.url && source.url.startsWith('https://learning.postman.com/docs/')) {
      urls.push(stripTrailingSlash(source.url));
    }
  }
  return [...new Set(urls)].sort();
}

function externalMatrixSources(matrix) {
  return Object.entries(matrix.sources || {})
    .filter(([, source]) => source?.url && !source.url.startsWith('https://learning.postman.com/docs/') && !source.url.startsWith(SDK_REFERENCE_BASE_URL))
    .map(([id, source]) => ({ id: `matrix-source:${id}`, title: source.title, url: source.url }))
    .filter((source) => source.url.startsWith('https://blog.postman.com/') || source.url.startsWith('https://learning.postman.com/'));
}

function markdownUrlForLearningDoc(url) {
  const stripped = stripTrailingSlash(url);
  return stripped.endsWith('.md') ? stripped : `${stripped}.md`;
}

function sourceIdForUrl(url, prefix) {
  const parsed = new URL(url);
  const pathname = stripTrailingSlash(parsed.pathname).replace(/^\/+/, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${prefix}:${pathname || parsed.hostname.replace(/[^A-Za-z0-9]+/g, '-')}`;
}

function titleForUrl(url) {
  const parsed = new URL(url);
  const parts = stripTrailingSlash(parsed.pathname).split('/').filter(Boolean);
  const tail = parts[parts.length - 1] || parsed.hostname;
  return tail.replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

async function fetchNewmanLatestVersion() {
  const text = await fetchText(NEWMAN_LATEST_URL);
  const parsed = JSON.parse(text);
  return { version: parsed.version || '' };
}

function parseNewmanLatestVersion(content) {
  try {
    const parsed = JSON.parse(content || '{}');
    return parsed.version || '';
  } catch {
    return '';
  }
}

function fetchText(url, options = {}) {
  const timeoutMillis = options.timeoutMillis || FETCH_TIMEOUT_MILLIS;
  const maxBytes = options.maxBytes || FETCH_MAX_BYTES;
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http;
    const request = client.get(url, {
      headers: {
        accept: 'text/markdown,text/plain,text/html,application/json,*/*',
        'user-agent': 'PostMeter parity docs audit'
      },
      timeout: timeoutMillis
    }, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
        response.resume();
        const nextUrl = new URL(response.headers.location, url).toString();
        fetchText(nextUrl, options).then(resolve, reject);
        return;
      }
      if ((response.statusCode || 0) < 200 || (response.statusCode || 0) >= 300) {
        response.resume();
        reject(new Error(`Fetch failed for ${url}: HTTP ${response.statusCode}`));
        return;
      }
      const chunks = [];
      let bytes = 0;
      response.on('data', (chunk) => {
        bytes += chunk.length;
        if (bytes > maxBytes) {
          request.destroy(new Error(`Fetch exceeded ${maxBytes} bytes for ${url}`));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        resolve(Buffer.concat(chunks).toString('utf8'));
      });
    });
    request.on('timeout', () => {
      request.destroy(new Error(`Fetch timed out after ${timeoutMillis}ms for ${url}`));
    });
    request.on('error', reject);
  });
}

async function mapConcurrent(items, concurrency, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

function uniqueBy(values, keyFn) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const key = keyFn(value);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(value);
  }
  return result;
}

function tokenId(token) {
  if (/^newman@/.test(token)) {
    return 'newman.latest';
  }
  return slug(token) || 'token';
}

function slug(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function normalizeForSearch(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\(\)/g, '')
    .replace(/['"`]/g, '')
    .replace(/[^a-z0-9@./:-]+/g, '')
    .replace(/:function|:number|:string|:object|:boolean|:array/g, '');
}

function stripTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  DOCS_AUDIT_PATH,
  buildDocsCoverageAuditFromSources,
  extractDocsTokens,
  fetchOfficialDocsSources,
  resolveDocsCoverage,
  runLiveDocsCoverageAudit,
  validateCommittedDocsCoverageAudit,
  validateDocsCoverageAudit,
  writeDocsCoverageAudit
};
