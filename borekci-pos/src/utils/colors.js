// Renk yardımcıları (kategori / ürün renkleri için)

export const hexToRgb = (hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || ''));
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : { r: 59, g: 130, b: 246 };
};

export const rgba = (hex, alpha) => {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

/** Renk açık mı? (üzerine koyu metin gerekir) */
export const isLightColor = (hex) => {
  const { r, g, b } = hexToRgb(hex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62;
};

export const isWhite = (hex) => String(hex || '').toUpperCase().replace('#', '') === 'FFFFFF';

/** Arka plan rengine göre okunabilir metin rengi */
export const contrastText = (hex) => (isLightColor(hex) ? '#111827' : '#FFFFFF');

/** Beyaz/çok açık renklerde kenarlık görünür kalsın */
export const borderColorFor = (hex, fallback = '#9CA3AF') => (isWhite(hex) ? fallback : hex);

export const COLOR_PALETTE = [
  '#FFFFFF', '#EF4444', '#F97316', '#F59E0B', '#EAB308', '#84CC16',
  '#22C55E', '#10B981', '#14B8A6', '#06B6D4', '#0EA5E9', '#3B82F6',
  '#6366F1', '#8B5CF6', '#A855F7', '#D946EF', '#EC4899', '#F43F5E',
  '#A52A2A', '#78350F', '#B45309', '#4D7C0F', '#065F46', '#0E7490',
  '#1E3A8A', '#4C1D95', '#831843', '#374151', '#6B7280', '#000000',
];
