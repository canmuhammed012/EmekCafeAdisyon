// Socket.io ile real-time güncellemeler
// Ağ üzerinden çoklu cihaz desteği

import { getSocket } from './socket';

// Event tipleri
export const UPDATE_TYPES = {
  CATEGORIES: 'categories',
  PRODUCTS: 'products',
  TABLES: 'tables',
  ORDERS: 'orders',
  PAYMENTS: 'payments',
  ALL: 'all' // Tüm verileri yenile
};

// Socket.io event isimleri - Backend'deki broadcast event isimleriyle eşleşmeli
const SOCKET_EVENTS = {
  CATEGORIES: 'categoryUpdated',
  PRODUCTS: 'productUpdated',
  TABLES: 'tableUpdated',
  ORDERS: 'orderUpdated',
  PAYMENT_COMPLETED: 'paymentCompleted', // Backend'de paymentCompleted gönderiliyor
  CATEGORIES_SORTED: 'categoriesSorted',
  PRODUCTS_SORTED: 'productsSorted',
  ALL: 'dataUpdated',
  // Backend'den gelen diğer event'ler
  ORDER_CREATED: 'orderCreated',
  ORDER_UPDATED: 'orderUpdated',
  ORDER_DELETED: 'orderDeleted',
  TABLE_CREATED: 'tableCreated',
  TABLE_UPDATED: 'tableUpdated',
  TABLE_DELETED: 'tableDeleted',
  TABLE_TOTAL_UPDATED: 'tableTotalUpdated',
  CATEGORY_CREATED: 'categoryCreated',
  CATEGORY_UPDATED: 'categoryUpdated',
  CATEGORY_DELETED: 'categoryDeleted',
  PRODUCT_CREATED: 'productCreated',
  PRODUCT_UPDATED: 'productUpdated',
  PRODUCT_DELETED: 'productDeleted'
};

// Event broadcast et (Socket.io üzerinden)
export async function broadcastUpdate(type, data = null) {
  try {
    const socket = await getSocket();
    if (socket && socket.connected) {
      const eventName = SOCKET_EVENTS[type] || SOCKET_EVENTS.ALL;
      socket.emit(eventName, data || {});
      console.log(`📡 Socket emit: ${eventName}`, data);
    } else {
      console.warn('⚠ Socket bağlı değil, broadcast gönderilemedi');
    }
  } catch (error) {
    console.error('❌ Broadcast hatası:', error);
  }
}

// Event listener ekle (Socket.io üzerinden)
export function onUpdate(callback) {
  let socket = null;
  let listeners = [];

  const setupListeners = async () => {
    try {
      socket = await getSocket();
      
      if (!socket) return;

      // Tüm event'leri dinle - Backend'deki tüm broadcast event'lerini dinle
      const eventHandlers = {
        // Kategori event'leri
        [SOCKET_EVENTS.CATEGORY_CREATED]: () => callback({ type: UPDATE_TYPES.CATEGORIES }),
        [SOCKET_EVENTS.CATEGORY_UPDATED]: () => callback({ type: UPDATE_TYPES.CATEGORIES }),
        [SOCKET_EVENTS.CATEGORY_DELETED]: () => callback({ type: UPDATE_TYPES.CATEGORIES }),
        [SOCKET_EVENTS.CATEGORIES_SORTED]: () => callback({ type: UPDATE_TYPES.CATEGORIES }),
        [SOCKET_EVENTS.CATEGORIES]: () => callback({ type: UPDATE_TYPES.CATEGORIES }),
        
        // Ürün event'leri
        [SOCKET_EVENTS.PRODUCT_CREATED]: () => callback({ type: UPDATE_TYPES.PRODUCTS }),
        [SOCKET_EVENTS.PRODUCT_UPDATED]: () => callback({ type: UPDATE_TYPES.PRODUCTS }),
        [SOCKET_EVENTS.PRODUCT_DELETED]: () => callback({ type: UPDATE_TYPES.PRODUCTS }),
        [SOCKET_EVENTS.PRODUCTS_SORTED]: () => callback({ type: UPDATE_TYPES.PRODUCTS }),
        [SOCKET_EVENTS.PRODUCTS]: () => callback({ type: UPDATE_TYPES.PRODUCTS }),
        
        // Masa event'leri
        [SOCKET_EVENTS.TABLE_CREATED]: () => callback({ type: UPDATE_TYPES.TABLES }),
        [SOCKET_EVENTS.TABLE_UPDATED]: () => callback({ type: UPDATE_TYPES.TABLES }),
        [SOCKET_EVENTS.TABLE_DELETED]: () => callback({ type: UPDATE_TYPES.TABLES }),
        [SOCKET_EVENTS.TABLE_TOTAL_UPDATED]: () => callback({ type: UPDATE_TYPES.TABLES }),
        [SOCKET_EVENTS.TABLES]: () => callback({ type: UPDATE_TYPES.TABLES }),
        
        // Sipariş event'leri
        [SOCKET_EVENTS.ORDER_CREATED]: () => callback({ type: UPDATE_TYPES.ORDERS }),
        [SOCKET_EVENTS.ORDER_UPDATED]: () => callback({ type: UPDATE_TYPES.ORDERS }),
        [SOCKET_EVENTS.ORDER_DELETED]: () => callback({ type: UPDATE_TYPES.ORDERS }),
        [SOCKET_EVENTS.ORDERS]: () => callback({ type: UPDATE_TYPES.ORDERS }),
        
        // Ödeme event'leri
        [SOCKET_EVENTS.PAYMENTS]: () => callback({ type: UPDATE_TYPES.PAYMENTS }),
        [SOCKET_EVENTS.PAYMENT_COMPLETED]: () => callback({ type: UPDATE_TYPES.ALL }), // Ödeme tüm verileri etkiler
        
        // Genel event'ler
        [SOCKET_EVENTS.ALL]: () => callback({ type: UPDATE_TYPES.ALL })
      };

      // Event listener'ları ekle
      Object.entries(eventHandlers).forEach(([event, handler]) => {
        socket.on(event, handler);
        listeners.push({ event, handler });
      });

      console.log('✅ Socket event listener\'lar eklendi');
    } catch (error) {
      console.error('❌ Socket listener kurulum hatası:', error);
    }
  };

  setupListeners();

  // Cleanup function
  return () => {
    if (socket) {
      listeners.forEach(({ event, handler }) => {
        socket.off(event, handler);
      });
      listeners = [];
    }
  };
}

