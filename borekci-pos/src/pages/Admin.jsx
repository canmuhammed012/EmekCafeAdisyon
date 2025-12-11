import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  getTables,
  createTable,
  deleteTable,
  getDailyReport,
  getPayments,
  updateCategoriesSort,
  updateProductsSort,
} from '../services/api';
import { broadcastUpdate, onUpdate, UPDATE_TYPES } from '../services/broadcast';
import { formatDateTR, formatTimeTR } from '../utils/dateFormatter';
import { getSocket } from '../services/socket';
import Footer from '../components/Footer';

// Hex rengi RGB'ye çevir (yardımcı fonksiyon)
const hexToRgb = (hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 59, g: 130, b: 246 };
};

const Admin = ({ user }) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('categories');
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [tables, setTables] = useState([]);
  const [report, setReport] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [payments, setPayments] = useState([]);
  
  // Form states
  const [categoryForm, setCategoryForm] = useState({ name: '', color: '#3B82F6' });
  const [productForm, setProductForm] = useState({ name: '', price: '', categoryId: '', color: '#FFFFFF' });
  const [tableForm, setTableForm] = useState({ name: '' });
  const [editingId, setEditingId] = useState(null);
  
  // Modal states
  const [showProductModal, setShowProductModal] = useState(false);
  const [modalStep, setModalStep] = useState('form'); // 'form', 'category', 'color'
  const [showCategoryColorModal, setShowCategoryColorModal] = useState(false);
  const [showSortModal, setShowSortModal] = useState(false);
  const [sortMode, setSortMode] = useState('categories'); // 'categories' or 'products'
  const [draggedItem, setDraggedItem] = useState(null);
  const [draggedElement, setDraggedElement] = useState(null);
  const [sortedCategories, setSortedCategories] = useState([]);
  const [sortedProducts, setSortedProducts] = useState({}); // { categoryId: [productIds] }
  
  // Kategori açık/kapalı durumu
  const [expandedCategories, setExpandedCategories] = useState([]);
  
  // Masa hesap isteği bildirimi
  const [paymentRequest, setPaymentRequest] = useState(null);
  const [isBlinking, setIsBlinking] = useState(false);
  const audioRef = useRef(null);
  const blinkIntervalRef = useRef(null);
  const soundIntervalRef = useRef(null);
  
  // 30 adet önceden tanımlı renk paleti
  const colorPalette = [
    '#FFFFFF', '#000000', '#FF0000', '#00FF00', '#0000FF', '#FFFF00',
    '#FF00FF', '#00FFFF', '#FFA500', '#800080', '#008000', '#808080',
    '#FFC0CB', '#A52A2A', '#FFD700', '#C0C0C0', '#FF6347', '#4B0082',
    '#20B2AA', '#FF1493', '#00CED1', '#FF4500', '#DA70D6', '#EEE8AA',
    '#98FB98', '#F08080', '#E0BBE4', '#FFDAB9', '#B0E0E6', '#F0E68C'
  ];

  useEffect(() => {
    // Fonksiyonları useEffect içinde tanımla (infinite loop'u önlemek için)
    const loadCategoriesLocal = async () => {
      try {
        const response = await getCategories();
        // sortOrder'a göre sırala
        const sorted = [...(response.data || [])].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
        setCategories(sorted);
      } catch (error) {
        console.error('Kategoriler yüklenemedi:', error);
      }
    };

    const loadProductsLocal = async () => {
      try {
        const response = await getProducts();
        setProducts(response.data);
      } catch (error) {
        console.error('Ürünler yüklenemedi:', error);
      }
    };

    const loadTablesLocal = async () => {
      try {
        const response = await getTables();
        setTables(response.data);
      } catch (error) {
        console.error('Masalar yüklenemedi:', error);
      }
    };

    const loadReportLocal = async () => {
      try {
        const [reportResponse, paymentsResponse] = await Promise.all([
          getDailyReport(selectedDate),
          getPayments(selectedDate)
        ]);
        setReport(reportResponse.data);
        setPayments(paymentsResponse.data);
      } catch (error) {
        console.error('Rapor yüklenemedi:', error);
      }
    };

    const loadAllData = async () => {
      await loadCategoriesLocal();
      await loadProductsLocal();
      await loadTablesLocal();
      await loadReportLocal();
    };

    // İlk yükleme - socket event listener'ları kaldırıldı
    loadAllData();

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
      console.log('📥 Broadcast alındı:', event.type);
      
      switch (event.type) {
        case UPDATE_TYPES.CATEGORIES:
          loadCategoriesLocal();
          break;
        case UPDATE_TYPES.PRODUCTS:
          loadProductsLocal();
          break;
        case UPDATE_TYPES.TABLES:
          loadTablesLocal();
          break;
        case UPDATE_TYPES.ALL:
          loadAllData();
          break;
        default:
          // Bilinmeyen tip - tüm verileri yenile
          loadAllData();
      }
    });

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      unsubscribe();
    };
  }, [selectedDate]); // Sadece selectedDate değiştiğinde rapor yenilenir

  // Masa hesap isteği bildirimini dinle
  useEffect(() => {
    let socket = null;
    let isMounted = true;
    
    const setupPaymentRequestListener = async () => {
      try {
        socket = await getSocket();
        if (!socket) {
          console.warn('⚠ Socket bağlantısı kurulamadı');
          return;
        }
        
        // Socket bağlantısını bekle
        if (!socket.connected) {
          socket.once('connect', () => {
            console.log('✅ Socket bağlandı, listener ekleniyor...');
            setupListener();
          });
        } else {
          setupListener();
        }
        
        function setupListener() {
          socket.on('tableRequestPayment', (data) => {
            console.log('📢 Masa hesap isteği alındı:', data);
            if (!isMounted) return;
            
            setPaymentRequest(data);
            setIsBlinking(true);
            
            // Yanıp sönme efekti
            if (blinkIntervalRef.current) {
              clearInterval(blinkIntervalRef.current);
            }
            blinkIntervalRef.current = setInterval(() => {
              setIsBlinking(prev => !prev);
            }, 500);
            
            // Ses çalma (her 2 saniyede bir)
            const playSound = () => {
              try {
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();

                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);

                // Dikkat çekici bir bip sesi
                oscillator.frequency.value = 1000;
                oscillator.type = 'sine';
                
                gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);

                oscillator.start(audioContext.currentTime);
                oscillator.stop(audioContext.currentTime + 0.2);
              } catch (error) {
                console.warn('Ses çalınamadı:', error);
              }
            };
            
            // İlk sesi hemen çal
            playSound();
            
            // Her 2 saniyede bir ses çal
            if (soundIntervalRef.current) {
              clearInterval(soundIntervalRef.current);
            }
            soundIntervalRef.current = setInterval(() => {
              playSound();
            }, 2000);
          });
          
          console.log('✅ Masa hesap isteği listener eklendi');
        }
      } catch (error) {
        console.error('❌ Socket listener kurulum hatası:', error);
      }
    };
    
    setupPaymentRequestListener();
    
    return () => {
      isMounted = false;
      if (socket) {
        socket.off('tableRequestPayment');
      }
      if (blinkIntervalRef.current) {
        clearInterval(blinkIntervalRef.current);
      }
      if (soundIntervalRef.current) {
        clearInterval(soundIntervalRef.current);
      }
    };
  }, []);

  // Bildirimi kapat
  const handleClosePaymentRequest = () => {
    setPaymentRequest(null);
    setIsBlinking(false);
    if (blinkIntervalRef.current) {
      clearInterval(blinkIntervalRef.current);
    }
    if (soundIntervalRef.current) {
      clearInterval(soundIntervalRef.current);
    }
  };

  // Hesabı Al butonuna basıldığında
  const handleAcceptPaymentRequest = () => {
    if (paymentRequest) {
      handleClosePaymentRequest();
      navigate(`/table/${paymentRequest.tableId}`);
    }
  };

  // loadData fonksiyonu kaldırıldı - kullanılmıyor

  const loadCategories = async () => {
    try {
      const response = await getCategories();
      // sortOrder'a göre sırala
      const sorted = [...(response.data || [])].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
      setCategories(sorted);
    } catch (error) {
      console.error('Kategoriler yüklenemedi:', error);
    }
  };

  const loadProducts = async () => {
    try {
      const response = await getProducts();
      setProducts(response.data);
    } catch (error) {
      console.error('Ürünler yüklenemedi:', error);
    }
  };

  const loadTables = async () => {
    try {
      const response = await getTables();
      setTables(response.data);
    } catch (error) {
      console.error('Masalar yüklenemedi:', error);
    }
  };

  const loadReport = async (date) => {
    try {
      const reportDate = date || selectedDate;
      const [reportResponse, paymentsResponse] = await Promise.all([
        getDailyReport(reportDate),
        getPayments(reportDate)
      ]);
      setReport(reportResponse.data);
      setPayments(paymentsResponse.data);
    } catch (error) {
      console.error('Rapor yüklenemedi:', error);
    }
  };

  const handleDateChange = (e) => {
    const newDate = e.target.value;
    setSelectedDate(newDate);
    loadReport(newDate);
  };

  const exportToExcel = () => {
    if (!report) return;

    // Excel workbook oluştur
    const wb = XLSX.utils.book_new();

    // TEK SAYFA - ÖZET VE DETAYLI ÖDEMELER BİRLİKTE
    const excelData = [
      ['Emek Cafe - Gün Sonu Raporu'],
      ['Tarih:', selectedDate],
      [],
      ['Toplam Masa:', report.totalTables || 0],
      ['Toplam Ödeme:', report.totalPayments || 0],
      ['Toplam Ciro:', `${(report.totalRevenue || 0).toFixed(2)} ₺`],
      ['Nakit:', `${(report.cashRevenue || 0).toFixed(2)} ₺`],
      ['Kart:', `${(report.cardRevenue || 0).toFixed(2)} ₺`],
      [],
      [],
      ['DETAYLI ÖDEMELER'],
      [],
      ['Tarih', 'Saat', 'Masa', 'Tutar', 'Ödeme Türü']
    ];

    // Detaylı ödemeleri ekle
    if (payments && payments.length > 0) {
      payments.forEach(payment => {
        excelData.push([
          new Date(payment.createdAt).toLocaleDateString('tr-TR'),
          new Date(payment.createdAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
          payment.tableName || 'Bilinmiyor',
          `${(payment.amount || 0).toFixed(2)} ₺`,
          payment.paymentType || 'Bilinmiyor'
        ]);
      });
    } else {
      excelData.push(['Ödeme bulunamadı', '', '', '', '']);
    }

    // Worksheet oluştur
    const ws = XLSX.utils.aoa_to_sheet(excelData);
    
    // Sütun genişliklerini ayarla
    ws['!cols'] = [
      { wch: 20 },  // A sütunu (Etiketler / Tarih)
      { wch: 15 },  // B sütunu (Değerler / Saat)
      { wch: 15 },  // C sütunu (Masa)
      { wch: 15 },  // D sütunu (Tutar)
      { wch: 15 }   // E sütunu (Ödeme Türü)
    ];
    
    XLSX.utils.book_append_sheet(wb, ws, 'Gün Sonu Raporu');

    // Dosyayı indir
    XLSX.writeFile(wb, `Emek_Cafe_Rapor_${selectedDate}.xlsx`);
  };

  const handleCategorySubmit = async (e) => {
    e.preventDefault();
    
    // Eğer düzenleme modundaysa direkt kaydet
    if (editingId) {
      try {
        await updateCategory(editingId, categoryForm);
        setCategoryForm({ name: '', color: '#3B82F6' });
        setEditingId(null);
        loadCategories();
        broadcastUpdate(UPDATE_TYPES.CATEGORIES);
      } catch (error) {
        console.error('Kategori kaydedilemedi:', error);
      }
    } else {
      // Yeni kategori ekleme - renk seçim modalını aç
      if (categoryForm.name.trim()) {
        setShowCategoryColorModal(true);
      }
    }
  };

  const handleCategoryColorSelect = async (selectedColor) => {
    try {
      await createCategory({ ...categoryForm, color: selectedColor });
      setCategoryForm({ name: '', color: '#3B82F6' });
      setShowCategoryColorModal(false);
      // Local state'i güncelle
      loadCategories();
      // Diğer sayfalara bildir
      broadcastUpdate(UPDATE_TYPES.CATEGORIES);
    } catch (error) {
      console.error('Kategori kaydedilemedi:', error);
    }
  };

  const handleProductSubmit = async () => {
    // Form validasyonu
    if (!productForm.name || !productForm.price || !productForm.categoryId) {
      alert('Lütfen tüm alanları doldurun!');
      return;
    }
    
    try {
      if (editingId) {
        await updateProduct(editingId, { ...productForm, price: parseFloat(productForm.price) });
      } else {
        await createProduct({ ...productForm, price: parseFloat(productForm.price) });
      }
      closeProductModal();
      // Local state'i güncelle
      loadProducts();
      // Diğer sayfalara bildir
      broadcastUpdate(UPDATE_TYPES.PRODUCTS);
    } catch (error) {
      console.error('Ürün kaydedilemedi:', error);
      alert('Ürün kaydedilirken hata oluştu!');
    }
  };

  const handleTableSubmit = async (e) => {
    e.preventDefault();
    try {
      await createTable(tableForm);
      setTableForm({ name: '' });
      // Local state'i güncelle
      loadTables();
      // Diğer sayfalara bildir
      broadcastUpdate(UPDATE_TYPES.TABLES);
    } catch (error) {
      console.error('Masa oluşturulamadı:', error);
    }
  };

  const handleEdit = (type, item) => {
    setEditingId(item.id);
    if (type === 'category') {
      setCategoryForm({ name: item.name, color: item.color });
    } else if (type === 'product') {
      setProductForm({ name: item.name, price: item.price, categoryId: item.categoryId, color: item.color || '#FFFFFF' });
      setShowProductModal(true);
      setModalStep('form');
    }
  };
  
  const openProductModal = () => {
    setEditingId(null);
    setProductForm({ name: '', price: '', categoryId: '', color: '#FFFFFF' });
    setShowProductModal(true);
    setModalStep('form');
  };
  
  const closeProductModal = () => {
    setShowProductModal(false);
    setModalStep('form');
    setEditingId(null);
    setProductForm({ name: '', price: '', categoryId: '', color: '#FFFFFF' });
  };
  
  const toggleCategory = (categoryId) => {
    setExpandedCategories(prev => 
      prev.includes(categoryId) 
        ? prev.filter(id => id !== categoryId)
        : [...prev, categoryId]
    );
  };

  const openSortModal = async () => {
    setShowSortModal(true);
    setSortMode('categories');
    
    // Verileri yeniden yükle (güncel sıralamayı almak için)
    try {
      const [categoriesResponse, productsResponse] = await Promise.all([
        getCategories(),
        getProducts()
      ]);
      
      const freshCategories = categoriesResponse.data || [];
      const freshProducts = productsResponse.data || [];
      
      // Kategorileri mevcut sortOrder'a göre sırala
      const sortedCats = [...freshCategories].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
      setSortedCategories(sortedCats.map(c => c.id));
      
      // Her kategori için ürünleri mevcut sortOrder'a göre sıralı olarak ayarla
      const productsByCategory = {};
      freshCategories.forEach(cat => {
        const catProducts = freshProducts
          .filter(p => p.categoryId === cat.id)
          .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
        productsByCategory[cat.id] = catProducts.map(p => p.id);
      });
      setSortedProducts(productsByCategory);
      
      // State'i de güncelle
      setCategories(freshCategories);
      setProducts(freshProducts);
    } catch (error) {
      console.error('Sıralama modalı açılırken hata:', error);
      // Hata olsa bile mevcut state ile devam et
      const sortedCats = [...categories].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
      setSortedCategories(sortedCats.map(c => c.id));
      const productsByCategory = {};
      categories.forEach(cat => {
        const catProducts = products
          .filter(p => p.categoryId === cat.id)
          .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
        productsByCategory[cat.id] = catProducts.map(p => p.id);
      });
      setSortedProducts(productsByCategory);
    }
  };

  const handleDragStart = (e, itemId, type) => {
    setDraggedItem({ id: itemId, type });
    setDraggedElement(e.currentTarget);
    e.dataTransfer.effectAllowed = 'move';
    e.currentTarget.style.opacity = '0.5';
    e.currentTarget.style.transform = 'scale(0.95)';
  };

  const handleDragEnd = (e) => {
    if (draggedElement) {
      draggedElement.style.opacity = '1';
      draggedElement.style.transform = 'scale(1)';
    }
    setDraggedItem(null);
    setDraggedElement(null);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e, targetId, type) => {
    e.preventDefault();
    if (!draggedItem || draggedItem.id === targetId) return;

    if (type === 'categories') {
      const newOrder = [...sortedCategories];
      const draggedIndex = newOrder.indexOf(draggedItem.id);
      const targetIndex = newOrder.indexOf(targetId);
      newOrder.splice(draggedIndex, 1);
      newOrder.splice(targetIndex, 0, draggedItem.id);
      setSortedCategories(newOrder);
    } else if (type === 'products') {
      // categoryId'yi parent container'dan al
      let categoryId = null;
      let element = e.currentTarget;
      while (element && !categoryId) {
        categoryId = element.dataset?.categoryId;
        element = element.parentElement;
      }
      
      if (!categoryId) {
        console.error('Category ID bulunamadı');
        setDraggedItem(null);
        return;
      }
      
      categoryId = parseInt(categoryId);
      const newOrder = [...(sortedProducts[categoryId] || [])];
      const draggedIndex = newOrder.indexOf(draggedItem.id);
      const targetIndex = newOrder.indexOf(targetId);
      
      if (draggedIndex === -1 || targetIndex === -1) {
        setDraggedItem(null);
        return;
      }
      
      newOrder.splice(draggedIndex, 1);
      newOrder.splice(targetIndex, 0, draggedItem.id);
      setSortedProducts({ ...sortedProducts, [categoryId]: newOrder });
    }
    setDraggedItem(null);
  };

  const handleSaveSort = async () => {
    try {
      if (sortMode === 'categories') {
        console.log('📤 Kategoriler sıralaması kaydediliyor:', sortedCategories);
        const response = await updateCategoriesSort(sortedCategories);
        console.log('✅ Kategoriler sıralaması kaydedildi:', response);
        
        // Biraz bekle (veritabanı güncellemesinin tamamlanması için)
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Verileri yeniden yükle
        const categoriesResponse = await getCategories();
        const freshCategories = categoriesResponse.data || [];
        // sortOrder'a göre sırala
        const sortedCats = [...freshCategories].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
        console.log('📥 Yüklenen kategoriler:', sortedCats.map(c => ({ id: c.id, name: c.name, sortOrder: c.sortOrder })));
        setCategories(sortedCats);
        
        broadcastUpdate(UPDATE_TYPES.CATEGORIES);
        broadcastUpdate(UPDATE_TYPES.ALL); // Tüm sayfaları güncelle
      } else {
        // Tüm kategoriler için ürün sıralamalarını kaydet
        console.log('📤 Ürünler sıralaması kaydediliyor:', sortedProducts);
        const promises = Object.keys(sortedProducts).map(categoryId => {
          const productIds = sortedProducts[categoryId];
          if (productIds && productIds.length > 0) {
            console.log(`📤 Kategori ${categoryId} için ürünler kaydediliyor:`, productIds);
            return updateProductsSort(parseInt(categoryId), productIds);
          }
          return Promise.resolve();
        });
        await Promise.all(promises);
        console.log('✅ Ürünler sıralaması kaydedildi');
        
        // Biraz bekle (veritabanı güncellemesinin tamamlanması için)
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Verileri yeniden yükle
        const productsResponse = await getProducts();
        const freshProducts = productsResponse.data || [];
        console.log('📥 Yüklenen ürünler (ilk 5):', freshProducts.slice(0, 5).map(p => ({ id: p.id, name: p.name, categoryId: p.categoryId, sortOrder: p.sortOrder })));
        setProducts(freshProducts);
        
        broadcastUpdate(UPDATE_TYPES.PRODUCTS);
        broadcastUpdate(UPDATE_TYPES.ALL); // Tüm sayfaları güncelle
      }
      setShowSortModal(false);
      alert('Sıralama başarıyla kaydedildi!');
    } catch (error) {
      console.error('❌ Sıralama kaydedilemedi:', error);
      console.error('Error details:', error.response?.data || error.message);
      alert('Sıralama kaydedilirken hata oluştu: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleDelete = async (type, id) => {
    if (!window.confirm('Silmek istediğinize emin misiniz?')) return;
    
    try {
      if (type === 'category') {
        await deleteCategory(id);
        loadCategories();
        broadcastUpdate(UPDATE_TYPES.CATEGORIES);
      } else if (type === 'product') {
        await deleteProduct(id);
        loadProducts();
        broadcastUpdate(UPDATE_TYPES.PRODUCTS);
      } else if (type === 'table') {
        await deleteTable(id);
        loadTables();
        broadcastUpdate(UPDATE_TYPES.TABLES);
      }
    } catch (error) {
      console.error('Silme işlemi başarısız:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex flex-col">
      <div className="flex-1 pt-4">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 sm:p-6 mb-4 mx-2 sm:mx-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0">
          <div>
            <button
              onClick={() => navigate('/')}
              className="text-blue-600 hover:text-blue-800 mb-2 sm:mb-3 text-sm sm:text-base md:text-lg font-semibold px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg hover:bg-blue-50 dark:hover:bg-gray-700 transition"
            >
              ← Ana Sayfa
            </button>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-800 dark:text-white">Yönetim Paneli</h1>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md mb-4 mx-2 sm:mx-4">
          <div className="flex flex-wrap border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
            {['categories', 'products', 'tables', 'report'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 sm:px-6 md:px-8 py-3 sm:py-4 md:py-5 font-bold text-sm sm:text-base md:text-lg transition whitespace-nowrap ${
                  activeTab === tab
                    ? 'border-b-4 border-blue-600 text-blue-600'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white'
                }`}
              >
                {tab === 'categories' && 'Kategoriler'}
                {tab === 'products' && 'Ürünler'}
                {tab === 'tables' && 'Masalar'}
                {tab === 'report' && 'Gün Sonu Raporu'}
              </button>
            ))}
          </div>

          <div className="p-3 sm:p-4 md:p-6 relative z-10">
            {/* Categories Tab */}
            {activeTab === 'categories' && (
              <div>
                <form onSubmit={handleCategorySubmit} className="mb-4 sm:mb-6 flex flex-col sm:flex-row gap-2 sm:gap-3">
                  <input
                    type="text"
                    placeholder="Kategori Adı"
                    value={categoryForm.name}
                    onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                    className="flex-1 px-4 sm:px-6 py-3 sm:py-4 border rounded-lg dark:bg-gray-700 dark:text-white text-sm sm:text-base md:text-lg relative z-10"
                    required
                    autoComplete="off"
                  />
                  {editingId && (
                    <input
                      type="color"
                      value={categoryForm.color}
                      onChange={(e) => setCategoryForm({ ...categoryForm, color: e.target.value })}
                      className="w-20 sm:w-24 h-12 sm:h-14"
                    />
                  )}
                  <button
                    type="submit"
                    className="px-4 sm:px-6 md:px-8 py-3 sm:py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-sm sm:text-base md:text-lg"
                  >
                    {editingId ? 'Güncelle' : 'Ekle'}
                  </button>
                  {editingId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(null);
                        setCategoryForm({ name: '', color: '#3B82F6' });
                      }}
                      className="px-4 sm:px-6 md:px-8 py-3 sm:py-4 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-bold text-sm sm:text-base md:text-lg"
                    >
                      İptal
                    </button>
                  )}
                </form>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
                  {categories.map((category) => (
                    <div
                      key={category.id}
                      className="p-3 sm:p-4 md:p-5 border rounded-lg dark:bg-gray-700"
                      style={{ borderLeftColor: category.color, borderLeftWidth: '6px' }}
                    >
                      <h3 className="font-bold text-gray-800 dark:text-white mb-3 text-lg">
                        {category.name}
                      </h3>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEdit('category', category)}
                          className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-base font-semibold"
                        >
                          Düzenle
                        </button>
                        <button
                          onClick={() => handleDelete('category', category.id)}
                          className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg text-base font-semibold"
                        >
                          Sil
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sort Modal */}
            {showSortModal && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
                  <div className="p-6">
                    <div className="flex justify-between items-center mb-6">
                      <h2 className="text-2xl font-bold text-gray-800 dark:text-white">
                        Sıralamayı Düzenle
                      </h2>
                      <button
                        onClick={() => setShowSortModal(false)}
                        className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-3xl"
                      >
                        ×
                      </button>
                    </div>

                    {/* Mode Toggle */}
                    <div className="flex gap-3 mb-6">
                      <button
                        onClick={() => setSortMode('categories')}
                        className={`flex-1 px-6 py-3 rounded-lg font-bold text-lg transition ${
                          sortMode === 'categories'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white'
                        }`}
                      >
                        Kategoriler
                      </button>
                      <button
                        onClick={() => setSortMode('products')}
                        className={`flex-1 px-6 py-3 rounded-lg font-bold text-lg transition ${
                          sortMode === 'products'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white'
                        }`}
                      >
                        Ürünler
                      </button>
                    </div>

                    {/* Categories Sort */}
                    {sortMode === 'categories' && (
                      <div>
                        <p className="text-lg text-gray-700 dark:text-gray-300 mb-4">
                          Kategorileri sürükleyip bırakarak sıralayın:
                        </p>
                        <div className="space-y-2">
                          {sortedCategories.map((categoryId) => {
                            const category = categories.find(c => c.id === categoryId);
                            if (!category) return null;
                            return (
                              <div
                                key={category.id}
                                draggable
                                onDragStart={(e) => handleDragStart(e, category.id, 'categories')}
                                onDragEnd={handleDragEnd}
                                onDragOver={handleDragOver}
                                onDrop={(e) => handleDrop(e, category.id, 'categories')}
                                className={`p-4 bg-gray-100 dark:bg-gray-700 rounded-lg cursor-move hover:bg-gray-200 dark:hover:bg-gray-600 transition-all duration-200 flex items-center gap-3 ${
                                  draggedItem?.id === category.id ? 'opacity-50 scale-95' : ''
                                }`}
                                style={{ borderLeft: `6px solid ${category.color}` }}
                              >
                                <span className="text-2xl">☰</span>
                                <span className="font-bold text-lg text-gray-800 dark:text-white">
                                  {category.name}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Products Sort */}
                    {sortMode === 'products' && (
                      <div>
                        <p className="text-lg text-gray-700 dark:text-gray-300 mb-4">
                          Kategori seçin ve ürünleri sürükleyip bırakarak sıralayın:
                        </p>
                        <div className="space-y-4">
                          {categories.map((category) => {
                            const categoryProductIds = sortedProducts[category.id] || [];
                            const categoryProducts = categoryProductIds
                              .map(id => products.find(p => p.id === id))
                              .filter(Boolean);
                            
                            return (
                              <div key={category.id} className="border border-gray-300 dark:border-gray-600 rounded-lg p-4">
                                <h3 className="font-bold text-lg mb-3 text-gray-800 dark:text-white" style={{ color: category.color }}>
                                  {category.name}
                                </h3>
                                <div className="space-y-2" data-category-id={category.id}>
                                  {categoryProducts.map((product) => (
                                    <div
                                      key={product.id}
                                      draggable
                                      onDragStart={(e) => handleDragStart(e, product.id, 'products')}
                                      onDragEnd={handleDragEnd}
                                      onDragOver={handleDragOver}
                                      onDrop={(e) => handleDrop(e, product.id, 'products')}
                                      className={`p-3 bg-gray-100 dark:bg-gray-700 rounded-lg cursor-move hover:bg-gray-200 dark:hover:bg-gray-600 transition-all duration-200 flex items-center gap-3 ${
                                        draggedItem?.id === product.id ? 'opacity-50 scale-95 shadow-lg' : ''
                                      }`}
                                    >
                                      <span className="text-xl">☰</span>
                                      <span className="font-semibold text-gray-800 dark:text-white">
                                        {product.name}
                                      </span>
                                      <span className="ml-auto text-gray-600 dark:text-gray-400">
                                        {product.price.toFixed(2)} ₺
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="flex gap-3 mt-6">
                      <button
                        onClick={() => setShowSortModal(false)}
                        className="flex-1 px-8 py-4 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-bold text-lg"
                      >
                        İptal
                      </button>
                      <button
                        onClick={handleSaveSort}
                        className="flex-1 px-8 py-4 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold text-lg"
                      >
                        Kaydet
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Category Color Selection Modal */}
            {showCategoryColorModal && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                  <div className="p-6">
                    <div className="flex justify-between items-center mb-6">
                      <h2 className="text-2xl font-bold text-gray-800 dark:text-white">
                        Kategori Rengi Seçin
                      </h2>
                      <button
                        onClick={() => setShowCategoryColorModal(false)}
                        className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-3xl"
                      >
                        ×
                      </button>
                    </div>

                    <div className="mb-6">
                      <p className="text-lg text-gray-700 dark:text-gray-300 mb-2">
                        Kategori: <span className="font-bold">{categoryForm.name}</span>
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                        Aşağıdaki renklerden birini seçin:
                      </p>
                    </div>

                    <div className="grid grid-cols-5 md:grid-cols-6 gap-3 mb-6">
                      {colorPalette.map((color) => {
                        const isSelected = categoryForm.color === color;
                        return (
                          <button
                            key={color}
                            onClick={() => handleCategoryColorSelect(color)}
                            className={`h-20 rounded-lg transition transform hover:scale-110 ${
                              isSelected ? 'ring-4 ring-blue-500 scale-110' : 'ring-2 ring-gray-300 dark:ring-gray-600'
                            }`}
                            style={{ backgroundColor: color }}
                            title={color}
                          >
                            {isSelected && (
                              <span className="text-2xl">✓</span>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={() => setShowCategoryColorModal(false)}
                        className="flex-1 px-8 py-4 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-bold text-lg"
                      >
                        İptal
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Product Modal */}
            {showProductModal && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                  <div className="p-6">
                    <div className="flex justify-between items-center mb-6">
                      <h2 className="text-2xl font-bold text-gray-800 dark:text-white">
                        {editingId ? 'Ürün Düzenle' : 'Yeni Ürün Ekle'}
                      </h2>
                      <button
                        onClick={closeProductModal}
                        className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-3xl"
                      >
                        ×
                      </button>
                    </div>

                    {/* Step 1: Form */}
                    {modalStep === 'form' && (
                      <div>
                        <div className="space-y-4 mb-6">
                          <div>
                            <label className="block text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">Ürün Adı</label>
                            <input
                              type="text"
                              placeholder="Ürün Adı"
                              value={productForm.name}
                              onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                              className="w-full px-6 py-4 border rounded-lg dark:bg-gray-700 dark:text-white text-lg relative z-10"
                              autoComplete="off"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">Fiyat (₺)</label>
                            <input
                              type="number"
                              step="0.01"
                              placeholder="Fiyat"
                              value={productForm.price}
                              onChange={(e) => setProductForm({ ...productForm, price: e.target.value })}
                              className="w-full px-6 py-4 border rounded-lg dark:bg-gray-700 dark:text-white text-lg relative z-10"
                              autoComplete="off"
                            />
                          </div>
                        </div>
                        <button
                          onClick={() => setModalStep('category')}
                          className="w-full px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-lg"
                        >
                          Devam Et: Kategori Seç
                        </button>
                      </div>
                    )}

                    {/* Step 2: Category Selection */}
                    {modalStep === 'category' && (
                      <div>
                        <h3 className="text-xl font-bold mb-4 text-gray-800 dark:text-white">Kategori Seçin</h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                          {categories.map((category) => {
                            const isSelected = productForm.categoryId === category.id;
                            return (
                              <button
                                key={category.id}
                                onClick={() => setProductForm({ ...productForm, categoryId: category.id })}
                                className={`p-6 rounded-lg font-bold text-xl transition min-h-[120px] flex items-center justify-center ${
                                  isSelected
                                    ? 'text-white shadow-2xl scale-105 ring-4 ring-blue-500'
                                    : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600'
                                }`}
                                style={{
                                  backgroundColor: isSelected ? category.color : undefined,
                                  borderLeft: `8px solid ${category.color}`,
                                }}
                              >
                                {category.name}
                              </button>
                            );
                          })}
                        </div>
                        <div className="flex gap-3">
                          <button
                            onClick={() => setModalStep('form')}
                            className="flex-1 px-8 py-4 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-bold text-lg"
                          >
                            Geri
                          </button>
                          <button
                            onClick={() => setModalStep('color')}
                            disabled={!productForm.categoryId}
                            className="flex-1 px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-lg disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Devam Et: Renk Seç
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Step 3: Color Selection */}
                    {modalStep === 'color' && (
                      <div>
                        <h3 className="text-xl font-bold mb-4 text-gray-800 dark:text-white">Renk Seçin</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">Seçili renk: {productForm.color}</p>
                        <div className="grid grid-cols-5 md:grid-cols-6 gap-3 mb-6">
                          {colorPalette.map((color) => {
                            const isSelected = productForm.color === color;
                            return (
                              <button
                                key={color}
                                onClick={() => setProductForm({ ...productForm, color })}
                                className={`h-20 rounded-lg transition transform hover:scale-110 ${
                                  isSelected ? 'ring-4 ring-blue-500 scale-110' : 'ring-2 ring-gray-300 dark:ring-gray-600'
                                }`}
                                style={{ backgroundColor: color }}
                                title={color}
                              >
                                {isSelected && (
                                  <span className="text-2xl">✓</span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                        <div className="flex gap-3">
                          <button
                            onClick={() => setModalStep('category')}
                            className="flex-1 px-8 py-4 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-bold text-lg"
                          >
                            Geri
                          </button>
                          <button
                            onClick={handleProductSubmit}
                            className="flex-1 px-8 py-4 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold text-lg"
                          >
                            {editingId ? 'Güncelle' : 'Kaydet'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Products Tab */}
            {activeTab === 'products' && (
              <div>
                {/* Butonlar */}
                <div className="flex gap-3 mb-6">
                  <button
                    onClick={openSortModal}
                    className="flex-1 px-8 py-6 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-bold text-2xl transition shadow-lg"
                  >
                    Sıralamayı Düzenle
                  </button>
                  <button
                    onClick={openProductModal}
                    className="flex-1 px-8 py-6 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold text-2xl transition shadow-lg"
                  >
                    + Yeni Ürün Ekle
                  </button>
                </div>

                {/* Kategorilere Göre Ürünler (Accordion) */}
                <div className="space-y-4">
                  {categories.map((category) => {
                    const categoryProducts = products.filter(p => p.categoryId === category.id);
                    const isExpanded = expandedCategories.includes(category.id);
                    const rgb = hexToRgb(category.color);
                    
                    return (
                      <div key={category.id} className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
                        {/* Kategori Başlık - Tıklanabilir */}
                        <button
                          onClick={() => toggleCategory(category.id)}
                          className="w-full p-6 flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-700 transition relative overflow-hidden"
                          style={{
                            borderLeft: `8px solid ${category.color}`,
                          }}
                        >
                          {/* Degrade Işık Süzmesi */}
                          <div
                            className="absolute inset-0 pointer-events-none opacity-20"
                            style={{
                              background: `linear-gradient(to right, rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.3) 0%, rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0) 100%)`
                            }}
                          ></div>
                          
                          <div className="flex items-center gap-4 relative z-10">
                            <span className="text-3xl">{isExpanded ? '▼' : '▶'}</span>
                            <div className="text-left">
                              <h3 className="text-2xl font-bold text-gray-800 dark:text-white">
                                {category.name}
                              </h3>
                              <p className="text-sm text-gray-600 dark:text-gray-400">
                                {categoryProducts.length} ürün
                              </p>
                            </div>
                          </div>
                        </button>

                        {/* Kategori Ürünleri - Açılır/Kapanır */}
                        {isExpanded && (
                          <div className="p-6 border-t border-gray-200 dark:border-gray-700">
                            {categoryProducts.length === 0 ? (
                              <p className="text-center py-8 text-gray-600 dark:text-gray-400">
                                Bu kategoride henüz ürün yok
                              </p>
                            ) : (
                              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                {categoryProducts.map((product) => {
                                  const categoryColor = category.color;
                                  
                                  // Ürün rengi varsa onu kullan, yoksa kategori rengini kullan
                                  const productColor = product.color && product.color !== '#FFFFFF' ? product.color : categoryColor;
                                  
                                  const rgb = hexToRgb(productColor);
                                  const hasCustomColor = product.color && product.color !== '#FFFFFF';
                                  
                                  return (
                                    <div
                                      key={product.id}
                                      className="relative overflow-hidden p-5 border-4 rounded-lg dark:bg-gray-700"
                                      style={{
                                        borderColor: productColor,
                                        boxShadow: hasCustomColor 
                                          ? `0 4px 20px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.3), 0 2px 10px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.2)`
                                          : '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)'
                                      }}
                                    >
                                      {/* Degrade Işık Süzmesi */}
                                      <div
                                        className="absolute inset-0 pointer-events-none opacity-35"
                                        style={{
                                          background: `linear-gradient(to right, rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.5) 0%, rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0) 100%)`
                                        }}
                                      ></div>
                                      
                                      {/* İçerik */}
                                      <div className="relative z-10">
                                        <h3 className="font-bold text-gray-800 dark:text-white mb-2 text-lg">
                                          {product.name}
                                        </h3>
                                        <p className="text-xl font-bold mb-3" style={{ color: productColor }}>
                                          {product.price.toFixed(2)} ₺
                                        </p>
                                        <div className="flex gap-2">
                                          <button
                                            onClick={() => handleEdit('product', product)}
                                            className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-base font-semibold"
                                          >
                                            Düzenle
                                          </button>
                                          <button
                                            onClick={() => handleDelete('product', product.id)}
                                            className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg text-base font-semibold"
                                          >
                                            Sil
                                          </button>
                                        </div>
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

                {/* Kategori yoksa mesaj göster */}
                {categories.length === 0 && (
                  <div className="text-center py-8 text-gray-600 dark:text-gray-400">
                    Önce kategoriler sekmesinden kategori ekleyin
                  </div>
                )}
              </div>
            )}

            {/* Tables Tab */}
            {activeTab === 'tables' && (
              <div>
                <form onSubmit={handleTableSubmit} className="mb-6 flex gap-3">
                  <input
                    type="text"
                    placeholder="Masa Adı (örn: Masa 1)"
                    value={tableForm.name}
                    onChange={(e) => setTableForm({ name: e.target.value })}
                    className="flex-1 px-6 py-4 border rounded-lg dark:bg-gray-700 dark:text-white text-lg relative z-10"
                    required
                    autoComplete="off"
                  />
                  <button
                    type="submit"
                    className="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-lg"
                  >
                    Masa Ekle
                  </button>
                </form>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {tables.map((table) => (
                    <div
                      key={table.id}
                      className="p-5 border rounded-lg dark:bg-gray-700"
                    >
                      <h3 className="font-bold text-gray-800 dark:text-white mb-2 text-lg">
                        {table.name}
                      </h3>
                      <p className="text-base text-gray-600 dark:text-gray-400 mb-2">
                        Durum: {table.status}
                      </p>
                      <p className="text-xl font-bold text-blue-600 dark:text-blue-400 mb-3">
                        {table.total.toFixed(2)} ₺
                      </p>
                      <button
                        onClick={() => handleDelete('table', table.id)}
                        className="w-full px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg text-base font-semibold"
                      >
                        Sil
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Report Tab */}
            {activeTab === 'report' && (
              <div className="space-y-6">
                {/* Tarih Seçici ve Excel Butonu */}
                <div className="flex flex-wrap gap-4 items-center justify-between">
                  <div className="flex items-center gap-3">
                    <label className="text-lg font-semibold text-gray-700 dark:text-gray-300">
                      Tarih Seçin:
                    </label>
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={handleDateChange}
                      className="px-4 py-3 text-base border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 relative z-10"
                      autoComplete="off"
                    />
                  </div>
                  <button
                    onClick={exportToExcel}
                    className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold text-base flex items-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Excel Olarak İndir
                  </button>
                </div>

                {report ? (
                  <>
                    {/* Özet Kartları - Tek Satırda */}
                    <div className="grid grid-cols-5 gap-4">
                      <div className="p-5 bg-blue-50 dark:bg-blue-900 rounded-lg shadow-md">
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Toplam Masa</p>
                        <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                          {report.totalTables}
                        </p>
                      </div>
                      <div className="p-5 bg-green-50 dark:bg-green-900 rounded-lg shadow-md">
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Toplam Ödeme</p>
                        <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                          {report.totalPayments}
                        </p>
                      </div>
                      <div className="p-5 bg-purple-50 dark:bg-purple-900 rounded-lg shadow-md">
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Toplam Ciro</p>
                        <p className="text-3xl font-bold text-purple-600 dark:text-purple-400">
                          {report.totalRevenue.toFixed(2)} ₺
                        </p>
                      </div>
                      <div className="p-5 bg-yellow-50 dark:bg-yellow-900 rounded-lg shadow-md">
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Nakit</p>
                        <p className="text-3xl font-bold text-yellow-600 dark:text-yellow-400">
                          {report.cashRevenue.toFixed(2)} ₺
                        </p>
                      </div>
                      <div className="p-5 bg-indigo-50 dark:bg-indigo-900 rounded-lg shadow-md">
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Kart</p>
                        <p className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">
                          {report.cardRevenue.toFixed(2)} ₺
                        </p>
                      </div>
                    </div>

                    {/* Detaylı Ödemeler Listesi */}
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg shadow-md p-6">
                      <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-4">
                        Detaylı Ödemeler
                      </h2>
                      {payments.length > 0 ? (
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead>
                              <tr className="border-b-2 border-gray-300 dark:border-gray-600">
                                <th className="text-left py-3 px-4 text-gray-700 dark:text-gray-300 font-semibold">Tarih</th>
                                <th className="text-left py-3 px-4 text-gray-700 dark:text-gray-300 font-semibold">Saat</th>
                                <th className="text-left py-3 px-4 text-gray-700 dark:text-gray-300 font-semibold">Masa</th>
                                <th className="text-right py-3 px-4 text-gray-700 dark:text-gray-300 font-semibold">Tutar</th>
                                <th className="text-center py-3 px-4 text-gray-700 dark:text-gray-300 font-semibold">Ödeme Türü</th>
                              </tr>
                            </thead>
                            <tbody>
                              {payments.map((payment, index) => (
                                <tr 
                                  key={payment.id} 
                                  className={`border-b border-gray-200 dark:border-gray-700 ${
                                    index % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50 dark:bg-gray-800'
                                  }`}
                                >
                                  <td className="py-3 px-4 text-gray-800 dark:text-gray-200">
                                    {formatDateTR(payment.createdAt)}
                                  </td>
                                  <td className="py-3 px-4 text-gray-800 dark:text-gray-200">
                                    {formatTimeTR(payment.createdAt)}
                                  </td>
                                  <td className="py-3 px-4 text-gray-800 dark:text-gray-200 font-semibold">
                                    {payment.tableName}
                                  </td>
                                  <td className="py-3 px-4 text-right text-gray-800 dark:text-gray-200 font-bold">
                                    {payment.amount.toFixed(2)} ₺
                                  </td>
                                  <td className="py-3 px-4 text-center">
                                    <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                                      payment.paymentType === 'Nakit' 
                                        ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                        : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                                    }`}>
                                      {payment.paymentType}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="text-center py-8 text-gray-600 dark:text-gray-400">
                          Bu tarih için ödeme kaydı bulunamadı.
                        </p>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="text-center py-8 text-gray-600 dark:text-gray-400">
                    Rapor yükleniyor...
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Masa Hesap İsteği Bildirimi Modal */}
      {paymentRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
          <div 
            className={`bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 text-center transition-all duration-300 ${
              isBlinking ? 'scale-105 ring-4 ring-orange-500' : 'scale-100'
            }`}
            style={{
              animation: isBlinking ? 'pulse 0.5s ease-in-out infinite' : 'none'
            }}
          >
            <div className="mb-6">
              <div className="text-6xl mb-4">📢</div>
              <h2 className="text-3xl font-bold text-gray-800 dark:text-white mb-4">
                {paymentRequest.tableName || `${paymentRequest.tableId} Numaralı Masa`}
              </h2>
              <p className="text-xl text-gray-600 dark:text-gray-300">
                Hesap Ödemek İçin Kasaya Gelmektedir!
              </p>
            </div>
            
            <div className="flex gap-4">
              <button
                onClick={handleAcceptPaymentRequest}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-6 rounded-lg transition-all duration-150 transform active:scale-95 text-lg"
              >
                Hesabı Al
              </button>
              <button
                onClick={handleClosePaymentRequest}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-4 px-6 rounded-lg transition-all duration-150 transform active:scale-95 text-lg"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
      
      <Footer />
    </div>
  );
};

export default Admin;

