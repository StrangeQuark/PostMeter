const { BODY_TYPES, collectionModel, keyValue, requestModel } = require('./models');
const { normalizeAuth } = require('./authModel');
const {
  buildUrlWithQuery,
  flattenCollectionRequests,
  looksLikeJson,
  parseRequestUrl,
  shellQuote,
  splitCommandLine,
  stripQueryFromUrl
} = require('./collectionFormatUtils');

function importCurlCommand(text) {
  const tokens = splitCommandLine(normalizeCurlCommandText(text)).filter((token) => token !== '^');
  if (tokens[0] !== 'curl') {
    throw new Error('File is not a supported curl command.');
  }
  const request = requestModel({ name: 'Imported curl Request', method: 'GET', url: '' });
  const dataParts = [];
  const deferredQueryParts = [];
  let sendDataAsQuery = false;
  let explicitMethod = false;
  for (let index = 1; index < tokens.length; index++) {
    const token = tokens[index];
    if (token === '-X' || token === '--request') {
      request.method = String(tokens[++index] || 'GET').toUpperCase();
      explicitMethod = true;
    } else if (token.startsWith('--request=')) {
      request.method = token.slice('--request='.length).toUpperCase();
      explicitMethod = true;
    } else if (token.startsWith('-X') && token.length > 2) {
      request.method = token.slice(2).toUpperCase();
      explicitMethod = true;
    } else if (token === '-I' || token === '--head') {
      request.method = 'HEAD';
      explicitMethod = true;
    } else if (token === '-G' || token === '--get') {
      sendDataAsQuery = true;
    } else if (token === '-H' || token === '--header') {
      addCurlHeader(request, tokens[++index] || '');
    } else if (token.startsWith('--header=')) {
      addCurlHeader(request, token.slice('--header='.length));
    } else if (token.startsWith('-H') && token.length > 2) {
      addCurlHeader(request, token.slice(2));
    } else if (token === '-b' || token === '--cookie' || token.startsWith('--cookie=')) {
      const value = token.includes('=') && token.startsWith('--cookie=') ? token.slice('--cookie='.length) : tokens[++index] || '';
      request.headers.push(keyValue('Cookie', value));
    } else if (token.startsWith('-b') && token.length > 2) {
      request.headers.push(keyValue('Cookie', token.slice(2)));
    } else if (token === '-F' || token === '--form' || token === '--form-string') {
      appendCurlForm(request, tokens[++index] || '');
    } else if (token.startsWith('--form=') || token.startsWith('--form-string=')) {
      appendCurlForm(request, token.slice(token.indexOf('=') + 1));
    } else if (token.startsWith('-F') && token.length > 2) {
      appendCurlForm(request, token.slice(2));
    } else if (isCurlDataFlag(token)) {
      appendCurlData(request, tokens[++index] || '', token, dataParts, { explicitMethod });
    } else if (isAttachedLongCurlDataFlag(token)) {
      const separator = token.indexOf('=');
      appendCurlData(request, token.slice(separator + 1), token.slice(0, separator), dataParts, { explicitMethod });
    } else if (token.startsWith('-d') && token.length > 2) {
      appendCurlData(request, token.slice(2), '-d', dataParts, { explicitMethod });
    } else if (token === '-u' || token === '--user') {
      applyCurlUser(request, tokens[++index] || '');
    } else if (token.startsWith('--user=')) {
      applyCurlUser(request, token.slice('--user='.length));
    } else if (token.startsWith('-u') && token.length > 2) {
      applyCurlUser(request, token.slice(2));
    } else if (token === '-A' || token === '--user-agent') {
      request.headers.push(keyValue('User-Agent', tokens[++index] || ''));
    } else if (token.startsWith('--user-agent=')) {
      request.headers.push(keyValue('User-Agent', token.slice('--user-agent='.length)));
    } else if (token.startsWith('-A') && token.length > 2) {
      request.headers.push(keyValue('User-Agent', token.slice(2)));
    } else if (token === '-e' || token === '--referer') {
      request.headers.push(keyValue('Referer', tokens[++index] || ''));
    } else if (token.startsWith('--referer=')) {
      request.headers.push(keyValue('Referer', token.slice('--referer='.length)));
    } else if (isCurlMetadataFlag(token)) {
      const name = token.replace(/^--/, '');
      const value = tokens[++index] || '';
      request.variables.push(keyValue(`curl.${name}`, value));
    } else if (isAttachedCurlMetadataFlag(token)) {
      const separator = token.indexOf('=');
      const name = token.slice(2, separator);
      request.variables.push(keyValue(`curl.${name}`, token.slice(separator + 1)));
    } else if (token === '-L' || token === '--location' || token === '--location-trusted') {
      request.variables.push(keyValue('curl.followRedirects', 'true'));
    } else if (token === '--compressed') {
      request.variables.push(keyValue('curl.compressed', 'true'));
    } else if (token === '-k' || token === '--insecure') {
      request.variables.push(keyValue('curl.insecure', 'true'));
    } else if (token === '-T' || token === '--upload-file') {
      const value = tokens[++index] || '';
      request.variables.push(keyValue('curl.uploadFile', value));
      request.body = `@${value.replace(/^@/, '')}`;
      request.bodyType = BODY_TYPES.RAW_TEXT;
      if (!explicitMethod && request.method === 'GET') {
        request.method = 'PUT';
      }
    } else if (token.startsWith('--upload-file=')) {
      const value = token.slice('--upload-file='.length);
      request.variables.push(keyValue('curl.uploadFile', value));
      request.body = `@${value.replace(/^@/, '')}`;
      request.bodyType = BODY_TYPES.RAW_TEXT;
      if (!explicitMethod && request.method === 'GET') {
        request.method = 'PUT';
      }
    } else if (token === '--request-target') {
      request.variables.push(keyValue('curl.requestTarget', tokens[++index] || ''));
    } else if (token.startsWith('--request-target=')) {
      request.variables.push(keyValue('curl.requestTarget', token.slice('--request-target='.length)));
    } else if (token === '--url-query') {
      deferredQueryParts.push(tokens[++index] || '');
    } else if (token.startsWith('--url-query=')) {
      deferredQueryParts.push(token.slice('--url-query='.length));
    } else if (token === '--url') {
      request.url = tokens[++index] || '';
    } else if (token.startsWith('--url=')) {
      request.url = token.slice('--url='.length);
    } else if (!token.startsWith('-') && !request.url) {
      request.url = token;
    }
  }
  if (!request.url) {
    throw new Error('curl command does not include a URL.');
  }
  if (sendDataAsQuery) {
    deferredQueryParts.push(...dataParts);
    request.body = '';
    request.bodyType = BODY_TYPES.NONE;
    if (!explicitMethod) {
      request.method = 'GET';
    }
  }
  const parsed = parseRequestUrl(request.url);
  if (parsed) {
    request.url = stripQueryFromUrl(request.url);
    for (const [key, value] of parsed.searchParams.entries()) {
      request.queryParams.push(keyValue(key, value));
    }
  }
  for (const part of deferredQueryParts) {
    appendCurlQueryPart(request, part);
  }
  request.name = curlRequestName(request);
  return collectionModel({ name: 'Imported curl Collection', requests: [request], folders: [] });
}

