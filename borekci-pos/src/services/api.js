import axios from 'axios';

export const SERVER_PORT = 3000;

/** Kayıtlı sunucu adresi (garson cihazı admin bilgisayarının IP'sini saklar) */
/** Electron dışında (telefon/tablet tarayıcısı) çalışıyor muyuz? */
export const isBrowserMode = () => !window.electron && /^https?:$/.test(window.location.protocol) && !['localhost', '127.0.0.1'].includes(window.location.hostname);

export function getServerBaseUrl() {
  // Tarayıcıdan http://<kasa-ip>:3000 ile açıldıysa sunucu zaten bu adrestir
  if (isBrowserMode()) return window.location.origin;
  const serverIP = localStorage.getItem('serverIP');
  return serverIP ? `http://${serverIP}:${SERVER_PORT}` : `http://localhost:${SERVER_PORT}`;
}

export function getStoredUser() {
  try {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function getAuthToken() {
  return getStoredUser()?.token || null;
}

/** Bu sekmeye özel kimlik: sunucu yayınlarında kendi işlemimizi tanıyıp yeniden indirmeyi atlarız */
export const CLIENT_ID = (() => {
  try {
    let id = sessionStorage.getItem('clientId');
    if (!id) {
      id = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem('clientId', id);
    }
    return id;
  } catch {
    return `c${Math.random().toString(36).slice(2, 12)}`;
  }
})();

/** Oturum düştüğünde uygulamanın giriş ekranına dönmesi için */
export const AUTH_EXPIRED_EVENT = 'emekcafe:auth-expired';

const api = axios.create({
  baseURL: `${getServerBaseUrl()}/api`,
  headers: { 'Content-Type': 'application/json' },
  timeout: 10000,
});

api.interceptors.request.use((config) => {
  config.baseURL = `${getServerBaseUrl()}/api`;
  config.headers = config.headers || {};
  config.headers['X-Client-Id'] = CLIENT_ID;
  const token = getAuthToken();
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const isLoginCall = String(error.config?.url || '').includes('/auth/login');
    if (status === 401 && !isLoginCall && getStoredUser()) {
      localStorage.removeItem('user');
      window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
    }
    return Promise.reject(error);
  }
);

/** Hata nesnesinden kullanıcıya gösterilecek metni üret */
export function getErrorMessage(error, fallback = 'Bir hata oluştu') {
  if (!error) return fallback;
  if (error.response?.data?.error) return error.response.data.error;
  if (error.code === 'ECONNABORTED') return 'Sunucu yanıt vermedi (zaman aşımı)';
  if (error.code === 'ERR_NETWORK') return 'Sunucuya bağlanılamadı. Ağ bağlantısını kontrol edin.';
  return error.message || fallback;
}

// Auth
export const login = (credentials) => api.post('/auth/login', credentials);
export const logout = () => api.post('/auth/logout');
export const me = () => api.get('/auth/me');

// Users
export const getUsers = () => api.get('/users');
export const createUser = (data) => api.post('/users', data);
export const updateUser = (id, data) => api.put(`/users/${id}`, data);
export const changeUserPassword = (id, password) => api.put(`/users/${id}/password`, { password });
export const deleteUser = (id) => api.delete(`/users/${id}`);

// Tables
export const getTables = () => api.get('/tables');
export const getTable = (id) => api.get(`/tables/${id}`);
export const createTable = (data) => api.post('/tables', data);
export const updateTable = (id, data) => api.put(`/tables/${id}`, data);
export const deleteTable = (id) => api.delete(`/tables/${id}`);
export const requestTablePayment = (tableId) => api.post(`/tables/${tableId}/request-payment`);
export const getPaymentRequests = (since = 0) => api.get('/payment-requests', { params: { since } });

// Categories
export const getCategories = () => api.get('/categories');
export const createCategory = (data) => api.post('/categories', data);
export const updateCategory = (id, data) => api.put(`/categories/${id}`, data);
export const deleteCategory = (id) => api.delete(`/categories/${id}`);
export const updateCategoriesSort = (sortedIds) => api.put('/categories/sort', { sortedIds });

// Products
export const getProducts = (categoryId) => api.get('/products', { params: categoryId ? { categoryId } : {} });
export const createProduct = (data) => api.post('/products', data);
export const updateProduct = (id, data) => api.put(`/products/${id}`, data);
export const deleteProduct = (id) => api.delete(`/products/${id}`);
export const updateProductsSort = (categoryId, sortedIds) => api.put('/products/sort', { categoryId, sortedIds });

// Orders
export const getOrders = (tableId) => api.get(`/orders/${tableId}`);
export const createOrder = (data) => api.post('/orders', data);
export const updateOrder = (id, data) => api.put(`/orders/${id}`, data);
export const deleteOrder = (id) => api.delete(`/orders/${id}`);
export const transferOrders = (fromTableId, toTableId) => api.post('/orders/transfer', { fromTableId, toTableId });

// Payments
export const createPayment = (data) => api.post('/payments', data);
export const getPayments = (date) => api.get('/payments', { params: date ? { date } : {} });

// Reports
export const getDailyReport = (date) => api.get('/reports/daily', { params: date ? { date } : {} });
export const getHourlyReport = (date) => api.get('/reports/hourly', { params: date ? { date } : {} });
export const getStaffReport = (date) => api.get('/reports/staff', { params: date ? { date } : {} });

// Daily goals
export const getGoals = () => api.get('/goals');
export const getGoalsHistory = (days = 30) => api.get('/goals/history', { params: { days } });
export const saveGoal = (productId, quota) => api.post('/goals', { productId, quota });
export const updateGoal = (id, quota) => api.put(`/goals/${id}`, { quota });
export const deleteGoal = (id) => api.delete(`/goals/${id}`);

// Settings
export const getSettings = () => api.get('/settings');
export const updateSetting = (key, value) => api.put(`/settings/${key}`, { value });

// Receipt / printers
export const getReceipt = (tableId) => api.get(`/receipt/${tableId}`);
export const getWindowsPrinters = () => api.get('/printers/windows');
export const printTestReceipt = (printerName = null) => api.post('/print/test', printerName ? { printerName } : {});
export const printReceipt = (tableId, printerName = null) =>
  api.post('/print/receipt', printerName ? { tableId, printerName } : { tableId });

// Server info
export const getServerInfo = () => api.get('/server/info');

export default api;
