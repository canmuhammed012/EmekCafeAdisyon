import React, { useState, useEffect, useCallback } from 'react';
import { getCategories, getProducts, getTables, getErrorMessage } from '../services/api';
import { onUpdate, UPDATE_TYPES } from '../services/broadcast';
import { useAlert } from '../hooks/useAlert';
import AppHeader from '../components/AppHeader';
import Footer from '../components/Footer';
import AlertModal from '../components/AlertModal';
import CategoriesTab from './admin/CategoriesTab';
import ProductsTab from './admin/ProductsTab';
import TablesTab from './admin/TablesTab';
import ReportTab from './admin/ReportTab';
import HourlyTab from './admin/HourlyTab';
import UsersTab from './admin/UsersTab';
import SettingsTab from './admin/SettingsTab';

const TABS = [
  { key: 'report', icon: '📊', label: 'Gün Sonu' },
  { key: 'hourly', icon: '📈', label: 'Saatlik Analiz' },
  { key: 'products', icon: '🍰', label: 'Ürünler' },
  { key: 'categories', icon: '🏷️', label: 'Kategoriler' },
  { key: 'tables', icon: '🍽️', label: 'Masalar' },
  { key: 'users', icon: '👥', label: 'Kullanıcılar' },
  { key: 'settings', icon: '⚙️', label: 'Ayarlar' },
];

const Admin = ({ user, onLogout, onOpenScreensaver }) => {
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('adminTab') || 'report');
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [tables, setTables] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const { alertProps, showAlert, confirm } = useAlert();

  const loadCatalog = useCallback(async () => {
    try {
      const [c, p, t] = await Promise.all([getCategories(), getProducts(), getTables()]);
      setCategories([...(c.data || [])].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)));
      setProducts(p.data || []);
      setTables(t.data || []);
    } catch (err) {
      showAlert('Hata', getErrorMessage(err, 'Veriler yüklenemedi'), 'error');
    }
  }, [showAlert]);

  useEffect(() => {
    loadCatalog();
    const unsubscribe = onUpdate((event) => {
      if ([UPDATE_TYPES.CATEGORIES, UPDATE_TYPES.PRODUCTS, UPDATE_TYPES.TABLES, UPDATE_TYPES.ORDERS].includes(event.type)) {
        loadCatalog();
      }
      if (event.type === UPDATE_TYPES.PAYMENTS) setRefreshKey((k) => k + 1);
    });
    return unsubscribe;
  }, [loadCatalog]);

  const selectTab = (key) => {
    setActiveTab(key);
    localStorage.setItem('adminTab', key);
  };

  const common = { showAlert, confirm };

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 flex flex-col gap-3 p-2 sm:p-3">
        <AppHeader title="Yönetim Paneli" subtitle="Ürünler, masalar, raporlar ve ayarlar" user={user} onLogout={onLogout} onOpenScreensaver={onOpenScreensaver} showAdminLink={false} showTablesLink />

        <div className="card overflow-hidden">
          <nav className="flex overflow-x-auto border-b border-gray-200 dark:border-gray-700 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Yönetim sekmeleri">
            {TABS.map((tab) => (
              <button key={tab.key} type="button" onClick={() => selectTab(tab.key)} className={`tab ${activeTab === tab.key ? 'tab-active' : ''}`}>
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>

          <div className="p-3 sm:p-4">
            {activeTab === 'report' && <ReportTab {...common} refreshKey={refreshKey} />}
            {activeTab === 'hourly' && <HourlyTab {...common} refreshKey={refreshKey} />}
            {activeTab === 'products' && <ProductsTab {...common} categories={categories} products={products} reload={loadCatalog} />}
            {activeTab === 'categories' && <CategoriesTab {...common} categories={categories} products={products} reload={loadCatalog} />}
            {activeTab === 'tables' && <TablesTab {...common} tables={tables} reload={loadCatalog} />}
            {activeTab === 'users' && <UsersTab {...common} currentUser={user} />}
            {activeTab === 'settings' && <SettingsTab {...common} />}
          </div>
        </div>
      </div>
      <AlertModal {...alertProps} />
      <Footer />
    </div>
  );
};

export default Admin;
