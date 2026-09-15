// Socket.io istemcisi — tek bağlantı, oturum token'ı ile doğrulanır
import { io } from 'socket.io-client';
import { getServerBaseUrl, getAuthToken, AUTH_EXPIRED_EVENT } from './api';

let socketInstance = null;
let currentServerUrl = null;

export function disconnectSocket() {
  if (socketInstance) {
    socketInstance.removeAllListeners();
    socketInstance.disconnect();
    socketInstance = null;
  }
  currentServerUrl = null;
}

/** serverIP değiştiğinde veya giriş sonrası çağrılır */
export function resetSocket() {
  disconnectSocket();
}

/**
 * Socket örneğini döndürür. Bağlantı henüz kurulmamış olsa bile örnek hemen döner;
 * socket.io bağlanmadan önce eklenen dinleyicileri de korur.
 */
export function getSocket() {
  const serverUrl = getServerBaseUrl();
  const token = getAuthToken();

  if (socketInstance && currentServerUrl !== serverUrl) {
    disconnectSocket();
  }
  if (socketInstance) {
    return socketInstance;
  }
  if (!token) {
    return null;
  }

  currentServerUrl = serverUrl;
  socketInstance = io(serverUrl, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    reconnectionAttempts: Infinity,
    timeout: 20000,
  });

  socketInstance.on('connect', () => {
    console.log('✅ Socket bağlandı →', serverUrl);
  });
  socketInstance.on('disconnect', (reason) => {
    console.log('❌ Socket bağlantısı kesildi:', reason);
  });
  socketInstance.on('connect_error', (error) => {
    if (error?.message === 'unauthorized') {
      console.warn('Socket: oturum geçersiz, çıkış yapılıyor');
      disconnectSocket();
      localStorage.removeItem('user');
      window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
      return;
    }
    console.warn('Socket bağlantı hatası:', error?.message);
  });

  return socketInstance;
}
