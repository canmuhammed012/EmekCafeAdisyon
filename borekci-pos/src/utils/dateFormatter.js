// Sunucu (SQLite) zaman damgalarını Türkiye saatinde göstermek için yardımcılar.
// SQLite CURRENT_TIMESTAMP "YYYY-MM-DD HH:MM:SS" biçiminde UTC üretir; JS bu biçimi
// yerel saat sanır. Bu yüzden önce UTC olarak ayrıştırıp Europe/Istanbul'a çeviriyoruz.

const TZ = 'Europe/Istanbul';

export const parseServerDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  const str = String(value).trim();
  // "2025-01-01 12:30:00" → UTC
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(str)) {
    return new Date(str.replace(' ', 'T') + 'Z');
  }
  const d = new Date(str);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const formatDateTR = (value) => {
  const date = parseServerDate(value);
  if (!date) return '';
  return date.toLocaleDateString('tr-TR', { timeZone: TZ });
};

export const formatTimeTR = (value) => {
  const date = parseServerDate(value);
  if (!date) return '';
  return date.toLocaleTimeString('tr-TR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
};

export const formatDateTimeTR = (value) => {
  const d = formatDateTR(value);
  const t = formatTimeTR(value);
  return d && t ? `${d} ${t}` : d || t;
};

/** Bugünün tarihi (Türkiye saati) — "YYYY-MM-DD" */
export const todayISO = () => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
};

/** Para biçimi: 1.234,50 ₺ */
export const formatCurrency = (value) => {
  const n = Number(value) || 0;
  return `${n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`;
};

/** Geçen süre: "5 dk", "1 sa 12 dk" */
export const formatElapsed = (value) => {
  const date = parseServerDate(value);
  if (!date) return '';
  const mins = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (mins < 1) return 'şimdi';
  if (mins < 60) return `${mins} dk`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} sa ${m} dk` : `${h} sa`;
};
