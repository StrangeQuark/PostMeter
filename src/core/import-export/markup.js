const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');
const xpath = require('xpath');
const { parse: parseHtml } = require('node-html-parser');

function readXmlPath(body, expression) {
  const result = selectXmlPath(body, expression);
  return xmlSelectionValue(result);
}

function xmlPathExists(body, expression) {
  const result = selectXmlPath(body, expression);
  if (Array.isArray(result)) {
    return result.length > 0;
  }
  if (typeof result === 'boolean') {
    return result;
  }
  if (typeof result === 'number') {
    return Number.isFinite(result) && result !== 0;
  }
  return result != null && String(result) !== '';
}

function selectXmlPath(body, expression) {
  const path = String(expression || '').trim();
  if (!path) {
    throw new Error('XML XPath assertion requires a path.');
  }
  const document = parseXml(body);
  return xpath.select(path, document);
}

function parseXml(body) {
  const text = String(body || '');
  if (/<!DOCTYPE\b|<!ENTITY\b/i.test(text)) {
    throw new Error('Response body XML must not contain DTD or entity declarations.');
  }
  const errors = [];
  const document = new DOMParser({
    onError(level, message) {
      if (level === 'error' || level === 'fatalError') {
        errors.push(message);
      }
    }
  }).parseFromString(text, 'text/xml');
  if (errors.length) {
    throw new Error(`Response body is not valid XML: ${errors[0]}`);
  }
  const parserErrors = document.getElementsByTagName('parsererror');
  if (parserErrors.length) {
    throw new Error(`Response body is not valid XML: ${parserErrors[0].textContent || 'parse error'}`);
  }
  return document;
}

function xmlSelectionValue(result) {
  if (Array.isArray(result)) {
    if (!result.length) {
      return undefined;
    }
    return result.map(xmlNodeValue).join('\n');
  }
  return result;
}

function xmlNodeValue(node) {
  if (!node) {
    return '';
  }
  if (node.nodeType === 2) {
    return node.value || '';
  }
  if (node.nodeType === 3 || node.nodeType === 4) {
    return node.data || '';
  }
  if (node.textContent != null && !hasElementChildren(node)) {
    return node.textContent;
  }
  return new XMLSerializer().serializeToString(node);
}

function hasElementChildren(node) {
  for (let index = 0; index < (node.childNodes?.length || 0); index++) {
    if (node.childNodes[index].nodeType === 1) {
      return true;
    }
  }
  return false;
}

function readHtmlSelector(body, selector) {
  const matches = selectHtml(body, selector);
  if (!matches.length) {
    return undefined;
  }
  return matches.map(htmlNodeText).join('\n');
}

function htmlSelectorExists(body, selector) {
  return selectHtml(body, selector).length > 0;
}

function selectHtml(body, selector) {
  const query = String(selector || '').trim();
  if (!query) {
    throw new Error('HTML selector assertion requires a selector.');
  }
  try {
    return parseHtml(String(body || '')).querySelectorAll(query);
  } catch (error) {
    throw new Error(`HTML selector could not be evaluated: ${error.message || String(error)}`);
  }
}

function htmlNodeText(node) {
  return normalizeWhitespace(node?.textContent || node?.rawText || node?.toString() || '');
}

function normalizeWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

module.exports = {
  htmlSelectorExists,
  readHtmlSelector,
  readXmlPath,
  xmlPathExists
};
