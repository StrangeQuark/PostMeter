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

function looksLikeOpenApiDocument(document) {
  return Boolean(document && typeof document === 'object' && (document.openapi || document.swagger) && document.paths);
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

module.exports = {
  exportOpenApiCollection,
  importOpenApiDocument,
  looksLikeOpenApiDocument
};
