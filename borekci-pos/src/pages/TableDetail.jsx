import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getOrders,
  getTable,
  updateOrder,
  deleteOrder,
  createPayment,
  getCategories,
  getProducts,
  createOrder,
  transferOrders,
  getTables,
  requestTablePayment,
  printReceipt,
  getErrorMessage,
  CLIENT_ID,
} from '../services/api';
import { getExchangeRates, convertWithDiscount, RATE_DISCOUNT } from '../services/currency';
import { onUpdate, UPDATE_TYPES } from '../services/broadcast';
import { formatTimeTR, formatCurrency, parseServerDate } from '../utils/dateFormatter';
import { playActionSound } from '../utils/sound';
import { rgba, contrastText, borderColorFor, isWhite } from '../utils/colors';
import { useAlert } from '../hooks/useAlert';
import { useMediaQuery } from '../hooks/useMediaQuery';
import Footer from '../components/Footer';
import AlertModal from '../components/AlertModal';
import NumPadModal from '../components/NumPadModal';

const TableDetail = ({ user }) => {
  const { id } = useParams();
  const tableId = parseInt(id, 10);
  const navigate = useNavigate();
  const { alertProps, showAlert, confirm } = useAlert();
  // Telefon / dar ekran: kategoriler üstte yatay şerit, sipariş listesi alttan açılan panel
  const isNarrow = useMediaQuery('(max-width: 767px)');

  const [table, setTable] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [productsLoading, setProductsLoading] = useState(true);
  const [exchangeRates, setExchangeRates] = useState(null);
  const [clickedProductId, setClickedProductId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [ordersSheetOpen, setOrdersSheetOpen] = useState(false);
  // Sipariş listesi görünümü: 'list' (saat sırasıyla satırlar) | 'grouped' (ürün bazında toplu)
  const [ordersView, setOrdersView] = useState(() => localStorage.getItem('ordersView') || 'list');
  // Tutarı elle girilen ürün için rakam klavyesi
  const [numPad, setNumPad] = useState({ open: false, product: null });

  const [paymentSuccess, setPaymentSuccess] = useState(null); // { type, amount }
  const [showTransfer, setShowTransfer] = useState(false);
  const [tables, setTables] = useState([]);
  const [requestSent, setRequestSent] = useState(false);

  // Sayfa açıldığındaki sipariş durumu ("Geri Al" için)
  const snapshotRef = useRef(null);
  const selectedCategoryRef = useRef(null);
  selectedCategoryRef.current = selectedCategory;
  // Hızlı arka arkaya tıklamalar kaybolmasın: sipariş işlemleri sırayla kuyruğa alınır
  const queueRef = useRef(Promise.resolve());
  const ordersRef = useRef([]);
  const [pending, setPending] = useState(0);

  const isAdmin = user?.role === 'yönetici';

  // ---------------------------------------------------------------- yükleme
  /** Sipariş listesini hem state'e hem ref'e yazar (kuyruk işleri güncel değeri ref'ten okur) */
  const applyOrders = useCallback((updater) => {
    const next = typeof updater === 'function' ? updater(ordersRef.current) : updater;
    ordersRef.current = next;
    setOrders(next);
  }, []);

  const loadOrders = useCallback(async () => {
    const response = await getOrders(tableId);
    const data = response.data || [];
    ordersRef.current = data;
    setOrders(data);
    if (snapshotRef.current === null) {
      snapshotRef.current = data.map((o) => ({ id: o.id, productId: o.productId, quantity: o.quantity }));
    }
    return data;
  }, [tableId]);

  const loadTable = useCallback(async () => {
    try {
      const response = await getTable(tableId);
      setTable(response.data);
    } catch {
      setTable({ id: tableId, name: `Masa ${tableId}` });
    }
  }, [tableId]);

  const loadCategories = useCallback(async () => {
    const response = await getCategories();
    const sorted = [...(response.data || [])].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    setCategories(sorted);
    if (sorted.length > 0 && (selectedCategoryRef.current === null || !sorted.some((c) => c.id === selectedCategoryRef.current))) {
      setSelectedCategory(sorted[0].id);
    }
    if (sorted.length === 0) setProductsLoading(false);
  }, []);

  const loadProducts = useCallback(async (categoryId) => {
    if (categoryId === null || categoryId === undefined) return;
    try {
      const response = await getProducts(categoryId);
      setProducts(response.data || []);
    } finally {
      setProductsLoading(false);
    }
  }, []);

  useEffect(() => {
    snapshotRef.current = null;
    setLoading(true);
    Promise.all([loadOrders(), loadTable(), loadCategories()])
      .catch((err) => showAlert('Hata', getErrorMessage(err, 'Masa bilgileri yüklenemedi'), 'error'))
      .finally(() => setLoading(false));

    getExchangeRates().then(setExchangeRates).catch(() => {});

    const unsubscribe = onUpdate((event) => {
      switch (event.type) {
        case UPDATE_TYPES.CATEGORIES:
          loadCategories().then(() => loadProducts(selectedCategoryRef.current)).catch(() => {});
          break;
        case UPDATE_TYPES.PRODUCTS:
          loadProducts(selectedCategoryRef.current).catch(() => {});
          break;
        case UPDATE_TYPES.ORDERS:
          // Kendi yaptığımız işlem zaten ekranda; yalnızca başka cihazların değişikliklerini indir
          if (event.data?.origin === CLIENT_ID) break;
          if (!event.data || event.data.tableId === tableId || event.data.fromTableId === tableId || event.data.toTableId === tableId) {
            loadOrders().catch(() => {});
          }
          break;
        case UPDATE_TYPES.PAYMENTS:
        case UPDATE_TYPES.TABLES:
          if (event.data?.origin === CLIENT_ID) break;
          if (!event.data || event.data.tableId === tableId || event.data.id === tableId) {
            loadOrders().catch(() => {});
            loadTable();
          }
          break;
        default:
          break;
      }
    });
    return unsubscribe;
  }, [tableId, loadOrders, loadTable, loadCategories, loadProducts, showAlert]);

  useEffect(() => {
    if (selectedCategory !== null) {
      setProductsLoading(true);
      loadProducts(selectedCategory).catch(() => {});
    }
  }, [selectedCategory, loadProducts]);

  useEffect(() => {
    if (clickedProductId === null) return undefined;
    const timer = setTimeout(() => setClickedProductId(null), 600);
    return () => clearTimeout(timer);
  }, [clickedProductId]);

  // ---------------------------------------------------------------- türetilen
  const total = useMemo(() => orders.reduce((sum, o) => sum + (Number(o.total) || 0), 0), [orders]);
  const itemCount = useMemo(() => orders.reduce((sum, o) => sum + (Number(o.quantity) || 0), 0), [orders]);
  const currentCategory = categories.find((c) => c.id === selectedCategory);

  const hasChanges = useMemo(() => {
    const snap = snapshotRef.current;
    if (!snap) return false;
    if (snap.length !== orders.length) return true;
    const map = new Map(snap.map((o) => [o.id, o.quantity]));
    return orders.some((o) => map.get(o.id) !== o.quantity);
  }, [orders]);

  // Ürün bazında toplu görünüm: aynı ürünün (aynı birim fiyatlı) satırları birleştirilir
  const groupedOrders = useMemo(() => {
    const map = new Map();
    orders.forEach((o) => {
      const key = `${o.productId}|${o.unitPrice ?? ''}`;
      const cur = map.get(key) || { key, name: o.name, price: o.price, quantity: 0, total: 0, lines: 0, variablePrice: o.variablePrice };
      cur.quantity += o.quantity;
      cur.total += Number(o.total) || 0;
      cur.lines += 1;
      map.set(key, cur);
    });
    return [...map.values()].sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name, 'tr'));
  }, [orders]);

  // ---------------------------------------------------------------- işlemler
  const run = async (fn, errorTitle = 'Hata') => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      showAlert(errorTitle, getErrorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  /**
   * Sipariş işlemlerini sırayla çalıştırır; hiçbir tıklama atılmaz.
   * Ekran tıklama anında güncellenir (iyimser); sunucu cevabı gelince satır gerçek veriyle değiştirilir.
   * Hata olursa liste sunucudan yeniden indirilir.
   */
  const enqueue = (fn, errorTitle = 'Hata') => {
    setPending((n) => n + 1);
    const job = async () => {
      try {
        await fn();
      } catch (err) {
        showAlert(errorTitle, getErrorMessage(err), 'error');
        await loadOrders().catch(() => {});
      } finally {
        setPending((n) => Math.max(0, n - 1));
      }
    };
    queueRef.current = queueRef.current.then(job, job);
    return queueRef.current;
  };

  const tempIdRef = useRef(0);
  const MERGE_WINDOW_MS = 60 * 1000;

  /** Sunucudan gelen satırı listeye işle: geçici satırı veya aynı id'li satırı değiştir */
  const mergeServerRow = (row, tempId) => {
    if (!row) return;
    applyOrders((list) => {
      const withoutTemp = tempId ? list.filter((o) => o.id !== tempId) : list;
      const exists = withoutTemp.some((o) => o.id === row.id);
      const next = exists ? withoutTemp.map((o) => (o.id === row.id ? row : o)) : [row, ...withoutTemp];
      return next.sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)) || b.id - a.id);
    });
  };

  const handleAddProduct = (product) => {
    const productId = typeof product === 'object' ? product.id : product;
    setClickedProductId(productId);
    playActionSound();
    if (typeof product === 'object' && product.variablePrice) {
      // Tartılı ürün: önce tutar sorulur
      setNumPad({ open: true, product });
      return;
    }
    const nowIso = new Date().toISOString();
    // İyimser güncelleme: sunucunun 60 sn birleştirme kuralını burada da uygula
    let tempId = null;
    applyOrders((list) => {
      const recent = list.find((o) => {
        if (o.productId !== productId || o.unitPrice != null) return false;
        const t = parseServerDate(o.updatedAt || o.createdAt);
        return t && Date.now() - t.getTime() <= MERGE_WINDOW_MS;
      });
      if (recent) {
        return list.map((o) => (o.id === recent.id ? { ...o, quantity: o.quantity + 1, total: Math.round((o.price * (o.quantity + 1)) * 100) / 100, updatedAt: nowIso, optimistic: true } : o));
      }
      tempId = `temp-${++tempIdRef.current}`;
      const p = typeof product === 'object' ? product : { id: productId, name: '…', price: 0 };
      return [{ id: tempId, tableId, productId, name: p.name, price: p.price, unitPrice: null, variablePrice: 0, quantity: 1, total: p.price, createdAt: nowIso, updatedAt: nowIso, optimistic: true }, ...list];
    });
    enqueue(async () => {
      const response = await createOrder({ tableId, productId, quantity: 1 });
      mergeServerRow(response.data?.order, tempId);
      if (!response.data?.order) await loadOrders();
    }, 'Ürün eklenemedi');
  };

  const handleNumPadConfirm = (amount) => {
    const product = numPad.product;
    setNumPad({ open: false, product: null });
    if (!product) return;
    playActionSound();
    const nowIso = new Date().toISOString();
    const tempId = `temp-${++tempIdRef.current}`;
    applyOrders((list) => [{ id: tempId, tableId, productId: product.id, name: product.name, price: amount, unitPrice: amount, variablePrice: 1, quantity: 1, total: amount, createdAt: nowIso, updatedAt: nowIso, optimistic: true }, ...list]);
    enqueue(async () => {
      const response = await createOrder({ tableId, productId: product.id, quantity: 1, customPrice: amount });
      mergeServerRow(response.data?.order, tempId);
      if (!response.data?.order) await loadOrders();
    }, 'Ürün eklenemedi');
  };

  const toggleOrdersView = () => {
    const next = ordersView === 'list' ? 'grouped' : 'list';
    setOrdersView(next);
    localStorage.setItem('ordersView', next);
  };

  const isTemp = (id) => typeof id === 'string' && id.startsWith('temp-');

  const handleQuantityChange = (order, delta) => {
    playActionSound();
    // İyimser: ekranda hemen değiştir
    applyOrders((list) => {
      const cur = list.find((o) => o.id === order.id);
      if (!cur) return list;
      const q = cur.quantity + delta;
      if (q < 1) return list.filter((o) => o.id !== order.id);
      return list.map((o) => (o.id === order.id ? { ...o, quantity: q, total: Math.round(o.price * q * 100) / 100, optimistic: true } : o));
    });
    enqueue(async () => {
      if (isTemp(order.id)) return; // henüz sunucuda yok; bir önceki iş bittiğinde gerçek id gelir, kullanıcı tekrar dokunur
      const current = ordersRef.current.find((o) => o.id === order.id);
      if (!current) {
        await deleteOrder(order.id).catch((e) => { if (e.response?.status !== 404) throw e; });
        return;
      }
      const response = await updateOrder(order.id, { quantity: current.quantity });
      mergeServerRow(response.data?.order);
    }, 'Sipariş güncellenemedi');
  };

  const handleDeleteOrder = (order) => {
    playActionSound();
    applyOrders((list) => list.filter((o) => o.id !== order.id));
    enqueue(async () => {
      if (isTemp(order.id)) return;
      await deleteOrder(order.id).catch((e) => { if (e.response?.status !== 404) throw e; });
    }, 'Sipariş silinemedi');
  };

  const handlePayment = async (type) => {
    playActionSound();
    const ok = await confirm(
      `${type} ile hesabı kapat`,
      `${table?.name || `Masa ${tableId}`} — ${formatCurrency(total)}\nHesap kapatılacak ve masa boşaltılacak.`,
      { type: 'info', confirmText: 'Hesabı Kapat' }
    );
    if (!ok) return;
    run(async () => {
      await queueRef.current; // bekleyen sipariş işlemleri bitsin
      const response = await createPayment({ tableId, paymentType: type });
      setOrdersSheetOpen(false);
      setPaymentSuccess({ type, amount: response.data?.amount ?? total });
    }, 'Ödeme alınamadı');
  };

  const handlePrint = () => {
    playActionSound();
    run(async () => {
      const response = await printReceipt(tableId);
      const data = response.data || {};
      if (!data.success) throw new Error(data.error || 'Fiş yazdırılamadı');
      showAlert(
        'Fiş',
        data.mode === 'server' ? `Fiş kasadaki yazıcıdan yazdırıldı (${data.printer}).` : 'Kasada termal yazıcı bulunamadı; istek yazıcıya bağlı cihaza gönderildi.',
        data.mode === 'server' ? 'success' : 'info'
      );
    }, 'Yazdırma hatası');
  };

  const handleRequestPayment = () => {
    playActionSound();
    run(async () => {
      await requestTablePayment(tableId);
      setOrdersSheetOpen(false);
      setRequestSent(true);
    }, 'Hesap isteği gönderilemedi');
  };

  const openTransfer = () => {
    playActionSound();
    setShowTransfer(true);
    getTables()
      .then((r) => setTables(r.data || []))
      .catch(() => setTables([]));
  };

  const handleTransfer = (toTableId) => {
    run(async () => {
      await transferOrders(tableId, toTableId);
      setShowTransfer(false);
      navigate(`/table/${toTableId}`);
    }, 'Masa değiştirilemedi');
  };

  /** Bu ekranda yapılan değişiklikleri sayfa açıldığı hâline döndür */
  const handleRevert = async () => {
    playActionSound();
    const ok = await confirm('Değişiklikleri geri al', 'Bu ekranda yapılan tüm ekleme ve değişiklikler geri alınacak. Emin misiniz?', {
      confirmText: 'Geri Al',
    });
    if (!ok) return;
    run(async () => {
      const snap = snapshotRef.current || [];
      const current = (await getOrders(tableId)).data || [];
      const snapMap = new Map(snap.map((o) => [o.id, o]));
      const currentMap = new Map(current.map((o) => [o.id, o]));

      for (const order of current) {
        if (!snapMap.has(order.id)) await deleteOrder(order.id);
      }
      for (const order of snap) {
        const now = currentMap.get(order.id);
        if (!now) await createOrder({ tableId, productId: order.productId, quantity: order.quantity });
        else if (now.quantity !== order.quantity) await updateOrder(order.id, { quantity: order.quantity });
      }
      await loadOrders();
    }, 'Geri alma başarısız');
  };

  // ---------------------------------------------------------------- görünüm
  if (loading) {
    return <div className="h-screen flex items-center justify-center text-gray-500">Yükleniyor…</div>;
  }

  const tableName = table?.name || `Masa ${tableId}`;


  const viewToggle = orders.length > 0 && (
    <div className="flex gap-0.5 p-0.5 rounded-lg bg-gray-100 dark:bg-gray-900">
      <button type="button" onClick={() => ordersView !== 'list' && toggleOrdersView()} className={`btn btn-sm px-2 py-1 ${ordersView === 'list' ? 'btn-primary' : 'btn-ghost'}`} title="Saat sırasıyla satırlar">
        🕒 Liste
      </button>
      <button type="button" onClick={() => ordersView !== 'grouped' && toggleOrdersView()} className={`btn btn-sm px-2 py-1 ${ordersView === 'grouped' ? 'btn-primary' : 'btn-ghost'}`} title="Ürün bazında toplu">
        Σ Toplu
      </button>
    </div>
  );

  const orderList = orders.length === 0 ? (
    <div className="text-center py-8 text-gray-500 text-sm">
      <div className="text-3xl mb-1">🧾</div>
      Henüz sipariş yok
    </div>
  ) : ordersView === 'grouped' ? (
    groupedOrders.map((g) => (
      <div key={g.key} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 px-2.5 py-2 flex items-center gap-2">
        <span className="min-w-[2.5rem] h-10 px-1.5 rounded-lg bg-blue-600 text-white font-bold tabular-nums flex items-center justify-center text-base">{g.quantity}×</span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-tight truncate-2 text-sm">{g.name}</p>
          <p className="text-[11px] text-gray-500 tabular-nums">
            {formatCurrency(g.price)}
            {g.lines > 1 ? ` · ${g.lines} ayrı giriş` : ''}
          </p>
        </div>
        <span className="font-bold tabular-nums text-blue-600 dark:text-blue-400 text-sm whitespace-nowrap">{formatCurrency(g.total)}</span>
      </div>
    ))
  ) : (
    orders.map((order) => (
      <div key={order.id} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 p-2">
        <div className="flex items-start justify-between gap-1.5">
          <div className="min-w-0">
            <p className="font-semibold leading-tight truncate-2 text-base">{order.name}</p>
            <p className="text-xs text-gray-500 tabular-nums">
              {formatTimeTR(order.updatedAt || order.createdAt)} · {formatCurrency(order.price)}
              {order.unitPrice != null ? ' ⚖️' : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleDeleteOrder(order)}
            className="btn btn-ghost btn-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 px-2 h-11 w-11 touch:h-12 touch:w-12 text-lg"
            title="Kalemi sil"
          >
            🗑
          </button>
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <div className="inline-flex items-center rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 overflow-hidden">
            <button
              type="button"
              onClick={() => handleQuantityChange(order, -1)}
              className="h-11 w-12 touch:h-12 touch:w-14 font-bold text-2xl text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 active:scale-95"
              aria-label="Azalt"
            >
              −
            </button>
            <span className="min-w-[2.5rem] text-center font-bold tabular-nums text-lg">{order.quantity}</span>
            <button
              type="button"
              onClick={() => handleQuantityChange(order, +1)}
              className="h-11 w-12 touch:h-12 touch:w-14 font-bold text-2xl text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 active:scale-95"
              aria-label="Artır"
            >
              +
            </button>
          </div>
          <span className="font-bold tabular-nums text-blue-600 dark:text-blue-400 text-base truncate">{formatCurrency(order.total)}</span>
        </div>
      </div>
    ))
  );

  const orderFooter = (
    <div className="border-t border-gray-200 dark:border-gray-700 p-2.5 space-y-2 flex-shrink-0">
      <div className="flex items-end justify-between gap-2">
        <div className="text-xs text-gray-500 pb-0.5">
          Toplam
          <div className="text-[11px] text-gray-400 tabular-nums">{itemCount} ürün</div>
        </div>
        <div className="text-right min-w-0">
          <div className="text-2xl sm:text-3xl font-bold tabular-nums text-blue-600 dark:text-blue-400 leading-none truncate">{formatCurrency(total)}</div>
          {exchangeRates && total > 0 && (
            <div className="text-[11px] text-gray-500 tabular-nums mt-1 truncate" title={`Kur −${RATE_DISCOUNT} ₺ ile hesaplanır`}>
              ${convertWithDiscount(total, exchangeRates.USD).toFixed(2)} · €{convertWithDiscount(total, exchangeRates.EUR).toFixed(2)}
            </div>
          )}
        </div>
      </div>
      {orders.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-1.5">
            <button type="button" onClick={() => handlePayment('Nakit')} className="btn btn-success" disabled={busy}>
              💵 Nakit
            </button>
            <button type="button" onClick={() => handlePayment('Kart')} className="btn btn-primary" disabled={busy}>
              💳 Kart
            </button>
          </div>
          <div className={`grid gap-1.5 ${isAdmin ? 'grid-cols-1' : 'grid-cols-2'}`}>
            <button type="button" onClick={handlePrint} className="btn btn-secondary" disabled={busy} title="Fiş yazdır">
              🖨️ Fiş
            </button>
            {!isAdmin && (
              <button type="button" onClick={handleRequestPayment} className="btn btn-warning" disabled={busy} title="Kasaya hesap isteği gönder">
                📢 Hesaba Yolla
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );

  const categoryButton = (category, compact) => {
    const isSelected = selectedCategory === category.id;
    const border = borderColorFor(category.color);
    return (
      <button
        key={category.id}
        type="button"
        onClick={() => setSelectedCategory(category.id)}
        className={`rounded-xl font-semibold transition-all duration-150 leading-tight active:scale-[0.98] ${
          compact ? 'flex-shrink-0 px-4 min-h-[3.25rem] max-w-[12rem] text-left' : 'w-full text-left px-2.5 py-2.5 min-h-[3.6rem]'
        } ${isSelected ? 'shadow-md' : 'bg-gray-100 dark:bg-gray-700/70 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
        style={{
          borderLeft: `4px solid ${border}`,
          backgroundColor: isSelected ? (isWhite(category.color) ? '#E5E7EB' : category.color) : undefined,
          color: isSelected ? (isWhite(category.color) ? '#111827' : contrastText(category.color)) : undefined,
          fontSize: compact ? '1rem' : 'clamp(0.9rem, 1vw, 1.1rem)',
        }}
        title={category.name}
      >
        <span className={compact ? 'block truncate' : 'block truncate-2'}>{category.name}</span>
      </button>
    );
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Üst çubuk */}
      <header className="page-header m-2 mb-0 flex-nowrap">
        <div className="flex items-center gap-2 min-w-0">
          <button type="button" onClick={() => navigate('/')} className="btn btn-secondary btn-sm" title="Masalara dön">
            ←<span className="hidden md:inline"> Masalar</span>
          </button>
          <h1 className="text-base sm:text-lg md:text-xl font-bold truncate">{tableName}</h1>
          <span className={`badge ${orders.length ? 'badge-red' : 'badge-green'} hidden sm:inline-flex`}>{orders.length ? `${itemCount} ürün` : 'Boş'}</span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {orders.length > 0 && (
            <button type="button" onClick={openTransfer} className="btn btn-purple btn-sm" title="Siparişleri başka masaya taşı" disabled={busy}>
              🔄<span className="hidden md:inline"> Masa Değiştir</span>
            </button>
          )}
          {hasChanges && (
            <button type="button" onClick={handleRevert} className="btn btn-outline btn-sm" title="Bu ekranda yapılan değişiklikleri geri al" disabled={busy}>
              ↩<span className="hidden md:inline"> Geri Al</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              playActionSound();
              navigate('/');
            }}
            className="btn btn-success btn-sm"
            title="Siparişi kaydet ve masalara dön"
          >
            ✅ Tamamla
          </button>
        </div>
      </header>

      {isNarrow ? (
        /* ---------------- Dar ekran (telefon): dikey yerleşim ---------------- */
        <div className="flex-1 min-h-0 flex flex-col gap-2 p-2">
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-2 px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden flex-shrink-0">
            {categories.map((c) => categoryButton(c, true))}
          </div>
          <section className="card flex-1 min-h-0 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-3 pt-2 pb-1">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 truncate">{currentCategory?.name || 'Ürünler'}</div>
              <span className="text-[11px] text-gray-400 tabular-nums">{products.length} ürün</span>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2">
              {productsLoading ? (
                <div className="text-center py-8 text-gray-500 text-sm">Yükleniyor…</div>
              ) : products.length === 0 ? (
                <div className="text-center py-8 text-gray-500 text-sm">Bu kategoride ürün yok</div>
              ) : (
                <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
                  {products.map((product) => {
                    const color = product.color && !isWhite(product.color) ? product.color : currentCategory?.color || '#3B82F6';
                    const isClicked = clickedProductId === product.id;
                    return (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => handleAddProduct(product)}
                        className={`relative rounded-xl text-center transition-all duration-150 active:scale-95 flex flex-col items-center justify-center gap-0.5 overflow-hidden bg-white dark:bg-gray-700 border min-h-[5.5rem] p-2 ${
                          isClicked ? 'animate-glow ring-2 ring-blue-500' : ''
                        }`}
                        style={{ borderColor: borderColorFor(color, '#D1D5DB'), background: `linear-gradient(160deg, ${rgba(color, 0.28)}, ${rgba(color, 0.06)} 70%)` }}
                      >
                        <span className="w-full font-semibold leading-tight truncate-2 text-gray-800 dark:text-white text-sm">{product.name}</span>
                        <span className="w-full font-bold tabular-nums truncate text-gray-900 dark:text-white text-sm">{product.variablePrice ? '⚖️ Tutar gir' : formatCurrency(product.price)}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          {/* Alt çubuk: toplam + sipariş paneli */}
          <button
            type="button"
            onClick={() => setOrdersSheetOpen(true)}
            className="card flex items-center justify-between gap-3 px-3 py-2.5 flex-shrink-0 active:scale-[0.99] border-blue-200 dark:border-blue-800"
          >
            <span className="flex items-center gap-2 text-sm font-semibold">
              🧾 Sipariş <span className="badge badge-blue tabular-nums">{itemCount}</span>
            </span>
            <span className="text-lg font-bold tabular-nums text-blue-600 dark:text-blue-400">{formatCurrency(total)}</span>
            <span className="text-gray-400">▲</span>
          </button>

          {ordersSheetOpen && (
            <div className="fixed inset-0 z-40 bg-black/50 flex items-end" onClick={() => setOrdersSheetOpen(false)}>
              <div className="card w-full max-h-[85vh] flex flex-col rounded-b-none overflow-hidden" onClick={(e) => e.stopPropagation()} style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
                <div className="flex items-center justify-between gap-2 px-3 pt-2 pb-1">
                  <div className="text-sm font-bold">
                    Sipariş <span className="text-gray-400 font-normal">· {orders.length} kalem</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {viewToggle}
                    <button type="button" onClick={() => setOrdersSheetOpen(false)} className="btn btn-ghost btn-sm text-xl leading-none">
                      ×
                    </button>
                  </div>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto px-2 space-y-1.5">{orderList}</div>
                {orderFooter}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ---------------- Geniş ekran: üç sütun ---------------- */
        <div className="flex-1 min-h-0 grid gap-2 p-2" style={{ gridTemplateColumns: 'clamp(120px, 13.5vw, 220px) minmax(0, 1fr) clamp(220px, 25vw, 380px)' }}>
          <aside className="card flex flex-col min-h-0 overflow-hidden">
            <div className="px-2 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Kategoriler</div>
            <div className="flex-1 min-h-0 overflow-y-auto px-1.5 pb-1.5 space-y-1.5">
              {categories.length === 0 && <p className="text-xs text-gray-500 p-2">Kategori yok</p>}
              {categories.map((c) => categoryButton(c, false))}
            </div>
          </aside>

          <section className="card flex flex-col min-h-0 overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-3 pt-2 pb-1">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 truncate">
                Ürünler{currentCategory ? ` · ${currentCategory.name}` : ''}
              </div>
              <span className="text-[11px] text-gray-400 tabular-nums">{products.length} ürün</span>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2">
              {productsLoading ? (
                <div className="text-center py-8 text-gray-500 text-sm">Yükleniyor…</div>
              ) : products.length === 0 ? (
                <div className="text-center py-8 text-gray-500 text-sm">Bu kategoride ürün yok</div>
              ) : (
                <div className="grid gap-1.5 sm:gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(clamp(112px, 11vw, 175px), 1fr))' }}>
                  {products.map((product) => {
                    const color = product.color && !isWhite(product.color) ? product.color : currentCategory?.color || '#3B82F6';
                    const isClicked = clickedProductId === product.id;
                    return (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => handleAddProduct(product)}
                        className={`relative rounded-xl text-center transition-all duration-150 active:scale-95 hover:-translate-y-0.5 hover:shadow-md flex flex-col items-center justify-center gap-0.5 overflow-hidden bg-white dark:bg-gray-700 border ${
                          isClicked ? 'animate-glow ring-2 ring-blue-500' : ''
                        }`}
                        style={{
                          aspectRatio: '1.2 / 1',
                          borderColor: borderColorFor(color, '#D1D5DB'),
                          padding: 'clamp(0.25rem, 0.5vw, 0.5rem)',
                          background: `linear-gradient(160deg, ${rgba(color, 0.28)}, ${rgba(color, 0.06)} 70%)`,
                        }}
                        title={product.name}
                      >
                        <span className="w-full font-semibold leading-tight truncate-2 text-gray-800 dark:text-white" style={{ fontSize: 'clamp(0.85rem, 1vw, 1.1rem)' }}>
                          {product.name}
                        </span>
                        <span className="w-full font-bold tabular-nums truncate text-gray-900 dark:text-white" style={{ fontSize: 'clamp(0.95rem, 1.15vw, 1.25rem)' }}>
                          {product.variablePrice ? '⚖️ Tutar gir' : formatCurrency(product.price)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          <aside className="card flex flex-col min-h-0 overflow-hidden">
            <div className="flex items-center justify-between gap-1 px-2.5 pt-2 pb-1">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 truncate">
                Sipariş <span className="text-gray-400 normal-case font-normal">· {orders.length}</span>
                {pending > 0 && <span className="ml-1 inline-block h-3 w-3 rounded-full border-2 border-blue-500 border-t-transparent animate-spin align-middle" title="İşleniyor" />}
              </div>
              {viewToggle}
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-2 space-y-1.5">{orderList}</div>
            {orderFooter}
          </aside>
        </div>
      )}

      <Footer className="py-1 flex-shrink-0" />

      {/* Ödeme başarılı */}
      {paymentSuccess && (
        <div className="modal-backdrop">
          <div className="modal max-w-sm text-center">
            <div className="modal-body py-8">
              <div className="text-6xl mb-3">{paymentSuccess.type === 'Nakit' ? '💵' : '💳'}</div>
              <h2 className="text-2xl font-bold mb-1">Ödeme alındı</h2>
              <p className="text-gray-600 dark:text-gray-300">
                {tableName} · {paymentSuccess.type}
              </p>
              <p className="text-3xl font-bold tabular-nums text-blue-600 dark:text-blue-400 mt-3">{formatCurrency(paymentSuccess.amount)}</p>
            </div>
            <div className="modal-footer">
              <button type="button" onClick={() => navigate('/')} className="btn btn-primary btn-lg w-full" autoFocus>
                Masalara Dön
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hesap isteği gönderildi */}
      {requestSent && (
        <div className="modal-backdrop">
          <div className="modal max-w-sm text-center">
            <div className="modal-body py-8">
              <div className="text-5xl mb-3">📢</div>
              <h2 className="text-xl font-bold">{tableName} kasaya bildirildi</h2>
              <p className="text-gray-600 dark:text-gray-300 mt-1">Hesap kasada alınacak.</p>
            </div>
            <div className="modal-footer">
              <button type="button" onClick={() => setRequestSent(false)} className="btn btn-success btn-lg w-full" autoFocus>
                Tamam
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Masa değiştir */}
      {showTransfer && (
        <div className="modal-backdrop" onClick={() => setShowTransfer(false)}>
          <div className="modal max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2 className="font-bold">Masa Değiştir</h2>
                <p className="text-xs text-gray-500">{tableName} siparişlerini taşıyacağınız masayı seçin. Dolu masaya taşınırsa hesaplar birleşir.</p>
              </div>
              <button type="button" onClick={() => setShowTransfer(false)} className="btn btn-ghost btn-sm text-xl leading-none">
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))' }}>
                {tables
                  .filter((t) => t.id !== tableId)
                  .map((t) => {
                    const isDolu = t.status === 'dolu';
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => handleTransfer(t.id)}
                        disabled={busy}
                        className={`rounded-xl border-2 p-2.5 min-h-[4.5rem] text-center transition hover:-translate-y-0.5 active:scale-95 ${
                          isDolu ? 'border-red-400 bg-red-50 dark:bg-red-900/20' : 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20'
                        }`}
                      >
                        <div className={`h-2 w-2 rounded-full mx-auto mb-1 ${isDolu ? 'bg-red-500' : 'bg-emerald-500'}`} />
                        <p className="font-bold text-sm truncate">{t.name}</p>
                        <p className="text-[11px] text-gray-500 tabular-nums">{formatCurrency(t.total)}</p>
                      </button>
                    );
                  })}
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" onClick={() => setShowTransfer(false)} className="btn btn-secondary w-full">
                İptal
              </button>
            </div>
          </div>
        </div>
      )}

      <NumPadModal
        open={numPad.open}
        title={numPad.product?.name || 'Tutar girin'}
        subtitle={`${tableName} · tutarı tuşlayıp onaylayın`}
        onConfirm={handleNumPadConfirm}
        onCancel={() => setNumPad({ open: false, product: null })}
        confirmText="Onayla ve Ekle"
      />
      <AlertModal {...alertProps} />
    </div>
  );
};

export default TableDetail;
