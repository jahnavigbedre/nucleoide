const { ipcRenderer } = require('electron');

// Since contextIsolation is false, we can directly attach to window
window.electronAPI = {
    readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
    saveFile: (data) => ipcRenderer.invoke('save-file', data),
    checkPerlSyntax: (code) => ipcRenderer.invoke('check-perl-syntax', code),
    getModulesForLetter: (letter) => ipcRenderer.invoke('get-modules-for-letter', letter),
    onMenuNewFile: (callback) => ipcRenderer.on('menu-new-file', callback),
    onFileOpened: (callback) => ipcRenderer.on('file-opened', callback),
    onMenuSaveFile: (callback) => ipcRenderer.on('menu-save-file', callback),
    onMenuSaveAsFile: (callback) => ipcRenderer.on('menu-save-as-file', callback)
};