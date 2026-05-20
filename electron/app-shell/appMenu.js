const { Menu } = require('electron');
const { normalizeKeyboardShortcuts, shortcutForAction } = require('../../src/core/contracts/keyboardShortcuts');

function installApplicationMenu(options = {}) {
  Menu.setApplicationMenu(Menu.buildFromTemplate(createApplicationMenuTemplate(options)));
}

function createApplicationMenuTemplate(options = {}) {
  const {
    appName = 'PostMeter',
    platform = process.platform,
    shortcuts = {},
    sendMenuAction = () => {},
    handleViewMenuAction = () => {},
    openExternal = () => {}
  } = options;
  const normalizedShortcuts = normalizeKeyboardShortcuts(shortcuts);
  const acceleratorFor = (actionId) => electronAcceleratorForShortcut(shortcutForAction(normalizedShortcuts, actionId));
  const actionItem = (label, action, itemOptions = {}) => ({
    label,
    ...itemOptions,
    click: () => sendMenuAction(action)
  });
  const viewActionItem = (label, action, itemOptions = {}) => ({
    label,
    ...itemOptions,
    click: () => handleViewMenuAction(action)
  });
  const roleActionItem = (label, role, actionId, itemOptions = {}) => ({
    label,
    role,
    accelerator: acceleratorFor(actionId),
    ...itemOptions
  });
  const fileEditViewHelpMenus = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New',
          submenu: [
            actionItem('Request', 'new-request', { accelerator: acceleratorFor('new-request') }),
            actionItem('Collection', 'new-collection', { accelerator: acceleratorFor('new-collection') }),
            actionItem('Folder', 'new-folder', { accelerator: acceleratorFor('new-folder') }),
            actionItem('Environment', 'new-environment', { accelerator: acceleratorFor('new-environment') }),
            actionItem('Runner', 'new-runner', { accelerator: acceleratorFor('new-runner') }),
            actionItem('Performance Test', 'new-performance-test', { accelerator: acceleratorFor('new-performance-test') }),
            actionItem('Workspace', 'new-workspace', { accelerator: acceleratorFor('new-workspace') })
          ]
        },
        { type: 'separator' },
        actionItem('Save', 'save-active-tab', { accelerator: acceleratorFor('save-active-tab') }),
        { type: 'separator' },
        {
          label: 'Import',
          submenu: [
            actionItem('Request', 'import-request', { accelerator: acceleratorFor('import-request') }),
            actionItem('Collection', 'import-collection', { accelerator: acceleratorFor('import-collection') }),
            actionItem('Environment', 'import-environment', { accelerator: acceleratorFor('import-environment') }),
            actionItem('Runner', 'import-runner', { accelerator: acceleratorFor('import-runner') }),
            actionItem('Performance Test', 'import-performance-test', { accelerator: acceleratorFor('import-performance-test') }),
            actionItem('Workspace', 'import-workspace', { accelerator: acceleratorFor('import-workspace') })
          ]
        },
        {
          label: 'Export',
          submenu: [
            {
              label: 'Request',
              submenu: [
                actionItem('PostMeter', 'export-request', { accelerator: acceleratorFor('export-request') }),
                actionItem('curl', 'export-request-curl', { accelerator: acceleratorFor('export-request-curl') })
              ]
            },
            {
              label: 'Collection',
              submenu: [
                actionItem('PostMeter', 'export-collection', { accelerator: acceleratorFor('export-collection') }),
                actionItem('Postman', 'export-postman', { accelerator: acceleratorFor('export-postman') }),
                actionItem('OpenAPI', 'export-openapi', { accelerator: acceleratorFor('export-openapi') }),
                actionItem('curl', 'export-curl', { accelerator: acceleratorFor('export-curl') })
              ]
            },
            {
              label: 'Environment',
              submenu: [
                actionItem('PostMeter', 'export-environment', { accelerator: acceleratorFor('export-environment') }),
                actionItem('Postman', 'export-postman-environment', { accelerator: acceleratorFor('export-postman-environment') })
              ]
            },
            actionItem('Runner', 'export-runner-definition', { accelerator: acceleratorFor('export-runner-definition') }),
            actionItem('Performance Test', 'export-performance-test', { accelerator: acceleratorFor('export-performance-test') }),
            actionItem('Workspace', 'export-workspace', { accelerator: acceleratorFor('export-workspace') })
          ]
        },
        { type: 'separator' },
        actionItem('Settings', 'settings', { accelerator: acceleratorFor('settings') }),
        { type: 'separator' },
        roleActionItem('Quit', 'quit', 'quit')
      ]
    },
    {
      label: 'Edit',
      submenu: [
        roleActionItem('Undo', 'undo', 'undo'),
        roleActionItem('Redo', 'redo', 'redo'),
        { type: 'separator' },
        roleActionItem('Cut', 'cut', 'cut'),
        roleActionItem('Copy', 'copy', 'copy'),
        roleActionItem('Paste', 'paste', 'paste'),
        roleActionItem('Paste and Match Style', 'pasteAndMatchStyle', 'paste-and-match-style'),
        roleActionItem('Delete', 'delete', 'delete'),
        { type: 'separator' },
        roleActionItem('Select All', 'selectAll', 'select-all')
      ]
    },
    {
      label: 'View',
      submenu: [
        viewActionItem('Reload', 'reload', { accelerator: acceleratorFor('reload') }),
        viewActionItem('Force Reload', 'force-reload', { accelerator: acceleratorFor('force-reload') }),
        viewActionItem('Toggle Developer Tools', 'toggle-devtools', { accelerator: acceleratorFor('toggle-devtools') }),
        { type: 'separator' },
        viewActionItem('Reset Zoom', 'zoom-reset', { accelerator: acceleratorFor('zoom-reset') }),
        viewActionItem('Zoom In', 'zoom-in', { accelerator: acceleratorFor('zoom-in') }),
        viewActionItem('Zoom Out', 'zoom-out', { accelerator: acceleratorFor('zoom-out') }),
        { type: 'separator' },
        viewActionItem('Toggle Full Screen', 'toggle-fullscreen', { accelerator: acceleratorFor('toggle-fullscreen') })
      ]
    },
    {
      label: 'Help',
      submenu: [
        actionItem('Tutorials', 'tutorials'),
        { type: 'separator' },
        {
          label: 'PostMeter Documentation',
          click: () => openExternal('https://github.com/StrangeQuark/PostMeter#readme')
        },
        {
          label: 'Report Issue',
          click: () => openExternal('https://github.com/StrangeQuark/PostMeter/issues')
        },
        {
          label: 'Export Local Diagnostics...',
          click: () => sendMenuAction('export-diagnostics')
        },
        { type: 'separator' },
        {
          label: 'Check for Updates',
          click: () => sendMenuAction('check-updates')
        }
      ]
    }
  ];

  if (platform !== 'darwin') {
    return fileEditViewHelpMenus;
  }

  return [
    {
      label: appName,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        roleActionItem('Quit', 'quit', 'quit')
      ]
    },
    ...fileEditViewHelpMenus
  ];
}

function electronAcceleratorForShortcut(shortcut) {
  if (!shortcut) {
    return undefined;
  }
  const parts = String(shortcut).split('+').map((part) => part.trim()).filter(Boolean);
  const keyIndex = parts.length - 1;
  if (parts[keyIndex] === 'Minus') {
    parts[keyIndex] = '-';
  }
  return parts.join('+');
}

module.exports = {
  createApplicationMenuTemplate,
  electronAcceleratorForShortcut,
  installApplicationMenu
};
