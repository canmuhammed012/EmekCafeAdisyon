// Sunucudan gelen gerçek zamanlı güncellemeleri tek bir kanalda toplar.
// Tüm veri değişiklikleri API üzerinden yapılır; sunucu ilgili event'i yayınlar.
import { getSocket } from './socket';

export const UPDATE_TYPES = {
  CATEGORIES: 'categories',
  PRODUCTS: 'products',
  TABLES: 'tables',
  ORDERS: 'orders',
  PAYMENTS: 'payments',
  SETTINGS: 'settings',
  GOALS: 'goals',
  ALL: 'all',
};

const EVENT_MAP = {
  categoryCreated: UPDATE_TYPES.CATEGORIES,
  categoryUpdated: UPDATE_TYPES.CATEGORIES,
  categoryDeleted: UPDATE_TYPES.CATEGORIES,
  categoriesSorted: UPDATE_TYPES.CATEGORIES,

  productCreated: UPDATE_TYPES.PRODUCTS,
  productUpdated: UPDATE_TYPES.PRODUCTS,
  productDeleted: UPDATE_TYPES.PRODUCTS,
  productsSorted: UPDATE_TYPES.PRODUCTS,

  tableCreated: UPDATE_TYPES.TABLES,
  tableUpdated: UPDATE_TYPES.TABLES,
  tableDeleted: UPDATE_TYPES.TABLES,

  orderCreated: UPDATE_TYPES.ORDERS,
  orderUpdated: UPDATE_TYPES.ORDERS,
  orderDeleted: UPDATE_TYPES.ORDERS,
  ordersTransferred: UPDATE_TYPES.ORDERS,

  paymentCompleted: UPDATE_TYPES.PAYMENTS,
  settingUpdated: UPDATE_TYPES.SETTINGS,
  goalsUpdated: UPDATE_TYPES.GOALS,
};

/**
 * Sunucu event'lerini dinler. callback({ type, event, data }) çağrılır.
 * Geri dönen fonksiyon dinleyicileri kaldırır.
 */
export function onUpdate(callback) {
  const socket = getSocket();
  if (!socket) return () => {};

  const handlers = Object.entries(EVENT_MAP).map(([event, type]) => {
    const handler = (data) => callback({ type, event, data });
    socket.on(event, handler);
    return { event, handler };
  });

  return () => {
    handlers.forEach(({ event, handler }) => socket.off(event, handler));
  };
}
