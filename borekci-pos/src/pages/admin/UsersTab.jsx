import React, { useState, useEffect, useCallback } from 'react';
import { getUsers, createUser, updateUser, changeUserPassword, deleteUser, getErrorMessage } from '../../services/api';

const ROLES = [
  { v: 'garson', l: '🧑‍🍳 Garson' },
  { v: 'yönetici', l: '🔑 Yönetici' },
];

const PasswordModal = ({ user, onClose, onSaved, showAlert }) => {
  const [password, setPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [saving, setSaving] = useState(false);
  if (!user) return null;

  const submit = async (e) => {
    e.preventDefault();
    if (password.length < 4) return showAlert('Şifre kısa', 'Şifre en az 4 karakter olmalı.', 'warning');
    if (password !== confirmPw) return showAlert('Eşleşmiyor', 'Şifreler aynı değil.', 'warning');
    setSaving(true);
    try {
      await changeUserPassword(user.id, password);
      onSaved();
    } catch (err) {
      showAlert('Hata', getErrorMessage(err, 'Şifre değiştirilemedi'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal max-w-sm" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="modal-header">
          <h2 className="font-bold">Şifre değiştir · {user.displayName || user.username}</h2>
          <button type="button" onClick={onClose} className="btn btn-ghost btn-sm text-xl leading-none">
            ×
          </button>
        </div>
        <div className="modal-body space-y-3">
          <div>
            <label className="label">Yeni şifre</label>
            <input type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus autoComplete="new-password" />
          </div>
          <div>
            <label className="label">Yeni şifre (tekrar)</label>
            <input type="password" className="input" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} autoComplete="new-password" />
          </div>
          <p className="text-xs text-gray-500">Şifre değişince bu kullanıcının diğer cihazlardaki oturumları kapanır.</p>
        </div>
        <div className="modal-footer">
          <button type="button" onClick={onClose} className="btn btn-secondary">
            İptal
          </button>
          <button type="submit" className="btn btn-primary flex-1" disabled={saving}>
            Kaydet
          </button>
        </div>
      </form>
    </div>
  );
};

const EditModal = ({ user, isSelf, onClose, onSaved, showAlert }) => {
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [role, setRole] = useState(user?.role || 'garson');
  const [saving, setSaving] = useState(false);
  if (!user) return null;

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateUser(user.id, { displayName: displayName.trim(), role });
      onSaved();
    } catch (err) {
      showAlert('Hata', getErrorMessage(err, 'Kullanıcı güncellenemedi'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal max-w-sm" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="modal-header">
          <h2 className="font-bold">Düzenle · {user.username}</h2>
          <button type="button" onClick={onClose} className="btn btn-ghost btn-sm text-xl leading-none">
            ×
          </button>
        </div>
        <div className="modal-body space-y-3">
          <div>
            <label className="label">Görünen ad</label>
            <input type="text" className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={user.username} maxLength={60} autoFocus />
            <p className="text-xs text-gray-500 mt-1">Karşılama metninde, hesap isteklerinde ve üst çubukta bu ad görünür.</p>
          </div>
          <div>
            <span className="label">Rol</span>
            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-gray-100 dark:bg-gray-900">
              {ROLES.map((o) => (
                <button key={o.v} type="button" disabled={isSelf} onClick={() => setRole(o.v)} className={`btn btn-sm ${role === o.v ? 'btn-primary' : 'btn-ghost'}`}>
                  {o.l}
                </button>
              ))}
            </div>
            {isSelf && <p className="text-xs text-gray-500 mt-1">Kendi rolünüzü değiştiremezsiniz.</p>}
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" onClick={onClose} className="btn btn-secondary">
            İptal
          </button>
          <button type="submit" className="btn btn-primary flex-1" disabled={saving}>
            Kaydet
          </button>
        </div>
      </form>
    </div>
  );
};

const UsersTab = ({ currentUser, showAlert, confirm }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ displayName: '', username: '', password: '', role: 'garson' });
  const [saving, setSaving] = useState(false);
  const [pwUser, setPwUser] = useState(null);
  const [editUser, setEditUser] = useState(null);

  const load = useCallback(async () => {
    try {
      const response = await getUsers();
      setUsers(response.data || []);
    } catch (err) {
      showAlert('Hata', getErrorMessage(err, 'Kullanıcılar yüklenemedi'), 'error');
    } finally {
      setLoading(false);
    }
  }, [showAlert]);

  useEffect(() => {
    load();
  }, [load]);

  /** Görünen addan otomatik kullanıcı adı öner: "Ayşe Yılmaz" → "ayse.yilmaz" */
  const suggestUsername = (name) =>
    name
      .toLocaleLowerCase('tr')
      .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
      .replace(/[^a-z0-9]+/g, '.')
      .replace(/^\.+|\.+$/g, '')
      .slice(0, 30);

  const handleCreate = async (e) => {
    e.preventDefault();
    const username = form.username.trim() || suggestUsername(form.displayName);
    if (username.length < 2) return showAlert('Eksik', 'Kullanıcı adı en az 2 karakter olmalı.', 'warning');
    if (form.password.length < 4) return showAlert('Eksik', 'Şifre en az 4 karakter olmalı.', 'warning');
    setSaving(true);
    try {
      await createUser({ username, displayName: form.displayName.trim() || username, password: form.password, role: form.role });
      setForm({ displayName: '', username: '', password: '', role: 'garson' });
      await load();
      showAlert('Eklendi', `"${form.displayName.trim() || username}" kullanıcısı oluşturuldu. Giriş adı: ${username}`, 'success');
    } catch (err) {
      showAlert('Hata', getErrorMessage(err, 'Kullanıcı eklenemedi'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (user) => {
    const ok = await confirm('Kullanıcıyı sil', `"${user.displayName || user.username}" silinecek ve oturumları kapanacak.`, { confirmText: 'Sil' });
    if (!ok) return;
    try {
      await deleteUser(user.id);
      await load();
    } catch (err) {
      showAlert('Silinemedi', getErrorMessage(err, 'Kullanıcı silinemedi'), 'error');
    }
  };

  const hasDefaultNames = users.some((u) => u.username === 'admin' || u.username === 'garson');

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
      <form onSubmit={handleCreate} className="card p-4 space-y-3 self-start">
        <h3 className="font-bold">Yeni kullanıcı</h3>
        <div>
          <label className="label">Ad Soyad (görünen ad)</label>
          <input
            type="text"
            className="input"
            value={form.displayName}
            onChange={(e) => setForm({ ...form, displayName: e.target.value })}
            placeholder="örn. Ayşe Yılmaz"
            autoComplete="off"
            maxLength={60}
          />
        </div>
        <div>
          <label className="label">Giriş adı</label>
          <input
            type="text"
            className="input"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value.replace(/\s/g, '') })}
            placeholder={form.displayName ? suggestUsername(form.displayName) || 'kullanıcı adı' : 'boş bırakılırsa addan üretilir'}
            autoComplete="off"
            autoCapitalize="none"
            maxLength={40}
          />
        </div>
        <div>
          <label className="label">Şifre</label>
          <input type="password" className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" />
        </div>
        <div>
          <span className="label">Rol</span>
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-gray-100 dark:bg-gray-900">
            {ROLES.map((o) => (
              <button key={o.v} type="button" onClick={() => setForm({ ...form, role: o.v })} className={`btn ${form.role === o.v ? 'btn-primary' : 'btn-ghost'}`}>
                {o.l}
              </button>
            ))}
          </div>
        </div>
        <button type="submit" className="btn btn-primary btn-lg w-full" disabled={saving}>
          + Kullanıcı Ekle
        </button>
      </form>

      <div className="space-y-3">
        {hasDefaultNames && (
          <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 text-sm px-3 py-2">
            🔐 Güvenlik için varsayılan hesapların (admin / garson) şifrelerini değiştirdiğinizden emin olun.
          </div>
        )}
        <div className="card overflow-hidden">
          {loading ? (
            <p className="text-center py-8 text-gray-500">Yükleniyor…</p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-700/70">
              {users.map((u) => {
                const isSelf = u.id === currentUser.id;
                return (
                  <li key={u.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold truncate">
                        {u.displayName || u.username}
                        {isSelf && <span className="badge badge-blue ml-2">siz</span>}
                      </div>
                      <div className="text-xs text-gray-500 truncate">
                        giriş adı: <span className="font-mono">{u.username}</span>
                      </div>
                    </div>
                    <span className={`badge ${u.role === 'yönetici' ? 'badge-amber' : 'badge-gray'}`}>{u.role === 'yönetici' ? '🔑 Yönetici' : '🧑‍🍳 Garson'}</span>
                    <div className="flex gap-1.5">
                      <button type="button" onClick={() => setEditUser(u)} className="btn btn-sm btn-secondary" title="Ad / rol düzenle">
                        ✏️ <span className="hidden sm:inline">Düzenle</span>
                      </button>
                      <button type="button" onClick={() => setPwUser(u)} className="btn btn-sm btn-secondary" title="Şifre değiştir">
                        🔑 <span className="hidden sm:inline">Şifre</span>
                      </button>
                      {!isSelf && (
                        <button type="button" onClick={() => handleDelete(u)} className="btn btn-sm btn-danger" title="Sil">
                          🗑
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <PasswordModal
        user={pwUser}
        onClose={() => setPwUser(null)}
        onSaved={() => {
          setPwUser(null);
          showAlert('Kaydedildi', 'Şifre güncellendi.', 'success');
        }}
        showAlert={showAlert}
      />
      <EditModal
        key={editUser?.id || 'none'}
        user={editUser}
        isSelf={editUser?.id === currentUser.id}
        onClose={() => setEditUser(null)}
        onSaved={async () => {
          setEditUser(null);
          await load();
        }}
        showAlert={showAlert}
      />
    </div>
  );
};

export default UsersTab;
