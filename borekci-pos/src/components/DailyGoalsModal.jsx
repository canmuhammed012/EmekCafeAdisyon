import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getGoals, saveGoal, updateGoal, deleteGoal, getProducts, getCategories, getErrorMessage } from '../services/api';
import { onUpdate, UPDATE_TYPES } from '../services/broadcast';
import { borderColorFor } from '../utils/colors';

/** Günlük görev verisini ve canlı güncellemeyi sağlar (üst çubuktaki rozet de bunu kullanır) */
export function useDailyGoals(enabled = true) {
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const response = await getGoals();
      setGoals(response.data || []);
    } catch {
      /* sessiz */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    load();
    const unsubscribe = onUpdate((event) => {
      if ([UPDATE_TYPES.GOALS, UPDATE_TYPES.ORDERS, UPDATE_TYPES.PAYMENTS, UPDATE_TYPES.PRODUCTS, UPDATE_TYPES.ALL].includes(event.type)) load();
    });
    const timer = setInterval(load, 60000);
    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, [enabled, load]);

  return { goals, loading, reload: load };
}

const GoalRow = ({ goal, isAdmin, onQuota, onDelete }) => {
  const [editing, setEditing] = useState(false);
  const [quota, setQuota] = useState(String(goal.quota));
  const pct = goal.quota ? Math.min(100, Math.round((goal.sold / goal.quota) * 100)) : 0;
  const color = goal.done ? '#10B981' : pct >= 60 ? '#3B82F6' : '#F59E0B';

  return (
    <li className="rounded-xl border border-gray-200 dark:border-gray-700 p-3" style={{ borderLeft: `5px solid ${borderColorFor(goal.categoryColor || '#3B82F6')}` }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-bold truncate">{goal.productName}</div>
          {goal.categoryName && <div className="text-[11px] text-gray-500 truncate">{goal.categoryName}</div>}
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-xl font-bold tabular-nums leading-none">
            <span className={goal.done ? 'text-emerald-600 dark:text-emerald-400' : ''}>{goal.sold}</span>
            <span className="text-gray-400 text-base"> / {goal.quota}</span>
          </div>
          <div className={`text-xs mt-0.5 font-medium ${goal.done ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
            {goal.done ? '✅ Hedef tamamlandı' : `${goal.remaining} adet daha`}
          </div>
        </div>
      </div>
      <div className="h-2.5 rounded-full bg-gray-100 dark:bg-gray-700 mt-2 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <div className="flex items-center justify-between mt-1.5 text-[11px] text-gray-500 tabular-nums">
        <span>
          Ödenen {goal.paid} · Açık masada {goal.open}
        </span>
        {isAdmin && (
          <div className="flex items-center gap-1">
            {editing ? (
              <form
                className="flex items-center gap-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  onQuota(goal, parseInt(quota, 10));
                  setEditing(false);
                }}
              >
                <input type="number" min="1" className="input w-20 py-1 text-sm" value={quota} onChange={(e) => setQuota(e.target.value)} autoFocus />
                <button type="submit" className="btn btn-sm btn-success px-2">
                  ✓
                </button>
                <button type="button" className="btn btn-sm btn-ghost px-2" onClick={() => setEditing(false)}>
                  ×
                </button>
              </form>
            ) : (
              <>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setEditing(true)}>
                  ✏️ Kota
                </button>
                <button type="button" className="btn btn-sm btn-ghost text-red-600" onClick={() => onDelete(goal)}>
                  🗑
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </li>
  );
};

const DailyGoalsModal = ({ open, onClose, user, goals, reload, showAlert, confirm }) => {
  const isAdmin = user?.role === 'yönetici';
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [productId, setProductId] = useState('');
  const [quota, setQuota] = useState('');
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!open || !isAdmin) return;
    Promise.all([getProducts(), getCategories()])
      .then(([p, c]) => {
        setProducts(p.data || []);
        setCategories([...(c.data || [])].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)));
      })
      .catch(() => {});
  }, [open, isAdmin]);

  const grouped = useMemo(
    () =>
      categories
        .map((c) => ({ ...c, products: products.filter((p) => p.categoryId === c.id && !p.variablePrice) }))
        .filter((c) => c.products.length > 0),
    [categories, products]
  );

  const summary = useMemo(() => {
    const done = goals.filter((g) => g.done).length;
    return { done, total: goals.length };
  }, [goals]);

  if (!open) return null;

  const handleAdd = async (e) => {
    e.preventDefault();
    const pid = parseInt(productId, 10);
    const q = parseInt(quota, 10);
    if (!pid) return showAlert('Eksik', 'Ürün seçin.', 'warning');
    if (!q || q < 1) return showAlert('Eksik', 'Kota en az 1 olmalı.', 'warning');
    setSaving(true);
    try {
      await saveGoal(pid, q);
      setProductId('');
      setQuota('');
      setAdding(false);
      await reload();
    } catch (err) {
      showAlert('Hata', getErrorMessage(err, 'Görev kaydedilemedi'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleQuota = async (goal, q) => {
    if (!q || q < 1) return showAlert('Geçersiz', 'Kota en az 1 olmalı.', 'warning');
    try {
      await updateGoal(goal.id, q);
      await reload();
    } catch (err) {
      showAlert('Hata', getErrorMessage(err, 'Kota güncellenemedi'), 'error');
    }
  };

  const handleDelete = async (goal) => {
    const ok = await confirm('Görevi kaldır', `"${goal.productName}" günlük görevi kaldırılacak.`, { confirmText: 'Kaldır' });
    if (!ok) return;
    try {
      await deleteGoal(goal.id);
      await reload();
    } catch (err) {
      showAlert('Hata', getErrorMessage(err, 'Görev silinemedi'), 'error');
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 className="font-bold text-lg">🎯 Günlük Görevler</h2>
            <p className="text-xs text-gray-500">
              Bugün {summary.done}/{summary.total} hedef tamamlandı · gece 00:00'da sıfırlanır
            </p>
          </div>
          <button type="button" onClick={onClose} className="btn btn-ghost btn-sm text-xl leading-none" aria-label="Kapat">
            ×
          </button>
        </div>
        <div className="modal-body space-y-3">
          {isAdmin && (
            <div className="rounded-xl bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 p-3">
              {adding ? (
                <form onSubmit={handleAdd} className="space-y-2">
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_6rem]">
                    <select className="input" value={productId} onChange={(e) => setProductId(e.target.value)} autoFocus>
                      <option value="">Ürün seçin…</option>
                      {grouped.map((c) => (
                        <optgroup key={c.id} label={c.name}>
                          {c.products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                              {goals.some((g) => g.productId === p.id) ? ' (mevcut)' : ''}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    <input type="number" inputMode="numeric" min="1" className="input" placeholder="Kota" value={quota} onChange={(e) => setQuota(e.target.value)} />
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className="btn btn-secondary" onClick={() => setAdding(false)}>
                      İptal
                    </button>
                    <button type="submit" className="btn btn-primary flex-1" disabled={saving}>
                      Görevi Kaydet
                    </button>
                  </div>
                </form>
              ) : (
                <button type="button" className="btn btn-primary w-full" onClick={() => setAdding(true)}>
                  + Yeni görev (ürün + günlük kota)
                </button>
              )}
            </div>
          )}

          {goals.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <div className="text-4xl mb-2">🎯</div>
              Henüz günlük görev tanımlanmadı.
              {!isAdmin && <div className="text-xs mt-1">Yönetici görev ekleyebilir.</div>}
            </div>
          ) : (
            <ul className="space-y-2">
              {goals.map((g) => (
                <GoalRow key={g.id} goal={g} isAdmin={isAdmin} onQuota={handleQuota} onDelete={handleDelete} />
              ))}
            </ul>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" onClick={onClose} className="btn btn-secondary w-full">
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
};

export default DailyGoalsModal;
