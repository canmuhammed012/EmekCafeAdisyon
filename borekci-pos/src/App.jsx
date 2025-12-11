import React, { useState, useEffect, useCallback, useRef } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext';
import { SocketProvider } from './contexts/SocketContext';
import ProtectedRoute from './components/ProtectedRoute';
import UpdateNotification from './components/UpdateNotification';
import Screensaver from './components/Screensaver';
import Login from './pages/Login';
import Tables from './pages/Tables';
import TableDetail from './pages/TableDetail';
import Menu from './pages/Menu';
import Admin from './pages/Admin';
import './index.css';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showScreensaver, setShowScreensaver] = useState(false);
  const inactivityTimerRef = useRef(null);
  const INACTIVITY_TIMEOUT = 30000; // 30 saniye

  useEffect(() => {
    // Kullanıcı bilgisini localStorage'dan kontrol et
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      try {
        const userData = JSON.parse(savedUser);
        setUser(userData);
      } catch (e) {
        console.error('Kullanıcı verisi yüklenemedi:', e);
      }
    }
    setLoading(false);
  }, []);

  // Ekran koruyucu için inaktivite takibi
  useEffect(() => {
    // Sadece kullanıcı giriş yaptıysa ekran koruyucuyu aktif et
    if (!user) {
      setShowScreensaver(false);
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
      return;
    }

    // Ekran koruyucu açıksa timer'ı durdur
    if (showScreensaver) {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
      return;
    }

    const resetInactivityTimer = () => {
      // Mevcut timer'ı temizle
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }

      // Yeni timer başlat
      inactivityTimerRef.current = setTimeout(() => {
        setShowScreensaver(true);
      }, INACTIVITY_TIMEOUT);
    };

    // İlk timer'ı başlat
    resetInactivityTimer();

    // Tüm etkileşim event'lerini dinle (mousemove hariç - çok hassas)
    const events = ['mousedown', 'keypress', 'scroll', 'touchstart', 'click', 'keydown'];
    events.forEach(event => {
      window.addEventListener(event, resetInactivityTimer, { passive: true });
    });

    // Cleanup
    return () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
      events.forEach(event => {
        window.removeEventListener(event, resetInactivityTimer);
      });
    };
  }, [user, showScreensaver]);

  // Global keydown listener kaldırıldı - sesler sadece aksiyonlarda çalacak

  const handleLogin = useCallback((userData) => {
    setUser(userData);
    localStorage.setItem('user', JSON.stringify(userData));
  }, []);

  const handleLogout = useCallback(() => {
    setUser(null);
    localStorage.removeItem('user');
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-xl">Yükleniyor...</div>
      </div>
    );
  }

  return (
    <ThemeProvider>
      <SocketProvider>
        <UpdateNotification />
        {showScreensaver && (
          <Screensaver onDismiss={() => setShowScreensaver(false)} />
        )}
        <Router>
          <Routes>
            <Route 
              path="/login" 
              element={user ? <Navigate to="/" replace /> : <Login onLogin={handleLogin} />} 
            />
            <Route 
              path="/" 
              element={user ? <Tables user={user} onLogout={handleLogout} /> : <Navigate to="/login" replace />} 
            />
            <Route 
              path="/table/:id" 
              element={user ? <TableDetail user={user} /> : <Navigate to="/login" replace />} 
            />
            <Route 
              path="/menu/:tableId" 
              element={user ? <Menu user={user} /> : <Navigate to="/login" replace />} 
            />
            <Route 
              path="/admin" 
              element={user?.role === 'yönetici' ? <Admin user={user} /> : <Navigate to="/login" replace />} 
            />
          </Routes>
        </Router>
      </SocketProvider>
    </ThemeProvider>
  );
}

export default App;

