import { useEffect } from 'react';
import { useSocket } from '../contexts/SocketContext';

function getPreferredPrinterNames() {
  const saved = localStorage.getItem('printerName')?.trim();
  return [saved, 'XP-90', 'XP-9000', 'XP9000', 'Xprinter', 'XP-80', 'POS-80'].filter(Boolean);
}

/**
 * Admin veya baska cihazdan gelen yazdirma istegini dinler;
 * yazici bu cihazda takiliysa buradan fis cikar.
 */
const PrintSocketListener = () => {
  const { socket } = useSocket();

  useEffect(() => {
    if (!socket || !window.electron?.printReceiptLocal) {
      return undefined;
    }

    const onPrintReceipt = async (data) => {
      if (!data?.receipt) return;

      const namesToTry = [
        data.printerName,
        ...getPreferredPrinterNames(),
        null,
      ].filter((n, i, arr) => n === null || (n && arr.indexOf(n) === i));

      for (const printerName of namesToTry) {
        try {
          const result = await window.electron.printReceiptLocal({
            receipt: data.receipt,
            printerName: printerName || undefined,
          });
          if (result?.success) {
            if (result.printer) {
              localStorage.setItem('printerName', result.printer);
            }
            console.log('✅ Socket fiş yazdırıldı:', result.printer);
            return;
          }
        } catch (err) {
          console.warn('Socket yazdırma denemesi başarısız:', err.message);
        }
      }
      console.warn('⚠️ Bu cihazda yazdırma yapılamadı (yazıcı yok veya hazır değil)');
    };

    socket.on('printReceipt', onPrintReceipt);
    return () => {
      socket.off('printReceipt', onPrintReceipt);
    };
  }, [socket]);

  return null;
};

export default PrintSocketListener;
