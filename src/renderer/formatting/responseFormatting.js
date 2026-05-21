(function attachResponseFormatting(global) {
  function formatBody(response) {
    const body = response.body || '';
    const contentType = Object.entries(response.headers || {})
      .find(([key]) => key.toLowerCase() === 'content-type')?.[1]?.join(',').toLowerCase() || '';
    const trimmed = body.trim();
    if (!trimmed) {
      return body;
    }
    if (trimmed.startsWith('{') || trimmed.startsWith('[') || contentType.includes('json')) {
      try {
        return JSON.stringify(JSON.parse(body), null, 2);
      } catch {
        return body;
      }
    }
    if (contentType.includes('xml') || trimmed.startsWith('<?xml') || looksLikeXml(trimmed)) {
      return formatMarkupBody(body, 'application/xml');
    }
    if (contentType.includes('html') || looksLikeHtml(trimmed)) {
      return formatMarkupBody(body, 'text/html');
    }
    if (contentType.includes('form-urlencoded') || looksLikeUrlEncoded(trimmed)) {
      return formatUrlEncodedBody(body);
    }
    return body;
  }

  function looksLikeXml(value) {
    return /^<([A-Za-z_][\w:.-]*)(\s|>|\/>)/.test(value) && !looksLikeHtml(value);
  }

  function looksLikeHtml(value) {
    return /<!doctype\s+html/i.test(value) || /^<html[\s>]/i.test(value) || /<(body|head|main|section|article|div|span|h1|p|table|form|script|style)(\s|>)/i.test(value);
  }

  function looksLikeUrlEncoded(value) {
    const text = String(value || '').trim();
    if (!text || /\s/.test(text) || /[{}\[\]<>]/.test(text) || !text.includes('&')) {
      return false;
    }
    return text.split('&').every((part) => /^[^=&]+=[\s\S]*$/.test(part));
  }

  function formatUrlEncodedBody(body) {
    return String(body || '')
      .split('&')
      .map((pair) => {
        const [rawKey, ...rawValueParts] = pair.split('=');
        const key = decodeUrlEncodedPart(rawKey);
        const value = decodeUrlEncodedPart(rawValueParts.join('='));
        return `${key}: ${value}`;
      })
      .join('\n');
  }

  function decodeUrlEncodedPart(value) {
    const normalized = String(value || '').replace(/\+/g, ' ');
    try {
      return decodeURIComponent(normalized);
    } catch {
      return normalized;
    }
  }

  function formatMarkupBody(body, mimeType) {
    try {
      const document = new DOMParser().parseFromString(body, mimeType);
      if (document.getElementsByTagName?.('parsererror')?.length) {
        return body;
      }
      const serialized = document.documentElement?.outerHTML
        || new XMLSerializer().serializeToString(document);
      return prettyMarkup(serialized);
    } catch {
      return prettyMarkup(body) || body;
    }
  }

  function prettyMarkup(markup) {
    const lines = String(markup || '')
      .replace(/>\s*</g, '>\n<')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    let depth = 0;
    return lines.map((line) => {
      if (/^<\//.test(line)) {
        depth = Math.max(0, depth - 1);
      }
      const output = `${'  '.repeat(depth)}${line}`;
      if (/^<[^!?/][^>]*[^/]>\s*$/.test(line) && !/^<(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)\b/i.test(line)) {
        depth++;
      }
      if (/<\/[^>]+>\s*$/.test(line) && !/^<\//.test(line) && !/^<[^>]+>[^<]*<\/[^>]+>$/.test(line)) {
        depth = Math.max(0, depth - 1);
      }
      return output;
    }).join('\n');
  }

  const exported = {
    formatBody,
    formatUrlEncodedBody,
    formatMarkupBody,
    looksLikeHtml,
    looksLikeXml,
    looksLikeUrlEncoded,
    prettyMarkup
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }
  global.PostMeterResponseFormatting = exported;
})(typeof window !== 'undefined' ? window : globalThis);
