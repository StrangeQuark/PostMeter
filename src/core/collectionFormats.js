const { BODY_TYPES, SUPPORTED_METHODS, collectionModel, folderModel, keyValue, requestModel, walkRequests } = require('./models');
const { normalizeAuth } = require('./auth');

const HTTP_METHODS = [...SUPPORTED_METHODS].map((method) => method.toLowerCase());

function importOpenApiDocument(document) {
  if (!looksLikeOpenApiDocument(document)) {
    throw new Error('File is not a supported OpenAPI document.');
  }
  const collection = collectionModel({
    name: document.info?.title || 'Imported OpenAPI Collection',
    requests: [],
    folders: []
  });
  const baseUrl = openApiBaseUrl(document);
  const foldersByTag = new Map();

  for (const [pathName, pathItem] of Object.entries(document.paths || {})) {
    if (!pathItem || typeof pathItem !== 'object') {
      continue;
    }
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation || typeof operation !== 'object') {
        continue;
      }
      const request = requestModel({
        name: operation.operationId || operation.summary || `${method.toUpperCase()} ${pathName}`,
        method: method.toUpperCase(),
        url: `${baseUrl}${openApiPathToPostMeter(pathName)}`
      });
      importOpenApiParameters([...(pathItem.parameters || []), ...(operation.parameters || [])], request);
      importOpenApiBody(operation.requestBody, request);
      importOpenApiResponses(operation.responses, request);
      importOpenApiAuth(document, operation, request);
      const tag = Array.isArray(operation.tags) && operation.tags[0] ? String(operation.tags[0]) : '';
      if (tag) {
        if (!foldersByTag.has(tag)) {
          const folder = folderModel({ name: tag, requests: [], folders: [] });
          foldersByTag.set(tag, folder);
          collection.folders.push(folder);
        }
        foldersByTag.get(tag).requests.push(request);
      } else {
        collection.requests.push(request);
      }
    }
  }
  assertImportableCollection(collection, 'OpenAPI document');
  return collection;
}

function importOpenApiAuth(document, operation, request) {
  const security = Array.isArray(operation.security) ? operation.security : document.security;
  if (!Array.isArray(security) || !security.length) {
    return;
  }
  const schemes = document.components?.securitySchemes || document.securityDefinitions || {};
  for (const requirement of security) {
    const schemeName = Object.keys(requirement || {})[0];
    const scheme = schemes[schemeName];
    if (!scheme) {
      continue;
    }
    const auth = openApiSecuritySchemeToAuth(scheme);
    if (auth) {
      request.auth = auth;
      return;
    }
  }
}

function openApiSecuritySchemeToAuth(scheme) {
  const type = String(scheme.type || '').toLowerCase();
  const location = String(scheme.in || '').toLowerCase();
  const name = scheme.name || '';
  if (type === 'http' && String(scheme.scheme || '').toLowerCase() === 'bearer') {
    return { type: 'bearer', token: `{{${name || 'bearerToken'}}}` };
  }
  if (type === 'http' && String(scheme.scheme || '').toLowerCase() === 'basic') {
    return { type: 'basic', username: '{{username}}', password: '{{password}}' };
  }
  if (type === 'apikey' && name) {
    return {
      type: 'apiKey',
      location: location === 'query' ? 'query' : 'header',
      key: name,
      value: `{{${name}}}`
    };
  }
  if (type === 'oauth2') {
    const flow = firstOpenApiOAuthFlow(scheme.flows);
    return {
      type: 'oauth2',
      tokenType: 'Bearer',
      accessToken: '{{accessToken}}',
      authorizationUrl: flow?.authorizationUrl || '',
      tokenUrl: flow?.tokenUrl || '',
      scopes: Object.keys(flow?.scopes || {}).join(' '),
      grantType: flow?.grantType || 'authorizationCode'
    };
  }
  return null;
}

function firstOpenApiOAuthFlow(flows = {}) {
  for (const [key, value] of Object.entries(flows || {})) {
    if (!value || typeof value !== 'object') {
      continue;
    }
    return {
      ...value,
      grantType: key === 'clientCredentials' ? 'clientCredentials' : 'authorizationCode'
    };
  }
  return null;
}

function exportOpenApiCollection(collection) {
  const paths = {};
  const securitySchemes = {};
  for (const { request } of flattenCollectionRequests(collection)) {
    const parsed = parseRequestUrl(request.url);
    const pathName = postMeterPathToOpenApiPath(parsed ? decodeURIComponent(parsed.pathname) : openApiPathFromRawUrl(request.url));
    const method = String(request.method || 'GET').toLowerCase();
    if (!HTTP_METHODS.includes(method)) {
      continue;
    }
    paths[pathName] ||= {};
    const operation = {
      operationId: operationId(request.name),
      summary: request.name || `${request.method} ${pathName}`,
      parameters: [],
      responses: {
        200: { description: 'Successful response' }
      }
    };
    for (const pair of request.queryParams || []) {
      if (pair.enabled === false || !pair.key) {
        continue;
      }
      operation.parameters.push(openApiParameter('query', pair.key, pair.value));
    }
    for (const header of request.headers || []) {
      if (header.enabled === false || !header.key || header.key.toLowerCase() === 'content-type') {
        continue;
      }
      operation.parameters.push(openApiParameter('header', header.key, header.value));
    }
    if (request.bodyType !== BODY_TYPES.NONE && request.body) {
      const contentType = contentTypeForRequest(request);
      operation.requestBody = {
        required: false,
        content: {
          [contentType]: {
            example: parseJsonMaybe(request.body)
          }
        }
      };
    }
    const security = openApiSecurityForRequest(request.auth, securitySchemes);
    if (security) {
      operation.security = [security];
    }
    paths[pathName][method] = operation;
  }
  const document = {
    openapi: '3.1.0',
    info: {
      title: collection.name || 'PostMeter Collection',
      version: '1.0.0',
      description: collection.description || ''
    },
    servers: [{ url: '{{baseUrl}}' }],
    paths
  };
  if (Object.keys(securitySchemes).length) {
    document.components = { securitySchemes };
  }
  return document;
}

function importHarDocument(document) {
  if (!looksLikeHarDocument(document)) {
    throw new Error('File is not a supported HAR document.');
  }
  const collection = collectionModel({ name: 'Imported HAR Collection', requests: [], folders: [] });
  for (const [index, entry] of (document.log.entries || []).entries()) {
    const source = entry?.request;
    if (!source?.url) {
      continue;
    }
    const request = requestModel({
      name: source.comment || `${source.method || 'GET'} ${safeUrlPath(source.url) || index + 1}`,
      method: source.method || 'GET',
      url: stripQueryFromUrl(source.url)
    });
    for (const query of source.queryString || []) {
      request.queryParams.push(keyValue(query.name, query.value ?? ''));
    }
    for (const header of source.headers || []) {
      request.headers.push(keyValue(header.name, header.value ?? ''));
    }
    if (source.postData?.text) {
      request.body = source.postData.text;
      request.bodyType = isJsonMime(source.postData.mimeType) ? BODY_TYPES.RAW_JSON : BODY_TYPES.RAW_TEXT;
    }
    const response = entry?.response;
    if (response && typeof response === 'object') {
      request.examples.push({
        name: response.status ? `HAR ${response.status}` : 'HAR Response',
        statusCode: Number(response.status || 0),
        headers: Array.isArray(response.headers)
          ? response.headers.filter((header) => header?.name).map((header) => keyValue(header.name, header.value ?? ''))
          : [],
        bodyType: isJsonMime(response.content?.mimeType) ? BODY_TYPES.RAW_JSON : BODY_TYPES.RAW_TEXT,
        body: response.content?.text || ''
      });
      if (Number.isFinite(Number(entry.time)) && entry.time > 0) {
        request.variables.push(keyValue('har.responseTimeMillis', String(entry.time)));
      }
    }
    collection.requests.push(request);
  }
  assertImportableCollection(collection, 'HAR document');
  return collection;
}

