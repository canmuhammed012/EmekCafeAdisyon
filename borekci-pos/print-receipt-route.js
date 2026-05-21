function registerPrintReceiptRoute(app, db, winRawPrint, broadcast) {
  app.post('/api/print/receipt', (req, res) => {
    const { tableId, printerName: reqPrinterName } = req.body;

    if (!tableId) {
      return res.status(400).json({ error: 'Masa ID gerekli' });
    }

    db.get(`SELECT * FROM tables WHERE id = ?`, [tableId], (err, table) => {
      if (err || !table) {
        return res.status(400).json({ error: 'Masa bulunamadı' });
      }

      db.all(
        `SELECT orders.id, products.name, products.price, orders.quantity, orders.total
         FROM orders
         JOIN products ON orders.productId = products.id
         WHERE orders.tableId = ?
         ORDER BY orders.createdAt`,
        [tableId],
        (ordersErr, orders) => {
          if (ordersErr) {
            return res.status(400).json({ error: ordersErr.message });
          }
          if (!orders || orders.length === 0) {
            return res.status(400).json({ error: 'Bu masada sipariş bulunamadı' });
          }

          db.get(`SELECT value FROM settings WHERE key = 'restaurantName'`, (_, nameRow) => {
            db.get(`SELECT value FROM settings WHERE key = 'printerName'`, (_, printerRow) => {
              const restaurantName = nameRow?.value || 'Emek Cafe Adisyon';
              const savedPrinterName = printerRow?.value?.trim() || '';
              const targetPrinterName = reqPrinterName?.trim() || savedPrinterName || null;

              const now = new Date();
              const receipt = {
                restaurantName,
                tableName: table.name,
                orders,
                total: table.total,
                date: `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
              };

              // Tum bagli cihazlara (garson tablet vb.) yazdirma istegi
              broadcast('printReceipt', {
                receipt,
                printerName: targetPrinterName,
                tableId,
              });

              console.log(`📡 Fiş yazdırma yayınlandı (masa ${table.name})`);

              // Admin sunucusunda da yazici varsa oradan da yazdir
              let localPrinter = null;
              if (process.platform === 'win32') {
                try {
                  const printers = winRawPrint.listWindowsPrinters();
                  const selected = winRawPrint.matchPrinter(printers, targetPrinterName);
                  if (selected) {
                    const buffer = winRawPrint.buildEscPosReceipt(receipt);
                    winRawPrint.printRawWindows(selected.name, buffer);
                    localPrinter = selected.name;
                    console.log(`✅ Sunucu yerel yazdırma: ${selected.name}`);
                  }
                } catch (localErr) {
                  console.warn('Sunucu yerel yazdırma atlandı:', localErr.message);
                }
              }

              if (localPrinter) {
                return res.json({
                  success: true,
                  message: `Fiş yazdırıldı (${localPrinter})`,
                  printer: localPrinter,
                  mode: 'server',
                });
              }

              res.json({
                success: true,
                message: 'Fiş yazdırma isteği gönderildi (yazıcıya bağlı cihazdan çıkacak)',
                mode: 'broadcast',
              });
            });
          });
        }
      );
    });
  });
}

module.exports = { registerPrintReceiptRoute };
