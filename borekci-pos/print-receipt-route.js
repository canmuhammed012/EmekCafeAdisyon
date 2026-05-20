function registerPrintReceiptRoute(app, db, winRawPrint) {
  app.post('/api/print/receipt', (req, res) => {
    const { tableId, printerName: reqPrinterName, printerType = 'windows' } = req.body;

    if (!tableId) {
      return res.status(400).json({ error: 'Masa ID gerekli' });
    }

    if (process.platform !== 'win32') {
      return res.status(400).json({ error: 'Fiş yazdırma yalnızca Windows admin PC üzerinde desteklenir' });
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

              try {
                const printers = winRawPrint.listWindowsPrinters();
                const selected = winRawPrint.matchPrinter(printers, targetPrinterName);

                if (!selected) {
                  return res.status(404).json({
                    error: 'Termal yazıcı bulunamadı. Windows\'ta Xprinter (XP-90) kurulu ve açık olmalı.',
                    availablePrinters: printers.map((p) => p.name),
                  });
                }

                const buffer = winRawPrint.buildEscPosReceipt({
                  restaurantName,
                  tableName: table.name,
                  orders,
                  total: table.total,
                  date: new Date().toLocaleString('tr-TR'),
                });

                winRawPrint.printRawWindows(selected.name, buffer);

                console.log(`✅ Fiş yazdırıldı: ${selected.name} (masa ${table.name})`);

                res.json({
                  success: true,
                  message: `Fiş yazdırıldı (${selected.name})`,
                  printer: selected.name,
                  printerType: 'windows-raw',
                });
              } catch (printError) {
                console.error('❌ Fiş yazdırma hatası:', printError);
                res.status(500).json({ error: printError.message });
              }
            });
          });
        }
      );
    });
  });
}

module.exports = { registerPrintReceiptRoute };