function exportHarCollection(collection) {
  const entries = [];
  for (const { request } of flattenCollectionRequests(collection)) {
    const url = buildUrlWithQuery(request);
    const headers = (request.headers || [])
      .filter((header) => header.enabled !== false && header.key)
      .map((header) => ({ name: header.key, value: header.value ?? '' }));
    const queryString = (request.queryParams || [])
      .filter((query) => query.enabled !== false && query.key)
      .map((query) => ({ name: query.key, value: query.value ?? '' }));
    entries.push({
      startedDateTime: new Date(0).toISOString(),
      time: 0,
      request: {
        method: request.method || 'GET',
        url,
        httpVersion: 'HTTP/1.1',
        headers,
        queryString,
        cookies: [],
        headersSize: -1,
        bodySize: request.body ? Buffer.byteLength(request.body, 'utf8') : 0,
        postData: request.body ? {
          mimeType: contentTypeForRequest(request),
          text: request.body
        } : undefined,
        comment: request.name || ''
      },
      response: {
        status: 0,
        statusText: '',
        httpVersion: 'HTTP/1.1',
        headers: [],
        cookies: [],
        content: { size: 0, mimeType: 'text/plain', text: '' },
        redirectURL: '',
        headersSize: -1,
        bodySize: 0
      },
      cache: {},
      timings: { send: 0, wait: 0, receive: 0 }
    });
  }
  return {
    log: {
      version: '1.2',
      creator: { name: 'PostMeter', version: '0.2.0' },
      entries
    }
  };
}

function importCurlCommand(text) {
  const tokens = splitCommandLine(text);
  if (tokens[0] !== 'curl') {
    throw new Error('File is not a supported curl command.');
  }
  const request = requestModel({ name: 'Imported curl Request', method: 'GET', url: '' });
  for (let index = 1; index < tokens.length; index++) {
    const token = tokens[index];
    if (token === '-X' || token === '--request') {
      request.method = String(tokens[++index] || 'GET').toUpperCase();
    } else if (token.startsWith('-X') && token.length > 2) {
      request.method = token.slice(2).toUpperCase();
    } else if (token === '-H' || token === '--header') {
      addCurlHeader(request, tokens[++index] || '');
    } else if (token === '-b' || token === '--cookie' || token.startsWith('--cookie=')) {
      const value = token.includes('=') && token.startsWith('--cookie=') ? token.slice('--cookie='.length) : tokens[++index] || '';
      request.headers.push(keyValue('Cookie', value));
    } else if (token === '-F' || token === '--form' || token === '--form-string') {
      appendCurlForm(request, tokens[++index] || '');
    } else if (token === '-d' || token === '--data' || token === '--data-raw' || token === '--data-binary' || token === '--data-urlencode') {
      request.body = tokens[++index] || '';
      request.bodyType = looksLikeJson(request.body) ? BODY_TYPES.RAW_JSON : BODY_TYPES.RAW_TEXT;
      if (request.method === 'GET') {
        request.method = 'POST';
      }
    } else if (token === '--proxy' || token === '--retry' || token === '--cacert' || token === '--cert' || token === '--key') {
      const value = tokens[++index] || '';
      request.variables.push(keyValue(`curl.${token.replace(/^--/, '')}`, value));
    } else if (token === '-k' || token === '--insecure') {
      request.variables.push(keyValue('curl.insecure', 'true'));
    } else if (token === '--url') {
      request.url = tokens[++index] || '';
    } else if (!token.startsWith('-') && !request.url) {
      request.url = token;
    }
  }
  if (!request.url) {
    throw new Error('curl command does not include a URL.');
  }
  const parsed = parseRequestUrl(request.url);
  if (parsed) {
    request.url = stripQueryFromUrl(request.url);
    for (const [key, value] of parsed.searchParams.entries()) {
      request.queryParams.push(keyValue(key, value));
    }
  }
  return collectionModel({ name: 'Imported curl Collection', requests: [request], folders: [] });
}

function appendCurlForm(request, value) {
  const next = String(value || '');
  request.body = request.body ? `${request.body}\n${next}` : next;
  request.bodyType = BODY_TYPES.RAW_TEXT;
  if (request.method === 'GET') {
    request.method = 'POST';
  }
  if (!(request.headers || []).some((header) => header.key?.toLowerCase() === 'content-type')) {
    request.headers.push(keyValue('Content-Type', 'multipart/form-data'));
  }
}

function exportCurlCollection(collection) {
  return flattenCollectionRequests(collection)
    .map(({ request }) => requestToCurl(request))
    .join('\n\n');
}

function importJMeterPlan(text) {
  if (!/<jmeterTestPlan[\s>]/.test(text) && !/<HTTPSamplerProxy[\s>]/.test(text)) {
    throw new Error('File is not a supported JMeter test plan.');
  }
  const collection = collectionModel({ name: 'Imported JMeter Plan', requests: [], folders: [] });
  importJMeterVariables(text, collection);
  importJMeterCsvDataSets(text, collection);
  importJMeterThreadMetadata(text, collection);
  importJMeterTimerMetadata(text, collection);
  importJMeterControllerMetadata(text, collection);
  importJMeterListenerMetadata(text, collection);
  importUnsupportedJMeterMetadata(text, collection);
  const samplerMatches = [...text.matchAll(/<HTTPSamplerProxy\b([\s\S]*?)<\/HTTPSamplerProxy>/g)];
  for (let index = 0; index < samplerMatches.length; index++) {
    const match = samplerMatches[index];
    const block = match[0];
    const attrs = match[1] || '';
    const name = xmlAttribute(attrs, 'testname') || 'Imported JMeter Request';
    const protocol = xmlStringProp(block, 'HTTPSampler.protocol') || 'https';
    const domain = xmlStringProp(block, 'HTTPSampler.domain');
    const pathName = xmlStringProp(block, 'HTTPSampler.path') || '/';
    const method = xmlStringProp(block, 'HTTPSampler.method') || 'GET';
    if (!domain) {
      continue;
    }
    const request = requestModel({
      name,
      method,
      url: `${protocol}://${domain}${pathName.startsWith('/') ? pathName : `/${pathName}`}`
    });
    for (const arg of xmlHttpArguments(block)) {
      request.queryParams.push(keyValue(arg.name, arg.value));
    }
    const nextSamplerIndex = samplerMatches[index + 1]?.index ?? text.length;
    const samplerHashTree = text.slice(match.index + block.length, nextSamplerIndex);
    request.headers.push(...jmeterHeaderManagerHeaders(samplerHashTree));
    request.assertions.push(...jmeterResponseAssertions(samplerHashTree));
    request.assertions.push(...jmeterDurationAssertions(samplerHashTree));
    request.assertions.push(...jmeterSizeAssertions(samplerHashTree));
    request.assertions.push(...jmeterJsonPathAssertions(samplerHashTree));
    request.assertions.push(...jmeterXmlPathAssertions(samplerHashTree));
    request.assertions.push(...jmeterJsonExtractors(samplerHashTree));
    request.assertions.push(...jmeterRegexExtractors(samplerHashTree));
    collection.requests.push(request);
  }
  assertImportableCollection(collection, 'JMeter test plan');
  return collection;
}

