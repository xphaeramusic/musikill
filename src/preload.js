const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('API', {
    // File selection
    selectFiles:     opts  => ipcRenderer.invoke('select-files', opts),
    selectDirectory: ()    => ipcRenderer.invoke('select-directory'),
    saveFile:        opts  => ipcRenderer.invoke('save-file', opts),
    revealFile:      fpath => ipcRenderer.send('reveal-file', fpath),

    // Converter
    getFormats:         ()    => ipcRenderer.invoke('converter:formats'),
    startConversion:    opts  => ipcRenderer.invoke('converter:start', opts),
    onConverterProgress: cb   => {
        ipcRenderer.on('converter:progress', (_, data) => cb(data));
    },

    // Separator
    startSeparation:     opts => ipcRenderer.invoke('separator:start', opts),
    onSeparatorProgress: cb   => {
        ipcRenderer.on('separator:progress', (_, data) => cb(data));
    },

    // Cleanup
    removeListeners: channel => ipcRenderer.removeAllListeners(channel),
});
