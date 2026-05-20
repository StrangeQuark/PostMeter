const assert = require('node:assert/strict');
const test = require('node:test');
const { createApplicationMenuTemplate, electronAcceleratorForShortcut } = require('../../electron/app-shell/appMenu');

const FILE_ACTIONS = new Map([
  ['File > New > Request', 'new-request'],
  ['File > New > Collection', 'new-collection'],
  ['File > New > Folder', 'new-folder'],
  ['File > New > Environment', 'new-environment'],
  ['File > New > Runner', 'new-runner'],
  ['File > New > Performance Test', 'new-performance-test'],
  ['File > New > Workspace', 'new-workspace'],
  ['File > Save', 'save-active-tab'],
  ['File > Import > Request', 'import-request'],
  ['File > Import > Collection', 'import-collection'],
  ['File > Import > Environment', 'import-environment'],
  ['File > Import > Runner', 'import-runner'],
  ['File > Import > Performance Test', 'import-performance-test'],
  ['File > Import > Workspace', 'import-workspace'],
  ['File > Export > Request > PostMeter', 'export-request'],
  ['File > Export > Request > curl', 'export-request-curl'],
  ['File > Export > Collection > PostMeter', 'export-collection'],
  ['File > Export > Collection > Postman', 'export-postman'],
  ['File > Export > Collection > OpenAPI', 'export-openapi'],
  ['File > Export > Collection > curl', 'export-curl'],
  ['File > Export > Environment > PostMeter', 'export-environment'],
  ['File > Export > Environment > Postman', 'export-postman-environment'],
  ['File > Export > Runner', 'export-runner-definition'],
  ['File > Export > Performance Test', 'export-performance-test'],
  ['File > Export > Workspace', 'export-workspace'],
  ['File > Settings', 'settings']
]);

const HELP_ACTIONS = new Map([
  ['Help > Tutorials', 'tutorials'],
  ['Help > Export Local Diagnostics...', 'export-diagnostics'],
  ['Help > Check for Updates', 'check-updates']
]);

const VIEW_ACTIONS = new Map([
  ['View > Reload', 'reload'],
  ['View > Force Reload', 'force-reload'],
  ['View > Toggle Developer Tools', 'toggle-devtools'],
  ['View > Reset Zoom', 'zoom-reset'],
  ['View > Zoom In', 'zoom-in'],
  ['View > Zoom Out', 'zoom-out'],
  ['View > Toggle Full Screen', 'toggle-fullscreen']
]);

const EDIT_ROLES = new Map([
  ['Edit > Undo', 'undo'],
  ['Edit > Redo', 'redo'],
  ['Edit > Cut', 'cut'],
  ['Edit > Copy', 'copy'],
  ['Edit > Paste', 'paste'],
  ['Edit > Paste and Match Style', 'pasteAndMatchStyle'],
  ['Edit > Delete', 'delete'],
  ['Edit > Select All', 'selectAll']
]);

test('application File and Help menu items dispatch every renderer action', () => {
  const dispatched = [];
  const viewActions = [];
  const openedExternalUrls = [];
  const template = createApplicationMenuTemplate({
    platform: 'linux',
    sendMenuAction: (action) => dispatched.push(action),
    handleViewMenuAction: (action) => viewActions.push(action),
    openExternal: (url) => openedExternalUrls.push(url)
  });
  const leaves = menuLeaves(template);
  const leavesByPath = new Map(leaves.map((leaf) => [leaf.path, leaf.item]));

  assert.deepEqual(menuLabels(template), ['File', 'Edit', 'View', 'Help']);
  assert.equal(leavesByPath.get('File > Quit')?.role, 'quit');
  assert.equal(leavesByPath.has('File > Save Workspace'), false);
  assert.equal(leavesByPath.has('File > Close'), false);

  for (const [path, action] of new Map([...FILE_ACTIONS, ...HELP_ACTIONS])) {
    const item = leavesByPath.get(path);
    assert.equal(typeof item?.click, 'function', `${path} should be clickable`);
    item.click();
    assert.equal(dispatched.at(-1), action, `${path} should dispatch ${action}`);
  }

  for (const [path, action] of VIEW_ACTIONS) {
    const item = leavesByPath.get(path);
    assert.equal(typeof item?.click, 'function', `${path} should be clickable`);
    item.click();
    assert.equal(viewActions.at(-1), action, `${path} should apply ${action}`);
  }

  for (const [path, role] of EDIT_ROLES) {
    assert.equal(leavesByPath.get(path)?.role, role, `${path} should use the native ${role} role`);
  }

  leavesByPath.get('Help > PostMeter Documentation').click();
  leavesByPath.get('Help > Report Issue').click();
  assert.deepEqual(openedExternalUrls, [
    'https://github.com/StrangeQuark/PostMeter#readme',
    'https://github.com/StrangeQuark/PostMeter/issues'
  ]);

  assert.deepEqual(dispatched, [...FILE_ACTIONS.values(), ...HELP_ACTIONS.values()]);
  assert.deepEqual(viewActions, [...VIEW_ACTIONS.values()]);
});

