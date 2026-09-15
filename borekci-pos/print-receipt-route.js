function registerPrintReceiptRoute(app, db, winRawPrint, broadcast) {
  const get = (sql, params = []) =>
    new Promise((resolve, reject) => db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row))));
  const all = (sql, params = []) =>
    new Promise((resolve, reject) => db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || []))));

  app.post('/api/print/receipt', async (req, res, next) => {
    try {
      const tableId = parseInt(req.body?.tableId, 10);
      if (Number.isNaN(tableId)) {
        return res.status(400).json({ error: 'Masa ID gerekli' });
      }

      const table = await get(`SELECT * FROM tables WHERE id = ?`, [tableId]);
      if (!table) return res.status(404).json({ error: 'Masa bulunamadı' });

      const orders = await all(
        `SELECT orders.id, products.name, COALESCE(orders.unitPrice, products.price) as price, orders.quantity, orders.total
         FROM orders JOIN products ON orders.productId = products.id
         WHERE orders.tableId = ? ORDER BY orders.createdAt`,
        [tableId]
      );
      if (orders.length === 0) return res.status(400).json({ error: 'Bu masada sipariş bulunamadı' });

      const nameRow = await get(`SELECT value FROM settings WHERE key = 'restaurantName'`);
      const printerRow = await get(`SELECT value FROM settings WHERE key = 'printerName'`);
      const restaurantName = nameRow?.value || 'Emek Cafe Adisyon';
      const savedPrinterName = (printerRow?.value || '').trim();
      const targetPrinterName = (req.body?.printerName || '').trim() || savedPrinterName || null;

      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const receipt = {
        restaurantName,
        tableName: table.name,
        orders,
        total: orders.reduce((sum, o) => sum + Number(o.total || 0), 0),
        date: `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`,
      };

      // Önce sunucu (kasa) bilgisayarındaki yazıcıyı dene
      let localPrinter = null;
      let localError = null;
      if (process.platform === 'win32') {
        try {
          const printers = winRawPrint.listWindowsPrinters();
          const selected = winRawPrint.matchPrinter(printers, targetPrinterName);
          if (selected) {
            winRawPrint.printRawWindows(selected.name, winRawPrint.buildEscPosReceipt(receipt));
            localPrinter = selected.name;
            console.log(`✅ Sunucu yerel yazdırma: ${selected.name}`);
          }
        } catch (err) {
          localError = err.message;
          console.warn('Sunucu yerel yazdırma atlandı:', err.message);
        }
      }

      if (localPrinter) {
        return res.json({ success: true, message: `Fiş yazdırıldı (${localPrinter})`, printer: localPrinter, mode: 'server' });
      }

      // Sunucuda termal yazıcı yoksa yazıcının takılı olduğu cihaza (garson tablet vb.) ilet
      broadcast('printReceipt', { receipt, printerName: targetPrinterName, tableId, requestedBy: req.user?.username });
      console.log(`📡 Fiş yazdırma yayınlandı (masa ${table.name})`);
      res.json({
        success: true,
        message: 'Fiş yazdırma isteği yazıcıya bağlı cihaza gönderildi',
        mode: 'broadcast',
        localError,
      });
    } catch (err) {
      next(err);
    }
  });
}

module.exports = { registerPrintReceiptRoute };
