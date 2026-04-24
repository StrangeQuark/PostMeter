const { BODY_TYPES, collectionModel, keyValue, requestModel } = require('./models');
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
    } else if (token.startsWith('-H') && token.length > 2) {
      addCurlHeader(request, token.slice(2));
    } else if (token === '-b' || token === '--cookie' || token.startsWith('--cookie=')) {
      const value = token.includes('=') && token.startsWith('--cookie=') ? token.slice('--cookie='.length) : tokens[++index] || '';
      request.headers.push(keyValue('Cookie', value));
    } else if (token.startsWith('-b') && token.length > 2) {
      request.headers.push(keyValue('Cookie', token.slice(2)));
    } else if (token === '-F' || token === '--form' || token === '--form-string') {
      appendCurlForm(request, tokens[++index] || '');
    } else if (token.startsWith('-F') && token.length > 2) {
      appendCurlForm(request, token.slice(2));
    } else if (token === '-d' || token === '--data' || token === '--data-raw' || token === '--data-binary' || token === '--data-urlencode') {
      request.body = tokens[++index] || '';
      request.bodyType = looksLikeJson(request.body) ? BODY_TYPES.RAW_JSON : BODY_TYPES.RAW_TEXT;
      if (request.method === 'GET') {
        request.method = 'POST';
      }
    } else if (token.startsWith('-d') && token.length > 2) {
      request.body = token.slice(2);
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

module.exports = {
  exportCurlCollection,
  importCurlCommand,
  splitCommandLine
};