test('application File New Import and Export menus place Workspace last', () => {
  const template = createApplicationMenuTemplate({ platform: 'linux' });
  const fileMenu = submenuWithLabel(template, 'File');

  assert.deepEqual(submenuLabels(submenuWithLabel(fileMenu, 'New')), [
    'Request',
    'Collection',
    'Folder',
    'Environment',
    'Runner',
    'Performance Test',
    'Workspace'
  ]);
  assert.deepEqual(submenuLabels(submenuWithLabel(fileMenu, 'Import')), [
    'Request',
    'Collection',
    'Environment',
    'Runner',
    'Performance Test',
    'Workspace'
  ]);
  assert.deepEqual(submenuLabels(submenuWithLabel(fileMenu, 'Export')), [
    'Request',
    'Collection',
    'Environment',
    'Runner',
    'Performance Test',
    'Workspace'
  ]);
});

test('application menu accelerators stay bound to user-facing actions', () => {
  const template = createApplicationMenuTemplate({ platform: 'linux' });
  const leavesByPath = new Map(menuLeaves(template).map((leaf) => [leaf.path, leaf.item]));

  assert.equal(leavesByPath.get('File > New > Request').accelerator, 'CmdOrCtrl+N');
  assert.equal(leavesByPath.get('File > New > Collection').accelerator, 'CmdOrCtrl+Shift+N');
  assert.equal(leavesByPath.get('File > New > Folder').accelerator, 'CmdOrCtrl+Alt+N');
  assert.equal(leavesByPath.get('File > New > Environment').accelerator, 'CmdOrCtrl+E');
  assert.equal(leavesByPath.get('File > New > Runner').accelerator, 'CmdOrCtrl+T');
  assert.equal(leavesByPath.get('File > New > Performance Test').accelerator, 'CmdOrCtrl+P');
  assert.equal(leavesByPath.get('File > New > Workspace').accelerator, 'CmdOrCtrl+W');
  assert.equal(leavesByPath.get('File > Save').accelerator, 'CmdOrCtrl+S');
  assert.equal(leavesByPath.get('File > Import > Request').accelerator, undefined);
  assert.equal(leavesByPath.get('File > Export > Workspace').accelerator, undefined);
  assert.equal(leavesByPath.get('File > Settings').accelerator, 'CmdOrCtrl+,');
  assert.equal(leavesByPath.get('File > Quit').accelerator, 'CmdOrCtrl+Q');
  assert.equal(leavesByPath.get('Edit > Undo').accelerator, 'CmdOrCtrl+Z');
  assert.equal(leavesByPath.get('Edit > Redo').accelerator, 'CmdOrCtrl+Shift+Z');
  assert.equal(leavesByPath.get('Edit > Cut').accelerator, 'CmdOrCtrl+X');
  assert.equal(leavesByPath.get('Edit > Copy').accelerator, 'CmdOrCtrl+C');
  assert.equal(leavesByPath.get('Edit > Paste').accelerator, 'CmdOrCtrl+V');
  assert.equal(leavesByPath.get('Edit > Paste and Match Style').accelerator, 'CmdOrCtrl+Shift+V');
  assert.equal(leavesByPath.get('Edit > Delete').accelerator, 'Delete');
  assert.equal(leavesByPath.get('Edit > Select All').accelerator, 'CmdOrCtrl+A');
  assert.equal(leavesByPath.get('View > Reload').accelerator, 'CmdOrCtrl+R');
  assert.equal(leavesByPath.get('View > Force Reload').accelerator, 'CmdOrCtrl+Shift+R');
  assert.equal(leavesByPath.get('View > Toggle Developer Tools').accelerator, 'CmdOrCtrl+Shift+I');
  assert.equal(leavesByPath.get('View > Zoom In').accelerator, 'CmdOrCtrl+Plus');
  assert.equal(leavesByPath.get('View > Zoom Out').accelerator, 'CmdOrCtrl+-');
  assert.equal(leavesByPath.get('View > Reset Zoom').accelerator, 'CmdOrCtrl+0');
  assert.equal(leavesByPath.get('View > Toggle Full Screen').accelerator, 'F11');
});

test('application menu translates internal shortcut tokens to Electron accelerators', () => {
  assert.equal(electronAcceleratorForShortcut('CmdOrCtrl+Minus'), 'CmdOrCtrl+-');
  assert.equal(electronAcceleratorForShortcut('CmdOrCtrl+Alt+Minus'), 'CmdOrCtrl+Alt+-');
  assert.equal(electronAcceleratorForShortcut('CmdOrCtrl+Plus'), 'CmdOrCtrl+Plus');
  assert.equal(electronAcceleratorForShortcut('CmdOrCtrl+,'), 'CmdOrCtrl+,');
  assert.equal(electronAcceleratorForShortcut(''), undefined);
});

