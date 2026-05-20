import { getReceipt, printReceipt } from './api';

function getPreferredPrinterNames() {
  const saved = localStorage.getItem('printerName')?.trim();
  return [saved, 'XP-90', 'XP-9000', 'XP9000', 'Xprinter', 'XP-80', 'POS-80'].filter(Boolean);
}

/**
 * Fiş yazdır: önce bu cihazdaki yazıcı (Electron), yoksa admin sunucusundaki yazıcı.
 */
export async function printTableReceipt(tableId) {
  const receiptRes = await getReceipt(tableId);
  const receipt = receiptRes.data;

  const namesToTry = [...getPreferredPrinterNames(), null];
  let lastError = null;

  // 1) Bu bilgisayara takılı termal yazıcı (garson veya admin tablet/PC)
  if (window.electron?.printReceiptLocal) {
    for (const printerName of namesToTry) {
      try {
        const result = await window.electron.printReceiptLocal({
          receipt,
          printerName: printerName || undefined,
        });
        if (result?.success) {
          if (result.printer) {
            localStorage.setItem('printerName', result.printer);
          }
          return {
            success: true,
            message: result.message || `Fiş yazdırıldı (${result.printer})`,
            printer: result.printer,
            printedOn: 'local',
          };
        }
        lastError = result?.error || lastError;
      } catch (err) {
        lastError = err.message || lastError;
      }
    }
  }

  // 2) Admin sunucusundaki yazıcı (bu cihazda yazıcı yoksa)
  for (const printerName of namesToTry) {
    try {
      const response = await printReceipt(tableId, printerName || null, 'windows');
      if (response.data?.success) {
        if (response.data.printer) {
          localStorage.setItem('printerName', response.data.printer);
        }
        return {
          success: true,
          message: response.data.message || 'Fiş yazdırıldı (sunucu)',
          printer: response.data.printer,
          printedOn: 'server',
        };
      }
      lastError = response.data?.error || lastError;
      if (response.data?.availablePrinters?.length) {
        lastError += `\nSunucudaki yazıcılar: ${response.data.availablePrinters.join(', ')}`;
      }
    } catch (err) {
      lastError = err.response?.data?.error || err.message || lastError;
      if (err.response?.data?.availablePrinters?.length) {
        lastError += `\nSunucudaki yazıcılar: ${err.response.data.availablePrinters.join(', ')}`;
      }
    }
  }

  const err = new Error(
    lastError ||
      'Fiş yazdırılamadı. Yazıcı bu cihazda veya admin bilgisayarında takılı ve açık olmalı.'
  );
  throw err;
}
