const { contextBridge, ipcRenderer } = require('electron');

// Renderer'a yalnızca ihtiyaç duyulan kanallar açılır (rastgele IPC erişimi yok)
const SEND_CHANNELS = new Set(['install-update', 'set-background-color']);
const RECEIVE_CHANNELS = new Set(['update-available', 'download-progress', 'update-downloaded', 'update-error']);

contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    send: (channel, data) => {
      if (SEND_CHANNELS.has(channel)) ipcRenderer.send(channel, data);
    },
    on: (channel, func) => {
      if (!RECEIVE_CHANNELS.has(channel)) return () => {};
      const listener = (event, ...args) => func(event, ...args);
      ipcRenderer.on(channel, listener);
      return () => ipcRenderer.removeListener(channel, listener);
    },
    removeAllListeners: (channel) => {
      if (RECEIVE_CHANNELS.has(channel)) ipcRenderer.removeAllListeners(channel);
    },
  },

  getVersion: () => ipcRenderer.sendSync('get-version'),
  setBackgroundColor: (color) => ipcRenderer.send('set-background-color', color),

  getDeviceRole: () => ipcRenderer.invoke('get-device-role'),
  setDeviceRole: (role) => ipcRenderer.invoke('set-device-role', role),
  relaunchApp: () => ipcRenderer.invoke('relaunch-app'),
  getPerformanceMode: () => ipcRenderer.invoke('get-performance-mode'),
  getFirewallStatus: () => ipcRenderer.invoke('firewall-status'),
  allowFirewall: () => ipcRenderer.invoke('firewall-allow'),
  setPerformanceMode: (enabled) => ipcRenderer.invoke('set-performance-mode', enabled),

  listLocalPrinters: () => ipcRenderer.invoke('list-local-printers'),
  printReceiptLocal: (payload) => ipcRenderer.invoke('print-receipt-local', payload),
});
