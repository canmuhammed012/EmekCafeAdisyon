import { useEffect } from 'react';
import { useSocket } from '../contexts/SocketContext';

/**
 * Kasa "Fiş Yazdır" dediğinde sunucuda termal yazıcı yoksa istek tüm cihazlara yayınlanır;
 * yazıcının takılı olduğu cihaz (garson tableti vb.) buradan yazdırır.
 * Termal yazıcı olarak tanınmayan (ofis) yazıcılara hiçbir şey gönderilmez.
 */
const PrintSocketListener = () => {
  const { socket } = useSocket();

  useEffect(() => {
    if (!socket || !window.electron?.printReceiptLocal) return undefined;

    const onPrintReceipt = async (data) => {
      if (!data?.receipt) return;
      const saved = localStorage.getItem('printerName')?.trim();
      const names = [data.printerName, saved, null].filter((n, i, arr) => n === null || (n && arr.indexOf(n) === i));

      for (const printerName of names) {
        try {
          const result = await window.electron.printReceiptLocal({ receipt: data.receipt, printerName: printerName || undefined });
          if (result?.success) {
            if (result.printer) localStorage.setItem('printerName', result.printer);
            console.log('✅ Fiş bu cihazdan yazdırıldı:', result.printer);
            return;
          }
        } catch (err) {
          console.warn('Yazdırma denemesi başarısız:', err.message);
        }
      }
      console.info('Bu cihazda termal yazıcı yok, yazdırma isteği yoksayıldı.');
    };

    socket.on('printReceipt', onPrintReceipt);
    return () => socket.off('printReceipt', onPrintReceipt);
  }, [socket]);

  return null;
};

export default PrintSocketListener;
