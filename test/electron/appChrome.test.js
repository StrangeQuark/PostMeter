const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');

test('Electron shell keeps custom File/Edit/View/Help menus without the default Window menu', async () => {
  const root = path.join(__dirname, '..', '..');
  const mainSource = await fs.readFile(path.join(root, 'electron', 'main.js'), 'utf8');
  const preloadSource = await fs.readFile(path.join(root, 'electron', 'preload.js'), 'utf8');
  const rendererSource = await fs.readFile(path.join(root, 'src', 'renderer', 'renderer.js'), 'utf8');

  assert.match(mainSource, /Menu\.setApplicationMenu\(Menu\.buildFromTemplate\(createApplicationMenuTemplate\(\)\)\)/);
  assert.match(mainSource, /label:\s*'File'/);
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
    assert.match(mainSource, new RegExp(`label:\\s*'${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`));
  }
  assert.match(mainSource, /role:\s*'editMenu'/);
  assert.match(mainSource, /role:\s*'viewMenu'/);
  assert.match(mainSource, /label:\s*'Help'/);
  assert.match(mainSource, /label:\s*'PostMeter Documentation'/);
  assert.match(mainSource, /label:\s*'Report Issue'/);
  assert.match(mainSource, /label:\s*'Prereleases'[\s\S]*type:\s*'checkbox'[\s\S]*label:\s*'Check for Updates'/);
  assert.match(mainSource, /label:\s*'Check for Updates'/);
  assert.doesNotMatch(mainSource, /role:\s*['"]windowMenu['"]/);
  assert.doesNotMatch(mainSource, /label:\s*['"]Window['"]/);
  assert.doesNotMatch(mainSource, /Menu\.setApplicationMenu\(null\)/);
  assert.doesNotMatch(mainSource, /\.removeMenu\(\)/);
  assert.doesNotMatch(mainSource, /\.setMenuBarVisibility\(false\)/);

  assert.match(preloadSource, /onMenuAction/);
  assert.match(preloadSource, /ipcRenderer\.on\('menu:action'/);
  assert.match(preloadSource, /'set-prereleases'/);
  assert.match(preloadSource, /includePrereleases/);
  assert.match(rendererSource, /handleAppMenuAction/);
  assert.match(rendererSource, /setIncludePrereleases/);
});
