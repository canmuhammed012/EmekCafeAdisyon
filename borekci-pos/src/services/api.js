import axios from 'axios';

// API URL - localStorage'dan oku, yoksa localhost kullan
// Garson bilgisayarı admin bilgisayarının IP'sini localStorage'a kaydedebilir
function getApiUrl() {
  // localStorage'dan server IP'yi oku
  const serverIP = localStorage.getItem('serverIP');
  if (serverIP) {
    return `http://${serverIP}:3000/api`;
  }
  // Varsayılan: localhost (admin bilgisayarı)
  return 'http://localhost:3000/api';
}

const API_URL = getApiUrl();

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Her API çağrısında güncel URL'i kullanmak için interceptor ekle
api.interceptors.request.use((config) => {
  // Her istekte güncel API URL'ini kullan
  const currentUrl = getApiUrl();
  config.baseURL = currentUrl;
  return config;
});

// Tables
export const getTables = () => api.get('/tables');
export const createTable = (data) => api.post('/tables', data);
export const updateTable = (id, data) => api.put(`/tables/${id}`, data);
export const deleteTable = (id) => api.delete(`/tables/${id}`);

// Categories
export const getCategories = () => api.get('/categories');
export const createCategory = (data) => api.post('/categories', data);
export const updateCategory = (id, data) => api.put(`/categories/${id}`, data);
export const deleteCategory = (id) => api.delete(`/categories/${id}`);
export const updateCategoriesSort = (sortedIds) => api.put('/categories/sort', { sortedIds });

// Products
export const getProducts = (categoryId) => {
  const url = categoryId ? `/products?categoryId=${categoryId}` : '/products';
  return api.get(url);
};
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
export const getPayments = (date) => {
  const url = date ? `/payments?date=${date}` : '/payments';
  return api.get(url);
};

// Reports
export const getDailyReport = (date) => {
  const url = date ? `/reports/daily?date=${date}` : '/reports/daily';
  return api.get(url);
};

// Settings
export const getSettings = () => api.get('/settings');
export const updateSetting = (key, value) => api.put(`/settings/${key}`, { value });

// Auth
export const login = (credentials) => api.post('/auth/login', credentials);

// Receipt
export const getReceipt = (tableId) => api.get(`/receipt/${tableId}`);

// Server Info
export const getServerInfo = () => api.get('/server/info');

export default api;