test('application menu accelerators use customized shortcut settings', () => {
  const template = createApplicationMenuTemplate({
    platform: 'linux',
    shortcuts: {
      'new-request': 'CmdOrCtrl+1',
      'save-active-tab': 'CmdOrCtrl+Shift+S',
      'import-request': 'CmdOrCtrl+Alt+I',
      'export-workspace': 'CmdOrCtrl+Alt+W',
      quit: 'CmdOrCtrl+Shift+Q',
      copy: 'CmdOrCtrl+Shift+C',
      'paste-and-match-style': 'CmdOrCtrl+Alt+V',
      reload: 'CmdOrCtrl+Alt+R',
      'zoom-in': 'CmdOrCtrl+=',
      'zoom-out': 'CmdOrCtrl+Alt+-',
      settings: 'CmdOrCtrl+Alt+,'
    }
  });
  const leavesByPath = new Map(menuLeaves(template).map((leaf) => [leaf.path, leaf.item]));

  assert.equal(leavesByPath.get('File > New > Request').accelerator, 'CmdOrCtrl+1');
  assert.equal(leavesByPath.get('File > Save').accelerator, 'CmdOrCtrl+Shift+S');
  assert.equal(leavesByPath.get('File > Import > Request').accelerator, 'CmdOrCtrl+Alt+I');
  assert.equal(leavesByPath.get('File > Export > Workspace').accelerator, 'CmdOrCtrl+Alt+W');
  assert.equal(leavesByPath.get('File > Settings').accelerator, 'CmdOrCtrl+Alt+,');
  assert.equal(leavesByPath.get('File > Quit').accelerator, 'CmdOrCtrl+Shift+Q');
  assert.equal(leavesByPath.get('Edit > Copy').accelerator, 'CmdOrCtrl+Shift+C');
  assert.equal(leavesByPath.get('Edit > Paste and Match Style').accelerator, 'CmdOrCtrl+Alt+V');
  assert.equal(leavesByPath.get('View > Reload').accelerator, 'CmdOrCtrl+Alt+R');
  assert.equal(leavesByPath.get('View > Zoom In').accelerator, 'CmdOrCtrl+Plus');
  assert.equal(leavesByPath.get('View > Zoom Out').accelerator, 'CmdOrCtrl+Alt+-');
});

test('application menu keeps the macOS app menu while preserving File Edit View Help', () => {
  const template = createApplicationMenuTemplate({ appName: 'PostMeter Test', platform: 'darwin' });
  const labels = menuLabels(template);

  assert.deepEqual(labels, ['PostMeter Test', 'File', 'Edit', 'View', 'Help']);
  const appMenuRoles = template[0].submenu
    .filter((item) => item.role)
    .map((item) => item.role);
  assert.deepEqual(appMenuRoles, ['about', 'services', 'hide', 'hideOthers', 'unhide', 'quit']);
});

test('every custom menu leaf is either actionable, a documented Electron role, or a separator', () => {
  const template = createApplicationMenuTemplate({ platform: 'linux' });
  for (const leaf of menuLeaves(template, { includeSeparators: true })) {
    const item = leaf.item;
    if (item.type === 'separator') {
      continue;
    }
    if (item.role) {
      assert.ok([
        'copy',
        'cut',
        'delete',
        'paste',
        'pasteAndMatchStyle',
        'quit',
        'redo',
        'selectAll',
        'undo'
      ].includes(item.role), `${leaf.path} has an unexpected role`);
      continue;
    }
    assert.equal(typeof item.click, 'function', `${leaf.path} should either click or use an Electron role`);
  }
});

function menuLabels(template) {
  return template.map((item) => item.label || roleLabel(item.role));
}

function submenuWithLabel(items, label) {
  const menu = (items || []).find((item) => item.label === label);
  assert.ok(Array.isArray(menu?.submenu), `${label} should have a submenu`);
  return menu.submenu;
}

function submenuLabels(items) {
  return (items || []).filter((item) => item.type !== 'separator').map((item) => item.label);
}

function menuLeaves(items, options = {}, prefix = []) {
  const leaves = [];
  for (const item of items || []) {
    const label = item.label || roleLabel(item.role) || item.type || 'item';
    const path = [...prefix, label];
    if (Array.isArray(item.submenu)) {
      leaves.push(...menuLeaves(item.submenu, options, path));
    } else if (options.includeSeparators || item.type !== 'separator') {
      leaves.push({ path: path.join(' > '), item });
    }
  }
  return leaves;
}

function roleLabel(role) {
  if (role === 'editMenu') {
    return 'Edit';
  }
  if (role === 'viewMenu') {
    return 'View';
  }
  if (role === 'quit') {
    return 'Quit';
  }
  return role || '';
}
