const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('guardian', {
  quitToDesktop: () => ipcRenderer.invoke('quit-to-desktop'),
});
