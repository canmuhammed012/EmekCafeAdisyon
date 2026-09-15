import React, { useState } from 'react';
import { createCategory, updateCategory, deleteCategory, getErrorMessage } from '../../services/api';
import { borderColorFor } from '../../utils/colors';
import ColorPicker from './ColorPicker';

const EMPTY = { name: '', color: '#3B82F6' };

const CategoriesTab = ({ categories, products, reload, showAlert, confirm }) => {
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setForm(EMPTY);
    setEditingId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editingId) await updateCategory(editingId, form);
      else await createCategory(form);
      reset();
      await reload();
    } catch (err) {
      showAlert('Hata', getErrorMessage(err, 'Kategori kaydedilemedi'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (category) => {
    const count = products.filter((p) => p.categoryId === category.id).length;
    if (count > 0) {
      showAlert('Silinemez', `"${category.name}" kategorisinde ${count} ürün var. Önce ürünleri silin veya başka kategoriye taşıyın.`, 'warning');
      return;
    }
    const ok = await confirm('Kategoriyi sil', `"${category.name}" kategorisi silinecek.`, { confirmText: 'Sil' });
    if (!ok) return;
    try {
      await deleteCategory(category.id);
      if (editingId === category.id) reset();
      await reload();
    } catch (err) {
      showAlert('Hata', getErrorMessage(err, 'Kategori silinemedi'), 'error');
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
      {/* Form */}
      <form onSubmit={handleSubmit} className="card p-4 space-y-3 self-start">
        <h3 className="font-bold">{editingId ? 'Kategoriyi düzenle' : 'Yeni kategori'}</h3>
        <div>
          <label className="label" htmlFor="cat-name">
            Kategori adı
          </label>
          <input id="cat-name" type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" placeholder="örn. Sıcak İçecekler" required autoComplete="off" maxLength={60} />
        </div>
        <div>
          <span className="label">Renk</span>
          <ColorPicker value={form.color} onChange={(color) => setForm({ ...form, color })} allowWhite={false} />
        </div>
        <div className="flex gap-2 pt-1">
          <button type="submit" className="btn btn-primary flex-1" disabled={saving}>
            {editingId ? 'Güncelle' : '+ Ekle'}
          </button>
          {editingId && (
            <button type="button" onClick={reset} className="btn btn-secondary">
              İptal
            </button>
          )}
        </div>
      </form>

      {/* Liste */}
      <div>
        {categories.length === 0 ? (
          <div className="card p-8 text-center text-gray-500">Henüz kategori yok. Soldaki formdan ekleyin.</div>
        ) : (
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(clamp(150px, 16vw, 220px), 1fr))' }}>
            {categories.map((category) => {
              const count = products.filter((p) => p.categoryId === category.id).length;
              return (
                <div key={category.id} className={`card p-3 flex flex-col gap-2 ${editingId === category.id ? 'ring-2 ring-blue-500' : ''}`} style={{ borderLeft: `5px solid ${borderColorFor(category.color)}` }}>
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-bold leading-tight truncate-2">{category.name}</h4>
                    <span className="badge badge-gray tabular-nums flex-shrink-0">{count} ürün</span>
                  </div>
                  <div className="flex gap-1.5 mt-auto">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(category.id);
                        setForm({ name: category.name, color: category.color });
                      }}
                      className="btn btn-sm btn-secondary flex-1"
                    >
                      ✏️ Düzenle
                    </button>
                    <button type="button" onClick={() => handleDelete(category)} className="btn btn-sm btn-danger" title="Sil">
                      🗑
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default CategoriesTab;
