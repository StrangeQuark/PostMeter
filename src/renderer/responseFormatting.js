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
    return body;
  }

  function looksLikeXml(value) {
    return /^<([A-Za-z_][\w:.-]*)(\s|>|\/>)/.test(value) && !looksLikeHtml(value);
  }

  function looksLikeHtml(value) {
    return /<!doctype\s+html/i.test(value) || /^<html[\s>]/i.test(value) || /<(body|head|main|section|article|div|span|h1|p|table|form|script|style)(\s|>)/i.test(value);
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

  global.PostMeterResponseFormatting = {
    formatBody,
    formatMarkupBody,
    looksLikeHtml,
    looksLikeXml,
    prettyMarkup
  };
})(window);