function importJMeterVariables(text, collection) {
  const variableBlockPattern = /<Arguments\b[^>]*testname="User Defined Variables"[\s\S]*?<\/Arguments>/g;
  for (const match of text.matchAll(variableBlockPattern)) {
    for (const arg of xmlHttpArguments(match[0])) {
      collection.variables.push(keyValue(arg.name, arg.value));
    }
  }
}

function importJMeterCsvDataSets(text, collection) {
  const pattern = /<CSVDataSet\b([^>]*)>([\s\S]*?)<\/CSVDataSet>/g;
  for (const match of text.matchAll(pattern)) {
    const name = xmlAttribute(match[1] || '', 'testname') || `CSV ${collection.variables.length + 1}`;
    const filename = xmlStringProp(match[2], 'filename');
    const variableNames = xmlStringProp(match[2], 'variableNames');
    if (filename) {
      collection.variables.push(keyValue(`jmeter.csv.${name}.filename`, filename));
    }
    if (variableNames) {
      collection.variables.push(keyValue(`jmeter.csv.${name}.variables`, variableNames));
    }
  }
}

function importJMeterThreadMetadata(text, collection) {
  const threads = xmlStringProp(text, 'ThreadGroup.num_threads');
  const ramp = xmlStringProp(text, 'ThreadGroup.ramp_time');
  if (threads) {
    collection.variables.push(keyValue('jmeter.threadGroup.threads', threads));
  }
  if (ramp) {
    collection.variables.push(keyValue('jmeter.threadGroup.rampSeconds', ramp));
  }
}

function importJMeterTimerMetadata(text, collection) {
  const pattern = /<([A-Za-z]+Timer)\b([^>]*)>([\s\S]*?)<\/\1>/g;
  let importedLegacyConstantDelay = false;
  for (const match of text.matchAll(pattern)) {
    const timerClass = match[1];
    const name = xmlAttribute(match[2] || '', 'testname') || timerClass;
    collection.variables.push(keyValue(`jmeter.timer.${name}.class`, timerClass));
    if (timerClass === 'ConstantTimer') {
      const delay = xmlStringProp(match[3], 'ConstantTimer.delay');
      if (delay) {
        collection.variables.push(keyValue(`jmeter.timer.${name}.constantDelayMillis`, delay));
        if (!importedLegacyConstantDelay) {
          collection.variables.push(keyValue('jmeter.timer.constantDelayMillis', delay));
          importedLegacyConstantDelay = true;
        }
      }
    } else {
      for (const prop of xmlStringProps(match[3])) {
        collection.variables.push(keyValue(`jmeter.timer.${name}.${prop.name}`, prop.value));
      }
    }
  }
}

function importJMeterControllerMetadata(text, collection) {
  const pattern = /<(LoopController|IfController|WhileController|ForeachController|OnceOnlyController|GenericController|TransactionController|ThroughputController|RuntimeController)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/g;
  for (const match of text.matchAll(pattern)) {
    const controllerClass = match[1];
    const name = xmlAttribute(match[2] || '', 'testname') || controllerClass;
    collection.variables.push(keyValue(`jmeter.controller.${name}.class`, controllerClass));
    for (const prop of xmlStringProps(match[3] || '')) {
      const propName = prop.name.startsWith(`${controllerClass}.`)
        ? prop.name.slice(controllerClass.length + 1)
        : prop.name;
      collection.variables.push(keyValue(`jmeter.controller.${name}.${propName}`, prop.value));
    }
  }
}

function importJMeterListenerMetadata(text, collection) {
  const pattern = /<ResultCollector\b([^>]*?)(?:\/>|>([\s\S]*?)<\/ResultCollector>)/g;
  for (const match of text.matchAll(pattern)) {
    const name = xmlAttribute(match[1] || '', 'testname') || `Listener ${collection.variables.length + 1}`;
    collection.variables.push(keyValue(`jmeter.listener.${name}.class`, 'ResultCollector'));
    const filename = xmlStringProp(match[2] || '', 'filename');
    if (filename) {
      collection.variables.push(keyValue(`jmeter.listener.${name}.filename`, filename));
    }
  }
}

function importUnsupportedJMeterMetadata(text, collection) {
  const unsupportedElements = [
    'BeanShellAssertion',
    'BeanShellPostProcessor',
    'BeanShellPreProcessor',
    'BoundaryExtractor',
    'DebugSampler',
    'HTMLAssertion',
    'JSR223Assertion',
    'JSR223PostProcessor',
    'JSR223PreProcessor',
    'JSR223Sampler',
    'XMLAssertion'
  ];
  for (const elementName of unsupportedElements) {
    const pattern = new RegExp(`<${elementName}\\b([^>]*?)(?:\\/>|>([\\s\\S]*?)<\\/${elementName}>)`, 'g');
    for (const match of text.matchAll(pattern)) {
      const attrs = match[1] || '';
      const block = match[2] || '';
      const name = xmlAttribute(attrs, 'testname') || elementName;
      const prefix = `jmeter.unsupported.${name}`;
      collection.variables.push(keyValue(`${prefix}.class`, elementName));
      for (const prop of xmlStringProps(block).slice(0, 25)) {
        if (prop.name) {
          collection.variables.push(keyValue(`${prefix}.${prop.name}`, prop.value));
        }
      }
    }
  }
}

function jmeterHeaderManagerHeaders(text) {
  const headers = [];
  const pattern = /<HeaderManager\b[^>]*>([\s\S]*?)<\/HeaderManager>/g;
  for (const match of text.matchAll(pattern)) {
    const headerPattern = /<elementProp\b[^>]*elementType="Header"[^>]*>([\s\S]*?)<\/elementProp>/g;
    for (const header of match[1].matchAll(headerPattern)) {
      const name = xmlStringProp(header[1], 'Header.name');
      if (name) {
        headers.push(keyValue(name, xmlStringProp(header[1], 'Header.value')));
      }
    }
  }
  return headers;
}

