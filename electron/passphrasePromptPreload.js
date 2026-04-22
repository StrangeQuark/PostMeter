const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('postmeterPassphrasePrompt', {
  submit: (value) => ipcRenderer.invoke('passphrase-prompt:submit', value),
  cancel: () => ipcRenderer.invoke('passphrase-prompt:cancel')
});
