import { printReceipt } from './api';

/**
 * Fiş yazdır: sunucu tüm cihazlara yayınlar (garson yazıcısı dahil).
 * Yazıcı takılı cihaz PrintSocketListener ile yazdırır.
 */
export async function printTableReceipt(tableId) {
  const response = await printReceipt(tableId, null, 'windows');

  if (response.data?.success) {
    return {
      success: true,
      message: response.data.message || 'Fiş yazdırma isteği gönderildi',
      printer: response.data.printer,
      printedOn: response.data.mode === 'server' ? 'server' : 'broadcast',
    };
  }

  const err = new Error(
    response.data?.error ||
      'Fiş yazdırılamadı. Garson cihazının açık ve ağa bağlı olduğundan emin olun.'
  );
  if (response.data?.availablePrinters?.length) {
    err.message += `\nBulunan yazıcılar: ${response.data.availablePrinters.join(', ')}`;
  }
  throw err;
}