function jmeterResponseAssertions(text) {
  const assertions = [];
  const pattern = /<ResponseAssertion\b[^>]*testname="([^"]*)"[^>]*>([\s\S]*?)<\/ResponseAssertion>/g;
  for (const match of text.matchAll(pattern)) {
    const name = xmlUnescape(match[1] || 'JMeter Response Assertion');
    const block = match[2] || '';
    const field = xmlStringProp(block, 'Assertion.test_field');
    const patternValue = firstAssertionPattern(block);
    if (!patternValue) {
      continue;
    }
    if (field === 'Assertion.response_code') {
      assertions.push({
        enabled: true,
        type: 'statusCode',
        name,
        path: '',
        operator: 'equals',
        expected: patternValue,
        variableName: ''
      });
    } else if (field === 'Assertion.response_data' || field === 'Assertion.response_message') {
      assertions.push({
        enabled: true,
        type: 'bodyContains',
        name,
        path: '',
        operator: 'contains',
        expected: patternValue,
        variableName: ''
      });
    }
  }
  return assertions;
}

function jmeterDurationAssertions(text) {
  const assertions = [];
  const pattern = /<DurationAssertion\b[^>]*testname="([^"]*)"[^>]*>([\s\S]*?)<\/DurationAssertion>/g;
  for (const match of text.matchAll(pattern)) {
    const expected = xmlStringProp(match[2] || '', 'DurationAssertion.duration');
    if (!expected) {
      continue;
    }
    assertions.push({
      enabled: true,
      type: 'responseTime',
      name: xmlUnescape(match[1] || 'JMeter Duration Assertion'),
      path: '',
      operator: 'lessThan',
      expected,
      variableName: ''
    });
  }
  return assertions;
}

function jmeterSizeAssertions(text) {
  const assertions = [];
  const pattern = /<SizeAssertion\b[^>]*testname="([^"]*)"[^>]*>([\s\S]*?)<\/SizeAssertion>/g;
  for (const match of text.matchAll(pattern)) {
    const block = match[2] || '';
    const expected = xmlStringProp(block, 'SizeAssertion.size');
    if (!expected) {
      continue;
    }
    assertions.push({
      enabled: true,
      type: 'responseSize',
      name: xmlUnescape(match[1] || 'JMeter Size Assertion'),
      path: '',
      operator: jmeterSizeOperatorToPostMeter(xmlStringProp(block, 'SizeAssertion.operator')),
      expected,
      variableName: ''
    });
  }
  return assertions;
}

function jmeterJsonPathAssertions(text) {
  const assertions = [];
  const pattern = /<JSONPathAssertion\b[^>]*testname="([^"]*)"[^>]*>([\s\S]*?)<\/JSONPathAssertion>/g;
  for (const match of text.matchAll(pattern)) {
    const block = match[2] || '';
    const path = xmlStringProp(block, 'JSON_PATH');
    if (!path) {
      continue;
    }
    const expected = xmlStringProp(block, 'EXPECTED_VALUE');
    assertions.push({
      enabled: true,
      type: 'jsonPath',
      name: xmlUnescape(match[1] || 'JMeter JSONPath Assertion'),
      path,
      operator: expected ? 'equals' : 'exists',
      expected,
      variableName: ''
    });
  }
  return assertions;
}

function jmeterXmlPathAssertions(text) {
  const assertions = [];
  const pattern = /<(XPathAssertion|XPath2Assertion)\b([^>]*)>([\s\S]*?)<\/\1>/g;
  for (const match of text.matchAll(pattern)) {
    const attrs = match[2] || '';
    const block = match[3] || '';
    const path = xmlStringProp(block, 'XPath.xpath')
      || xmlStringProp(block, 'XPath2.xpath')
      || xmlStringProp(block, 'xpath');
    if (!path) {
      continue;
    }
    assertions.push({
      enabled: xmlAttribute(attrs, 'enabled') !== 'false',
      type: 'xmlPath',
      name: xmlUnescape(xmlAttribute(attrs, 'testname') || 'JMeter XPath Assertion'),
      path,
      operator: 'exists',
      expected: '',
      variableName: ''
    });
  }
  return assertions;
}

function jmeterJsonExtractors(text) {
  const assertions = [];
  const pattern = /<JSONPostProcessor\b[^>]*testname="([^"]*)"[^>]*>([\s\S]*?)<\/JSONPostProcessor>/g;
  for (const match of text.matchAll(pattern)) {
    const name = xmlUnescape(match[1] || 'JMeter JSON Extractor');
    const block = match[2] || '';
    const names = splitJMeterList(xmlStringProp(block, 'JSONPostProcessor.referenceNames'));
    const paths = splitJMeterList(xmlStringProp(block, 'JSONPostProcessor.jsonPathExprs'));
    for (let index = 0; index < Math.min(names.length, paths.length); index++) {
      if (!names[index] || !paths[index]) {
        continue;
      }
      assertions.push({
        enabled: true,
        type: 'extractVariable',
        name: names[index],
        path: paths[index],
        operator: 'exists',
        expected: '',
        variableName: names[index],
        source: name
      });
    }
  }
  return assertions;
}

function jmeterRegexExtractors(text) {
  const assertions = [];
  const pattern = /<RegexExtractor\b[^>]*testname="([^"]*)"[^>]*>([\s\S]*?)<\/RegexExtractor>/g;
  for (const match of text.matchAll(pattern)) {
    const block = match[2] || '';
    const variableName = xmlStringProp(block, 'RegexExtractor.refname');
    const regex = xmlStringProp(block, 'RegexExtractor.regex');
    if (!variableName || !regex) {
      continue;
    }
    assertions.push({
      enabled: true,
      type: 'extractRegex',
      name: xmlUnescape(match[1] || variableName),
      path: '',
      operator: 'exists',
      expected: regex,
      variableName
    });
  }
  return assertions;
}

function firstAssertionPattern(block) {
  const match = /<collectionProp\s+name="Asserion\.test_strings">([\s\S]*?)<\/collectionProp>/.exec(block)
    || /<collectionProp\s+name="Assertion\.test_strings">([\s\S]*?)<\/collectionProp>/.exec(block);
  if (!match) {
    return '';
  }
  const value = /<stringProp\b[^>]*>([\s\S]*?)<\/stringProp>/.exec(match[1]);
  return value ? xmlUnescape(value[1]) : '';
}

