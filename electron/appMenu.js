const { Menu } = require('electron');

function installApplicationMenu(options = {}) {
  Menu.setApplicationMenu(Menu.buildFromTemplate(createApplicationMenuTemplate(options)));
}

function createApplicationMenuTemplate(options = {}) {
  const {
    appName = 'PostMeter',
    platform = process.platform,
    sendMenuAction = () => {},
    openExternal = () => {}
  } = options;
  const actionItem = (label, action, itemOptions = {}) => ({
    label,
    ...itemOptions,
    click: () => sendMenuAction(action)
  });
  const fileEditViewHelpMenus = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New',
          submenu: [
            actionItem('Workspace', 'new-workspace'),
            actionItem('Request', 'new-request', { accelerator: 'CmdOrCtrl+N' }),
            actionItem('Collection', 'new-collection', { accelerator: 'CmdOrCtrl+Shift+N' }),
            actionItem('Folder', 'new-folder', { accelerator: 'CmdOrCtrl+Alt+N' }),
            actionItem('Environment', 'new-environment'),
            actionItem('Runner', 'new-runner'),
            actionItem('Performance Test', 'new-performance-test')
          ]
        },
        { type: 'separator' },
        {
          label: 'Import',
          submenu: [
            actionItem('Workspace', 'import-workspace'),
            actionItem('Request', 'import-request'),
            actionItem('Collection', 'import-collection'),
            actionItem('Environment', 'import-environment'),
            actionItem('Runner', 'import-runner'),
            actionItem('Performance Test', 'import-performance-test')
          ]
        },
        {
          label: 'Export',
          submenu: [
            actionItem('Workspace', 'export-workspace'),
            {
              label: 'Request',
              submenu: [
                actionItem('PostMeter', 'export-request'),
                actionItem('curl', 'export-request-curl')
              ]
            },
            {
              label: 'Collection',
              submenu: [
                actionItem('PostMeter', 'export-collection'),
                actionItem('Postman', 'export-postman'),
                actionItem('OpenAPI', 'export-openapi'),
                actionItem('curl', 'export-curl')
              ]
            },
            {
              label: 'Environment',
              submenu: [
                actionItem('PostMeter', 'export-environment'),
                actionItem('Postman', 'export-postman-environment')
              ]
            },
            actionItem('Runner', 'export-runner-definition'),
            actionItem('Performance Test', 'export-performance-test')
          ]
        },
        { type: 'separator' },
        actionItem('Settings...', 'settings', { accelerator: 'CmdOrCtrl+,' }),
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    {
      label: 'Help',
      submenu: [
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
        { role: 'quit' }
      ]
    },
    ...fileEditViewHelpMenus
  ];
}

module.exports = {
  createApplicationMenuTemplate,
  installApplicationMenu
};
