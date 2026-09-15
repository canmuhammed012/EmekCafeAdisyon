import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getTables, getErrorMessage } from '../services/api';
import { onUpdate, UPDATE_TYPES } from '../services/broadcast';
import { playActionSound } from '../utils/sound';
import { formatCurrency } from '../utils/dateFormatter';
import AppHeader from '../components/AppHeader';
import Footer from '../components/Footer';

const FILTERS = [
  { key: 'all', label: 'Tümü' },
  { key: 'dolu', label: 'Dolu' },
  { key: 'boş', label: 'Boş' },
];

const Tables = ({ user, onLogout, onOpenScreensaver }) => {
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const navigate = useNavigate();

  const loadTables = useCallback(async () => {
    try {
      const response = await getTables();
      setTables(response.data || []);
      setError('');
    } catch (err) {
      setError(getErrorMessage(err, 'Masalar yüklenemedi'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTables();
    const onFocus = () => loadTables();
    window.addEventListener('focus', onFocus);
    const unsubscribe = onUpdate((event) => {
      if ([UPDATE_TYPES.TABLES, UPDATE_TYPES.ORDERS, UPDATE_TYPES.PAYMENTS, UPDATE_TYPES.ALL].includes(event.type)) {
        loadTables();
      }
    });
    // Yedek: bağlantı kopsa bile 30 sn'de bir yenile
    const timer = setInterval(loadTables, 30000);
    return () => {
      window.removeEventListener('focus', onFocus);
      unsubscribe();
      clearInterval(timer);
    };
  }, [loadTables]);

  const stats = useMemo(() => {
    const dolu = tables.filter((t) => t.status === 'dolu');
    return {
      total: tables.length,
      dolu: dolu.length,
      bos: tables.length - dolu.length,
      openAmount: dolu.reduce((sum, t) => sum + (Number(t.total) || 0), 0),
    };
  }, [tables]);

  const visibleTables = useMemo(() => (filter === 'all' ? tables : tables.filter((t) => t.status === filter)), [tables, filter]);

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 flex flex-col gap-3 p-2 sm:p-3">
        <AppHeader
          title="Masalar"
          subtitle={`Hoş geldiniz, ${user.displayName || user.username} 👋`}
          user={user}
          onLogout={onLogout}
          onOpenScreensaver={onOpenScreensaver}
        />

        {/* Özet ve filtre */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 p-1 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={`btn btn-sm ${filter === f.key ? 'btn-primary' : 'btn-ghost'}`}
              >
                {f.label}
                <span className={`ml-1 tabular-nums ${filter === f.key ? 'opacity-80' : 'opacity-60'}`}>
                  {f.key === 'all' ? stats.total : f.key === 'dolu' ? stats.dolu : stats.bos}
                </span>
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="badge badge-red">
              <span className="h-2 w-2 rounded-full bg-red-500" /> {stats.dolu} dolu
            </span>
            <span className="badge badge-green">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> {stats.bos} boş
            </span>
            {stats.openAmount > 0 && <span className="badge badge-blue tabular-nums">Açık hesap: {formatCurrency(stats.openAmount)}</span>}
          </div>
        </div>

        {error && (
          <div className="card px-4 py-3 border-red-200 dark:border-red-800 text-red-700 dark:text-red-200 text-sm flex items-center justify-between gap-3">
            <span>{error}</span>
            <button type="button" className="btn btn-sm btn-danger" onClick={loadTables}>
              Tekrar dene
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-gray-500">Yükleniyor…</div>
        ) : visibleTables.length === 0 ? (
          <div className="card p-8 text-center text-gray-500 dark:text-gray-400">
            <div className="text-4xl mb-2">🍽️</div>
            <p>{tables.length === 0 ? 'Henüz masa eklenmemiş.' : 'Bu filtrede masa yok.'}</p>
            {tables.length === 0 && user.role === 'yönetici' && (
              <button type="button" onClick={() => navigate('/admin')} className="btn btn-purple mt-3">
                Yönetim panelinden masa ekle
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-2 sm:gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(clamp(130px, 14vw, 200px), 1fr))' }}>
            {visibleTables.map((table) => {
              const isDolu = table.status === 'dolu';
              return (
                <button
                  type="button"
                  key={table.id}
                  onClick={() => {
                    playActionSound();
                    navigate(`/table/${table.id}`);
                  }}
                  className={`relative text-left card p-2.5 sm:p-3 min-h-[6.5rem] sm:min-h-[7.5rem] flex flex-col justify-between overflow-hidden transition-all duration-150 hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.98] border-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                    isDolu ? 'border-red-400/80 dark:border-red-500/70' : 'border-emerald-400/80 dark:border-emerald-500/70'
                  }`}
                >
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background: isDolu
                        ? 'linear-gradient(160deg, rgba(239,68,68,0.16), rgba(239,68,68,0) 60%)'
                        : 'linear-gradient(160deg, rgba(16,185,129,0.14), rgba(16,185,129,0) 60%)',
                    }}
                  />
                  <div className="relative flex items-start justify-between gap-1">
                    <h3 className="font-bold text-base sm:text-lg leading-tight truncate-2">{table.name}</h3>
                    <span className={`mt-0.5 h-2.5 w-2.5 rounded-full flex-shrink-0 ${isDolu ? 'bg-red-500' : 'bg-emerald-500'}`} />
                  </div>
                  <div className="relative">
                    <p className={`font-bold tabular-nums text-lg sm:text-xl leading-tight truncate ${isDolu ? 'text-red-600 dark:text-red-300' : 'text-gray-400 dark:text-gray-500'}`}>
                      {formatCurrency(table.total)}
                    </p>
                    <p className={`text-[11px] font-medium ${isDolu ? 'text-red-500/80' : 'text-emerald-600/80 dark:text-emerald-400/80'}`}>{isDolu ? 'Dolu' : 'Boş'}</p>
                  </div>
                </button>
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