function exportJMeterPlan(collection) {
  const samplers = flattenCollectionRequests(collection)
    .map(({ request }) => requestToJMeterSampler(request))
    .join('\n');
  const variables = collectionVariablesToJMeter(collection);
  const metadata = jmeterMetadataToJMeter(collection);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<jmeterTestPlan version="1.2" properties="5.0" jmeter="5.6.3">\n  <hashTree>\n    <TestPlan guiclass="TestPlanGui" testclass="TestPlan" testname="${xmlEscape(collection.name || 'PostMeter Collection')}" enabled="true"/>\n    <hashTree>\n${variables}${metadata}${samplers}\n    </hashTree>\n  </hashTree>\n</jmeterTestPlan>\n`;
}

function looksLikeOpenApiDocument(document) {
  return Boolean(document && typeof document === 'object' && (document.openapi || document.swagger) && document.paths);
}

function looksLikeHarDocument(document) {
  return Boolean(document?.log && document.log.version && Array.isArray(document.log.entries));
}

function openApiBaseUrl(document) {
  if (Array.isArray(document.servers) && document.servers[0]?.url) {
    return stripTrailingSlash(document.servers[0].url);
  }
  if (document.swagger === '2.0' && document.host) {
    const scheme = Array.isArray(document.schemes) && document.schemes[0] ? document.schemes[0] : 'https';
    return stripTrailingSlash(`${scheme}://${document.host}${document.basePath || ''}`);
  }
  return '{{baseUrl}}';
}

function importOpenApiParameters(parameters, request) {
  if (!Array.isArray(parameters)) {
    return;
  }
  for (const parameter of parameters) {
    if (!parameter?.name) {
      continue;
    }
    if (parameter.in === 'query') {
      request.queryParams.push(keyValue(parameter.name, parameter.example ?? ''));
    } else if (parameter.in === 'header') {
      request.headers.push(keyValue(parameter.name, parameter.example ?? ''));
    }
  }
}

function importOpenApiBody(requestBody, request) {
  const content = requestBody?.content;
  if (!content || typeof content !== 'object') {
    return;
  }
  const contentType = Object.keys(content)[0];
  if (!contentType) {
    return;
  }
  const mediaType = content[contentType] || {};
  const example = mediaType.example ?? firstExample(mediaType.examples);
  request.headers.push(keyValue('Content-Type', contentType));
  request.bodyType = isJsonMime(contentType) ? BODY_TYPES.RAW_JSON : BODY_TYPES.RAW_TEXT;
  request.body = example == null ? '' : typeof example === 'string' ? example : JSON.stringify(example, null, 2);
}

function importOpenApiResponses(responses, request) {
  if (!responses || typeof responses !== 'object') {
    return;
  }
  for (const [status, response] of Object.entries(responses)) {
    const statusCode = parseOpenApiStatus(status);
    if (statusCode) {
      request.assertions.push({
        enabled: false,
        type: 'statusCode',
        name: `OpenAPI ${statusCode}`,
        path: '',
        operator: 'equals',
        expected: String(statusCode),
        variableName: ''
      });
    }
    const responseHeaders = openApiResponseHeaders(response?.headers);
    for (const header of responseHeaders) {
      request.assertions.push({
        enabled: false,
        type: 'header',
        name: header.key,
        path: '',
        operator: header.value ? 'contains' : 'exists',
        expected: header.value,
        variableName: ''
      });
    }
    request.examples.push(...openApiResponseExamples(status, response, responseHeaders));
  }
}

function parseOpenApiStatus(status) {
  const value = String(status || '').trim();
  return /^\d{3}$/.test(value) ? Number(value) : 0;
}

function openApiResponseHeaders(headers) {
  if (!headers || typeof headers !== 'object') {
    return [];
  }
  return Object.entries(headers)
    .filter(([name]) => name)
    .map(([name, header]) => keyValue(name, openApiHeaderExample(header)));
}

function openApiHeaderExample(header) {
  const value = header?.example ?? firstExample(header?.examples) ?? header?.schema?.example ?? header?.schema?.default ?? '';
  return value == null ? '' : String(value);
}

function openApiResponseExamples(status, response, headers) {
  const content = response?.content;
  if (!content || typeof content !== 'object') {
    return [];
  }
  const statusCode = parseOpenApiStatus(status);
  const examples = [];
  for (const [contentType, mediaType] of Object.entries(content)) {
    for (const example of openApiMediaExamples(mediaType)) {
      examples.push({
        name: openApiExampleName(status, contentType, example.name),
        statusCode,
        headers,
        bodyType: isJsonMime(contentType) ? BODY_TYPES.RAW_JSON : BODY_TYPES.RAW_TEXT,
        body: serializeOpenApiExample(example.value)
      });
    }
  }
  return examples;
}

function openApiMediaExamples(mediaType) {
  if (!mediaType || typeof mediaType !== 'object') {
    return [];
  }
  if (mediaType.example !== undefined) {
    return [{ name: '', value: mediaType.example }];
  }
  const examples = mediaType.examples;
  if (!examples || typeof examples !== 'object') {
    return [];
  }
  return Object.entries(examples)
    .map(([name, example]) => ({ name: example?.summary || name, value: example?.value }))
    .filter((example) => example.value !== undefined);
}

function openApiExampleName(status, contentType, name) {
  return [status, contentType, name].map((part) => String(part || '').trim()).filter(Boolean).join(' ');
}

function serializeOpenApiExample(value) {
  if (value == null) {
    return '';
  }
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

function firstExample(examples) {
  if (!examples || typeof examples !== 'object') {
    return null;
  }
  const first = Object.values(examples)[0];
  return first?.value ?? null;
}

function openApiPathToPostMeter(pathName) {
  return String(pathName || '').replace(/\{([^}]+)\}/g, '{{$1}}');
}

function openApiPathFromRawUrl(value) {
  const text = String(value || '').trim();
  if (!text) {
    return '/';
  }
  const withoutBase = text.replace(/^https?:\/\/[^/]+/i, '');
  const pathName = withoutBase.split('?')[0] || '/';
  return pathName.startsWith('/') ? pathName : `/${pathName}`;
}

function postMeterPathToOpenApiPath(pathName) {
  return String(pathName || '/').replace(/\{\{([^}]+)\}\}/g, '{$1}');
}

function openApiParameter(location, name, value) {
  return {
    name,
    in: location,
    required: false,
    schema: { type: 'string' },
    example: value ?? ''
  };
}

function openApiSecurityForRequest(auth, securitySchemes) {
  const normalized = normalizeAuth(auth);
  if (normalized.type === 'none') {
    return null;
  }
  let scheme;
  let preferredName;
  if (normalized.type === 'bearer') {
    preferredName = 'bearerAuth';
    scheme = { type: 'http', scheme: 'bearer' };
  } else if (normalized.type === 'basic') {
    preferredName = 'basicAuth';
    scheme = { type: 'http', scheme: 'basic' };
  } else if (normalized.type === 'apiKey') {
    const keyName = normalized.key || 'X-API-Key';
    preferredName = `apiKey_${keyName}`;
    scheme = {
      type: 'apiKey',
      in: normalized.location === 'query' ? 'query' : 'header',
      name: keyName
    };
  } else if (normalized.type === 'cookie') {
    const cookieName = firstCookieName(normalized.value) || 'session';
    preferredName = `cookie_${cookieName}`;
    scheme = {
      type: 'apiKey',
      in: 'cookie',
      name: cookieName
    };
  } else if (normalized.type === 'oauth2') {
    preferredName = 'oauth2Auth';
    scheme = openApiOAuth2Scheme(normalized);
  } else if (normalized.type === 'clientCertificate') {
    preferredName = 'mutualTlsAuth';
    scheme = { type: 'mutualTLS' };
  }
  if (!scheme) {
    return null;
  }
  const name = addOpenApiSecurityScheme(securitySchemes, preferredName, scheme);
  return { [name]: [] };
}

