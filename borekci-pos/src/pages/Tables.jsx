import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { getTables } from '../services/api';
import { onUpdate, UPDATE_TYPES } from '../services/broadcast';
import Footer from '../components/Footer';

const Tables = ({ user, onLogout }) => {
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { darkMode, toggleTheme } = useTheme();

  useEffect(() => {
    const loadTables = async () => {
      try {
        const response = await getTables();
        setTables(response.data || []);
      } catch (error) {
        console.error('Masalar yüklenemedi:', error);
        setTables([]);
      } finally {
        setLoading(false);
      }
    };

    // İlk yükleme
    loadTables();

    // Window focus olduğunda yeniden yükle (kullanıcı başka sayfadan döndüğünde)
    const handleFocus = () => {
      loadTables();
    };

    // Sayfa görünür olduğunda yeniden yükle
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        loadTables();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // BroadcastChannel listener - diğer sayfalardan gelen güncellemeleri dinle
    const unsubscribe = onUpdate((event) => {
      console.log('📥 Broadcast alındı (Tables):', event.type);
      
      if (event.type === UPDATE_TYPES.TABLES || 
          event.type === UPDATE_TYPES.ORDERS || 
          event.type === UPDATE_TYPES.ALL) {
        // Masalar veya siparişler güncellendi - masa durumları değişmiş olabilir
        loadTables();
      }
    });

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      unsubscribe();
    };
  }, []); // Boş dependency - sadece mount'ta çalışır

  const getStatusColor = (status) => {
    switch (status) {
      case 'dolu':
        return 'bg-red-500';
      case 'boş':
        return 'bg-green-500';
      default:
        return 'bg-gray-500';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-xl">Yükleniyor...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex flex-col">
      <div className="flex-1 pt-4">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-4 mx-4 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-2">Masalar</h1>
            <p className="text-lg text-gray-600 dark:text-gray-400">
              Hoş geldiniz {user.role === 'yönetici' ? 'Selahattin CAN 👋' : `${user.username} 👋`}
            </p>
          </div>
          <div className="flex gap-2">
            {user.role === 'yönetici' && (
              <button
                onClick={() => navigate('/admin')}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition"
              >
                Yönetim
              </button>
            )}
            <button
              onClick={toggleTheme}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition"
            >
              {darkMode ? '☀️' : '🌙'}
            </button>
            <button
              onClick={onLogout}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition"
            >
              Çıkış
            </button>
          </div>
        </div>

        {/* Tables Grid */}
        {tables.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 text-center mx-4">
            <p className="text-gray-600 dark:text-gray-400 text-lg">
              Henüz masa eklenmemiş.
            </p>
            {user.role === 'yönetici' && (
              <p className="text-gray-500 dark:text-gray-500 text-sm mt-2">
                Yönetim panelinden masa ekleyebilirsiniz.
              </p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5 mx-4">
            {tables.map((table) => {
              const isDolu = table.status === 'dolu';
              const isBos = table.status === 'boş';
              
              return (
                <div
                  key={table.id}
                  onClick={() => navigate(`/table/${table.id}`)}
                  className={`relative bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 cursor-pointer hover:shadow-2xl transition transform hover:scale-105 overflow-hidden border-4 min-h-[180px] ${
                    isDolu ? 'border-red-500' : isBos ? 'border-green-500' : 'border-gray-400'
                  }`}
                >
                  {/* Degrade Işık Süzmesi */}
                  <div
                    className="absolute inset-0 pointer-events-none opacity-30"
                    style={{
                      background: isDolu 
                        ? 'linear-gradient(to bottom, rgba(239, 68, 68, 0.4) 0%, rgba(239, 68, 68, 0) 100%)'
                        : isBos
                        ? 'linear-gradient(to bottom, rgba(34, 197, 94, 0.4) 0%, rgba(34, 197, 94, 0) 100%)'
                        : 'transparent'
                    }}
                  ></div>
                  
                  {/* İçerik */}
                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-2xl font-bold text-gray-800 dark:text-white">
                        {table.name}
                      </h3>
                      <div className={`w-4 h-4 rounded-full ${getStatusColor(table.status)}`}></div>
                    </div>
                    <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                      {table.total ? table.total.toFixed(2) : '0.00'} ₺
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
};

export default Tables;

