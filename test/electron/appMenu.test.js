const assert = require('node:assert/strict');
const test = require('node:test');
const { createApplicationMenuTemplate } = require('../../electron/appMenu');

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

test('application File and Help menu items dispatch every renderer action', () => {
  const dispatched = [];
  const openedExternalUrls = [];
  const template = createApplicationMenuTemplate({
    platform: 'linux',
    sendMenuAction: (action) => dispatched.push(action),
    openExternal: (url) => openedExternalUrls.push(url)
  });
  const leaves = menuLeaves(template);
  const leavesByPath = new Map(leaves.map((leaf) => [leaf.path, leaf.item]));

  assert.deepEqual(menuLabels(template), ['File', 'Edit', 'View', 'Help']);
  assert.equal(leavesByPath.get('Edit')?.role, 'editMenu');
  assert.equal(leavesByPath.get('View')?.role, 'viewMenu');
  assert.equal(leavesByPath.get('File > Quit')?.role, 'quit');
  assert.equal(leavesByPath.has('File > Save Workspace'), false);
  assert.equal(leavesByPath.has('File > Close'), false);

  for (const [path, action] of new Map([...FILE_ACTIONS, ...HELP_ACTIONS])) {
    const item = leavesByPath.get(path);
    assert.equal(typeof item?.click, 'function', `${path} should be clickable`);
    item.click();
    assert.equal(dispatched.at(-1), action, `${path} should dispatch ${action}`);
  }

  leavesByPath.get('Help > PostMeter Documentation').click();
  leavesByPath.get('Help > Report Issue').click();
  assert.deepEqual(openedExternalUrls, [
    'https://github.com/StrangeQuark/PostMeter#readme',
    'https://github.com/StrangeQuark/PostMeter/issues'
  ]);

  assert.deepEqual(dispatched, [...FILE_ACTIONS.values(), ...HELP_ACTIONS.values()]);
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
  assert.equal(leavesByPath.get('File > Save').accelerator, 'CmdOrCtrl+S');
  assert.equal(leavesByPath.get('File > Settings').accelerator, 'CmdOrCtrl+,');
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
      assert.ok(['editMenu', 'viewMenu', 'quit'].includes(item.role), `${leaf.path} has an unexpected role`);
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
