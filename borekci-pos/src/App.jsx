import React, { useState, useEffect, useCallback, useRef } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext';
import { SocketProvider } from './contexts/SocketContext';
import ProtectedRoute from './components/ProtectedRoute';
import UpdateNotification from './components/UpdateNotification';
import PaymentRequestNotification from './components/PaymentRequestNotification';
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
  const ENABLE_AUTO_SCREENSAVER = false; // Otomatik ekran koruyucu devre dışı

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

  // Otomatik ekran koruyucu devre dışı (sadece kilit tuşu ile açılacak)
  useEffect(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }
    // Cleanup: hiçbir timer eklenmediği için sadece clear
    return () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
    };
  }, [user, showScreensaver]);

  // Global keydown listener kaldırıldı - sesler sadece aksiyonlarda çalacak

  const openScreensaver = useCallback(() => {
    // Manuel açıldığında mevcut inaktivite sayacını durdur
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }
    setShowScreensaver(true);
  }, []);

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
        <PaymentRequestNotification user={user} />
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
              element={user ? <Tables user={user} onLogout={handleLogout} onOpenScreensaver={openScreensaver} /> : <Navigate to="/login" replace />} 
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
              element={user?.role === 'yönetici' ? <Admin user={user} onLogout={handleLogout} onOpenScreensaver={openScreensaver} /> : <Navigate to="/login" replace />} 
            />
          </Routes>
        </Router>
      </SocketProvider>
    </ThemeProvider>
  );
}

export default App;

