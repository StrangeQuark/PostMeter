const {
  htmlSelectorExists,
  readHtmlSelector,
  readXmlPath,
  xmlPathExists
} = require('./markup');

function evaluateAssertions(response, assertions = []) {
  const results = [];
  const extractedVariables = [];
  for (const assertion of assertions || []) {
    if (assertion?.enabled === false) {
      continue;
    }
    const result = evaluateAssertion(response, assertion);
    results.push(result);
    if (result.passed && result.extractedVariable) {
      extractedVariables.push(result.extractedVariable);
    }
  }
  return {
    passed: results.every((result) => result.passed),
    results,
    extractedVariables
  };
}

function evaluateAssertion(response, assertion = {}) {
  try {
    if (assertion.type === 'statusCode') {
      return compareAssertion(assertion, response.statusCode, Number(assertion.expected), `Status code ${response.statusCode}`);
    }
    if (assertion.type === 'header') {
      const value = headerValue(response.headers, assertion.name);
      return compareAssertion(assertion, value, assertion.expected, `Header ${assertion.name || ''}`);
    }
    if (assertion.type === 'jsonPath') {
      const payload = parseJson(response.body);
      const value = readJsonPath(payload, assertion.path);
      return compareAssertion(assertion, value, parseExpected(assertion.expected), `JSON path ${assertion.path || ''}`);
    }
    if (assertion.type === 'xmlPath') {
      const value = assertion.operator === 'exists'
        ? xmlPathExists(response.body, assertion.path)
        : readXmlPath(response.body, assertion.path);
      return compareAssertion(assertion, value, parseExpected(assertion.expected), `XML XPath ${assertion.path || ''}`);
    }
    if (assertion.type === 'htmlSelector') {
      const value = assertion.operator === 'exists'
        ? htmlSelectorExists(response.body, assertion.path)
        : readHtmlSelector(response.body, assertion.path);
      return compareAssertion(assertion, value, assertion.expected, `HTML selector ${assertion.path || ''}`);
    }
    if (assertion.type === 'responseTime') {
      return compareAssertion(assertion, response.durationMillis, Number(assertion.expected), `Response time ${response.durationMillis} ms`);
    }
    if (assertion.type === 'responseSize') {
      return compareAssertion(assertion, response.responseBytes, Number(assertion.expected), `Response size ${response.responseBytes} bytes`);
    }
    if (assertion.type === 'bodyContains') {
      return compareAssertion({ ...assertion, operator: 'contains' }, response.body || '', assertion.expected, 'Response body');
    }
    if (assertion.type === 'extractVariable') {
      const payload = parseJson(response.body);
      const value = readJsonPath(payload, assertion.path);
      if (value == null || value === '') {
        return failed(assertion, `JSON path ${assertion.path || ''} did not produce a value.`);
      }
      const variableName = assertion.variableName || assertion.name;
      if (!variableName) {
        return failed(assertion, 'Extract variable assertion requires a variable name.');
      }
      return {
        assertion,
        passed: true,
        message: `Extracted ${variableName}.`,
        actual: value,
        expected: '',
        extractedVariable: { key: variableName, value: String(value) }
      };
    }
    if (assertion.type === 'extractXml') {
      const value = readXmlPath(response.body, assertion.path);
      if (value == null || value === '') {
        return failed(assertion, `XML XPath ${assertion.path || ''} did not produce a value.`);
      }
      const variableName = assertion.variableName || assertion.name;
      if (!variableName) {
        return failed(assertion, 'XML extract assertion requires a variable name.');
      }
      return {
        assertion,
        passed: true,
        message: `Extracted ${variableName}.`,
        actual: value,
        expected: '',
        extractedVariable: { key: variableName, value: String(value) }
      };
    }
    if (assertion.type === 'extractHtml') {
      const value = readHtmlSelector(response.body, assertion.path);
      if (value == null || value === '') {
        return failed(assertion, `HTML selector ${assertion.path || ''} did not produce a value.`);
      }
      const variableName = assertion.variableName || assertion.name;
      if (!variableName) {
        return failed(assertion, 'HTML extract assertion requires a variable name.');
      }
      return {
        assertion,
        passed: true,
        message: `Extracted ${variableName}.`,
        actual: value,
        expected: '',
        extractedVariable: { key: variableName, value: String(value) }
      };
    }
    if (assertion.type === 'extractRegex') {
      const pattern = assertion.expected || assertion.path;
      if (!pattern) {
        return failed(assertion, 'Regex extract assertion requires a pattern.');
      }
      const match = new RegExp(pattern).exec(response.body || '');
      if (!match) {
        return failed(assertion, 'Regex extract assertion did not match the response body.');
      }
      const variableName = assertion.variableName || assertion.name;
      if (!variableName) {
        return failed(assertion, 'Regex extract assertion requires a variable name.');
      }
      const value = match[1] != null ? match[1] : match[0];
      return {
        assertion,
        passed: true,
        message: `Extracted ${variableName}.`,
        actual: value,
        expected: pattern,
        extractedVariable: { key: variableName, value: String(value) }
      };
    }
    return failed(assertion, `Unsupported assertion type: ${assertion.type || 'unknown'}.`);
  } catch (error) {
    return failed(assertion, error.message || String(error));
  }
}

function compareAssertion(assertion, actual, expected, label) {
  const operator = assertion.operator || 'equals';
  let passed = false;
  if (operator === 'equals') {
    passed = String(actual) === String(expected);
  } else if (operator === 'notEquals') {
    passed = String(actual) !== String(expected);
  } else if (operator === 'contains') {
    passed = String(actual ?? '').includes(String(expected ?? ''));
  } else if (operator === 'exists') {
    passed = typeof actual === 'boolean' ? actual : actual != null && actual !== '';
  } else if (operator === 'lessThan') {
    passed = Number(actual) < Number(expected);
  } else if (operator === 'greaterThan') {
    passed = Number(actual) > Number(expected);
  } else {
    return failed(assertion, `Unsupported assertion operator: ${operator}.`, actual, expected);
  }
  return {
    assertion,
    passed,
    message: passed ? `${label} assertion passed.` : `${label} assertion failed.`,
    actual,
    expected
  };
}

function headerValue(headers = {}, name = '') {
  const target = String(name || '').toLowerCase();
  for (const [key, values] of Object.entries(headers || {})) {
    if (key.toLowerCase() === target) {
      return Array.isArray(values) ? values.join(', ') : String(values ?? '');
    }
  }
  return '';
}

function parseJson(body) {
  try {
    return JSON.parse(body || '');
  } catch {
    throw new Error('Response body is not valid JSON.');
  }
}

function readJsonPath(value, path) {
  const parts = parseJsonPath(path);
  let current = value;
  for (const part of parts) {
    if (current == null) {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

function parseJsonPath(path) {
  const text = String(path || '').trim();
  if (!text || text === '$') {
    return [];
  }
  const withoutRoot = text.startsWith('$.') ? text.slice(2) : text.replace(/^\$/, '');
  return withoutRoot
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean);
}

function parseExpected(value) {
  if (typeof value !== 'string') {
    return value;
  }
  const text = value.trim();
  if (!text) {
    return '';
  }
  try {
    return JSON.parse(text);
  } catch {
    return value;
  }
}

function failed(assertion, message, actual = '', expected = assertion?.expected ?? '') {
  return {
    assertion,
    passed: false,
    message,
    actual,
    expected
  };
}

module.exports = {
  evaluateAssertion,
  evaluateAssertions,
  readHtmlSelector,
  readJsonPath,
  readXmlPath
};
