import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getOrders, updateOrder, deleteOrder, createPayment, getCategories, getProducts, createOrder } from '../services/api';
import { getExchangeRates, convertWithDiscount } from '../services/currency';
import { broadcastUpdate, onUpdate, UPDATE_TYPES } from '../services/broadcast';
import Footer from '../components/Footer';

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
    // Fonksiyonları useEffect içinde tanımla (infinite loop'u önlemek için)
    const loadOrdersLocal = async () => {
      try {
        const response = await getOrders(id);
        setOrders(response.data);
        const total = response.data.reduce((sum, order) => sum + order.total, 0);
        setTable({ id: parseInt(id), total });
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

  const handleQuantityChange = async (orderId, newQuantity) => {
    if (newQuantity < 1) {
      handleDeleteOrder(orderId);
      return;
    }

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
    try {
      // Mevcut siparişlerde bu ürün var mı kontrol et
      const existingOrder = orders.find(order => order.productId === productId);
      
      if (existingOrder) {
        // Eğer varsa, miktarını artır
        await updateOrder(existingOrder.id, { quantity: existingOrder.quantity + 1 });
      } else {
        // Yoksa yeni sipariş oluştur
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
      alert('Ürün eklenirken bir hata oluştu: ' + (error.response?.data?.error || error.message));
    }
  };

  const handlePayment = async (selectedPaymentType) => {
    try {
      await createPayment({ tableId: parseInt(id), paymentType: selectedPaymentType });
      // Ödeme yapıldı - masalar ve ödemeler güncellenmeli
      broadcastUpdate(UPDATE_TYPES.ALL);
      // Ödeme başarı modalını göster
      setPaymentType(selectedPaymentType);
      setShowPaymentSuccess(true);
    } catch (error) {
      console.error('Ödeme yapılamadı:', error);
      alert('Ödeme yapılırken bir hata oluştu');
    }
  };

  const handlePaymentSuccessClose = () => {
    setShowPaymentSuccess(false);
    setPaymentType(null);
    navigate('/');
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
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex flex-col overflow-hidden">
      <div className="flex-1 pt-4 overflow-hidden">
        {/* Menu Section */}
        <div className="flex flex-col lg:flex-row gap-2 sm:gap-4 px-2 sm:px-4 h-full overflow-hidden">
          {/* Categories - Sol tarafta, küçük ekranlarda üstte */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-2 sm:p-3 md:p-4 w-full lg:w-auto lg:min-w-[180px] xl:min-w-[220px] 2xl:min-w-[260px] lg:flex-shrink-0 overflow-y-auto lg:max-h-[calc(100vh-100px)] max-h-[200px] lg:max-h-none">
            <h2 className="text-base sm:text-lg md:text-xl lg:text-2xl font-bold mb-2 sm:mb-3 md:mb-4 text-gray-800 dark:text-white">Kategoriler</h2>
            <div className="flex flex-row lg:flex-col gap-2 sm:gap-4 overflow-x-auto lg:overflow-x-visible pb-2 lg:pb-0 -mx-2 lg:mx-0 px-2 lg:px-0">
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
                
                return (
                  <button
                    key={category.id}
                    onClick={() => setSelectedCategory(category.id)}
                    className={`relative overflow-hidden px-3 sm:px-4 md:px-6 lg:px-8 py-2 sm:py-3 md:py-4 lg:py-6 rounded-lg text-left font-bold text-xs sm:text-sm md:text-base lg:text-lg xl:text-xl transition shadow-xl whitespace-nowrap lg:whitespace-normal flex-shrink-0 lg:flex-shrink ${
                      isSelected
                        ? `${textColor} scale-105`
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600'
                    }`}
                    style={{
                      borderLeft: `6px solid ${category.color}`,
                      minHeight: '40px',
                      minWidth: '120px',
                      backgroundColor: isSelected ? category.color : undefined,
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
                    <span className="relative z-10">{category.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

                 {/* Orta ve Sağ taraf - Ürünler ve Siparişler */}
                 <div className="flex-1 flex flex-col lg:flex-row gap-2 sm:gap-4 min-w-0 overflow-hidden">
                   {/* Orta - Header ve Ürünler */}
                   <div className="flex-1 flex flex-col gap-2 sm:gap-4 min-w-0 overflow-hidden">
                     {/* Header */}
                     <div className="bg-white dark:bg-gray-800 shadow-md p-2 sm:p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-4 flex-shrink-0">
                       <div>
                         <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-800 dark:text-white">
                           Masa {id} - Siparişler
                         </h1>
                       </div>
                       <div className="flex flex-wrap items-center gap-2 sm:gap-4 w-full sm:w-auto">
                         {orders.length > 0 && (
                           <div className="flex gap-2 sm:gap-3">
                             <button
                               onClick={() => handlePayment('Nakit')}
                               className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 sm:py-3 md:py-4 px-4 sm:px-6 md:px-8 rounded-lg transition flex items-center justify-center gap-1 sm:gap-2 text-xs sm:text-sm md:text-base"
                             >
                               <span className="text-base sm:text-lg md:text-xl">💵</span>
                               <span className="hidden sm:inline">Nakit ile Kapat</span>
                               <span className="sm:hidden">Nakit</span>
                             </button>
                             <button
                               onClick={() => handlePayment('Kart')}
                               className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 sm:py-3 md:py-4 px-4 sm:px-6 md:px-8 rounded-lg transition flex items-center justify-center gap-1 sm:gap-2 text-xs sm:text-sm md:text-base"
                             >
                               <span className="text-base sm:text-lg md:text-xl">💳</span>
                               <span className="hidden sm:inline">Kart ile Kapat</span>
                               <span className="sm:hidden">Kart</span>
                             </button>
                           </div>
                         )}
                         <button
                           onClick={() => navigate('/')}
                           className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 sm:py-3 md:py-4 px-4 sm:px-6 md:px-8 rounded-lg transition text-xs sm:text-sm md:text-base lg:text-lg"
                         >
                           Tamamla
                         </button>
                         <div className="text-right ml-auto sm:ml-0">
                           <p className="text-lg sm:text-xl md:text-2xl font-bold text-blue-600 dark:text-blue-400">
                             {total.toFixed(2)} ₺
                           </p>
                           {exchangeRates.USD > 0 && exchangeRates.EUR > 0 && total > 0 && (
                             <div className="mt-1 sm:mt-2 text-xs sm:text-sm text-gray-600 dark:text-gray-400 space-y-0.5 sm:space-y-1">
                               <p className="flex items-center justify-end gap-1 sm:gap-2">
                                 <span>💵 Dolar:</span>
                                 <span className="font-semibold">${convertWithDiscount(total, exchangeRates.USD).toFixed(2)}</span>
                                 <span className="text-xs hidden sm:inline">({(exchangeRates.USD - 2).toFixed(2)} ₺)</span>
                               </p>
                               <p className="flex items-center justify-end gap-1 sm:gap-2">
                                 <span>💶 Euro:</span>
                                 <span className="font-semibold">€{convertWithDiscount(total, exchangeRates.EUR).toFixed(2)}</span>
                                 <span className="text-xs hidden sm:inline">({(exchangeRates.EUR - 2).toFixed(2)} ₺)</span>
                               </p>
                             </div>
                           )}
                         </div>
                       </div>
                     </div>

                       {/* Products Grid */}
                     <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-2 sm:p-4 flex-1 min-h-0 overflow-hidden flex flex-col">
                       <h2 className="text-lg sm:text-xl md:text-2xl font-bold mb-2 sm:mb-4 text-gray-800 dark:text-white flex-shrink-0">Ürünler</h2>
                     {menuLoading ? (
                       <div className="text-center py-8 text-gray-600 dark:text-gray-400">Yükleniyor...</div>
                     ) : products.length === 0 ? (
                       <div className="text-center py-8 text-gray-600 dark:text-gray-400">
                         Bu kategoride ürün yok
                       </div>
                     ) : (
                       <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-1.5 sm:gap-2 overflow-y-auto flex-1 min-h-0">
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
                  
                  return (
                    <div
                      key={product.id}
                      onClick={() => handleAddProduct(product.id)}
                      className="relative overflow-hidden bg-gray-50 dark:bg-gray-700 rounded-lg p-1.5 sm:p-2 cursor-pointer hover:shadow-2xl transition transform hover:scale-105 flex flex-col justify-center"
                      style={{
                        aspectRatio: '1.5 / 1',
                        border: '2px solid',
                        borderColor: productColor,
                        boxShadow: hasCustomColor 
                          ? `0 3px 15px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.3), 0 1px 7px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.2)`
                          : '0 3px 5px -1px rgb(0 0 0 / 0.1), 0 1px 3px -2px rgb(0 0 0 / 0.1)',
                        minHeight: '80px'
                      }}
                    >
                      {/* Degrade Işık Süzmesi - Daha Belirgin */}
                      <div
                        className="absolute inset-0 pointer-events-none opacity-40"
                        style={{
                          background: `linear-gradient(to right, rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.6) 0%, rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0) 100%)`
                        }}
                      ></div>
                      
                      {/* İçerik */}
                      <div className="relative z-10 flex flex-col items-center justify-center text-center h-full px-1" style={{ transform: 'translateZ(0)', willChange: 'transform' }}>
                        <h3 className="font-bold text-gray-800 dark:text-white mb-1 sm:mb-2 text-xs sm:text-sm md:text-base lg:text-lg leading-tight break-words w-full" style={{ transform: 'translateZ(0)' }}>
                          {product.name}
                        </h3>
                        <p className="text-sm sm:text-base md:text-lg lg:text-xl font-bold whitespace-nowrap" style={{ color: productColor, transform: 'translateZ(0)' }}>
                          {product.price.toFixed(2)} ₺
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
              </div>
            </div>

                 {/* Sağ taraf - Siparişler (Dikey Liste) */}
                 <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-2 sm:p-3 md:p-4 w-full lg:w-auto lg:min-w-[200px] xl:min-w-[240px] 2xl:min-w-[280px] lg:flex-shrink-0 flex flex-col overflow-hidden lg:max-h-[calc(100vh-100px)] max-h-[300px] lg:max-h-none">
                   <h2 className="text-base sm:text-lg md:text-xl lg:text-2xl font-bold mb-2 sm:mb-3 md:mb-4 text-gray-800 dark:text-white flex-shrink-0">Siparişler</h2>
              {orders.length === 0 ? (
                <p className="text-center text-gray-600 dark:text-gray-400 py-6 text-sm sm:text-base">
                  Henüz sipariş yok
                </p>
              ) : (
                <div className="space-y-2 sm:space-y-3 flex-1 overflow-y-auto min-h-0">
                  {orders.map((order) => (
                    <div
                      key={order.id}
                      className="flex flex-col p-2 sm:p-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-700/50"
                    >
                      {/* Ürün adı ve artı/eksi butonları */}
                      <div className="flex items-center justify-between mb-1 sm:mb-2 gap-1 sm:gap-2">
                        <h3 className="font-semibold text-xs sm:text-sm md:text-base text-gray-800 dark:text-white flex-1 break-words">
                          {order.name}
                        </h3>
                        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleQuantityChange(order.id, order.quantity - 1);
                            }}
                            className="w-8 h-8 sm:w-10 sm:h-10 bg-red-500 hover:bg-red-600 text-white rounded-lg text-base sm:text-lg md:text-xl font-bold flex items-center justify-center"
                          >
                            -
                          </button>
                          <span className="w-8 sm:w-10 text-center font-bold text-sm sm:text-base md:text-lg text-gray-800 dark:text-white">
                            {order.quantity}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleQuantityChange(order.id, order.quantity + 1);
                            }}
                            className="w-8 h-8 sm:w-10 sm:h-10 bg-green-500 hover:bg-green-600 text-white rounded-lg text-base sm:text-lg md:text-xl font-bold flex items-center justify-center"
                          >
                            +
                          </button>
                        </div>
                      </div>
                      
                      {/* Fiyat bilgisi */}
                      <div className="flex items-center justify-between mb-1 sm:mb-2">
                        <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                          {order.price.toFixed(2)} ₺ x {order.quantity}
                        </p>
                        <span className="text-sm sm:text-base font-bold text-blue-600 dark:text-blue-400">
                          {order.total.toFixed(2)} ₺
                        </span>
                      </div>
                      
                      {/* Sil butonu (enine) */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteOrder(order.id);
                        }}
                        className="w-full py-1.5 sm:py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs sm:text-sm font-semibold flex items-center justify-center"
                      >
                        Sil
                      </button>
                    </div>
                  ))}
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
                {total.toFixed(2)} ₺
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
      
      <Footer />
    </div>
  );
};

export default TableDetail;