function openApiOAuth2Scheme(auth) {
  const scopes = openApiScopes(auth.scopes);
  if (auth.grantType === 'clientCredentials') {
    return {
      type: 'oauth2',
      flows: {
        clientCredentials: {
          tokenUrl: auth.tokenUrl || '{{tokenUrl}}',
          scopes
        }
      }
    };
  }
  const flow = {
    authorizationUrl: auth.authorizationUrl || auth.deviceAuthorizationUrl || '{{authorizationUrl}}',
    tokenUrl: auth.tokenUrl || '{{tokenUrl}}',
    scopes
  };
  const scheme = {
    type: 'oauth2',
    flows: {
      authorizationCode: flow
    }
  };
  if (auth.grantType === 'deviceCode') {
    scheme['x-postmeter-grantType'] = 'deviceCode';
    if (auth.deviceAuthorizationUrl) {
      scheme['x-postmeter-deviceAuthorizationUrl'] = auth.deviceAuthorizationUrl;
    }
  }
  return scheme;
}

function openApiScopes(value) {
  const scopes = {};
  for (const scope of String(value || '').split(/\s+/).map((item) => item.trim()).filter(Boolean)) {
    scopes[scope] = '';
  }
  return scopes;
}

function firstCookieName(value) {
  const pair = String(value || '').split(';').map((part) => part.trim()).find(Boolean);
  const separator = pair ? pair.indexOf('=') : -1;
  return separator > 0 ? pair.slice(0, separator).trim() : '';
}

function addOpenApiSecurityScheme(securitySchemes, preferredName, scheme) {
  const baseName = openApiSecuritySchemeName(preferredName);
  let name = baseName;
  let suffix = 2;
  while (securitySchemes[name] && JSON.stringify(securitySchemes[name]) !== JSON.stringify(scheme)) {
    name = `${baseName}${suffix++}`;
  }
  securitySchemes[name] = scheme;
  return name;
}

