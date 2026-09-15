import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { useSocket } from '../contexts/SocketContext';
import { useAlert } from '../hooks/useAlert';
import DailyGoalsModal, { useDailyGoals } from './DailyGoalsModal';
import AlertModal from './AlertModal';

/**
 * Masalar ve Yönetim sayfalarının ortak üst çubuğu.
 * Küçük ekranlarda buton metinleri gizlenir, ikonlar kalır.
 */
const AppHeader = ({ title, subtitle, user, onLogout, onOpenScreensaver, showAdminLink = true, showTablesLink = false }) => {
  const navigate = useNavigate();
  const { darkMode, toggleTheme } = useTheme();
  const { isConnected } = useSocket();
  const [goalsOpen, setGoalsOpen] = useState(false);
  const { goals, reload } = useDailyGoals(Boolean(user));
  const { alertProps, showAlert, confirm } = useAlert();

  const goalsDone = goals.filter((g) => g.done).length;
  const goalsPending = goals.length - goalsDone;

  return (
    <>
      <header className="page-header">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <img src="./logo.png" alt="" className="h-8 w-8 sm:h-10 sm:w-10 object-contain rounded-lg hidden sm:block" onError={(e) => (e.currentTarget.style.display = 'none')} />
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl md:text-2xl font-bold leading-tight truncate">{title}</h1>
            {subtitle && <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 truncate">{subtitle}</p>}
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap justify-end">
          <span
            className={`badge ${isConnected ? 'badge-green' : 'badge-red'} hidden sm:inline-flex`}
            title={isConnected ? 'Sunucuya bağlı' : 'Sunucu bağlantısı yok'}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-red-500'}`} />
            {isConnected ? 'Bağlı' : 'Bağlantı yok'}
          </span>
          {user && (
            <span className="badge badge-gray hidden md:inline-flex max-w-[12rem]" title={`${user.username} · ${user.role}`}>
              👤 <span className="truncate">{user.displayName || user.username}</span>
            </span>
          )}
          {showTablesLink && (
            <button type="button" onClick={() => navigate('/')} className="btn btn-secondary" title="Masalar">
              <span>🍽️</span>
              <span className="hidden sm:inline">Masalar</span>
            </button>
          )}
          {showAdminLink && user?.role === 'yönetici' && (
            <button type="button" onClick={() => navigate('/admin')} className="btn btn-purple" title="Yönetim paneli">
              <span>⚙️</span>
              <span className="hidden sm:inline">Yönetim</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setGoalsOpen(true)}
            className={`btn ${goalsPending > 0 ? 'btn-warning' : 'btn-secondary'}`}
            title="Günlük görevler"
          >
            <span>🎯</span>
            <span className="hidden sm:inline">Günlük Görevler</span>
            {goals.length > 0 && (
              <span className={`badge ${goalsPending > 0 ? 'bg-white/90 text-amber-700' : 'badge-green'} tabular-nums px-1.5`}>
                {goalsDone}/{goals.length}
              </span>
            )}
          </button>
          <button type="button" onClick={onOpenScreensaver} className="btn btn-primary" title="Ekranı kilitle">
            🔒
          </button>
          <button type="button" onClick={toggleTheme} className="btn btn-secondary" title={darkMode ? 'Açık tema' : 'Koyu tema'}>
            {darkMode ? '☀️' : '🌙'}
          </button>
          <button type="button" onClick={onLogout} className="btn btn-danger" title="Çıkış yap">
            <span>⎋</span>
            <span className="hidden sm:inline">Çıkış</span>
          </button>
        </div>
      </header>

      <DailyGoalsModal open={goalsOpen} onClose={() => setGoalsOpen(false)} user={user} goals={goals} reload={reload} showAlert={showAlert} confirm={confirm} />
      <AlertModal {...alertProps} />
    </>
  );
};

export default AppHeader;
