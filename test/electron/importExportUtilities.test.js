const test = require('node:test');
const assert = require('node:assert/strict');
const {
  BODY_TYPES,
  assertImportableCollection,
  buildUrlWithQuery,
  contentTypeForRequest,
  flattenCollectionRequests,
  isJsonMime,
  looksLikeJson,
  parseJsonMaybe,
  safeUrlPath,
  shellQuote,
  splitCommandLine,
  stripQueryFromUrl,
  stripTrailingSlash,
  xmlEscape,
  xmlUnescape
} = require('../../src/core/import-export/collectionFormatUtils');
const {
  htmlSelectorExists,
  readHtmlSelector,
  readXmlPath,
  xmlPathExists
} = require('../../src/core/import-export/markup');

test('collection format utilities flatten requests and build safe request URLs', () => {
  const collection = {
    requests: [{ id: 'root' }],
    folders: [
      {
        id: 'folder',
        requests: [{ id: 'nested' }],
        folders: [{ id: 'deep-folder', requests: [{ id: 'deep' }] }]
      }
    ]
  };
  assert.deepEqual(flattenCollectionRequests(collection).map((entry) => ({
    folder: entry.folder?.id || null,
    request: entry.request.id
  })), [
    { folder: null, request: 'root' },
    { folder: 'folder', request: 'nested' },
    { folder: 'deep-folder', request: 'deep' }
  ]);
  assert.equal(buildUrlWithQuery({
    url: 'https://api.example.test/search',
    queryParams: [
      { key: 'term', value: 'a b' },
      { key: 'empty', value: '' },
      { key: 'off', value: 'hidden', enabled: false }
    ]
  }), 'https://api.example.test/search?term=a%20b&empty=');
  assert.equal(buildUrlWithQuery({ url: 'https://api.example.test/search?existing=1', queryParams: [{ key: 'next', value: '2' }] }), 'https://api.example.test/search?existing=1&next=2');
  assert.equal(stripQueryFromUrl('https://api.example.test/search?term=a#frag'), 'https://api.example.test/search#frag');
  assert.equal(stripQueryFromUrl('not a url'), 'not a url');
  assert.equal(safeUrlPath('https://api.example.test/a/b?c=1'), '/a/b');
  assert.equal(safeUrlPath('not a url'), '');
});

test('collection format utilities detect content types and JSON-like values', () => {
  assert.equal(contentTypeForRequest({ headers: [{ key: 'Content-Type', value: 'application/problem+json' }] }), 'application/problem+json');
  assert.equal(contentTypeForRequest({ bodyType: BODY_TYPES.RAW_JSON }), 'application/json');
  assert.equal(contentTypeForRequest({ bodyType: BODY_TYPES.RAW_JAVASCRIPT }), 'application/javascript');
  assert.equal(contentTypeForRequest({ bodyType: BODY_TYPES.RAW_HTML }), 'text/html; charset=utf-8');
  assert.equal(contentTypeForRequest({ bodyType: BODY_TYPES.RAW_XML }), 'application/xml');
  assert.equal(contentTypeForRequest({ bodyType: BODY_TYPES.URLENCODED }), 'application/x-www-form-urlencoded');
  assert.equal(contentTypeForRequest({ bodyType: BODY_TYPES.BINARY, postmanBody: { file: { src: '/tmp/data.csv?download=1' } } }), 'text/csv');
  assert.equal(contentTypeForRequest({ bodyType: BODY_TYPES.BINARY, postmanBody: { binary: { src: '/tmp/data.unknown' } } }), 'application/octet-stream');
  assert.equal(looksLikeJson(' [1,2] '), true);
  assert.deepEqual(parseJsonMaybe('{"ok":true}'), { ok: true });
  assert.equal(parseJsonMaybe('{"broken"'), '{"broken"');
  assert.equal(isJsonMime('application/vnd.api+json'), true);
});

test('collection format utilities quote shell tokens and XML safely', () => {
  assert.equal(shellQuote("it's ok"), "'it'\\''s ok'");
  assert.equal(xmlEscape('<tag attr="a&b">'), '&lt;tag attr=&quot;a&amp;b&quot;&gt;');
  assert.equal(xmlUnescape('&lt;tag attr=&quot;a&amp;b&quot;&gt;'), '<tag attr="a&b">');
  assert.equal(stripTrailingSlash('https://api.example.test///'), 'https://api.example.test');
  assert.deepEqual(splitCommandLine(`curl -H "X-Test: a b" 'single quoted' trailing\\`), [
    'curl',
    '-H',
    'X-Test: a b',
    'single quoted',
    'trailing\\'
  ]);
  assert.throws(() => assertImportableCollection({ requests: [], folders: [] }, 'Fixture'), /Fixture does not contain importable requests/);
});

test('markup utilities read XML XPath and HTML selector values safely', () => {
  const xml = '<root><item id="a">One</item><item id="b"><child>Two</child></item></root>';
  assert.equal(readXmlPath(xml, 'string(/root/item[@id="a"])'), 'One');
  assert.equal(readXmlPath(xml, '/root/item/@id'), 'a\nb');
  assert.equal(xmlPathExists(xml, 'count(/root/item) = 2'), true);
  assert.equal(xmlPathExists(xml, '/root/missing'), false);
  assert.throws(() => readXmlPath('<!DOCTYPE root [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><root>&xxe;</root>', '/root'), /DTD or entity declarations/);
  assert.throws(() => readXmlPath('<!DOCTYPE lolz [<!ENTITY lol "lol">]><root>&lol;</root>', '/root'), /DTD or entity declarations/);
  assert.throws(() => readXmlPath('<root>', '/root'), /unclosed xml tag|not valid XML/);
  assert.throws(() => readXmlPath(xml, ''), /requires a path/);

  const html = '<main><section class="card"><h1>Hello <span>World</span></h1></section></main>';
  assert.equal(readHtmlSelector(html, '.card h1'), 'Hello World');
  assert.equal(htmlSelectorExists(html, 'main > section.card'), true);
  assert.equal(readHtmlSelector(html, '.missing'), undefined);
  assert.throws(() => readHtmlSelector(html, ''), /requires a selector/);
});
