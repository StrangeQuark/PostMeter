const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  assembleRendererHtml,
  checkIndex,
  readManifest,
  validateRendererSecurityAndAssets
} = require('../../scripts/buildRendererHtml');
const {
  APP_RENDERER_CORE_ASSET_PATHS,
  APP_RENDERER_CSP
} = require('../../electron/app-shell/rendererAssetManifest');

test('renderer HTML builder assembles manifest partials and detects stale index output', async (t) => {
  const fixture = await createHtmlFixture(t, ['head.html', 'body.html'], {
    'head.html': '<!doctype html>\n',
    'body.html': '<body>PostMeter</body>\n'
  });
  assert.equal(assembleRendererHtml(fixture), '<!doctype html>\n<body>PostMeter</body>\n');
  fs.writeFileSync(fixture.indexPath, '<!doctype html>\n<body>Stale</body>\n');

  assert.throws(
    () => checkIndex({ ...fixture, exitOnMismatch: false }),
    /src\/renderer\/index\.html is out of date/
  );
});

test('renderer HTML builder rejects invalid, duplicate, and missing manifest entries', async (t) => {
  const fixture = await createHtmlFixture(t, ['head.html'], { 'head.html': '<head></head>\n' });
  assert.deepEqual(readManifest(fixture), ['head.html']);

  fs.writeFileSync(fixture.manifestPath, JSON.stringify(['head.html', 'head.html']));
  assert.throws(() => readManifest(fixture), /Duplicate renderer HTML partial path/);

  fs.writeFileSync(fixture.manifestPath, JSON.stringify(['../outside.html']));
  assert.throws(() => readManifest(fixture), /Invalid renderer HTML partial path/);

  fs.writeFileSync(fixture.manifestPath, JSON.stringify(['/absolute.html']));
  assert.throws(() => readManifest(fixture), /Invalid renderer HTML partial path/);

  fs.writeFileSync(fixture.manifestPath, JSON.stringify(['missing.html']));
  assert.throws(() => assembleRendererHtml(fixture), /ENOENT/);
});

test('renderer HTML builder validates CSP and core asset manifest changes', () => {
  const validHtml = rendererHtmlWithCoreScripts(APP_RENDERER_CSP, APP_RENDERER_CORE_ASSET_PATHS);
  assert.doesNotThrow(() => validateRendererSecurityAndAssets(validHtml));

  assert.throws(
    () => validateRendererSecurityAndAssets(rendererHtmlWithCoreScripts("default-src 'self'", APP_RENDERER_CORE_ASSET_PATHS)),
    /Content-Security-Policy/
  );
  assert.throws(
    () => validateRendererSecurityAndAssets(rendererHtmlWithCoreScripts(APP_RENDERER_CSP, APP_RENDERER_CORE_ASSET_PATHS.slice(1))),
    /core asset manifest/
  );
  assert.throws(
    () => validateRendererSecurityAndAssets(rendererHtmlWithCoreScripts(APP_RENDERER_CSP, [
      ...APP_RENDERER_CORE_ASSET_PATHS,
      '/src/core/http/unreviewedCoreAsset.js'
    ])),
    /core asset manifest/
  );
});

async function createHtmlFixture(t, manifest, files) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'postmeter-renderer-html-builder-'));
  t.after(async () => fsp.rm(root, { recursive: true, force: true }));
  const htmlRoot = path.join(root, 'html');
  const indexPath = path.join(root, 'index.html');
  const manifestPath = path.join(htmlRoot, 'manifest.json');
  await fsp.mkdir(htmlRoot, { recursive: true });
  await fsp.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  for (const [relativePath, content] of Object.entries(files)) {
    const target = path.join(htmlRoot, relativePath);
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.writeFile(target, content);
  }
  await fsp.writeFile(indexPath, Object.values(files).join(''));
  return { htmlRoot, indexPath, manifestPath };
}

function rendererHtmlWithCoreScripts(csp, coreAssetPaths) {
  const scripts = coreAssetPaths
    .map((assetPath) => `<script src="${assetPath.replace('/src/', '../')}"></script>`)
    .join('\n');
  return [
    '<!doctype html>',
    '<html>',
    '<head>',
    `<meta http-equiv="Content-Security-Policy" content="${csp}">`,
    '</head>',
    '<body>',
    scripts,
    '</body>',
    '</html>'
  ].join('\n');
}
