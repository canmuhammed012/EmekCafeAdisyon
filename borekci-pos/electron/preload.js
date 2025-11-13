const { contextBridge, ipcRenderer } = require('electron');

// Electron API'lerini güvenli bir şekilde renderer process'e aç
contextBridge.exposeInMainWorld('electron', {
  // IPC Communication
  ipcRenderer: {
    send: (channel, data) => {
      ipcRenderer.send(channel, data);
    },
    on: (channel, func) => {
      ipcRenderer.on(channel, (event, ...args) => func(event, ...args));
    },
    removeAllListeners: (channel) => {
      ipcRenderer.removeAllListeners(channel);
    }
  },
  
  // App version
  getVersion: () => {
    return ipcRenderer.sendSync('get-version');
  }
});

