const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');

test('Electron shell keeps custom File/Edit/View/Help menus without the default Window menu', async () => {
  const root = path.join(__dirname, '..', '..');
  const mainSource = await fs.readFile(path.join(root, 'electron', 'main.js'), 'utf8');
  const appMenuSource = await fs.readFile(path.join(root, 'electron', 'appMenu.js'), 'utf8');
  const preloadSource = await fs.readFile(path.join(root, 'electron', 'preload.js'), 'utf8');
  const rendererSource = await fs.readFile(path.join(root, 'src', 'renderer', 'renderer.js'), 'utf8');

  assert.match(mainSource, /refreshApplicationMenu/);
  assert.match(appMenuSource, /Menu\.setApplicationMenu\(Menu\.buildFromTemplate\(createApplicationMenuTemplate\(options\)\)\)/);
  assert.match(appMenuSource, /label:\s*'File'/);
  for (const label of [
    'New Request',
    'New Collection',
    'New Folder',
    'Save Workspace',
    'Import Workspace...',
    'Import Collection...',
    'Export Workspace...',
    'Export Collection...'
  ]) {
    assert.match(appMenuSource, new RegExp(`label:\\s*'${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`));
  }
  assert.match(appMenuSource, /role:\s*'editMenu'/);
  assert.match(appMenuSource, /role:\s*'viewMenu'/);
  assert.match(appMenuSource, /label:\s*'Help'/);
  assert.match(appMenuSource, /label:\s*'PostMeter Documentation'/);
  assert.match(appMenuSource, /label:\s*'Report Issue'/);
  assert.match(appMenuSource, /label:\s*'Prereleases'[\s\S]*type:\s*'checkbox'[\s\S]*label:\s*'Check for Updates'/);
  assert.match(appMenuSource, /label:\s*'Check for Updates'/);
  assert.doesNotMatch(`${mainSource}\n${appMenuSource}`, /role:\s*['"]windowMenu['"]/);
  assert.doesNotMatch(`${mainSource}\n${appMenuSource}`, /label:\s*['"]Window['"]/);
  assert.doesNotMatch(`${mainSource}\n${appMenuSource}`, /Menu\.setApplicationMenu\(null\)/);
  assert.doesNotMatch(`${mainSource}\n${appMenuSource}`, /\.removeMenu\(\)/);
  assert.doesNotMatch(`${mainSource}\n${appMenuSource}`, /\.setMenuBarVisibility\(false\)/);

  assert.match(preloadSource, /onMenuAction/);
  assert.match(preloadSource, /ipcRenderer\.on\('menu:action'/);
  assert.match(preloadSource, /'set-prereleases'/);
  assert.match(preloadSource, /includePrereleases/);
  assert.match(rendererSource, /handleAppMenuAction/);
  assert.match(rendererSource, /setIncludePrereleases/);
});
