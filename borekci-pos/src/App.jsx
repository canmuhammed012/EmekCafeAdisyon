import React, { useState, useEffect, useCallback } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext';
import { SocketProvider } from './contexts/SocketContext';
import { disconnectSocket } from './services/socket';
import { AUTH_EXPIRED_EVENT, getStoredUser, logout as apiLogout, me as apiMe } from './services/api';
import UpdateNotification from './components/UpdateNotification';
import PaymentRequestNotification from './components/PaymentRequestNotification';
import PrintSocketListener from './components/PrintSocketListener';
import GoalCelebration from './components/GoalCelebration';
import Screensaver from './components/Screensaver';
import Login from './pages/Login';
import Tables from './pages/Tables';
import TableDetail from './pages/TableDetail';
import Admin from './pages/Admin';
import './index.css';

function App() {
  const [user, setUser] = useState(() => {
    const saved = getStoredUser();
    // Eski sürümden kalan token'sız oturumlar geçersizdir
    return saved?.token ? saved : null;
  });
  const [showScreensaver, setShowScreensaver] = useState(false);

  const handleLogin = useCallback((userData) => {
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
  }, []);

  const handleLogout = useCallback(() => {
    apiLogout().catch(() => {});
    disconnectSocket();
    localStorage.removeItem('user');
    setUser(null);
  }, []);

  // Sunucu oturumu geçersiz saydığında (401) otomatik çıkış
  useEffect(() => {
    const onExpired = () => {
      disconnectSocket();
      setUser(null);
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  }, []);

  // Açılışta profil bilgisini (görünen ad, rol) sunucudan tazele
  useEffect(() => {
    if (!user?.token) return;
    apiMe()
      .then((r) => {
        if (r.data && (r.data.displayName !== user.displayName || r.data.role !== user.role)) {
          const next = { ...user, ...r.data, token: user.token };
          localStorage.setItem('user', JSON.stringify(next));
          setUser(next);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.token]);

  const openScreensaver = useCallback(() => setShowScreensaver(true), []);
  const closeScreensaver = useCallback(() => setShowScreensaver(false), []);

  const serverKey = user ? `${user.token}@${localStorage.getItem('serverIP') || 'localhost'}` : 'no-socket';

  const routes = (
    <>
      <UpdateNotification />
      {showScreensaver && <Screensaver onDismiss={closeScreensaver} />}
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login onLogin={handleLogin} />} />
        <Route
          path="/"
          element={user ? <Tables user={user} onLogout={handleLogout} onOpenScreensaver={openScreensaver} /> : <Navigate to="/login" replace />}
        />
        <Route path="/table/:id" element={user ? <TableDetail user={user} /> : <Navigate to="/login" replace />} />
        <Route
          path="/admin"
          element={
            user?.role === 'yönetici' ? (
              <Admin user={user} onLogout={handleLogout} onOpenScreensaver={openScreensaver} />
            ) : (
              <Navigate to={user ? '/' : '/login'} replace />
            )
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );

  return (
    <ThemeProvider>
      <Router>
        {user ? (
          <SocketProvider key={serverKey}>
            <PrintSocketListener />
            <PaymentRequestNotification user={user} />
            <GoalCelebration user={user} />
            {routes}
          </SocketProvider>
        ) : (
          routes
        )}
      </Router>
    </ThemeProvider>
  );
}

export default App;
