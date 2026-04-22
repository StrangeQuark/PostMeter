const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('postmeterSecretExportPrompt', {
  submit: (value) => ipcRenderer.invoke('secret-export-prompt:submit', value),
  cancel: () => ipcRenderer.invoke('secret-export-prompt:cancel')
});
