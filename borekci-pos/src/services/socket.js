// Socket.io client singleton - tek bir instance
import { io } from 'socket.io-client';

let socketInstance = null;
let isConnecting = false;

// Backend URL'i belirle
// Development: localhost:3000
// Production: Backend'in çalıştığı IP adresi (admin bilgisayarı)
function getServerUrl() {
  // localStorage'dan server IP'yi oku
  const serverIP = localStorage.getItem('serverIP');
  if (serverIP) {
    return `http://${serverIP}:3000`;
  }
  // Varsayılan: localhost (admin bilgisayarı)
  return 'http://localhost:3000';
}

export async function getSocket() {
  // Eğer zaten bağlı bir socket varsa, onu döndür
  if (socketInstance && socketInstance.connected) {
    return socketInstance;
  }

  // Eğer bağlanma işlemi devam ediyorsa, bekle
  if (isConnecting) {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (socketInstance && socketInstance.connected) {
          clearInterval(checkInterval);
          resolve(socketInstance);
        }
      }, 100);
    });
  }

  isConnecting = true;
  const serverUrl = getServerUrl();
  
  console.log('📡 Socket bağlantısı başlatılıyor:', serverUrl);

  socketInstance = io(serverUrl, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5,
    timeout: 20000,
  });

  socketInstance.on('connect', () => {
    console.log('✅ Socket bağlandı:', socketInstance.id);
    isConnecting = false;
  });

  socketInstance.on('disconnect', (reason) => {
    console.log('❌ Socket bağlantısı kesildi:', reason);
    isConnecting = false;
  });

  socketInstance.on('connect_error', (error) => {
    console.error('❌ Socket bağlantı hatası:', error.message);
    isConnecting = false;
  });

  return socketInstance;
}

export function disconnectSocket() {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
    isConnecting = false;
  }
}
