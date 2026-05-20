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
  },

  getDeviceRole: () => ipcRenderer.invoke('get-device-role'),
  setDeviceRole: (role) => ipcRenderer.invoke('set-device-role', role),

  listLocalPrinters: () => ipcRenderer.invoke('list-local-printers'),
  printReceiptLocal: (payload) => ipcRenderer.invoke('print-receipt-local', payload),
});

