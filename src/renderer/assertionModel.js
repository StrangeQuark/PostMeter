(function attachAssertionModel(global) {
const assertionTemplates = {
  status200: { type: 'statusCode', operator: 'equals', expected: '200', name: '', path: '', variableName: '' },
  jsonPathExists: { type: 'jsonPath', operator: 'exists', expected: '', name: '', path: '$', variableName: '' },
  xmlPathExists: { type: 'xmlPath', operator: 'exists', expected: '', name: '', path: '/*', variableName: '' },
  htmlSelectorExists: { type: 'htmlSelector', operator: 'exists', expected: '', name: '', path: 'body', variableName: '' },
  headerContains: { type: 'header', operator: 'contains', expected: 'application/json', name: 'Content-Type', path: '', variableName: '' },
  responseUnderOneSecond: { type: 'responseTime', operator: 'lessThan', expected: '1000', name: '', path: '', variableName: '' },
  responseUnder10Kb: { type: 'responseSize', operator: 'lessThan', expected: '10240', name: '', path: '', variableName: '' },
  bodyContains: { type: 'bodyContains', operator: 'contains', expected: '', name: '', path: '', variableName: '' },
  extractVariable: { type: 'extractVariable', operator: 'exists', expected: '', name: 'token', path: '$.token', variableName: 'token' },
  extractXml: { type: 'extractXml', operator: 'exists', expected: '', name: 'token', path: 'string(//token)', variableName: 'token' },
  extractHtml: { type: 'extractHtml', operator: 'exists', expected: '', name: 'title', path: 'title', variableName: 'title' },
  extractRegex: { type: 'extractRegex', operator: 'exists', expected: '"token"\\s*:\\s*"([^"]+)"', name: 'token', path: '', variableName: 'token' }
};

function assertionNamePlaceholder(assertion) {
  if (assertion.type === 'header') {
    return 'Header name';
  }
  if (assertion.type === 'extractVariable' || assertion.type === 'extractXml' || assertion.type === 'extractHtml' || assertion.type === 'extractRegex') {
    return 'Variable name';
  }
  return 'Name';
}

function assertionPathPlaceholder(assertion) {
  if (assertion.type === 'jsonPath' || assertion.type === 'extractVariable') {
    return 'JSON path';
  }
  if (assertion.type === 'xmlPath' || assertion.type === 'extractXml') {
    return 'XPath';
  }
  if (assertion.type === 'htmlSelector' || assertion.type === 'extractHtml') {
    return 'CSS selector';
  }
  if (assertion.type === 'extractRegex') {
    return 'Unused';
  }
  return 'Path';
}

function assertionExpectedPlaceholder(assertion) {
  if (assertion.type === 'statusCode') {
    return 'Expected status';
  }
  if (assertion.type === 'responseTime') {
    return 'Milliseconds';
  }
  if (assertion.type === 'responseSize') {
    return 'Bytes';
  }
  if (assertion.type === 'header') {
    return 'Expected header value';
  }
  if (assertion.type === 'bodyContains') {
    return 'Text to find';
  }
  if (assertion.type === 'extractRegex') {
    return 'Regex pattern';
  }
  if (assertion.type === 'xmlPath') {
    return 'Expected XML value';
  }
  if (assertion.type === 'htmlSelector') {
    return 'Expected text';
  }
  return 'Expected';
}

function applyAssertionTypeDefaults(assertion, templates = assertionTemplates) {
  const template = Object.values(templates).find((candidate) => candidate.type === assertion.type);
  if (!template) {
    return assertion;
  }
  assertion.operator = template.operator;
  assertion.expected = template.expected;
  assertion.name = template.name;
  assertion.path = template.path;
  assertion.variableName = template.variableName;
  return assertion;
}

function newAssertion(template = assertionTemplates.status200) {
  return {
    enabled: true,
    type: template.type || 'statusCode',
    operator: template.operator || 'equals',
    expected: template.expected ?? '',
    name: template.name || '',
    path: template.path || '',
    variableName: template.variableName || ''
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    applyAssertionTypeDefaults,
    assertionExpectedPlaceholder,
    assertionNamePlaceholder,
    assertionPathPlaceholder,
    assertionTemplates,
    newAssertion
  };
}

global.PostMeterAssertionModel = {
  applyAssertionTypeDefaults,
  assertionExpectedPlaceholder,
  assertionNamePlaceholder,
  assertionPathPlaceholder,
  assertionTemplates,
  newAssertion
};
})(typeof window === 'undefined' ? globalThis : window);
