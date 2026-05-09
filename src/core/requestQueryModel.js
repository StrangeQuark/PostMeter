(function attachRequestQueryModel(global) {
  function splitUrlQuery(urlText = '') {
    const text = String(urlText || '');
    const hashIndex = text.indexOf('#');
    const beforeHash = hashIndex >= 0 ? text.slice(0, hashIndex) : text;
    const hash = hashIndex >= 0 ? text.slice(hashIndex) : '';
    const queryIndex = beforeHash.indexOf('?');
    if (queryIndex < 0) {
      return {
        base: beforeHash,
        query: '',
        hash
      };
    }
    return {
      base: beforeHash.slice(0, queryIndex),
      query: beforeHash.slice(queryIndex + 1),
      hash
    };
  }

  function queryParamsFromUrl(urlText = '') {
    const { query } = splitUrlQuery(urlText);
    if (!query) {
      return [];
    }
    return Array.from(new URLSearchParams(query).entries()).map(([key, value]) => ({
      enabled: true,
      key,
      value
    }));
  }

  function enabledQueryParams(pairs = []) {
    return (Array.isArray(pairs) ? pairs : [])
      .filter((pair) => pair && pair.enabled !== false && String(pair.key || '').trim())
      .map((pair) => ({
        enabled: true,
        key: String(pair.key || '').trim(),
        value: String(pair.value ?? '')
      }));
  }

  function encodeQueryComponentForDisplay(value = '') {
    const text = String(value ?? '');
    const variablePattern = /{{[^{}]*}}/g;
    let output = '';
    let lastIndex = 0;
    for (const match of text.matchAll(variablePattern)) {
      output += encodeURIComponent(text.slice(lastIndex, match.index));
      output += match[0];
      lastIndex = match.index + match[0].length;
    }
    output += encodeURIComponent(text.slice(lastIndex));
    return output;
  }

  function queryStringFromPairs(pairs = []) {
    return enabledQueryParams(pairs)
      .map((pair) => `${encodeQueryComponentForDisplay(pair.key)}=${encodeQueryComponentForDisplay(pair.value)}`)
      .join('&');
  }

  function urlWithQueryParams(urlText = '', pairs = []) {
    const { base, hash } = splitUrlQuery(urlText);
    const query = queryStringFromPairs(pairs);
    return `${base}${query ? `?${query}` : ''}${hash}`;
  }

  function queryPairsEqual(left = [], right = []) {
    if (left.length !== right.length) {
      return false;
    }
    return left.every((pair, index) => pair.key === right[index].key && pair.value === right[index].value);
  }

  function urlQueryMatchesPairs(urlText = '', pairs = []) {
    return queryPairsEqual(queryParamsFromUrl(urlText), enabledQueryParams(pairs));
  }

  const exported = {
    enabledQueryParams,
    queryPairsEqual,
    queryParamsFromUrl,
    queryStringFromPairs,
    splitUrlQuery,
    urlQueryMatchesPairs,
    urlWithQueryParams
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }

  global.PostMeterRequestQueryModel = exported;
})(typeof window === 'undefined' ? globalThis : window);
