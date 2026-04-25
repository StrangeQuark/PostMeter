const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('postmeter', {
  app: {
    versions: () => ipcRenderer.invoke('app:versions'),
    checkForUpdates: (options) => ipcRenderer.invoke('app:check-updates', options),
    openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
    onMenuAction: (callback) => {
      const allowedStringActions = new Set([
        'new-request',
        'new-collection',
        'new-folder',
        'save-workspace',
        'import-workspace',
        'import-collection',
        'export-workspace',
        'export-collection',
        'check-updates'
      ]);
      const allowedPayloadActions = new Set(['set-prereleases']);
      const listener = (_event, action) => {
        if (typeof action === 'string' && allowedStringActions.has(action)) {
          callback(action);
          return;
        }
        if (action
          && typeof action === 'object'
          && allowedPayloadActions.has(action.type)
          && action.type === 'set-prereleases'
          && typeof action.includePrereleases === 'boolean') {
          callback({
            type: action.type,
            includePrereleases: action.includePrereleases
          });
        }
      };
      ipcRenderer.on('menu:action', listener);
      return () => ipcRenderer.removeListener('menu:action', listener);
    }
  },
  session: {
    load: () => ipcRenderer.invoke('session:load'),
    save: (session) => ipcRenderer.invoke('session:save', session),
    saveSync: (session) => ipcRenderer.sendSync('session:saveSync', session)
  },
  workspace: {
    load: () => ipcRenderer.invoke('workspace:load'),
    save: (workspace) => ipcRenderer.invoke('workspace:save', workspace),
    saveRequest: (payload) => ipcRenderer.invoke('workspace:saveRequest', payload),
    saveEnvironment: (payload) => ipcRenderer.invoke('workspace:saveEnvironment', payload),
    saveSettings: (settings) => ipcRenderer.invoke('workspace:saveSettings', settings),
    saveSync: (workspace) => ipcRenderer.sendSync('workspace:saveSync', workspace),
    create: () => ipcRenderer.invoke('workspace:create'),
    rename: (workspaceId, name) => ipcRenderer.invoke('workspace:rename', workspaceId, name),
    switch: (workspaceId) => ipcRenderer.invoke('workspace:switch', workspaceId),
    delete: (workspaceId) => ipcRenderer.invoke('workspace:delete', workspaceId),
    importWorkspace: () => ipcRenderer.invoke('workspace:import'),
    exportWorkspace: (workspace, workspaceId) => ipcRenderer.invoke('workspace:export', workspace, workspaceId)
  },
  collection: {
    importCollection: () => ipcRenderer.invoke('collection:import'),
    exportCollection: (collection, format) => ipcRenderer.invoke('collection:export', collection, format)
  },
  request: {
    validate: (request, environment) => ipcRenderer.invoke('request:validate', request, environment),
    send: (request, environment) => ipcRenderer.invoke('request:send', request, environment),
    exportExamples: (request) => ipcRenderer.invoke('request:examples:export', request)
  },
  oauth: {
    startPkceFlow: (id, auth, environment, strategy) => ipcRenderer.invoke('oauth:pkce:start', id, auth, environment, strategy),
    startDeviceFlow: (id, auth, environment) => ipcRenderer.invoke('oauth:device:start', id, auth, environment),
    cancelDeviceFlow: (id) => ipcRenderer.invoke('oauth:device:cancel', id),
    cancelFlow: (id) => ipcRenderer.invoke('oauth:cancel', id),
    onProgress: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('oauth:progress', listener);
      return () => ipcRenderer.removeListener('oauth:progress', listener);
    }
  },
  loadTest: {
    start: (id, request, environment, config) => ipcRenderer.invoke('load:start', id, request, environment, config),
    cancel: (id) => ipcRenderer.invoke('load:cancel', id),
    export: (result, format) => ipcRenderer.invoke('load:export', result, format),
    onProgress: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('load:progress', listener);
      return () => ipcRenderer.removeListener('load:progress', listener);
    }
  },
  runner: {
    start: (id, collection, environment, config) => ipcRenderer.invoke('runner:start', id, collection, environment, config),
    cancel: (id) => ipcRenderer.invoke('runner:cancel', id),
    export: (result, format) => ipcRenderer.invoke('runner:export', result, format),
    onProgress: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('runner:progress', listener);
      return () => ipcRenderer.removeListener('runner:progress', listener);
    }
  }
});