function openApiSecuritySchemeName(value) {
  const cleaned = String(value || 'auth')
    .replace(/[^A-Za-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || 'auth';
}

function operationId(name) {
  const cleaned = String(name || 'request').replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  return cleaned || 'request';
}

function flattenCollectionRequests(collection) {
  const entries = [];
  walkRequests(collection, (request, _collection, folder) => {
    entries.push({ request, folder });
  });
  return entries;
}

function addCurlHeader(request, value) {
  const separator = String(value).indexOf(':');
  if (separator <= 0) {
    return;
  }
  request.headers.push(keyValue(value.slice(0, separator).trim(), value.slice(separator + 1).trim()));
}

function requestToCurl(request) {
  const parts = ['curl', shellQuote(buildUrlWithQuery(request))];
  if (request.method && request.method !== 'GET') {
    parts.push('-X', shellQuote(request.method));
  }
  for (const header of request.headers || []) {
    if (header.enabled === false || !header.key) {
      continue;
    }
    parts.push('-H', shellQuote(`${header.key}: ${header.value ?? ''}`));
  }
  if (request.bodyType !== BODY_TYPES.NONE && request.body) {
    parts.push('--data-raw', shellQuote(request.body));
  }
  return parts.join(' ');
}

function requestToJMeterSampler(request) {
  const parsed = parseRequestUrl(request.url);
  const protocol = parsed?.protocol.replace(':', '') || 'https';
  const domain = parsed?.hostname || request.url.replace(/^https?:\/\//i, '').split('/')[0] || '{{host}}';
  const pathName = parsed ? `${parsed.pathname}${parsed.search}` : '/';
  const args = (request.queryParams || [])
    .filter((pair) => pair.enabled !== false && pair.key)
    .map((pair) => `            <elementProp name="${xmlEscape(pair.key)}" elementType="HTTPArgument">\n              <stringProp name="Argument.name">${xmlEscape(pair.key)}</stringProp>\n              <stringProp name="Argument.value">${xmlEscape(pair.value ?? '')}</stringProp>\n            </elementProp>`)
    .join('\n');
  const assertions = requestAssertionsToJMeter(request);
  const headers = requestHeadersToJMeter(request);
  return `      <HTTPSamplerProxy guiclass="HttpTestSampleGui" testclass="HTTPSamplerProxy" testname="${xmlEscape(request.name || 'Request')}" enabled="true">\n        <stringProp name="HTTPSampler.domain">${xmlEscape(domain)}</stringProp>\n        <stringProp name="HTTPSampler.protocol">${xmlEscape(protocol)}</stringProp>\n        <stringProp name="HTTPSampler.path">${xmlEscape(pathName)}</stringProp>\n        <stringProp name="HTTPSampler.method">${xmlEscape(request.method || 'GET')}</stringProp>\n        <elementProp name="HTTPsampler.Arguments" elementType="Arguments">\n          <collectionProp name="Arguments.arguments">\n${args}\n          </collectionProp>\n        </elementProp>\n      </HTTPSamplerProxy>\n      <hashTree>\n${headers}${assertions}      </hashTree>`;
}

function collectionVariablesToJMeter(collection) {
  const variables = (collection.variables || [])
    .filter((pair) => pair.enabled !== false && pair.key && !pair.key.startsWith('jmeter.csv.') && !pair.key.startsWith('jmeter.threadGroup.') && !pair.key.startsWith('jmeter.timer.') && !pair.key.startsWith('jmeter.controller.') && !pair.key.startsWith('jmeter.listener.') && !pair.key.startsWith('jmeter.unsupported.'))
    .map((pair) => `            <elementProp name="${xmlEscape(pair.key)}" elementType="HTTPArgument">\n              <stringProp name="Argument.name">${xmlEscape(pair.key)}</stringProp>\n              <stringProp name="Argument.value">${xmlEscape(pair.value ?? '')}</stringProp>\n            </elementProp>`)
    .join('\n');
  if (!variables) {
    return '';
  }
  return `      <Arguments guiclass="ArgumentsPanel" testclass="Arguments" testname="User Defined Variables" enabled="true">\n        <collectionProp name="Arguments.arguments">\n${variables}\n        </collectionProp>\n      </Arguments>\n      <hashTree/>\n`;
}

function jmeterMetadataToJMeter(collection) {
  const pairs = (collection.variables || []).filter((pair) => pair.enabled !== false && pair.key);
  return `${jmeterTimersToJMeter(pairs)}${jmeterControllersToJMeter(pairs)}${unsupportedJMeterMetadataToJMeter(pairs)}`;
}

function jmeterTimersToJMeter(pairs) {
  const groups = groupedJMeterMetadata(pairs, 'jmeter.timer.');
  return Object.entries(groups).map(([name, props]) => {
    const timerClass = props.class;
    if (!timerClass || !/^[A-Za-z]+Timer$/.test(timerClass)) {
      return '';
    }
    const guiClass = timerClass === 'ConstantTimer' ? 'ConstantTimerGui' : 'TestBeanGUI';
    const body = Object.entries(props)
      .filter(([prop]) => prop !== 'class')
      .map(([prop, value]) => {
        const propName = timerClass === 'ConstantTimer' && prop === 'constantDelayMillis'
          ? 'ConstantTimer.delay'
          : prop;
        return `        <stringProp name="${xmlEscape(propName)}">${xmlEscape(value)}</stringProp>`;
      })
      .join('\n');
    return `      <${timerClass} guiclass="${guiClass}" testclass="${timerClass}" testname="${xmlEscape(name)}" enabled="true">\n${body}\n      </${timerClass}>\n      <hashTree/>\n`;
  }).join('');
}

function jmeterControllersToJMeter(pairs) {
  const groups = groupedJMeterMetadata(pairs, 'jmeter.controller.');
  return Object.entries(groups).map(([name, props]) => {
    const controllerClass = props.class;
    if (!controllerClass || !/^[A-Za-z]+Controller$/.test(controllerClass)) {
      return '';
    }
    const body = Object.entries(props)
      .filter(([prop]) => prop !== 'class')
      .map(([prop, value]) => `        <stringProp name="${xmlEscape(prop)}">${xmlEscape(value)}</stringProp>`)
      .join('\n');
    return `      <${controllerClass} guiclass="${controllerClass}Gui" testclass="${controllerClass}" testname="${xmlEscape(name)}" enabled="true">\n${body}\n      </${controllerClass}>\n      <hashTree/>\n`;
  }).join('');
}

function unsupportedJMeterMetadataToJMeter(pairs) {
  const groups = groupedJMeterMetadata(pairs, 'jmeter.unsupported.');
  return Object.entries(groups).map(([name, props]) => {
    const elementClass = props.class;
    if (!elementClass || !/^[A-Za-z0-9]+$/.test(elementClass)) {
      return '';
    }
    const body = Object.entries(props)
      .filter(([prop]) => prop !== 'class')
      .map(([prop, value]) => `        <stringProp name="${xmlEscape(prop)}">${xmlEscape(value)}</stringProp>`)
      .join('\n');
    return `      <${elementClass} guiclass="TestBeanGUI" testclass="${xmlEscape(elementClass)}" testname="${xmlEscape(name)}" enabled="false">\n${body}\n      </${elementClass}>\n      <hashTree/>\n`;
  }).join('');
}

function groupedJMeterMetadata(pairs, prefix) {
  const groups = {};
  for (const pair of pairs) {
    if (!String(pair.key).startsWith(prefix)) {
      continue;
    }
    const rest = String(pair.key).slice(prefix.length);
    const separator = rest.lastIndexOf('.');
    if (separator <= 0) {
      continue;
    }
    const name = rest.slice(0, separator);
    const prop = rest.slice(separator + 1);
    groups[name] ||= {};
    groups[name][prop] = pair.value ?? '';
  }
  return groups;
}

function requestAssertionsToJMeter(request) {
  return (request.assertions || [])
    .filter((assertion) => assertion.enabled !== false)
    .map((assertion) => {
      if (assertion.type === 'statusCode' && assertion.operator === 'equals' && assertion.expected) {
        return responseAssertionToJMeter(assertion.name || 'Status Code', 'Assertion.response_code', assertion.expected);
      }
      if (assertion.type === 'bodyContains' && assertion.expected) {
        return responseAssertionToJMeter(assertion.name || 'Body Contains', 'Assertion.response_data', assertion.expected);
      }
      if (assertion.type === 'responseTime' && assertion.operator === 'lessThan' && assertion.expected) {
        return durationAssertionToJMeter(assertion.name || 'Response Time', assertion.expected);
      }
      if (assertion.type === 'responseSize' && assertion.expected) {
        return sizeAssertionToJMeter(assertion.name || 'Response Size', assertion.expected, assertion.operator);
      }
      if (assertion.type === 'jsonPath' && assertion.path) {
        return jsonPathAssertionToJMeter(assertion.name || 'JSON Path', assertion.path, assertion.operator === 'exists' ? '' : assertion.expected);
      }
      if (assertion.type === 'xmlPath' && assertion.path && assertion.operator === 'exists') {
        return xPathAssertionToJMeter(assertion.name || 'XML XPath', assertion.path);
      }
      if (assertion.type === 'extractVariable' && assertion.path && (assertion.variableName || assertion.name)) {
        return jsonExtractorToJMeter(assertion.name || assertion.variableName || 'JSON Extractor', assertion.variableName || assertion.name, assertion.path);
      }
      if (assertion.type === 'extractRegex' && assertion.expected && (assertion.variableName || assertion.name)) {
        return regexExtractorToJMeter(assertion.name || assertion.variableName || 'Regex Extractor', assertion.variableName || assertion.name, assertion.expected);
      }
      return '';
    })
    .filter(Boolean)
    .join('');
}

function requestHeadersToJMeter(request) {
  const headers = (request.headers || [])
    .filter((header) => header.enabled !== false && header.key)
    .map((header) => `            <elementProp name="${xmlEscape(header.key)}" elementType="Header">\n              <stringProp name="Header.name">${xmlEscape(header.key)}</stringProp>\n              <stringProp name="Header.value">${xmlEscape(header.value ?? '')}</stringProp>\n            </elementProp>`)
    .join('\n');
  if (!headers) {
    return '';
  }
  return `        <HeaderManager guiclass="HeaderPanel" testclass="HeaderManager" testname="HTTP Header Manager" enabled="true">\n          <collectionProp name="HeaderManager.headers">\n${headers}\n          </collectionProp>\n        </HeaderManager>\n        <hashTree/>\n`;
}

function responseAssertionToJMeter(name, field, expected) {
  return `        <ResponseAssertion guiclass="AssertionGui" testclass="ResponseAssertion" testname="${xmlEscape(name)}" enabled="true">\n          <collectionProp name="Asserion.test_strings">\n            <stringProp name="${xmlEscape(expected)}">${xmlEscape(expected)}</stringProp>\n          </collectionProp>\n          <stringProp name="Assertion.test_field">${xmlEscape(field)}</stringProp>\n          <boolProp name="Assertion.assume_success">false</boolProp>\n          <intProp name="Assertion.test_type">2</intProp>\n        </ResponseAssertion>\n        <hashTree/>\n`;
}

function durationAssertionToJMeter(name, expected) {
  return `        <DurationAssertion guiclass="DurationAssertionGui" testclass="DurationAssertion" testname="${xmlEscape(name)}" enabled="true">\n          <stringProp name="DurationAssertion.duration">${xmlEscape(expected)}</stringProp>\n        </DurationAssertion>\n        <hashTree/>\n`;
}

function sizeAssertionToJMeter(name, expected, operator) {
  return `        <SizeAssertion guiclass="SizeAssertionGui" testclass="SizeAssertion" testname="${xmlEscape(name)}" enabled="true">\n          <stringProp name="SizeAssertion.size">${xmlEscape(expected)}</stringProp>\n          <stringProp name="SizeAssertion.operator">${xmlEscape(postMeterSizeOperatorToJMeter(operator))}</stringProp>\n        </SizeAssertion>\n        <hashTree/>\n`;
}

function jsonPathAssertionToJMeter(name, path, expected) {
  return `        <JSONPathAssertion guiclass="JSONPathAssertionGui" testclass="JSONPathAssertion" testname="${xmlEscape(name)}" enabled="true">\n          <stringProp name="JSON_PATH">${xmlEscape(path)}</stringProp>\n          <stringProp name="EXPECTED_VALUE">${xmlEscape(expected || '')}</stringProp>\n          <boolProp name="JSONVALIDATION">true</boolProp>\n          <boolProp name="EXPECT_NULL">false</boolProp>\n          <boolProp name="INVERT">false</boolProp>\n        </JSONPathAssertion>\n        <hashTree/>\n`;
}

function xPathAssertionToJMeter(name, path) {
  return `        <XPathAssertion guiclass="XPathAssertionGui" testclass="XPathAssertion" testname="${xmlEscape(name)}" enabled="true">\n          <stringProp name="XPath.xpath">${xmlEscape(path)}</stringProp>\n          <boolProp name="XPath.negate">false</boolProp>\n        </XPathAssertion>\n        <hashTree/>\n`;
}

function jsonExtractorToJMeter(name, variableName, path) {
  return `        <JSONPostProcessor guiclass="JSONPostProcessorGui" testclass="JSONPostProcessor" testname="${xmlEscape(name)}" enabled="true">\n          <stringProp name="JSONPostProcessor.referenceNames">${xmlEscape(variableName)}</stringProp>\n          <stringProp name="JSONPostProcessor.jsonPathExprs">${xmlEscape(path)}</stringProp>\n          <stringProp name="JSONPostProcessor.match_numbers">1</stringProp>\n          <stringProp name="JSONPostProcessor.defaultValues"></stringProp>\n        </JSONPostProcessor>\n        <hashTree/>\n`;
}

function regexExtractorToJMeter(name, variableName, regex) {
  return `        <RegexExtractor guiclass="RegexExtractorGui" testclass="RegexExtractor" testname="${xmlEscape(name)}" enabled="true">\n          <stringProp name="RegexExtractor.useHeaders">false</stringProp>\n          <stringProp name="RegexExtractor.refname">${xmlEscape(variableName)}</stringProp>\n          <stringProp name="RegexExtractor.regex">${xmlEscape(regex)}</stringProp>\n          <stringProp name="RegexExtractor.template">$1$</stringProp>\n          <stringProp name="RegexExtractor.default"></stringProp>\n        </RegexExtractor>\n        <hashTree/>\n`;
}

function jmeterSizeOperatorToPostMeter(value) {
  return {
    1: 'equals',
    2: 'notEquals',
    3: 'greaterThan',
    4: 'lessThan'
  }[String(value || '').trim()] || 'lessThan';
}

function postMeterSizeOperatorToJMeter(value) {
  return {
    equals: '1',
    notEquals: '2',
    greaterThan: '3',
    lessThan: '4'
  }[String(value || '').trim()] || '4';
}

function xmlHttpArguments(block) {
  const args = [];
  const pattern = /<elementProp\b[^>]*elementType="HTTPArgument"[^>]*>([\s\S]*?)<\/elementProp>/g;
  let match;
  while ((match = pattern.exec(block))) {
    args.push({
      name: xmlStringProp(match[1], 'Argument.name'),
      value: xmlStringProp(match[1], 'Argument.value')
    });
  }
  return args.filter((arg) => arg.name);
}

function xmlStringProp(block, name) {
  const escaped = escapeRegExp(name);
  const match = new RegExp(`<stringProp\\s+name="${escaped}">([\\s\\S]*?)<\\/stringProp>`).exec(block);
  return match ? xmlUnescape(match[1]) : '';
}

function xmlStringProps(block) {
  const props = [];
  const pattern = /<stringProp\s+name="([^"]*)">([\s\S]*?)<\/stringProp>/g;
  for (const match of String(block || '').matchAll(pattern)) {
    props.push({ name: xmlUnescape(match[1]), value: xmlUnescape(match[2]) });
  }
  return props;
}

function splitJMeterList(value) {
  return String(value || '')
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function xmlAttribute(text, name) {
  const match = new RegExp(`${escapeRegExp(name)}="([^"]*)"`).exec(text);
  return match ? xmlUnescape(match[1]) : '';
}

function splitCommandLine(text) {
  const tokens = [];
  let current = '';
  let quote = '';
  let escaped = false;
  for (const char of String(text || '').trim()) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = '';
      } else {
        current += char;
      }
      continue;
    }
    if (char === '\'' || char === '"') {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += char;
  }
  if (current) {
    tokens.push(current);
  }
  return tokens;
}

