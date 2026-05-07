const { contextBridge, ipcRenderer } = require('electron');

const postmeterApi = {
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
        'export-diagnostics',
        'check-updates'
      ]);
      const allowedPayloadActions = new Set(['set-prereleases', 'set-save-on-force-close']);
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
          return;
        }
        if (action
          && typeof action === 'object'
          && allowedPayloadActions.has(action.type)
          && action.type === 'set-save-on-force-close'
          && typeof action.saveOnForceClose === 'boolean') {
          callback({
            type: action.type,
            saveOnForceClose: action.saveOnForceClose
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
  vault: {
    bindSecret: (key, value) => ipcRenderer.invoke('vault:bind-secret', key, value),
    metadata: () => ipcRenderer.invoke('vault:metadata'),
    onPrompt: (callback) => {
      const listener = (_event, payload) => callback(safeVaultPromptPayload(payload));
      ipcRenderer.on('vault:prompt', listener);
      return () => ipcRenderer.removeListener('vault:prompt', listener);
    },
    resolvePrompt: (promptId, decision) => ipcRenderer.invoke('vault:prompt-response', String(promptId || '').slice(0, 128), safeVaultPromptDecision(decision)),
    reset: () => ipcRenderer.invoke('vault:reset'),
    unsetSecret: (key) => ipcRenderer.invoke('vault:unset-secret', key)
  },
  sandboxPackages: {
    fetch: (specifier, options) => ipcRenderer.invoke('sandbox-package:fetch', specifier, options)
  },
  diagnostics: {
    export: () => ipcRenderer.invoke('diagnostics:export')
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
  },
  performance: {
    start: (id, performanceTest, environment) => ipcRenderer.invoke('performance:start', id, performanceTest, environment),
    cancel: (id) => ipcRenderer.invoke('performance:cancel', id),
    importTest: () => ipcRenderer.invoke('performance:import'),
    exportTest: (performanceTest, format) => ipcRenderer.invoke('performance:export', performanceTest, format),
    exportResult: (result, format) => ipcRenderer.invoke('performance:exportResult', result, format),
    onProgress: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('performance:progress', listener);
      return () => ipcRenderer.removeListener('performance:progress', listener);
    }
  }
};

if (process.isMainFrame === true) {
  contextBridge.exposeInMainWorld('postmeter', postmeterApi);
}

function safeVaultPromptPayload(payload = {}) {
  return {
    collectionId: stringField(payload.collectionId, 256),
    collectionName: stringField(payload.collectionName, 256),
    key: stringField(payload.key, 256),
    operation: stringField(payload.operation, 64),
    promptId: stringField(payload.promptId, 128),
    requestId: stringField(payload.requestId, 256),
    requestName: stringField(payload.requestName, 256),
    workspaceId: stringField(payload.workspaceId, 256),
    workspaceName: stringField(payload.workspaceName, 256)
  };
}

function safeVaultPromptDecision(decision = {}) {
  return {
    granted: decision?.granted === true,
    reset: decision?.reset === true,
    scope: decision?.scope === 'collection' || decision?.scope === 'workspace' ? decision.scope : 'request'
  };
}

function stringField(value, maxLength) {
  return String(value == null ? '' : value).slice(0, maxLength);
}
