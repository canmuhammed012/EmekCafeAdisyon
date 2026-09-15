import React, { useState } from 'react';
import { createTable, updateTable, deleteTable, getErrorMessage } from '../../services/api';
import { formatCurrency } from '../../utils/dateFormatter';

const TablesTab = ({ tables, reload, showAlert, confirm }) => {
  const [name, setName] = useState('');
  const [bulkCount, setBulkCount] = useState('');
  const [editing, setEditing] = useState(null); // { id, name }
  const [saving, setSaving] = useState(false);

  const nextNumber = () => {
    const nums = tables.map((t) => parseInt(String(t.name).replace(/\D/g, ''), 10)).filter((n) => Number.isFinite(n));
    return (nums.length ? Math.max(...nums) : 0) + 1;
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    const value = name.trim() || `Masa ${nextNumber()}`;
    setSaving(true);
    try {
      await createTable({ name: value });
      setName('');
      await reload();
    } catch (err) {
      showAlert('Hata', getErrorMessage(err, 'Masa eklenemedi'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleBulkAdd = async () => {
    const count = parseInt(bulkCount, 10);
    if (!count || count < 1 || count > 100) {
      showAlert('Geçersiz sayı', '1 ile 100 arasında bir sayı girin.', 'warning');
      return;
    }
    const start = nextNumber();
    const ok = await confirm('Toplu masa ekle', `Masa ${start} – Masa ${start + count - 1} arası ${count} masa eklenecek.`, { type: 'info', confirmText: 'Ekle' });
    if (!ok) return;
    setSaving(true);
    try {
      for (let i = 0; i < count; i++) {
        await createTable({ name: `Masa ${start + i}` });
      }
      setBulkCount('');
      await reload();
    } catch (err) {
      showAlert('Hata', getErrorMessage(err, 'Masalar eklenemedi'), 'error');
      await reload();
    } finally {
      setSaving(false);
    }
  };

  const handleRename = async (e) => {
    e.preventDefault();
    if (!editing?.name.trim()) return;
    try {
      await updateTable(editing.id, { name: editing.name.trim() });
      setEditing(null);
      await reload();
    } catch (err) {
      showAlert('Hata', getErrorMessage(err, 'Masa adı değiştirilemedi'), 'error');
    }
  };

  const handleDelete = async (table) => {
    if (table.status === 'dolu') {
      showAlert('Silinemez', `"${table.name}" dolu. Önce hesabı kapatın veya siparişleri taşıyın.`, 'warning');
      return;
    }
    const ok = await confirm('Masayı sil', `"${table.name}" silinecek. Geçmiş ödeme kayıtları raporlarda kalır.`, { confirmText: 'Sil' });
    if (!ok) return;
    try {
      await deleteTable(table.id);
      await reload();
    } catch (err) {
      showAlert('Silinemedi', getErrorMessage(err, 'Masa silinemedi'), 'error');
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <form onSubmit={handleAdd} className="card p-3 flex gap-2 items-end">
          <div className="flex-1">
            <label className="label" htmlFor="table-name">
              Yeni masa
            </label>
            <input id="table-name" type="text" className="input" placeholder={`Boş bırakılırsa: Masa ${nextNumber()}`} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" maxLength={60} />
          </div>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            + Ekle
          </button>
        </form>
        <div className="card p-3 flex gap-2 items-end">
          <div className="flex-1">
            <label className="label" htmlFor="bulk-count">
              Toplu ekle (adet)
            </label>
            <input id="bulk-count" type="number" min="1" max="100" className="input" placeholder="örn. 10" value={bulkCount} onChange={(e) => setBulkCount(e.target.value)} />
          </div>
          <button type="button" onClick={handleBulkAdd} className="btn btn-secondary" disabled={saving}>
            Toplu Ekle
          </button>
        </div>
      </div>

      {tables.length === 0 ? (
        <div className="card p-8 text-center text-gray-500">Henüz masa yok.</div>
      ) : (
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(clamp(130px, 14vw, 180px), 1fr))' }}>
          {tables.map((table) => {
            const isDolu = table.status === 'dolu';
            return (
              <div key={table.id} className={`card p-3 flex flex-col gap-1.5 border-l-4 ${isDolu ? 'border-l-red-500' : 'border-l-emerald-500'}`}>
                {editing?.id === table.id ? (
                  <form onSubmit={handleRename} className="flex gap-1">
                    <input type="text" className="input py-1" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} autoFocus maxLength={60} />
                    <button type="submit" className="btn btn-sm btn-success px-2">
                      ✓
                    </button>
                    <button type="button" onClick={() => setEditing(null)} className="btn btn-sm btn-ghost px-2">
                      ×
                    </button>
                  </form>
                ) : (
                  <h4 className="font-bold truncate">{table.name}</h4>
                )}
                <div className="flex items-center justify-between gap-2">
                  <span className={`badge ${isDolu ? 'badge-red' : 'badge-green'}`}>{isDolu ? 'Dolu' : 'Boş'}</span>
                  <span className="font-bold tabular-nums text-blue-600 dark:text-blue-400 text-sm">{formatCurrency(table.total)}</span>
                </div>
                <div className="flex gap-1.5 mt-auto">
                  <button type="button" onClick={() => setEditing({ id: table.id, name: table.name })} className="btn btn-sm btn-secondary flex-1">
                    ✏️ Ad
                  </button>
                  <button type="button" onClick={() => handleDelete(table)} className="btn btn-sm btn-danger" title="Sil" disabled={isDolu}>
                    🗑
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TablesTab;