function buildUrlWithQuery(request) {
  const url = request.url || '';
  const enabled = (request.queryParams || []).filter((pair) => pair.enabled !== false && pair.key);
  if (!enabled.length) {
    return url;
  }
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}${enabled.map((pair) => `${encodeURIComponent(pair.key)}=${encodeURIComponent(pair.value ?? '')}`).join('&')}`;
}

function stripQueryFromUrl(url) {
  const parsed = parseRequestUrl(url);
  if (!parsed) {
    return url;
  }
  parsed.search = '';
  return parsed.toString();
}

function parseRequestUrl(url) {
  try {
    return new URL(String(url || ''));
  } catch {
    return null;
  }
}

function safeUrlPath(url) {
  return parseRequestUrl(url)?.pathname || '';
}

function contentTypeForRequest(request) {
  const explicit = (request.headers || []).find((header) => header.enabled !== false && header.key?.toLowerCase() === 'content-type');
  if (explicit?.value) {
    return explicit.value;
  }
  return request.bodyType === BODY_TYPES.RAW_JSON ? 'application/json' : 'text/plain; charset=utf-8';
}

function parseJsonMaybe(value) {
  if (!looksLikeJson(value)) {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function looksLikeJson(value) {
  const text = String(value || '').trim();
  return text.startsWith('{') || text.startsWith('[');
}

function isJsonMime(value) {
  return String(value || '').toLowerCase().includes('json');
}

function stripTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function assertImportableCollection(collection, label) {
  if (!collection.requests.length && !collection.folders.length) {
    throw new Error(`${label} does not contain importable requests.`);
  }
}

function shellQuote(value) {
  return `'${String(value ?? '').replaceAll("'", "'\\''")}'`;
}

function xmlEscape(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function xmlUnescape(value) {
  return String(value ?? '')
    .replaceAll('&quot;', '"')
    .replaceAll('&gt;', '>')
    .replaceAll('&lt;', '<')
    .replaceAll('&amp;', '&');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  exportCurlCollection,
  exportHarCollection,
  exportJMeterPlan,
  exportOpenApiCollection,
  importCurlCommand,
  importHarDocument,
  importJMeterPlan,
  importOpenApiDocument,
  looksLikeHarDocument,
  looksLikeOpenApiDocument,
  splitCommandLine
};
