const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  saveFile: (data) => ipcRenderer.invoke('save-file', data),
  checkPerlSyntax: (code) => ipcRenderer.invoke('check-perl-syntax', code),
  getModulesForLetter: (letter) => ipcRenderer.invoke('get-modules-for-letter', letter),
  onMenuNewFile: (callback) => ipcRenderer.on('menu-new-file', callback),
  onFileOpened: (callback) => ipcRenderer.on('file-opened', callback),
  onMenuSaveFile: (callback) => ipcRenderer.on('menu-save-file', callback),
  onMenuSaveAsFile: (callback) => ipcRenderer.on('menu-save-as-file', callback)
});