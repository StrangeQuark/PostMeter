const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('postmeter', {
  app: {
    versions: () => ipcRenderer.invoke('app:versions')
  },
  workspace: {
    load: () => ipcRenderer.invoke('workspace:load'),
    save: (workspace) => ipcRenderer.invoke('workspace:save', workspace),
    importWorkspace: () => ipcRenderer.invoke('workspace:import'),
    exportWorkspace: (workspace) => ipcRenderer.invoke('workspace:export', workspace)
  },
  collection: {
    importCollection: () => ipcRenderer.invoke('collection:import'),
    exportCollection: (collection) => ipcRenderer.invoke('collection:export', collection)
  },
  request: {
    validate: (request, environment) => ipcRenderer.invoke('request:validate', request, environment),
    send: (request, environment) => ipcRenderer.invoke('request:send', request, environment)
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
  }
});
