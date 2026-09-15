const STORAGE_KEY = 'exchange_rates';
const STORAGE_TIMESTAMP_KEY = 'exchange_rates_timestamp';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 saat
const FETCH_TIMEOUT_MS = 5000;
const FALLBACK_RATES = { USD: 34.5, EUR: 37.5 };

/** Kur bilgisini fiyatlandırmada kullanılan indirim (₺) */
export const RATE_DISCOUNT = 2;

/**
 * Güncel döviz kurlarını al. İnternet yoksa kayıtlı/varsayılan kurlara düşer.
 * @returns {Promise<{USD: number, EUR: number, source: 'live'|'cache'|'fallback'}>}
 */
export async function getExchangeRates() {
  const saved = getSavedExchangeRates();
  const lastUpdate = getLastUpdateTime();
  if (saved && lastUpdate && Date.now() - lastUpdate.getTime() < CACHE_TTL_MS) {
    return { ...saved, source: 'cache' };
  }

  try {
    const response = await fetch('https://api.exchangerate-api.com/v4/latest/TRY', {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const usd = Number(data?.rates?.USD);
    const eur = Number(data?.rates?.EUR);
    if (!usd || !eur) throw new Error('Kur verisi eksik');

    const rates = { USD: 1 / usd, EUR: 1 / eur };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rates));
    localStorage.setItem(STORAGE_TIMESTAMP_KEY, Date.now().toString());
    return { ...rates, source: 'live' };
  } catch (error) {
    if (saved) return { ...saved, source: 'cache' };
    return { ...FALLBACK_RATES, source: 'fallback' };
  }
}

export function getSavedExchangeRates() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed?.USD > 0 && parsed?.EUR > 0) return { USD: parsed.USD, EUR: parsed.EUR };
    }
  } catch {
    /* yoksay */
  }
  return null;
}

export function getLastUpdateTime() {
  const timestamp = Number(localStorage.getItem(STORAGE_TIMESTAMP_KEY));
  return timestamp ? new Date(timestamp) : null;
}

/** Tutarı, kurdan RATE_DISCOUNT ₺ düşülmüş kurla dövize çevir */
export function convertWithDiscount(amount, rate) {
  const discountedRate = Number(rate) - RATE_DISCOUNT;
  if (!Number.isFinite(discountedRate) || discountedRate <= 0) return 0;
  return Number(amount) / discountedRate;
}
