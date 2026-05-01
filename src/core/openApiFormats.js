const { collectionModel, folderModel, keyValue, requestModel } = require('./models');
const { normalizeAuth } = require('./auth');
const {
  BODY_TYPES,
  HTTP_METHODS,
  assertImportableCollection,
  contentTypeForRequest,
  flattenCollectionRequests,
  isJsonMime,
  parseJsonMaybe,
  parseRequestUrl,
  stripTrailingSlash
} = require('./collectionFormatUtils');

function importOpenApiDocument(document) {
  if (!looksLikeOpenApiDocument(document)) {
    throw new Error('File is not a supported OpenAPI document.');
  }
  const collection = collectionModel({
    name: document.info?.title || 'Imported OpenAPI Collection',
    requests: [],
    folders: []
  });
  const server = firstOpenApiServer(document);
  const baseUrl = openApiBaseUrl(document, server);
  importOpenApiServerVariables(server, collection);
  const foldersByTag = new Map();

  for (const [pathName, rawPathItem] of Object.entries(document.paths || {})) {
    const pathItem = resolveOpenApiObject(document, rawPathItem);
    if (!pathItem || typeof pathItem !== 'object') {
      continue;
    }
    for (const method of HTTP_METHODS) {
      const operation = resolveOpenApiObject(document, pathItem[method]);
      if (!operation || typeof operation !== 'object') {
        continue;
      }
      const parameters = [...(pathItem.parameters || []), ...(operation.parameters || [])]
        .map((parameter) => resolveOpenApiObject(document, parameter))
        .filter(Boolean);
      const request = requestModel({
        name: operation.operationId || operation.summary || `${method.toUpperCase()} ${pathName}`,
        method: method.toUpperCase(),
        url: `${baseUrl}${openApiPathToPostMeter(pathName)}`
      });
      importOpenApiParameters(document, parameters, request);
      if (!importOpenApiBody(document, operation.requestBody, request)) {
        importSwaggerBodyParameters(document, parameters, operation, request);
      }
      importOpenApiResponses(document, operation.responses, request);
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
    const scheme = resolveOpenApiObject(document, schemes[schemeName]);
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
    if (location === 'cookie') {
      return {
        type: 'cookie',
        value: `${name}={{${name}}}`
      };
    }
    return {
      type: 'apiKey',
      location: location === 'query' ? 'query' : 'header',
      key: name,
      value: `{{${name}}}`
    };
  }
  if (type === 'oauth2') {
    const flow = firstOpenApiOAuthFlow(scheme);
    const isDeviceCode = flow?.grantType === 'deviceCode';
    return {
      type: 'oauth2',
      tokenType: 'Bearer',
      accessToken: '{{accessToken}}',
      authorizationUrl: isDeviceCode ? '' : flow?.authorizationUrl || '',
      deviceAuthorizationUrl: isDeviceCode ? flow?.deviceAuthorizationUrl || flow?.authorizationUrl || '' : '',
      tokenUrl: flow?.tokenUrl || '',
      scopes: Object.keys(flow?.scopes || {}).join(' '),
      grantType: flow?.grantType || 'authorizationCode'
    };
  }
  return null;
}

function firstOpenApiOAuthFlow(scheme = {}) {
  const flows = scheme?.flows || {};
  const extendedGrantType = String(scheme?.['x-postmeter-grantType'] || '').trim();
  const deviceAuthorizationUrl = String(scheme?.['x-postmeter-deviceAuthorizationUrl'] || '').trim();
  for (const [key, value] of Object.entries(flows || {})) {
    if (!value || typeof value !== 'object') {
      continue;
    }
    return {
      ...value,
      deviceAuthorizationUrl,
      grantType: extendedGrantType === 'deviceCode'
        ? 'deviceCode'
        : key === 'clientCredentials'
          ? 'clientCredentials'
          : 'authorizationCode'
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
    for (const name of openApiPathParameterNames(pathName)) {
      operation.parameters.push(openApiParameter('path', name, requestVariableValue(request, name), { required: true }));
    }
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
      if (header.key.toLowerCase() === 'cookie') {
        for (const cookie of cookieHeaderPairs(header.value)) {
          operation.parameters.push(openApiParameter('cookie', cookie.name, cookie.value));
        }
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

function looksLikeOpenApiDocument(document) {
  return Boolean(document && typeof document === 'object' && (document.openapi || document.swagger) && document.paths);
}

function firstOpenApiServer(document) {
  return Array.isArray(document.servers) && document.servers[0]?.url ? document.servers[0] : null;
}

function openApiBaseUrl(document, server = firstOpenApiServer(document)) {
  if (server?.url) {
    return openApiPathToPostMeter(stripTrailingSlash(server.url));
  }
  if (document.swagger === '2.0' && document.host) {
    const scheme = Array.isArray(document.schemes) && document.schemes[0] ? document.schemes[0] : 'https';
    return stripTrailingSlash(`${scheme}://${document.host}${document.basePath || ''}`);
  }
  return '{{baseUrl}}';
}

function importOpenApiServerVariables(server, collection) {
  const variables = server?.variables;
  if (!variables || typeof variables !== 'object') {
    return;
  }
  for (const [name, variable] of Object.entries(variables)) {
    if (name) {
      collection.variables.push(keyValue(name, openApiVariableDefault(variable)));
    }
  }
}

function openApiVariableDefault(variable) {
  const value = variable?.default ?? (Array.isArray(variable?.enum) ? variable.enum[0] : '');
  return stringifyOpenApiValue(value);
}

function importOpenApiParameters(document, parameters, request) {
  if (!Array.isArray(parameters)) {
    return;
  }
  for (const candidate of parameters) {
    const parameter = resolveOpenApiObject(document, candidate);
    if (!parameter?.name) {
      continue;
    }
    const value = openApiParameterExample(document, parameter);
    if (parameter.in === 'query') {
      request.queryParams.push(keyValue(parameter.name, value));
    } else if (parameter.in === 'header') {
      request.headers.push(keyValue(parameter.name, value));
    } else if (parameter.in === 'path') {
      request.variables.push(keyValue(parameter.name, value));
    } else if (parameter.in === 'cookie') {
      appendOpenApiCookieParameter(request, parameter.name, value);
    }
  }
}

function openApiParameterExample(document, parameter) {
  const schema = resolveOpenApiObject(document, parameter.schema);
  const value = parameter.example
    ?? firstOpenApiExample(document, parameter.examples)
    ?? parameter.default
    ?? schema?.example
    ?? schema?.default
    ?? '';
  return stringifyOpenApiValue(value);
}

function appendOpenApiCookieParameter(request, name, value) {
  const cookie = `${name}=${value || `{{${name}}}`}`;
  const existing = request.headers.find((header) => header.key?.toLowerCase() === 'cookie');
  if (existing) {
    existing.value = existing.value ? `${existing.value}; ${cookie}` : cookie;
  } else {
    request.headers.push(keyValue('Cookie', cookie));
  }
}

function importOpenApiBody(document, requestBody, request) {
  const resolvedRequestBody = resolveOpenApiObject(document, requestBody);
  const content = resolvedRequestBody?.content;
  if (!content || typeof content !== 'object') {
    return false;
  }
  const contentType = Object.keys(content)[0];
  if (!contentType) {
    return false;
  }
  const mediaType = resolveOpenApiObject(document, content[contentType] || {});
  const example = mediaType.example ?? firstOpenApiExample(document, mediaType.examples);
  request.headers.push(keyValue('Content-Type', contentType));
  request.bodyType = isJsonMime(contentType) ? BODY_TYPES.RAW_JSON : BODY_TYPES.RAW_TEXT;
  request.body = example == null ? '' : typeof example === 'string' ? example : JSON.stringify(example, null, 2);
  if (isOpenApiBinaryMedia(contentType, mediaType, document)) {
    request.variables.push(keyValue('openapi.requestBody.binary', 'true'));
    request.variables.push(keyValue('openapi.requestBody.contentType', contentType));
  }
  return true;
}

function importSwaggerBodyParameters(document, parameters, operation, request) {
  const consumes = Array.isArray(operation.consumes) && operation.consumes[0]
    ? operation.consumes[0]
    : Array.isArray(document.consumes) && document.consumes[0]
      ? document.consumes[0]
      : 'application/json';
  const bodyParameter = parameters.find((parameter) => parameter?.in === 'body');
  if (bodyParameter) {
    const bodySchema = resolveOpenApiObject(document, bodyParameter.schema);
    const value = bodyParameter.example
      ?? bodySchema?.example
      ?? bodySchema?.default
      ?? null;
    request.headers.push(keyValue('Content-Type', consumes));
    request.bodyType = isJsonMime(consumes) ? BODY_TYPES.RAW_JSON : BODY_TYPES.RAW_TEXT;
    request.body = value == null ? '' : typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    if (isOpenApiBinaryMedia(consumes, { schema: bodySchema || {} }, document)) {
      request.variables.push(keyValue('openapi.requestBody.binary', 'true'));
      request.variables.push(keyValue('openapi.requestBody.contentType', consumes));
    }
    return;
  }
  const formParameters = parameters.filter((parameter) => parameter?.in === 'formData' && parameter.name);
  if (!formParameters.length) {
    return;
  }
  const formContentType = consumes || 'application/x-www-form-urlencoded';
  request.headers.push(keyValue('Content-Type', formContentType));
  request.bodyType = BODY_TYPES.RAW_TEXT;
  request.body = formParameters
    .map((parameter) => `${parameter.name}=${openApiParameterExample(document, parameter)}`)
    .join(formContentType.includes('multipart/form-data') ? '\n' : '&');
  for (const parameter of formParameters) {
    if (parameter.type === 'file' || parameter.schema?.format === 'binary') {
      request.variables.push(keyValue(`openapi.formData.${parameter.name}.file`, 'true'));
    }
  }
}

function importOpenApiResponses(document, responses, request) {
  const resolvedResponses = resolveOpenApiObject(document, responses);
  if (!resolvedResponses || typeof resolvedResponses !== 'object') {
    return;
  }
  for (const [status, rawResponse] of Object.entries(resolvedResponses)) {
    const response = resolveOpenApiObject(document, rawResponse);
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
    const responseHeaders = openApiResponseHeaders(document, response?.headers);
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
    request.examples.push(...openApiResponseExamples(document, status, response, responseHeaders));
  }
}

function parseOpenApiStatus(status) {
  const value = String(status || '').trim();
  return /^\d{3}$/.test(value) ? Number(value) : 0;
}

function openApiResponseHeaders(document, headers) {
  if (!headers || typeof headers !== 'object') {
    return [];
  }
  return Object.entries(headers)
    .filter(([name]) => name)
    .map(([name, header]) => keyValue(name, openApiHeaderExample(document, resolveOpenApiObject(document, header))));
}

function openApiHeaderExample(document, header) {
  const schema = resolveOpenApiObject(document, header?.schema);
  const value = header?.example ?? firstOpenApiExample(document, header?.examples) ?? schema?.example ?? schema?.default ?? '';
  return value == null ? '' : String(value);
}

function openApiResponseExamples(document, status, response, headers) {
  const content = response?.content;
  if (!content || typeof content !== 'object') {
    return [];
  }
  const statusCode = parseOpenApiStatus(status);
  const examples = [];
  for (const [contentType, mediaType] of Object.entries(content)) {
    for (const example of openApiMediaExamples(document, resolveOpenApiObject(document, mediaType))) {
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

function openApiMediaExamples(document, mediaType) {
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
    .map(([name, example]) => resolveOpenApiObject(document, example))
    .map((example, index) => ({ name: example?.summary || Object.keys(examples)[index], value: example?.value }))
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

function stringifyOpenApiValue(value) {
  if (value == null) {
    return '';
  }
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function isOpenApiBinaryMedia(contentType, mediaType, document) {
  const schema = resolveOpenApiObject(document, mediaType?.schema) || {};
  const format = String(schema.format || '').toLowerCase();
  const encoding = String(schema.contentEncoding || '').toLowerCase();
  return String(contentType || '').toLowerCase() === 'application/octet-stream'
    || (schema.type === 'string' && (format === 'binary' || format === 'byte'))
    || encoding === 'base64';
}

function firstExample(examples) {
  if (!examples || typeof examples !== 'object') {
    return null;
  }
  const first = Object.values(examples)[0];
  return first?.value ?? null;
}

function firstOpenApiExample(document, examples) {
  if (!examples || typeof examples !== 'object') {
    return null;
  }
  const first = resolveOpenApiObject(document, Object.values(examples)[0]);
  return first?.value ?? null;
}

function resolveOpenApiObject(document, value, seen = new Set()) {
  if (!value || typeof value !== 'object' || !value.$ref) {
    return value;
  }
  const ref = String(value.$ref || '');
  if (!ref.startsWith('#/') || seen.has(ref)) {
    return value;
  }
  seen.add(ref);
  const target = ref
    .slice(2)
    .split('/')
    .map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce((current, part) => (current && typeof current === 'object' ? current[part] : undefined), document);
  return resolveOpenApiObject(document, target || value, seen);
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

function openApiPathParameterNames(pathName) {
  return [...String(pathName || '').matchAll(/\{([^}]+)\}/g)]
    .map((match) => match[1])
    .filter(Boolean);
}

function requestVariableValue(request, key) {
  return (request.variables || []).find((variable) => variable.enabled !== false && variable.key === key)?.value ?? '';
}

function openApiParameter(location, name, value, options = {}) {
  return {
    name,
    in: location,
    required: options.required === true,
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

function cookieHeaderPairs(value) {
  return String(value || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separator = part.indexOf('=');
      return separator > 0
        ? { name: part.slice(0, separator).trim(), value: part.slice(separator + 1).trim() }
        : { name: part, value: '' };
    })
    .filter((cookie) => cookie.name);
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

module.exports = {
  exportOpenApiCollection,
  importOpenApiDocument,
  looksLikeOpenApiDocument
};
