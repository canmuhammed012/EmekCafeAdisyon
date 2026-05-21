import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getOrders, updateOrder, deleteOrder, createPayment, getCategories, getProducts, createOrder, transferOrders, getTables, requestTablePayment } from '../services/api';
import { printTableReceipt } from '../services/print';
import { getExchangeRates, convertWithDiscount } from '../services/currency';
import { broadcastUpdate, onUpdate, UPDATE_TYPES } from '../services/broadcast';
import { formatTimeTR } from '../utils/dateFormatter';
import { playActionSound } from '../utils/sound';
import Footer from '../components/Footer';
import AlertModal from '../components/AlertModal';

const TableDetail = ({ user }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [table, setTable] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Menü için state'ler
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [menuLoading, setMenuLoading] = useState(true);
  
  // Döviz kurları için state
  const [exchangeRates, setExchangeRates] = useState({ USD: 0, EUR: 0 });
  
  // Ödeme başarı modalı için state
  const [showPaymentSuccess, setShowPaymentSuccess] = useState(false);
  const [paymentType, setPaymentType] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState(0);
  
  // Masa değiştirme modalı için state
  const [showTableTransferModal, setShowTableTransferModal] = useState(false);
  const [tables, setTables] = useState([]);
  
  // Hesap isteği başarı modalı için state
  const [showPaymentRequestSuccess, setShowPaymentRequestSuccess] = useState(false);
  
  // Alert modal için state
  const [alertModal, setAlertModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    type: 'info'
  });
  
  // Tıklanan ürün için glow efekti state
  const [clickedProductId, setClickedProductId] = useState(null);
  
  // Sayfa yüklendiğinde siparişlerin snapshot'ı (çıkış butonu için)
  const [ordersSnapshot, setOrdersSnapshot] = useState(null);
  const previousTableIdRef = useRef(null);

  // Fonksiyonları normal function olarak tanımla (useCallback'siz)
  const loadOrders = async () => {
    try {
      const response = await getOrders(id);
      setOrders(response.data);
      
      // Masa bilgisini al (toplam tutardan)
      const total = response.data.reduce((sum, order) => sum + order.total, 0);
      setTable({ id: parseInt(id), total });
    } catch (error) {
      console.error('Siparişler yüklenemedi:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCategories = async () => {
    try {
      const response = await getCategories();
      setCategories(response.data || []);
      if (response.data && response.data.length > 0 && !selectedCategory) {
        setSelectedCategory(response.data[0].id);
      }
    } catch (error) {
      console.error('Kategoriler yüklenemedi:', error);
    }
  };

  const loadProducts = async () => {
    if (selectedCategory === null) return;
    try {
      const response = await getProducts(selectedCategory);
      console.log('🎨 Ürünler yüklendi:', response.data);
      setProducts(response.data || []);
    } catch (error) {
      console.error('Ürünler yüklenemedi:', error);
    } finally {
      setMenuLoading(false);
    }
  };

  useEffect(() => {
    // Masa değiştiğinde snapshot'ı sıfırla
    if (previousTableIdRef.current !== id) {
      setOrdersSnapshot(null);
      previousTableIdRef.current = id;
    }
    
    // Fonksiyonları useEffect içinde tanımla (infinite loop'u önlemek için)
    const loadOrdersLocal = async () => {
      try {
        const response = await getOrders(id);
        setOrders(response.data);
        const total = response.data.reduce((sum, order) => sum + order.total, 0);
        setTable({ id: parseInt(id), total });
        
        // İlk yüklemede snapshot'ı kaydet (sadece snapshot yoksa)
        setOrdersSnapshot(prevSnapshot => {
          if (prevSnapshot === null) {
            return response.data.map(order => ({
              id: order.id,
              productId: order.productId,
              quantity: order.quantity,
              total: order.total
            }));
          }
          return prevSnapshot;
        });
      } catch (error) {
        console.error('Siparişler yüklenemedi:', error);
      } finally {
        setLoading(false);
      }
    };

          const loadCategoriesLocal = async () => {
            try {
              const response = await getCategories();
              // sortOrder'a göre sırala
              const sorted = [...(response.data || [])].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
              setCategories(sorted);
              if (sorted && sorted.length > 0 && !selectedCategory) {
                setSelectedCategory(sorted[0].id);
              }
            } catch (error) {
              console.error('Kategoriler yüklenemedi:', error);
            }
          };

    const loadAllData = async () => {
      await loadOrdersLocal();
      await loadCategoriesLocal();
    };

    // İlk yüklemeler
    loadAllData();
    
    // Döviz kurlarını sadece 1 kere yükle (otomatik güncelleme yok)
    const loadExchangeRates = async () => {
      const rates = await getExchangeRates();
      setExchangeRates(rates);
    };
    
    loadExchangeRates();

    // Window focus olduğunda yeniden yükle (kullanıcı başka sayfadan döndüğünde)
    const handleFocus = () => {
      loadAllData();
    };

    // Sayfa görünür olduğunda yeniden yükle
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        loadAllData();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // BroadcastChannel listener - diğer sayfalardan gelen güncellemeleri dinle
    const unsubscribe = onUpdate((event) => {
      console.log('📥 Broadcast alındı (TableDetail):', event.type);
      
      switch (event.type) {
        case UPDATE_TYPES.CATEGORIES:
          // Kategoriler güncellendi - menüyü yenile
          loadCategoriesLocal();
          // Ürünleri de yenile (kategori sıralaması değişmiş olabilir)
          if (selectedCategory !== null) {
            loadProducts();
          }
          break;
        case UPDATE_TYPES.PRODUCTS:
          // Ürünler güncellendi - menüyü yenile
          loadCategoriesLocal();
          if (selectedCategory !== null) {
            loadProducts();
          }
          break;
        case UPDATE_TYPES.ORDERS:
          // Siparişler güncellendi
          loadOrdersLocal();
          break;
        case UPDATE_TYPES.ALL:
          // Tüm verileri yenile
          loadAllData();
          break;
      }
    });

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      unsubscribe();
    };
  }, [id]); // id değiştiğinde yeniden yükle

  useEffect(() => {
    // selectedCategory değiştiğinde ürünleri yükle
    if (selectedCategory !== null) {
      loadProducts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory]);

  // Tıklanan ürün glow efektini kısa süre sonra temizle
  useEffect(() => {
    if (clickedProductId !== null) {
      const timer = setTimeout(() => {
        setClickedProductId(null);
      }, 600); // 600ms sonra temizle
      return () => clearTimeout(timer);
    }
  }, [clickedProductId]);

  const handleQuantityChange = async (orderId, newQuantity) => {
    if (newQuantity < 1) {
      handleDeleteOrder(orderId);
      return;
    }

    playActionSound();
    try {
      await updateOrder(orderId, { quantity: newQuantity });
      loadOrders();
      // Diğer sayfalara bildir (Tables sayfası masa durumunu güncellemek için)
      broadcastUpdate(UPDATE_TYPES.ORDERS);
    } catch (error) {
      console.error('Sipariş güncellenemedi:', error);
    }
  };

  const handleDeleteOrder = async (orderId) => {
    playActionSound();
    try {
      await deleteOrder(orderId);
      loadOrders();
      // Diğer sayfalara bildir
      broadcastUpdate(UPDATE_TYPES.ORDERS);
    } catch (error) {
      console.error('Sipariş silinemedi:', error);
    }
  };

  const handleAddProduct = async (productId) => {
    // Glow efekti için state set et
    setClickedProductId(productId);
    playActionSound();
    
    try {
      // Aynı ürünün en son eklenen siparişini bul (updatedAt > createdAt ise onu kullan)
      const latestSameProduct = orders
        .filter(order => order.productId === productId)
        .reduce((latest, order) => {
          const time = new Date(order.updatedAt || order.createdAt).getTime();
          if (!latest || time > latest.time) {
            return { ...order, time };
          }
          return latest;
        }, null);

      const now = Date.now();
      const withinOneMinute = latestSameProduct 
        ? (now - latestSameProduct.time) <= 60 * 1000
        : false;

      if (withinOneMinute) {
        // 1 dakika içinde aynı ürün tekrar eklendiyse miktarı artır
        await updateOrder(latestSameProduct.id, { quantity: latestSameProduct.quantity + 1 });
      } else {
        // 1 dakikadan sonra yeni bir sipariş olarak ekle
        await createOrder({
          tableId: parseInt(id),
          productId,
          quantity: 1,
        });
      }

      // Kullanıcı aksiyonu sonrası manuel güncelleme
      loadOrders();
      // Diğer sayfalara bildir
      broadcastUpdate(UPDATE_TYPES.ORDERS);
    } catch (error) {
      console.error('Ürün eklenemedi:', error);
      setAlertModal({
        isOpen: true,
        title: 'Hata',
        message: 'Ürün eklenirken bir hata oluştu: ' + (error.response?.data?.error || error.message),
        type: 'error'
      });
    }
  };

  const handlePayment = async (selectedPaymentType) => {
    try {
      // Ödeme öncesi tutarı kaydet (broadcast'tan önce!)
      const currentTotal = orders.reduce((sum, order) => sum + order.total, 0);
      
      await createPayment({ tableId: parseInt(id), paymentType: selectedPaymentType });
      // Ödeme yapıldı - masalar ve ödemeler güncellenmeli
      broadcastUpdate(UPDATE_TYPES.ALL);
      // Ödeme başarı modalını göster
      setPaymentType(selectedPaymentType);
      setPaymentAmount(currentTotal);
      setShowPaymentSuccess(true);
    } catch (error) {
      console.error('Ödeme yapılamadı:', error);
      setAlertModal({
        isOpen: true,
        title: 'Hata',
        message: 'Ödeme yapılırken bir hata oluştu',
        type: 'error'
      });
    }
  };

  const handlePaymentSuccessClose = () => {
    setShowPaymentSuccess(false);
    setPaymentType(null);
    navigate('/');
  };

  const handlePrintReceipt = async () => {
    try {
      const result = await printTableReceipt(parseInt(id));
      const hint =
        result.printedOn === 'server'
          ? 'kasa bilgisayarındaki yazıcıdan'
          : 'yazıcıya bağlı cihazdan (garson veya kasa)';
      setAlertModal({
        isOpen: true,
        title: 'Başarılı',
        message: `${result.message}\n(${hint})`,
        type: 'success',
      });
    } catch (error) {
      setAlertModal({
        isOpen: true,
        title: 'Yazdırma Hatası',
        message: error.message || 'Fiş yazdırılamadı',
        type: 'error',
      });
    }
  };

  // Masa değiştirme fonksiyonu
  const handleTableTransfer = async (toTableId) => {
    try {
      await transferOrders(parseInt(id), parseInt(toTableId));
      setShowTableTransferModal(false);
      // Yeni masaya yönlendir
      navigate(`/table/${toTableId}`);
    } catch (error) {
      console.error('Masa değiştirme hatası:', error);
      setAlertModal({
        isOpen: true,
        title: 'Hata',
        message: error.response?.data?.error || 'Masa değiştirme başarısız oldu',
        type: 'error'
      });
    }
  };

  // Masa listesini yükle
  const loadTables = async () => {
    try {
      const response = await getTables();
      setTables(response.data || []);
    } catch (error) {
      console.error('Masalar yüklenemedi:', error);
    }
  };

  // Modal açıldığında masaları yükle
  const handleOpenTableTransferModal = () => {
    setShowTableTransferModal(true);
    loadTables();
  };

  // Çıkış butonu - son girişimdeki değişiklikleri geri al
  const handleExit = async () => {
    if (!ordersSnapshot) {
      // Snapshot yoksa sadece çık
      navigate('/');
      return;
    }

    try {
      // Güncel siparişleri API'den al
      const response = await getOrders(id);
      const currentOrders = response.data;
      
      // Snapshot ile mevcut siparişleri karşılaştır
      const snapshotMap = new Map();
      ordersSnapshot.forEach(order => {
        snapshotMap.set(order.id, order);
      });
      
      const currentMap = new Map();
      currentOrders.forEach(order => {
        currentMap.set(order.id, order);
      });
      
      // Yeni eklenen siparişleri sil (snapshot'ta yok ama şu anda var)
      for (const [orderId, currentOrder] of currentMap) {
        if (!snapshotMap.has(orderId)) {
          await deleteOrder(currentOrder.id);
        }
      }
      
      // Silinen siparişleri geri ekle ve miktarları güncelle
      for (const [orderId, snapshotOrder] of snapshotMap) {
        if (!currentMap.has(orderId)) {
          // Snapshot'ta var ama şu anda yok - geri ekle
          await createOrder({
            tableId: parseInt(id),
            productId: snapshotOrder.productId,
            quantity: snapshotOrder.quantity,
          });
        } else {
          // Her ikisinde de var - miktarı snapshot'a göre güncelle
          const currentOrder = currentMap.get(orderId);
          if (currentOrder.quantity !== snapshotOrder.quantity) {
            await updateOrder(currentOrder.id, { quantity: snapshotOrder.quantity });
          }
        }
      }
      
      // Siparişleri yeniden yükle
      await loadOrders();
      broadcastUpdate(UPDATE_TYPES.ORDERS);
      
      // Ana sayfaya dön
      navigate('/');
    } catch (error) {
      console.error('Çıkış işlemi sırasında hata:', error);
      setAlertModal({
        isOpen: true,
        title: 'Hata',
        message: 'Çıkış işlemi sırasında bir hata oluştu',
        type: 'error'
      });
    }
  };


  const total = orders.reduce((sum, order) => sum + order.total, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-xl">Yükleniyor...</div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-100 dark:bg-gray-900 flex flex-col overflow-hidden">
      <div className="flex-1 pt-4 pb-0 overflow-hidden min-h-0">
        {/* Menu Section */}
        <div className="flex flex-col lg:flex-row gap-2 sm:gap-4 px-2 sm:px-4 h-full overflow-hidden">
          {/* Categories - Sol tarafta, küçük ekranlarda üstte */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md w-full lg:w-auto lg:flex-shrink-0 overflow-hidden flex flex-col" style={{ padding: 'clamp(0.4rem, 0.8vw, 0.8rem)', minWidth: 'clamp(120px, 12vw, 200px)', maxWidth: 'clamp(120px, 12vw, 200px)', width: 'clamp(120px, 12vw, 200px)', height: '100%' }}>
            <h2 className="font-bold mb-1 text-gray-800 dark:text-white flex-shrink-0" style={{ fontSize: 'clamp(0.9rem, 1.3vw, 1.3rem)' }}>Kategoriler</h2>
            <div className="flex flex-row lg:flex-col overflow-x-auto lg:overflow-y-auto lg:overflow-x-hidden pb-2 lg:pb-0 -mx-2 lg:mx-0 px-2 lg:px-0 flex-1 min-h-0" style={{ gap: 'clamp(0.4rem, 0.6vw, 0.7rem)' }}>
              {categories.map((category) => {
                // Hex rengi RGB'ye çevir
                const hexToRgb = (hex) => {
                  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
                  return result ? {
                    r: parseInt(result[1], 16),
                    g: parseInt(result[2], 16),
                    b: parseInt(result[3], 16)
                  } : { r: 59, g: 130, b: 246 }; // Varsayılan mavi
                };
                
                const rgb = hexToRgb(category.color);
                const isSelected = selectedCategory === category.id;
                // Beyaz renk için özel kontrol
                const isWhite = category.color.toUpperCase() === '#FFFFFF' || category.color.toUpperCase() === 'FFFFFF';
                const textColor = isSelected && isWhite ? 'text-gray-800 dark:text-gray-800' : isSelected ? 'text-white' : 'text-gray-800 dark:text-white';
                // Beyaz kategori için border rengini gri yap
                const borderColor = isWhite ? (isSelected ? '#9CA3AF' : '#D1D5DB') : category.color;
                
                return (
                  <button
                    key={category.id}
                    onClick={() => setSelectedCategory(category.id)}
                    className={`relative overflow-hidden rounded-lg text-center font-bold transition shadow-xl ${
                      isSelected
                        ? `${textColor} scale-105`
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600'
                    }`}
                    style={{
                      borderLeft: `clamp(3px, 0.3vw, 5px) solid ${borderColor}`,
                      minHeight: 'clamp(55px, 6vh, 80px)',
                      width: '100%',
                      backgroundColor: isSelected ? category.color : undefined,
                      fontSize: 'clamp(0.65rem, 0.85vw, 0.9rem)',
                      padding: 'clamp(0.5rem, 0.9vw, 0.9rem) clamp(0.3rem, 0.5vw, 0.6rem)',
                      lineHeight: '1.3',
                      wordBreak: 'normal',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {/* Degrade Işık Süzmesi */}
                    <div
                      className="absolute inset-0 pointer-events-none opacity-25"
                      style={{
                        background: `linear-gradient(to right, rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.5) 0%, rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0) 100%)`
                      }}
                    ></div>
                    
                    {/* İçerik */}
                    <span className="relative z-10 block truncate">{category.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

                 {/* Orta ve Sağ taraf - Ürünler ve Siparişler */}
                 <div className="flex-1 flex flex-col lg:flex-row gap-2 sm:gap-4 min-w-0 overflow-hidden" style={{ height: '100%' }}>
                   {/* Orta - Header ve Ürünler */}
                   <div className="flex-1 flex flex-col gap-2 sm:gap-4 min-w-0 overflow-hidden" style={{ flexBasis: 'auto', minWidth: 'clamp(200px, 20vw, 400px)', maxWidth: '100%', height: '100%' }}>
                     {/* Header */}
                     <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-2 sm:p-3 md:p-4 flex flex-col gap-2 sm:gap-3 flex-shrink-0">
                       {/* Üst satır: Başlık ve Masa Değiştir */}
                       <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                         <h1 className="text-base sm:text-lg md:text-xl lg:text-2xl font-bold text-gray-800 dark:text-white">
                           Masa {id} - Siparişler
                         </h1>
                         {orders.length > 0 && (
                           <button
                             onClick={() => {
                               playActionSound();
                               handleOpenTableTransferModal();
                             }}
                             className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-1 sm:py-1.5 px-2 sm:px-3 rounded-lg transition-all duration-150 transform active:scale-95 text-xs sm:text-sm flex items-center justify-center gap-1 w-fit"
                           >
                             <span>🔄</span>
                             <span>Masa Değiştir</span>
                           </button>
                         )}
                       </div>
                       
                       {/* Alt satır: Butonlar ve Fiyat/Kur bilgileri */}
                       <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-3 w-full">
                         {/* Butonlar */}
                         <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 w-full sm:w-auto flex-shrink-0">
                           {orders.length > 0 && (
                             <>
                               <button
                                 onClick={() => {
                                   playActionSound();
                                   handlePayment('Nakit');
                                 }}
                                 className="bg-green-600 hover:bg-green-700 text-white font-bold py-1.5 sm:py-2 px-2 sm:px-3 md:px-4 rounded-lg transition-all duration-150 transform active:scale-95 flex items-center justify-center gap-1 text-xs sm:text-sm"
                               >
                                 <span className="text-sm sm:text-base">💵</span>
                                 <span className="hidden sm:inline">Nakit ile Kapat</span>
                                 <span className="sm:hidden">Nakit</span>
                               </button>
                               <button
                                 onClick={() => {
                                   playActionSound();
                                   handlePayment('Kart');
                                 }}
                                 className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-1.5 sm:py-2 px-2 sm:px-3 md:px-4 rounded-lg transition-all duration-150 transform active:scale-95 flex items-center justify-center gap-1 text-xs sm:text-sm"
                               >
                                 <span className="text-sm sm:text-base">💳</span>
                                 <span className="hidden sm:inline">Kart ile Kapat</span>
                                 <span className="sm:hidden">Kart</span>
                               </button>
                               <button
                                 onClick={() => {
                                   playActionSound();
                                   handlePrintReceipt();
                                 }}
                                 className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-1.5 sm:py-2 px-2 sm:px-3 md:px-4 rounded-lg transition-all duration-150 transform active:scale-95 flex items-center justify-center gap-1 text-xs sm:text-sm"
                                 title="Fiş Yazdır"
                               >
                                 <span className="text-sm sm:text-base">🖨️</span>
                                 <span className="hidden sm:inline">Fiş Yazdır</span>
                                 <span className="sm:hidden">Fiş</span>
                               </button>
                             </>
                           )}
                          <button
                            onClick={() => {
                              playActionSound();
                              handleExit();
                            }}
                            className="bg-red-600 hover:bg-red-700 text-white font-bold py-1.5 sm:py-2 px-2 sm:px-3 md:px-4 rounded-lg transition-all duration-150 transform active:scale-95 flex items-center justify-center gap-1 text-xs sm:text-sm"
                          >
                            <span className="text-sm sm:text-base">➜]</span>
                            <span>Çıkış</span>
                          </button>
                          <button
                            onClick={() => {
                              playActionSound();
                              navigate('/');
                            }}
                            className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-1.5 sm:py-2 px-2 sm:px-3 md:px-4 rounded-lg transition-all duration-150 transform active:scale-95 flex items-center justify-center gap-1 text-xs sm:text-sm"
                          >
                            <span className="text-sm sm:text-base">✅</span>
                            <span>Tamamla</span>
                          </button>
                         </div>
                         
                         {/* Fiyat ve Kur bilgileri */}
                         <div className="text-right w-full sm:w-auto sm:ml-auto min-w-[120px] sm:min-w-[140px] flex-shrink-0">
                           <p className="text-base sm:text-lg md:text-xl lg:text-2xl font-bold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                             {total.toFixed(2)} ₺
                           </p>
                           {exchangeRates.USD > 0 && exchangeRates.EUR > 0 && total > 0 && (
                             <div className="mt-0.5 sm:mt-1 text-xs text-gray-600 dark:text-gray-400 space-y-0.5">
                               <p className="flex items-center justify-end gap-1 whitespace-nowrap">
                                 <span>💵</span>
                                 <span className="font-semibold">${convertWithDiscount(total, exchangeRates.USD).toFixed(2)}</span>
                                 <span className="text-[10px] hidden sm:inline">({(exchangeRates.USD - 2).toFixed(2)} ₺)</span>
                               </p>
                               <p className="flex items-center justify-end gap-1 whitespace-nowrap">
                                 <span>💶</span>
                                 <span className="font-semibold">€{convertWithDiscount(total, exchangeRates.EUR).toFixed(2)}</span>
                                 <span className="text-[10px] hidden sm:inline">({(exchangeRates.EUR - 2).toFixed(2)} ₺)</span>
                               </p>
                             </div>
                           )}
                         </div>
                       </div>
                     </div>

              {/* Products Grid */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md flex-1 min-h-0 overflow-hidden flex flex-col" style={{ padding: 'clamp(0.3rem, 0.6vw, 0.6rem)' }}>
                <h2 className="font-bold mb-1 text-gray-800 dark:text-white flex-shrink-0" style={{ fontSize: 'clamp(0.85rem, 1.1vw, 1.2rem)' }}>Ürünler</h2>
                     {menuLoading ? (
                       <div className="text-center py-8 text-gray-600 dark:text-gray-400">Yükleniyor...</div>
                     ) : products.length === 0 ? (
                       <div className="text-center py-8 text-gray-600 dark:text-gray-400">
                         Bu kategoride ürün yok
                       </div>
                     ) : (
                       <div className="grid overflow-y-auto overflow-x-hidden flex-1 min-h-0" style={{ 
                         gridTemplateColumns: 'repeat(auto-fill, minmax(clamp(85px, 9.5vw, 160px), 1fr))',
                         gap: 'clamp(0.15rem, 0.35vw, 0.35rem)',
                         gridAutoRows: 'min-content',
                         padding: '0.2rem',
                         justifyContent: 'start',
                         alignContent: 'start'
                       }}>
                {products.map((product) => {
                  // Seçili kategorinin rengini bul
                  const currentCategory = categories.find(cat => cat.id === selectedCategory);
                  const categoryColor = currentCategory?.color || '#3B82F6';
                  
                  // Ürün rengi varsa onu kullan, yoksa kategori rengini kullan
                  // Beyaz (#FFFFFF) ise kategori rengini kullan
                  const productColor = product.color && product.color !== '#FFFFFF' ? product.color : categoryColor;
                  
                  // Hex rengi RGB'ye çevir
                  const hexToRgb = (hex) => {
                    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
                    return result ? {
                      r: parseInt(result[1], 16),
                      g: parseInt(result[2], 16),
                      b: parseInt(result[3], 16)
                    } : { r: 59, g: 130, b: 246 };
                  };
                  
                  const rgb = hexToRgb(productColor);
                  
                  const hasCustomColor = product.color && product.color !== '#FFFFFF';
                  const isClicked = clickedProductId === product.id;
                  
                  // Beyaz kategori/ürün için border rengini gri yap
                  const isWhiteCategory = categoryColor.toUpperCase() === '#FFFFFF' || categoryColor.toUpperCase() === 'FFFFFF';
                  const isWhiteProduct = productColor.toUpperCase() === '#FFFFFF' || productColor.toUpperCase() === 'FFFFFF';
                  const borderColor = (isWhiteCategory || isWhiteProduct) ? '#9CA3AF' : productColor;
                  
                  return (
                    <div
                      key={product.id}
                      onClick={() => handleAddProduct(product.id)}
                      className="relative bg-gray-50 dark:bg-gray-700 rounded-lg cursor-pointer hover:shadow-2xl transition-all duration-150 transform hover:scale-105 active:scale-95 flex items-center justify-center"
                      style={{
                        aspectRatio: '1.2 / 1',
                        border: `clamp(${isClicked ? '2px' : '0.5px'}, ${isClicked ? '0.3vw' : '0.1vw'}, ${isClicked ? '3px' : '1px'}) solid`,
                        borderColor: borderColor,
                        boxShadow: isClicked
                          ? `0 0 20px rgba(59, 130, 246, 0.8), 0 0 40px rgba(147, 51, 234, 0.6), 0 0 60px rgba(236, 72, 153, 0.4), 0 1px 5px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.25)`
                          : hasCustomColor 
                          ? `0 1px 5px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.25), 0 0.5px 3px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.12)`
                          : '0 1px 2px -1px rgb(0 0 0 / 0.08), 0 0.5px 1px -1px rgb(0 0 0 / 0.08)',
                        width: '100%',
                        height: 'auto',
                        padding: 'clamp(0.2rem, 0.4vw, 0.4rem)',
                        overflow: 'hidden',
                        borderRadius: 'clamp(0.2rem, 0.3vw, 0.3rem)'
                      }}
                    >
                      {/* Degrade Işık Süzmesi - Daha Belirgin */}
                      <div
                        className="absolute inset-0 pointer-events-none opacity-40"
                        style={{
                          background: `linear-gradient(to right, rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.6) 0%, rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0) 100%)`
                        }}
                      ></div>
                      
                      {/* İçerik - Tam Kontrollü */}
                      <div 
                        className="relative z-10 flex flex-col items-center justify-center text-center"
                        style={{ 
                          width: '100%',
                          height: '100%',
                          maxWidth: '100%',
                          maxHeight: '100%',
                          overflow: 'hidden',
                          padding: '0',
                          gap: 'clamp(0.2rem, 0.3vw, 0.3rem)'
                        }}
                      >
                        {/* Ürün İsmi - Kesinlikle Taşmayacak */}
                        <div 
                          className="font-bold text-gray-800 dark:text-white"
                          style={{ 
                            width: '100%',
                            maxWidth: '100%',
                            fontSize: 'clamp(0.6rem, 0.75vw, 0.8rem)',
                            lineHeight: '1.3',
                            overflow: 'hidden',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            wordBreak: 'break-word',
                            textOverflow: 'ellipsis',
                            hyphens: 'auto'
                          }}
                        >
                          {product.name}
                        </div>
                        
                        {/* Fiyat - Kesinlikle Taşmayacak */}
                        <div 
                          className="font-bold text-gray-800 dark:text-white" 
                          style={{ 
                            width: '100%',
                            maxWidth: '100%',
                            fontSize: 'clamp(0.65rem, 0.8vw, 0.85rem)',
                            lineHeight: '1.2',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {product.price.toFixed(2)} ₺
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
              </div>
              
              {/* Masayı Hesaba Yolla Butonu - Ürünler box'ının altında */}
              {orders.length > 0 && user?.role !== 'yönetici' && (
                <div className="mt-2 flex-shrink-0">
                  <button
                    onClick={async () => {
                      playActionSound();
                      try {
                        await requestTablePayment(parseInt(id));
                        setShowPaymentRequestSuccess(true);
                      } catch (error) {
                        console.error('Hesap isteği gönderilemedi:', error);
                        setAlertModal({
                          isOpen: true,
                          title: 'Hata',
                          message: 'Hesap isteği gönderilemedi: ' + (error.response?.data?.error || error.message),
                          type: 'error'
                        });
                      }
                    }}
                    className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-2 px-4 rounded-lg transition-all duration-150 transform active:scale-95 flex items-center justify-center gap-2"
                    style={{ fontSize: 'clamp(0.8rem, 1vw, 0.9rem)' }}
                  >
                    <span>📢</span>
                    <span>Masayı Hesaba Yolla</span>
                  </button>
                </div>
              )}
            </div>

            {/* Sağ taraf - Siparişler (Dikey Liste) - Sabit genişlik, itmesin */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md w-full lg:w-auto lg:flex-shrink-0 flex flex-col overflow-hidden" style={{ padding: 'clamp(0.5rem, 1vw, 1rem)', minWidth: 'clamp(150px, 15vw, 240px)', maxWidth: 'clamp(150px, 15vw, 240px)', width: 'clamp(150px, 15vw, 240px)', height: '100%' }}>
              <h2 className="font-bold mb-2 text-gray-800 dark:text-white flex-shrink-0" style={{ fontSize: 'clamp(0.95rem, 1.3vw, 1.25rem)' }}>Siparişler</h2>
              {orders.length === 0 ? (
                <p className="text-center text-gray-600 dark:text-gray-400" style={{ padding: 'clamp(1rem, 2vw, 1.5rem)', fontSize: 'clamp(0.75rem, 1vw, 0.875rem)' }}>
                  Henüz sipariş yok
                </p>
              ) : (
                <div className="flex-1 overflow-y-auto min-h-0" style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(0.375rem, 0.7vw, 0.75rem)' }}>
                  {[...orders].reverse().map((order) => {
                    const orderTime = order.updatedAt || order.createdAt;
                    return (
                    <div
                      key={order.id}
                      className="flex flex-col border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-700/50"
                      style={{ 
                        padding: 'clamp(0.5rem, 1vw, 0.75rem)',
                        gap: 'clamp(0.375rem, 0.7vw, 0.75rem)'
                      }}
                    >
                      {/* Ürün adı - Üstte, tam genişlik */}
                      <h3 className="font-semibold text-gray-800 dark:text-white text-center" style={{ 
                        fontSize: 'clamp(0.75rem, 1vw, 0.875rem)',
                        lineHeight: '1.3',
                        wordBreak: 'break-word',
                        overflowWrap: 'break-word',
                        hyphens: 'auto',
                        width: '100%'
                      }}>
                        {order.name}
                      </h3>
                      
                      {/* Ekleme saati - Ürün adının altında */}
                      {orderTime && (
                        <p className="text-gray-500 dark:text-gray-400 text-center" style={{ 
                          fontSize: 'clamp(0.6rem, 0.8vw, 0.7rem)',
                          lineHeight: '1.2',
                          width: '100%'
                        }}>
                          {formatTimeTR(orderTime)}
                        </p>
                      )}
                      
                      {/* + 1 - Butonları - Ortada, yan yana */}
                      <div className="flex items-center justify-center" style={{ gap: 'clamp(0.5rem, 0.8vw, 1rem)' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleQuantityChange(order.id, order.quantity + 1);
                          }}
                          className="bg-green-500 hover:bg-green-600 text-white rounded-lg font-bold flex items-center justify-center"
                          style={{
                            width: 'clamp(2rem, 3vw, 2.75rem)',
                            height: 'clamp(2rem, 3vw, 2.75rem)',
                            fontSize: 'clamp(1rem, 1.4vw, 1.25rem)'
                          }}
                        >
                          +
                        </button>
                        <span className="text-center font-bold text-gray-800 dark:text-white" style={{ 
                          minWidth: 'clamp(2rem, 3vw, 2.75rem)',
                          fontSize: 'clamp(0.9rem, 1.2vw, 1.1rem)'
                        }}>
                          {order.quantity}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleQuantityChange(order.id, order.quantity - 1);
                          }}
                          className="bg-red-500 hover:bg-red-600 text-white rounded-lg font-bold flex items-center justify-center"
                          style={{
                            width: 'clamp(2rem, 3vw, 2.75rem)',
                            height: 'clamp(2rem, 3vw, 2.75rem)',
                            fontSize: 'clamp(1rem, 1.4vw, 1.25rem)'
                          }}
                        >
                          -
                        </button>
                      </div>
                      
                      {/* Fiyat bilgisi */}
                      <div className="flex items-center justify-between" style={{ gap: 'clamp(0.25rem, 0.5vw, 0.5rem)', fontSize: 'clamp(0.65rem, 0.85vw, 0.75rem)' }}>
                        <p className="text-gray-600 dark:text-gray-400 flex-shrink-1" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {order.price.toFixed(2)} ₺ x {order.quantity}
                        </p>
                        <span className="font-bold text-blue-600 dark:text-blue-400 flex-shrink-0" style={{ whiteSpace: 'nowrap' }}>
                          {order.total.toFixed(2)} ₺
                        </span>
                      </div>
                      
                      {/* Sil butonu - Altta, tam genişlik */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteOrder(order.id);
                        }}
                        className="w-full bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold flex items-center justify-center"
                        style={{
                          padding: 'clamp(0.375rem, 0.6vw, 0.5rem)',
                          fontSize: 'clamp(0.7rem, 0.9vw, 0.8rem)'
                        }}
                      >
                        SİL
                      </button>
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* Ödeme Başarı Modalı */}
      {showPaymentSuccess && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl p-12 max-w-md w-full mx-4 text-center">
            <div className="mb-8">
              <div className="text-6xl mb-4">
                {paymentType === 'Nakit' ? '💵' : '💳'}
              </div>
              <h2 className="text-3xl font-bold text-gray-800 dark:text-white mb-2">
                Ödeme Başarılı!
              </h2>
              <p className="text-xl text-gray-600 dark:text-gray-300">
                Ödeme {paymentType === 'Nakit' ? 'nakit' : 'kart'} ile alındı
              </p>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-4">
                {paymentAmount.toFixed(2)} ₺
              </p>
            </div>
            <button
              onClick={handlePaymentSuccessClose}
              className="w-full py-6 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-2xl transition shadow-lg"
            >
              Tamam
            </button>
          </div>
        </div>
      )}
      
      {/* Hesap İsteği Başarı Modalı */}
      {showPaymentRequestSuccess && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 text-center">
            <div className="mb-6">
              <div className="text-5xl mb-4">📢</div>
              <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">
                Masa {id} Hesabı Alınmak Üzere Kasaya Yönlendirilmiştir.
              </h2>
            </div>
            
            <button
              onClick={() => setShowPaymentRequestSuccess(false)}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-6 rounded-lg transition-all duration-150 transform active:scale-95 text-lg"
            >
              Tamamla
            </button>
          </div>
        </div>
      )}
      
      {/* Masa Değiştirme Modalı */}
      {showTableTransferModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl p-4 sm:p-6 max-w-2xl w-full mx-4">
            <h2 className="text-lg sm:text-xl font-bold text-gray-800 dark:text-white mb-2">
              Masa Değiştir - Masa {id}
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              Siparişleri taşımak istediğiniz masayı seçin:
            </p>
            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-3 max-h-[500px] overflow-y-auto">
              {tables
                .filter(table => table.id !== parseInt(id))
                .map((table) => {
                  const isDolu = table.status === 'dolu';
                  const isBos = table.status === 'boş';
                  return (
                    <button
                      key={table.id}
                      onClick={() => handleTableTransfer(table.id)}
                      className={`p-4 rounded-lg shadow-md transition-all duration-150 transform hover:scale-105 active:scale-95 border-2 ${
                        isDolu 
                          ? 'bg-red-50 dark:bg-red-900/20 border-red-500' 
                          : isBos 
                          ? 'bg-green-50 dark:bg-green-900/20 border-green-500' 
                          : 'bg-gray-50 dark:bg-gray-700 border-gray-400'
                      }`}
                    >
                      <div className="text-center">
                        <div className={`w-3 h-3 rounded-full mx-auto mb-2 ${
                          isDolu ? 'bg-red-500' : isBos ? 'bg-green-500' : 'bg-gray-400'
                        }`}></div>
                        <p className="font-bold text-gray-800 dark:text-white text-sm">
                          {table.name}
                        </p>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                          {table.total ? table.total.toFixed(2) : '0.00'} ₺
                        </p>
                      </div>
                    </button>
                  );
                })}
            </div>
            <button
              onClick={() => setShowTableTransferModal(false)}
              className="mt-3 w-full py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold transition-all duration-150 transform active:scale-95 text-sm"
            >
              İptal
            </button>
          </div>
        </div>
      )}
      
      {/* Alert Modal */}
      <AlertModal
        isOpen={alertModal.isOpen}
        onClose={() => setAlertModal({ ...alertModal, isOpen: false })}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
      />
      
      <Footer className="flex-shrink-0 mt-auto" />
    </div>
  );
};

export default TableDetail;

