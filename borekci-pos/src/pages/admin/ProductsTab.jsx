import React, { useState, useMemo } from 'react';
import { createProduct, updateProduct, deleteProduct, updateCategoriesSort, updateProductsSort, getErrorMessage } from '../../services/api';
import { formatCurrency } from '../../utils/dateFormatter';
import { rgba, borderColorFor, isWhite } from '../../utils/colors';
import ColorPicker from './ColorPicker';

const EMPTY_FORM = { name: '', price: '', categoryId: '', color: '#FFFFFF', variablePrice: false };

// ---------------------------------------------------------------- Ürün formu
const ProductModal = ({ open, initial, categories, onClose, onSaved, showAlert }) => {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    setForm(initial || EMPTY_FORM);
  }, [initial, open]);

  if (!open) return null;
  const isEdit = Boolean(initial?.id);

  const submit = async (e) => {
    e.preventDefault();
    const price = form.variablePrice ? 0 : parseFloat(String(form.price).replace(',', '.'));
    if (!form.name.trim() || !Number.isFinite(price) || price < 0 || !form.categoryId) {
      showAlert('Eksik bilgi', form.variablePrice ? 'Ürün adı ve kategori gerekli.' : 'Ürün adı, geçerli bir fiyat ve kategori gerekli.', 'warning');
      return;
    }
    setSaving(true);
    try {
      const payload = { name: form.name.trim(), price, categoryId: Number(form.categoryId), color: form.color || '#FFFFFF', variablePrice: Boolean(form.variablePrice) };
      if (isEdit) await updateProduct(initial.id, payload);
      else await createProduct(payload);
      onSaved();
    } catch (err) {
      showAlert('Hata', getErrorMessage(err, 'Ürün kaydedilemedi'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal max-w-2xl" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="modal-header">
          <h2 className="font-bold text-lg">{isEdit ? 'Ürünü düzenle' : 'Yeni ürün'}</h2>
          <button type="button" onClick={onClose} className="btn btn-ghost btn-sm text-xl leading-none">
            ×
          </button>
        </div>
        <div className="modal-body space-y-4">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
            <div>
              <label className="label" htmlFor="p-name">
                Ürün adı
              </label>
              <input id="p-name" type="text" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="örn. Türk Kahvesi" autoComplete="off" maxLength={80} autoFocus />
            </div>
            <div>
              <label className="label" htmlFor="p-price">
                Fiyat (₺)
              </label>
              <input id="p-price" type="number" inputMode="decimal" step="0.01" min="0" className="input tabular-nums" value={form.variablePrice ? '' : form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder={form.variablePrice ? 'Elle girilir' : '0.00'} autoComplete="off" disabled={form.variablePrice} />
            </div>
          </div>

          <label className="flex items-start gap-2 rounded-xl border border-gray-200 dark:border-gray-700 p-3 cursor-pointer">
            <input type="checkbox" className="mt-0.5 h-5 w-5 accent-blue-600" checked={Boolean(form.variablePrice)} onChange={(e) => setForm({ ...form, variablePrice: e.target.checked })} />
            <span>
              <span className="font-semibold text-sm">⚖️ Tutar elle girilir (tartılı ürün)</span>
              <span className="block text-xs text-gray-500">Örn. Tartılan Börek: masa ekranında tıklanınca rakam klavyesi açılır, tutarı kasiyer/garson girer. Sabit fiyat kullanılmaz.</span>
            </span>
          </label>

          <div>
            <span className="label">Kategori</span>
            {categories.length === 0 ? (
              <p className="text-sm text-amber-600">Önce Kategoriler sekmesinden kategori ekleyin.</p>
            ) : (
              <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(clamp(110px, 12vw, 160px), 1fr))' }}>
                {categories.map((c) => {
                  const selected = Number(form.categoryId) === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setForm({ ...form, categoryId: c.id })}
                      className={`rounded-xl px-2.5 py-2 text-sm font-semibold text-left transition truncate ${
                        selected ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/30' : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                      style={{ borderLeft: `4px solid ${borderColorFor(c.color)}` }}
                    >
                      {c.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <span className="label">Ürün rengi (isteğe bağlı)</span>
            <p className="text-xs text-gray-500 mb-2">Beyaz seçilirse ürün kategori rengini kullanır.</p>
            <ColorPicker value={form.color} onChange={(color) => setForm({ ...form, color })} />
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" onClick={onClose} className="btn btn-secondary">
            İptal
          </button>
          <button type="submit" className="btn btn-success flex-1" disabled={saving}>
            {isEdit ? 'Güncelle' : 'Kaydet'}
          </button>
        </div>
      </form>
    </div>
  );
};

// ---------------------------------------------------------------- Sıralama
const move = (arr, from, to) => {
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};

const SortableList = ({ items, onReorder, renderLabel, accent }) => {
  const [dragIndex, setDragIndex] = useState(null);
  return (
    <ul className="space-y-1.5">
      {items.map((item, index) => (
        <li
          key={item.id}
          draggable
          onDragStart={() => setDragIndex(index)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            if (dragIndex !== null && dragIndex !== index) onReorder(move(items, dragIndex, index));
            setDragIndex(null);
          }}
          onDragEnd={() => setDragIndex(null)}
          className={`flex items-center gap-2 rounded-xl bg-gray-100 dark:bg-gray-700 px-2 py-1.5 cursor-move ${dragIndex === index ? 'opacity-50' : ''}`}
          style={accent ? { borderLeft: `4px solid ${accent(item)}` } : undefined}
        >
          <span className="text-gray-400 select-none">☰</span>
          <span className="flex-1 min-w-0 truncate font-medium text-sm">{renderLabel(item)}</span>
          <div className="flex gap-1">
            <button type="button" className="btn btn-ghost btn-sm px-1.5" disabled={index === 0} onClick={() => onReorder(move(items, index, index - 1))} title="Yukarı">
              ▲
            </button>
            <button type="button" className="btn btn-ghost btn-sm px-1.5" disabled={index === items.length - 1} onClick={() => onReorder(move(items, index, index + 1))} title="Aşağı">
              ▼
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
};

const SortModal = ({ open, categories, products, onClose, onSaved, showAlert }) => {
  const [mode, setMode] = useState('categories');
  const [catOrder, setCatOrder] = useState([]);
  const [prodOrder, setProdOrder] = useState({});
  const [activeCat, setActiveCat] = useState(null);
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (!open) return;
    setMode('categories');
    setCatOrder(categories);
    const byCat = {};
    categories.forEach((c) => {
      byCat[c.id] = products.filter((p) => p.categoryId === c.id).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    });
    setProdOrder(byCat);
    setActiveCat(categories[0]?.id ?? null);
  }, [open, categories, products]);

  if (!open) return null;

  const save = async () => {
    setSaving(true);
    try {
      if (mode === 'categories') {
        await updateCategoriesSort(catOrder.map((c) => c.id));
      } else {
        await Promise.all(Object.entries(prodOrder).filter(([, list]) => list.length > 0).map(([catId, list]) => updateProductsSort(Number(catId), list.map((p) => p.id))));
      }
      onSaved();
    } catch (err) {
      showAlert('Hata', getErrorMessage(err, 'Sıralama kaydedilemedi'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal max-w-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="font-bold text-lg">Sıralamayı düzenle</h2>
          <div className="flex gap-1 p-1 rounded-xl bg-gray-100 dark:bg-gray-900">
            <button type="button" onClick={() => setMode('categories')} className={`btn btn-sm ${mode === 'categories' ? 'btn-primary' : 'btn-ghost'}`}>
              Kategoriler
            </button>
            <button type="button" onClick={() => setMode('products')} className={`btn btn-sm ${mode === 'products' ? 'btn-primary' : 'btn-ghost'}`}>
              Ürünler
            </button>
          </div>
        </div>
        <div className="modal-body">
          <p className="text-xs text-gray-500 mb-3">Sürükleyip bırakın veya ▲▼ oklarını kullanın. Bu sıra masa ekranındaki sırayı belirler.</p>
          {mode === 'categories' ? (
            <SortableList items={catOrder} onReorder={setCatOrder} renderLabel={(c) => c.name} accent={(c) => borderColorFor(c.color)} />
          ) : (
            <div className="grid gap-3 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)]">
              <div className="flex sm:flex-col gap-1 overflow-x-auto sm:overflow-visible">
                {categories.map((c) => (
                  <button key={c.id} type="button" onClick={() => setActiveCat(c.id)} className={`btn btn-sm justify-start whitespace-nowrap ${activeCat === c.id ? 'btn-primary' : 'btn-secondary'}`}>
                    {c.name} <span className="opacity-60 tabular-nums">({prodOrder[c.id]?.length || 0})</span>
                  </button>
                ))}
              </div>
              <div>
                {activeCat && (prodOrder[activeCat]?.length || 0) > 0 ? (
                  <SortableList items={prodOrder[activeCat]} onReorder={(list) => setProdOrder({ ...prodOrder, [activeCat]: list })} renderLabel={(p) => `${p.name} · ${p.variablePrice ? 'tutar elle' : formatCurrency(p.price)}`} />
                ) : (
                  <p className="text-sm text-gray-500 p-4 text-center">Bu kategoride ürün yok</p>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" onClick={onClose} className="btn btn-secondary">
            İptal
          </button>
          <button type="button" onClick={save} className="btn btn-success flex-1" disabled={saving}>
            {saving ? 'Kaydediliyor…' : 'Sıralamayı Kaydet'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- Sekme
const ProductsTab = ({ categories, products, reload, showAlert, confirm }) => {
  const [modal, setModal] = useState({ open: false, initial: null });
  const [sortOpen, setSortOpen] = useState(false);
  const [expanded, setExpanded] = useState(() => new Set());
  const [search, setSearch] = useState('');

  const query = search.trim().toLocaleLowerCase('tr');
  const filtered = useMemo(() => (query ? products.filter((p) => p.name.toLocaleLowerCase('tr').includes(query)) : products), [products, query]);

  const toggle = (id) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleDelete = async (product) => {
    const ok = await confirm('Ürünü sil', `"${product.name}" silinecek.`, { confirmText: 'Sil' });
    if (!ok) return;
    try {
      await deleteProduct(product.id);
      await reload();
    } catch (err) {
      showAlert('Silinemedi', getErrorMessage(err, 'Ürün silinemedi'), 'error');
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input type="search" className="input max-w-xs" placeholder="Ürün ara…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <span className="text-xs text-gray-500 tabular-nums">{products.length} ürün · {categories.length} kategori</span>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={() => setSortOpen(true)} className="btn btn-purple" disabled={categories.length === 0}>
            ↕️ <span className="hidden sm:inline">Sıralamayı Düzenle</span>
            <span className="sm:hidden">Sırala</span>
          </button>
          <button type="button" onClick={() => setModal({ open: true, initial: null })} className="btn btn-success" disabled={categories.length === 0}>
            + Yeni Ürün
          </button>
        </div>
      </div>

      {categories.length === 0 && <div className="card p-8 text-center text-gray-500">Önce Kategoriler sekmesinden kategori ekleyin.</div>}

      {/* Kategorisi silinmiş ürünler (eski verilerde olabilir) — düzenleyip bir kategoriye taşınabilir */}
      {(() => {
        const orphans = filtered.filter((p) => !categories.some((c) => c.id === p.categoryId));
        if (orphans.length === 0) return null;
        return (
          <div className="card overflow-hidden border-amber-300 dark:border-amber-700">
            <div className="px-3 py-2.5 flex items-center justify-between gap-3 bg-amber-50 dark:bg-amber-900/20">
              <div>
                <h3 className="font-bold">⚠️ Kategorisi silinmiş ürünler</h3>
                <p className="text-xs text-amber-700 dark:text-amber-300">Bu ürünler masa ekranında görünmez. "Düzenle" ile bir kategoriye taşıyın veya silin.</p>
              </div>
              <span className="badge badge-amber tabular-nums">{orphans.length} ürün</span>
            </div>
            <div className="p-2.5 grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(clamp(140px, 15vw, 200px), 1fr))' }}>
              {orphans.map((product) => (
                <div key={product.id} className="rounded-xl border border-gray-200 dark:border-gray-700 p-2.5 flex flex-col gap-1.5 bg-white dark:bg-gray-700/60">
                  <h4 className="font-semibold leading-tight truncate-2 text-sm">{product.name}</h4>
                  <p className="font-bold tabular-nums">{product.variablePrice ? <span className="badge badge-amber">⚖️ Tutar elle</span> : formatCurrency(product.price)}</p>
                  <div className="flex gap-1.5 mt-auto">
                    <button type="button" onClick={() => setModal({ open: true, initial: { id: product.id, name: product.name, price: product.price, categoryId: '', color: product.color || '#FFFFFF', variablePrice: Boolean(product.variablePrice) } })} className="btn btn-sm btn-secondary flex-1">
                      ✏️ Taşı
                    </button>
                    <button type="button" onClick={() => handleDelete(product)} className="btn btn-sm btn-danger" title="Sil">
                      🗑
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      <div className="space-y-2">
        {categories.map((category) => {
          const list = filtered.filter((p) => p.categoryId === category.id);
          if (query && list.length === 0) return null;
          const isOpen = query ? true : expanded.has(category.id);
          return (
            <div key={category.id} className="card overflow-hidden">
              <button type="button" onClick={() => toggle(category.id)} className="w-full flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition text-left" style={{ borderLeft: `5px solid ${borderColorFor(category.color)}` }}>
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`text-gray-400 transition-transform ${isOpen ? 'rotate-90' : ''}`}>▶</span>
                  <h3 className="font-bold truncate">{category.name}</h3>
                </div>
                <span className="badge badge-gray tabular-nums">{list.length} ürün</span>
              </button>
              {isOpen && (
                <div className="border-t border-gray-200 dark:border-gray-700 p-2.5">
                  {list.length === 0 ? (
                    <p className="text-center text-sm text-gray-500 py-4">Bu kategoride henüz ürün yok</p>
                  ) : (
                    <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(clamp(140px, 15vw, 200px), 1fr))' }}>
                      {list.map((product) => {
                        const color = product.color && !isWhite(product.color) ? product.color : category.color;
                        return (
                          <div key={product.id} className="rounded-xl border p-2.5 flex flex-col gap-1.5 bg-white dark:bg-gray-700/60" style={{ borderColor: borderColorFor(color, '#D1D5DB'), background: `linear-gradient(160deg, ${rgba(color, 0.18)}, transparent 70%)` }}>
                            <h4 className="font-semibold leading-tight truncate-2 text-sm">{product.name}</h4>
                            <p className="font-bold tabular-nums">{product.variablePrice ? <span className="badge badge-amber">⚖️ Tutar elle</span> : formatCurrency(product.price)}</p>
                            <div className="flex gap-1.5 mt-auto">
                              <button type="button" onClick={() => setModal({ open: true, initial: { id: product.id, name: product.name, price: product.price, categoryId: product.categoryId, color: product.color || '#FFFFFF', variablePrice: Boolean(product.variablePrice) } })} className="btn btn-sm btn-secondary flex-1">
                                ✏️ Düzenle
                              </button>
                              <button type="button" onClick={() => handleDelete(product)} className="btn btn-sm btn-danger" title="Sil">
                                🗑
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <ProductModal
        open={modal.open}
        initial={modal.initial}
        categories={categories}
        onClose={() => setModal({ open: false, initial: null })}
        onSaved={async () => {
          setModal({ open: false, initial: null });
          await reload();
        }}
        showAlert={showAlert}
      />
      <SortModal
        open={sortOpen}
        categories={categories}
        products={products}
        onClose={() => setSortOpen(false)}
        onSaved={async () => {
          setSortOpen(false);
          await reload();
          showAlert('Kaydedildi', 'Sıralama güncellendi.', 'success');
        }}
        showAlert={showAlert}
      />
    </div>
  );
};

export default ProductsTab;
