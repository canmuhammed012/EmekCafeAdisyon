// Türkiye saati için (GMT+3) tarih formatlaması

/**
 * UTC tarihini Türkiye saatine (GMT+3) çevirir
 * @param {string} utcDateString - UTC tarih string'i
 * @returns {Date} - GMT+3 için ayarlanmış Date objesi
 */
export const convertToTurkeyTime = (utcDateString) => {
  const date = new Date(utcDateString);
  // 3 saat ekle (Türkiye GMT+3)
  date.setHours(date.getHours() + 3);
  return date;
};

/**
 * UTC tarihini Türkiye formatında tarih string'ine çevirir
 * @param {string} utcDateString - UTC tarih string'i
 * @returns {string} - "DD.MM.YYYY" formatında tarih
 */
export const formatDateTR = (utcDateString) => {
  const date = convertToTurkeyTime(utcDateString);
  return date.toLocaleDateString('tr-TR');
};

/**
 * UTC tarihini Türkiye formatında saat string'ine çevirir
 * @param {string} utcDateString - UTC tarih string'i
 * @returns {string} - "HH:MM" formatında saat
 */
export const formatTimeTR = (utcDateString) => {
  const date = convertToTurkeyTime(utcDateString);
  return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
};

/**
 * UTC tarihini Türkiye formatında tarih ve saat string'ine çevirir
 * @param {string} utcDateString - UTC tarih string'i
 * @returns {string} - "DD.MM.YYYY HH:MM" formatında tarih-saat
 */
export const formatDateTimeTR = (utcDateString) => {
  return `${formatDateTR(utcDateString)} ${formatTimeTR(utcDateString)}`;
};

