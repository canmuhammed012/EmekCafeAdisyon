// Socket.io client singleton - tek bir instance
import { io } from 'socket.io-client';

let socketInstance = null;
let isConnecting = false;
let currentServerUrl = null;

// Backend URL'i belirle
function getServerUrl() {
  const serverIP = localStorage.getItem('serverIP');
  if (serverIP) {
    return `http://${serverIP}:3000`;
  }
  return 'http://localhost:3000';
}

export function disconnectSocket() {
  if (socketInstance) {
    socketInstance.removeAllListeners();
    socketInstance.disconnect();
    socketInstance = null;
  }
  isConnecting = false;
  currentServerUrl = null;
}

/** serverIP değiştiğinde veya giriş sonrası çağrılır */
export function resetSocket() {
  disconnectSocket();
}

export async function getSocket() {
  const serverUrl = getServerUrl();

  // Admin IP değiştiyse eski bağlantıyı kapat
  if (socketInstance && currentServerUrl && currentServerUrl !== serverUrl) {
    disconnectSocket();
  }

  if (socketInstance && socketInstance.connected) {
    return socketInstance;
  }

  if (isConnecting) {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (socketInstance && socketInstance.connected) {
          clearInterval(checkInterval);
          resolve(socketInstance);
        }
      }, 100);
      setTimeout(() => clearInterval(checkInterval), 30000);
    });
  }

  isConnecting = true;
  currentServerUrl = serverUrl;

  console.log('📡 Socket bağlantısı başlatılıyor:', serverUrl);

  socketInstance = io(serverUrl, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    reconnectionAttempts: Infinity,
    timeout: 20000,
  });

  socketInstance.on('connect', () => {
    console.log('✅ Socket bağlandı:', socketInstance.id, '→', serverUrl);
    isConnecting = false;
  });

  socketInstance.on('disconnect', (reason) => {
    console.log('❌ Socket bağlantısı kesildi:', reason, '→', serverUrl);
    isConnecting = false;
  });

  socketInstance.on('connect_error', (error) => {
    console.error('❌ Socket bağlantı hatası:', error.message, '→', serverUrl);
    isConnecting = false;
  });

  return socketInstance;
}
