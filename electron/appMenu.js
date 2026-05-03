const { Menu } = require('electron');

function installApplicationMenu(options = {}) {
  Menu.setApplicationMenu(Menu.buildFromTemplate(createApplicationMenuTemplate(options)));
}

function createApplicationMenuTemplate(options = {}) {
  const {
    appName = 'PostMeter',
    includePrereleases = false,
    platform = process.platform,
    sendMenuAction = () => {},
    openExternal = () => {}
  } = options;
  const fileEditViewHelpMenus = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Request',
          accelerator: 'CmdOrCtrl+N',
          click: () => sendMenuAction('new-request')
        },
        {
          label: 'New Collection',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => sendMenuAction('new-collection')
        },
        {
          label: 'New Folder',
          accelerator: 'CmdOrCtrl+Alt+N',
          click: () => sendMenuAction('new-folder')
        },
        { type: 'separator' },
        {
          label: 'Save Workspace',
          accelerator: 'CmdOrCtrl+S',
          click: () => sendMenuAction('save-workspace')
        },
        { type: 'separator' },
        {
          label: 'Import Workspace...',
          click: () => sendMenuAction('import-workspace')
        },
        {
          label: 'Import Collection...',
          click: () => sendMenuAction('import-collection')
        },
        { type: 'separator' },
        {
          label: 'Export Workspace...',
          click: () => sendMenuAction('export-workspace')
        },
        {
          label: 'Export Collection...',
          click: () => sendMenuAction('export-collection')
        },
        { type: 'separator' },
        { role: 'close' },
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
          label: 'Prereleases',
          type: 'checkbox',
          checked: includePrereleases === true,
          click: (menuItem) => sendMenuAction({
            type: 'set-prereleases',
            includePrereleases: menuItem.checked === true
          })
        },
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
