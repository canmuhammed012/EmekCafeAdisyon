import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getCategories, getProducts, createOrder } from '../services/api';
import Footer from '../components/Footer';
import AlertModal from '../components/AlertModal';

const Menu = ({ user }) => {
  const { tableId } = useParams();
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Alert modal için state
  const [alertModal, setAlertModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    type: 'info'
  });

  useEffect(() => {
    // Fonksiyonları useEffect içinde tanımla (infinite loop'u önlemek için)
    const loadCategoriesLocal = async () => {
      try {
        const response = await getCategories();
        setCategories(response.data);
        if (response.data.length > 0 && !selectedCategory) {
          setSelectedCategory(response.data[0].id);
        }
      } catch (error) {
        console.error('Kategoriler yüklenemedi:', error);
      }
    };

    // İlk yükleme - socket event listener'ları kaldırıldı
    loadCategoriesLocal();
  }, []); // Sadece mount'ta çalışır

  useEffect(() => {
    // selectedCategory değiştiğinde ürünleri yükle
    if (selectedCategory !== null) {
      const loadProductsLocal = async () => {
        try {
          setLoading(true);
          const response = await getProducts(selectedCategory);
          setProducts(response.data);
        } catch (error) {
          console.error('Ürünler yüklenemedi:', error);
        } finally {
          setLoading(false);
        }
      };
      loadProductsLocal();
    }
  }, [selectedCategory]);

  const handleAddProduct = async (productId) => {
    const quantity = parseInt(prompt('Adet girin:', '1')) || 1;
    
    if (isNaN(quantity) || quantity < 1) {
      return;
    }
    
    try {
      await createOrder({
        tableId: parseInt(tableId),
        productId,
        quantity,
      });
      // Navigate yerine sadece bilgi ver, kullanıcı isterse geri dönebilir
      // Socket event'i TableDetail'de zaten dinleniyor, otomatik güncellenecek
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

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex flex-col">
      <div className="flex-1 p-4">
        <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 mb-4 flex justify-between items-center">
          <div>
            <button
              onClick={() => navigate(`/table/${tableId}`)}
              className="text-blue-600 hover:text-blue-800 mb-2"
            >
              ← Geri
            </button>
            <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Menü</h1>
          </div>
        </div>

        <div className="flex gap-4">
          {/* Categories Sidebar */}
          <div className="w-64 bg-white dark:bg-gray-800 rounded-lg shadow-md p-4">
            <h2 className="text-lg font-bold mb-4 text-gray-800 dark:text-white">Kategoriler</h2>
            <div className="space-y-2">
              {categories.map((category) => (
                <button
                  key={category.id}
                  onClick={() => setSelectedCategory(category.id)}
                  className={`w-full text-left p-3 rounded-lg transition ${
                    selectedCategory === category.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-white hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                  style={{
                    borderLeft: `4px solid ${category.color}`,
                  }}
                >
                  {category.name}
                </button>
              ))}
            </div>
          </div>

          {/* Products Grid */}
          <div className="flex-1 bg-white dark:bg-gray-800 rounded-lg shadow-md p-4">
            {loading ? (
              <div className="text-center py-8">Yükleniyor...</div>
            ) : products.length === 0 ? (
              <div className="text-center py-8 text-gray-600 dark:text-gray-400">
                Bu kategoride ürün yok
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {products.map((product) => (
                  <div
                    key={product.id}
                    onClick={() => handleAddProduct(product.id)}
                    className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 cursor-pointer hover:shadow-lg transition transform hover:scale-105 border-2 border-transparent hover:border-blue-500"
                  >
                    <h3 className="font-semibold text-gray-800 dark:text-white mb-2">
                      {product.name}
                    </h3>
                    <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
                      {product.price.toFixed(2)} ₺
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        </div>
      </div>
      {/* Alert Modal */}
      <AlertModal
        isOpen={alertModal.isOpen}
        onClose={() => setAlertModal({ ...alertModal, isOpen: false })}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
      />
      
      <Footer />
    </div>
  );
};

export default Menu;