function normalizeCurlCommandText(text) {
  return String(text || '').replace(/\^\s*\r?\n/g, ' ');
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

function appendCurlData(request, value, flag, dataParts, { explicitMethod } = {}) {
  const next = String(value ?? '');
  dataParts.push(next);
  request.body = dataParts.join('&');
  request.bodyType = looksLikeJson(request.body) ? BODY_TYPES.RAW_JSON : BODY_TYPES.RAW_TEXT;
  if (flag === '--data-binary') {
    request.variables.push(keyValue('curl.dataBinary', 'true'));
    if (next.startsWith('@')) {
      request.variables.push(keyValue('curl.dataBinaryFile', next.slice(1)));
    }
  } else if (flag === '--data-urlencode') {
    request.variables.push(keyValue('curl.dataUrlencode', 'true'));
  }
  if (!explicitMethod && request.method === 'GET') {
    request.method = 'POST';
  }
}

function isCurlDataFlag(token) {
  return token === '-d'
    || token === '--data'
    || token === '--data-raw'
    || token === '--data-binary'
    || token === '--data-urlencode';
}

function isAttachedLongCurlDataFlag(token) {
  return token.startsWith('--data=')
    || token.startsWith('--data-raw=')
    || token.startsWith('--data-binary=')
    || token.startsWith('--data-urlencode=');
}

function isCurlMetadataFlag(token) {
  return token === '--proxy'
    || token === '--retry'
    || token === '--cacert'
    || token === '--cert'
    || token === '--key'
    || token === '--connect-timeout'
    || token === '--max-time';
}

function isAttachedCurlMetadataFlag(token) {
  return token.startsWith('--proxy=')
    || token.startsWith('--retry=')
    || token.startsWith('--cacert=')
    || token.startsWith('--cert=')
    || token.startsWith('--key=')
    || token.startsWith('--connect-timeout=')
    || token.startsWith('--max-time=');
}

function applyCurlUser(request, value) {
  const text = String(value || '');
  const separator = text.indexOf(':');
  request.auth = {
    type: 'basic',
    username: separator >= 0 ? text.slice(0, separator) : text,
    password: separator >= 0 ? text.slice(separator + 1) : ''
  };
}

function appendCurlQueryPart(request, value) {
  const text = String(value || '').replace(/^\?/, '');
  if (!text) {
    return;
  }
  for (const part of text.split('&')) {
    if (!part) {
      continue;
    }
    const separator = part.indexOf('=');
    const key = separator >= 0 ? part.slice(0, separator) : part;
    const rawValue = separator >= 0 ? part.slice(separator + 1) : '';
    request.queryParams.push(keyValue(decodeCurlQueryComponent(key), decodeCurlQueryComponent(rawValue)));
  }
}

function decodeCurlQueryComponent(value) {
  try {
    return decodeURIComponent(String(value || '').replace(/\+/g, ' '));
  } catch {
    return String(value || '');
  }
}

function curlRequestName(request) {
  const parsed = parseRequestUrl(request.url);
  if (!parsed) {
    return `${request.method || 'GET'} ${request.url || 'Request'}`;
  }
  const pathName = parsed.pathname && parsed.pathname !== '/' ? parsed.pathname : parsed.hostname;
  return `${request.method || 'GET'} ${pathName || 'Request'}`;
}

function exportCurlCollection(collection) {
  return flattenCollectionRequests(collection)
    .map(({ request }) => requestToCurl(request))
    .join('\n\n');
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
  const auth = normalizeAuth(request.auth || {});
  if (request.method && request.method !== 'GET') {
    parts.push('-X', shellQuote(request.method));
  }
  if (auth.type === 'basic' && auth.username) {
    parts.push('-u', shellQuote(`${auth.username}:${auth.password ?? ''}`));
  }
  if (requestVariableValue(request, 'curl.followRedirects') === 'true') {
    parts.push('-L');
  }
  if (requestVariableValue(request, 'curl.compressed') === 'true') {
    parts.push('--compressed');
  }
  if (requestVariableValue(request, 'curl.insecure') === 'true') {
    parts.push('-k');
  }
  for (const header of request.headers || []) {
    if (header.enabled === false || !header.key) {
      continue;
    }
    parts.push('-H', shellQuote(`${header.key}: ${header.value ?? ''}`));
  }
  if (request.bodyType !== BODY_TYPES.NONE && request.body) {
    const dataFlag = requestVariableValue(request, 'curl.dataBinary') === 'true' ? '--data-binary' : '--data-raw';
    parts.push(dataFlag, shellQuote(request.body));
  }
  return parts.join(' ');
}

function requestVariableValue(request, key) {
  return (request.variables || []).find((variable) => variable.enabled !== false && variable.key === key)?.value ?? '';
}

module.exports = {
  exportCurlCollection,
  importCurlCommand,
  splitCommandLine
};
