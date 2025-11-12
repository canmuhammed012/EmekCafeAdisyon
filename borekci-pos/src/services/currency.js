const STORAGE_KEY = 'exchange_rates';
const STORAGE_TIMESTAMP_KEY = 'exchange_rates_timestamp';

/**
 * Güncel döviz kurlarını al (TCMB veya alternatif API)
 * @returns {Promise<{USD: number, EUR: number}>}
 */
export async function getExchangeRates() {
  try {
    // exchangerate-api.com ücretsiz servisi
    const response = await fetch('https://api.exchangerate-api.com/v4/latest/TRY');
    const data = await response.json();
    
    // TRY bazlı olduğu için USD ve EUR'yu TRY'ye çevirmemiz gerekiyor
    // API TRY -> USD/EUR oranını veriyor, biz USD/EUR -> TRY istiyoruz
    const usdRate = 1 / data.rates.USD;
    const eurRate = 1 / data.rates.EUR;
    
    const rates = {
      USD: usdRate,
      EUR: eurRate
    };
    
    // Başarılı çekildiğinde localStorage'a kaydet
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rates));
    localStorage.setItem(STORAGE_TIMESTAMP_KEY, Date.now().toString());
    console.log('✓ Döviz kurları güncellendi:', rates);
    
    return rates;
  } catch (error) {
    console.error('✗ Döviz kurları alınamadı:', error);
    
    // Önce localStorage'dan yüklemeyi dene
    const savedRates = getSavedExchangeRates();
    if (savedRates) {
      console.log('⚠ Kaydedilmiş kurlar kullanılıyor:', savedRates);
      return savedRates;
    }
    
    // localStorage'da da yoksa fallback değerler
    console.log('⚠ Varsayılan kurlar kullanılıyor');
    return {
      USD: 34.50,
      EUR: 37.50
    };
  }
}

/**
 * localStorage'dan kaydedilmiş döviz kurlarını al
 * @returns {{USD: number, EUR: number} | null}
 */
export function getSavedExchangeRates() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (error) {
    console.error('Kaydedilmiş kurlar okunamadı:', error);
  }
  return null;
}

/**
 * Son güncelleme zamanını al
 * @returns {Date | null}
 */
export function getLastUpdateTime() {
  try {
    const timestamp = localStorage.getItem(STORAGE_TIMESTAMP_KEY);
    if (timestamp) {
      return new Date(parseInt(timestamp));
    }
  } catch (error) {
    console.error('Güncelleme zamanı okunamadı:', error);
  }
  return null;
}

/**
 * Toplam tutarı belirtilen kurdan 2 TL düşük kurla dönüştür
 * @param {number} amount - TL cinsinden tutar
 * @param {number} rate - Güncel kur
 * @returns {number} - Dönüştürülmüş tutar
 */
export function convertWithDiscount(amount, rate) {
  const discountedRate = rate - 2; // 2 TL düşük kur
  return amount / discountedRate;
}

