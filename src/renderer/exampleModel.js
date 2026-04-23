(function attachExampleModel(global) {
function formatExampleBody(example) {
  const body = example.body || '';
  if (example.bodyType !== 'RAW_JSON') {
    return body;
  }
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}

function exampleHeadersToText(headers) {
  return (headers || [])
    .filter((header) => header.enabled !== false && header.key)
    .map((header) => `${header.key}: ${header.value ?? ''}`)
    .join('\n');
}

function parseHeadersText(value) {
  return String(value || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf(':');
      if (separator < 1) {
        return { enabled: true, key: line, value: '' };
      }
      return {
        enabled: true,
        key: line.slice(0, separator).trim(),
        value: line.slice(separator + 1).trim()
      };
    });
}

function looksLikeJson(value) {
  if (!String(value || '').trim()) {
    return false;
  }
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

function newExampleObject(options = {}) {
  const existingNames = options.existingNames || [];
  return {
    id: options.id || crypto.randomUUID(),
    name: uniqueName('Example Response', existingNames),
    statusCode: 200,
    headers: [],
    bodyType: 'RAW_JSON',
    body: '{}'
  };
}

function exampleFromResponse(response, options = {}) {
  const existingNames = options.existingNames || [];
  return {
    id: options.id || crypto.randomUUID(),
    name: uniqueName(`Response ${response.statusCode || ''}`.trim() || 'Example Response', existingNames),
    statusCode: response.statusCode || 0,
    headers: Object.entries(response.headers || {}).flatMap(([key, values]) => (values || []).map((value) => ({ enabled: true, key, value }))),
    bodyType: looksLikeJson(response.body) ? 'RAW_JSON' : 'RAW_TEXT',
    body: response.body || ''
  };
}

function uniqueName(baseName, existingNames) {
  if (!existingNames.includes(baseName)) {
    return baseName;
  }
  let suffix = 2;
  while (existingNames.includes(`${baseName} ${suffix}`)) {
    suffix++;
  }
  return `${baseName} ${suffix}`;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    exampleFromResponse,
    exampleHeadersToText,
    formatExampleBody,
    looksLikeJson,
    newExampleObject,
    parseHeadersText
  };
}
global.PostMeterExampleModel = {
  exampleFromResponse,
  exampleHeadersToText,
  formatExampleBody,
  looksLikeJson,
  newExampleObject,
  parseHeadersText
};
})(typeof window === 'undefined' ? globalThis : window);
