const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const cors = require('cors');
const os = require('os');
const escpos = require('escpos');
const escposUSB = require('escpos-usb');
const usb = require('usb');
const printer = require('node-printer');

const app = express();
const server = http.createServer(app);

// Socket.io yapılandırması - ağ üzerinden çalışacak
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  pingInterval: 25000,
  pingTimeout: 20000,
  transports: ['websocket', 'polling'],
  allowEIO3: true
});

io.engine.on('connection_error', (err) => {
  console.error('[Socket.io Engine] Bağlantı hatası:', err.code, err.message);
});

// Socket.io bağlantı yönetimi
io.on('connection', (socket) => {
  console.log('✅ Yeni istemci bağlandı:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('❌ İstemci ayrıldı:', socket.id);
  });
});

const port = process.env.PORT || 3000;

// Path'leri düzgün ayarla
const path = require('path');
const distPath = path.join(__dirname, 'dist');
console.log('📁 Frontend klasörü:', distPath);

// Middleware
app.use(cors());
app.use(bodyParser.json());
// NOT: express.static API route'larından SONRA tanımlanacak (satır 1238'de)

// Ağ IP adresini al
function getNetworkIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const networkIP = getNetworkIP();

// Veritabanı yolu - portable olması için
const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'emekcafe.db');
console.log('📁 Veritabanı yolu:', dbPath);

// Veritabanı oluşturma / açma
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error(err.message);
  else console.log('✓ SQLite veritabanı bağlı:', dbPath);
});

// Tabloları oluştur
db.serialize(() => {
  // Masalar
  db.run(`CREATE TABLE IF NOT EXISTS tables (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    status TEXT DEFAULT 'boş',
    total REAL DEFAULT 0,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Kategoriler
  db.run(`CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    color TEXT DEFAULT '#3B82F6',
    sortOrder INTEGER DEFAULT 0
  )`);

  // Ürünler
  db.run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    price REAL,
    categoryId INTEGER,
    color TEXT DEFAULT '#FFFFFF',
    sortOrder INTEGER DEFAULT 0,
    FOREIGN KEY(categoryId) REFERENCES categories(id)
  )`);
  
  // Mevcut ürünlere color kolonu ekle (eğer yoksa)
  db.run(`ALTER TABLE products ADD COLUMN color TEXT DEFAULT '#FFFFFF'`, (err) => {
    if (err && !/duplicate column/i.test(err.message)) {
      console.error('❌ Color kolonu eklenirken hata:', err.message);
    } else if (!err) {
      console.log('✓ Color kolonu eklendi');
      // Mevcut ürünlere beyaz rengi ata
      db.run(`UPDATE products SET color = '#FFFFFF' WHERE color IS NULL`, (updateErr) => {
        if (!updateErr) {
          console.log('✓ Mevcut ürünlere beyaz renk atandı');
        } else {
          console.error('❌ Renk güncelleme hatası:', updateErr.message);
        }
      });
    } else {
      // Kolon zaten var, sessizce devam et
    }
  });

  // Kategorilere sortOrder kolonu ekle (eğer yoksa)
  db.run(`ALTER TABLE categories ADD COLUMN sortOrder INTEGER DEFAULT 0`, (err) => {
    if (err && !/duplicate column/i.test(err.message)) {
      console.error('❌ Categories sortOrder kolonu eklenirken hata:', err.message);
    } else if (!err) {
      console.log('✓ Categories sortOrder kolonu eklendi');
    }
  });

  // Ürünlere sortOrder kolonu ekle (eğer yoksa)
  db.run(`ALTER TABLE products ADD COLUMN sortOrder INTEGER DEFAULT 0`, (err) => {
    if (err && !/duplicate column/i.test(err.message)) {
      console.error('❌ Products sortOrder kolonu eklenirken hata:', err.message);
    } else if (!err) {
      console.log('✓ Products sortOrder kolonu eklendi');
    }
  });

  // Siparişler
  db.run(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tableId INTEGER,
    productId INTEGER,
    quantity INTEGER,
    total REAL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(tableId) REFERENCES tables(id),
    FOREIGN KEY(productId) REFERENCES products(id)
  )`);

  // Ödemeler
  db.run(`CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tableId INTEGER,
    amount REAL,
    paymentType TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(tableId) REFERENCES tables(id)
  )`);

  // Kullanıcılar
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    role TEXT DEFAULT 'garson'
  )`);

  // Ayarlar
  db.run(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )`);

  // Varsayılan ayarları ekle
  db.run(`INSERT OR IGNORE INTO settings(key, value) VALUES('printerIP', '')`);
  db.run(`INSERT OR IGNORE INTO settings(key, value) VALUES('taxRate', '0')`);
  db.run(`INSERT OR IGNORE INTO settings(key, value) VALUES('restaurantName', 'Emek Cafe Adisyon')`);
  
  // Varsayılan kullanıcı (şifre: admin)
  db.run(`INSERT OR IGNORE INTO users(username, password, role) VALUES('admin', 'admin', 'yönetici')`);
  db.run(`INSERT OR IGNORE INTO users(username, password, role) VALUES('garson', 'garson', 'garson')`);
});

// Socket.io kaldırıldı - tek cihaz kullanımı
// io.on('connection', (socket) => {
//   console.log('Yeni istemci bağlandı:', socket.id);
//   socket.on('disconnect', () => {
//     console.log('İstemci ayrıldı:', socket.id);
//   });
// });

// Broadcast kaldırıldı - artık gereksiz
function broadcast(event, data) {
  io.emit(event, data);
  console.log(`📡 Socket broadcast: ${event}`, data ? Object.keys(data) : '');
}

// API Endpoints

// ========== MASALAR ==========

// Masaları listele
app.get('/api/tables', (req, res) => {
  // Masaları sayısal sıraya göre sırala (Masa 1, Masa 2, ...)
  db.all("SELECT * FROM tables ORDER BY CAST(SUBSTR(name, 6) AS INTEGER)", [], (err, rows) => {
    if (err) {
      // Eğer sayısal sıralama başarısız olursa (örneğin "Masa" kelimesi yoksa), alfabetik sırala
      db.all("SELECT * FROM tables ORDER BY name", [], (err2, rows2) => {
        if (err2) res.status(400).json({error: err2.message});
        else res.json(rows2);
      });
    } else {
      res.json(rows);
    }
  });
});

// Masa oluştur
app.post('/api/tables', (req, res) => {
  const { name } = req.body;
  db.run(`INSERT INTO tables(name) VALUES(?)`, [name], function(err) {
    if (err) res.status(400).json({error: err.message});
    else {
      const newTable = {id: this.lastID, name, status: 'boş', total: 0};
      broadcast('tableCreated', newTable);
      res.json(newTable);
    }
  });
});

// Masa güncelle
app.put('/api/tables/:id', (req, res) => {
  const { name, status } = req.body;
  const id = req.params.id;
  db.run(`UPDATE tables SET name = ?, status = ? WHERE id = ?`, 
    [name, status, id], function(err) {
    if (err) res.status(400).json({error: err.message});
    else {
      broadcast('tableUpdated', {id, name, status});
      res.json({id, name, status});
    }
  });
});

// Masa sil
app.delete('/api/tables/:id', (req, res) => {
  const id = req.params.id;
  db.run(`DELETE FROM tables WHERE id = ?`, [id], function(err) {
    if (err) res.status(400).json({error: err.message});
    else {
      broadcast('tableDeleted', {id});
      res.json({success: true});
    }
  });
});

// Masa toplamını ve durumunu güncelle
function updateTableTotal(tableId) {
  // Sipariş sayısını ve toplamı kontrol et
  db.get(`SELECT COUNT(*) as orderCount, SUM(total) as total FROM orders WHERE tableId = ?`, [tableId], (err, row) => {
    if (!err) {
      const total = row.total || 0;
      const orderCount = row.orderCount || 0;
      const status = orderCount > 0 ? 'dolu' : 'boş';
      
      db.run(`UPDATE tables SET total = ?, status = ? WHERE id = ?`, [total, status, tableId], (err) => {
        if (!err) {
          broadcast('tableTotalUpdated', {tableId, total, status});
          broadcast('tableUpdated', {id: tableId, status, total});
        }
      });
    }
  });
}

// ========== KATEGORİLER ==========

// Kategorileri listele
app.get('/api/categories', (req, res) => {
  db.all("SELECT id, name, color, sortOrder FROM categories ORDER BY sortOrder ASC, id ASC", [], (err, rows) => {
    if (err) {
      console.error('❌ Kategoriler alınırken hata:', err);
      return res.status(500).json({error: err.message});
    }
    res.json(rows);
  });
});

// Kategori oluştur
app.post('/api/categories', (req, res) => {
  const { name, color } = req.body;
  // Yeni kategori için maksimum sortOrder + 1
  db.get("SELECT MAX(sortOrder) as maxOrder FROM categories", [], (err, row) => {
    if (err) {
      res.status(400).json({error: err.message});
      return;
    }
    const sortOrder = (row?.maxOrder || 0) + 1;
    db.run(`INSERT INTO categories(name, color, sortOrder) VALUES(?, ?, ?)`, [name, color || '#3B82F6', sortOrder], function(err) {
      if (err) res.status(400).json({error: err.message});
      else {
        const newCategory = {id: this.lastID, name, color: color || '#3B82F6', sortOrder};
        broadcast('categoryCreated', newCategory);
        res.json(newCategory);
      }
    });
  });
});

// Kategori güncelle
app.put('/api/categories/:id', (req, res) => {
  const { name, color } = req.body;
  const id = req.params.id;
  db.run(`UPDATE categories SET name = ?, color = ? WHERE id = ?`, 
    [name, color, id], function(err) {
    if (err) res.status(400).json({error: err.message});
    else {
      broadcast('categoryUpdated', {id, name, color});
      res.json({id, name, color});
    }
  });
});

// Kategori sil
app.delete('/api/categories/:id', (req, res) => {
  const id = req.params.id;
  db.run(`DELETE FROM categories WHERE id = ?`, [id], function(err) {
    if (err) res.status(400).json({error: err.message});
    else {
      broadcast('categoryDeleted', {id});
      res.json({success: true});
    }
  });
});

// Kategoriler sıralamasını güncelle
app.put('/api/categories/sort', (req, res) => {
  const { sortedIds } = req.body; // [id1, id2, id3, ...] formatında
  console.log('📥 Kategoriler sıralaması güncelleniyor:', sortedIds);
  
  if (!Array.isArray(sortedIds)) {
    console.error('❌ sortedIds bir array değil:', sortedIds);
    return res.status(400).json({error: 'sortedIds must be an array'});
  }
  
  if (sortedIds.length === 0) {
    // Boş array ise direkt başarı döndür
    broadcast('categoriesSorted', {sortedIds});
    return res.json({success: true});
  }
  
  // SQL injection'dan kaçınmak için id'leri kontrol et ve integer'a çevir
  const validIds = sortedIds.map(id => parseInt(id)).filter(id => !isNaN(id) && id > 0);
  if (validIds.length !== sortedIds.length) {
    console.error('❌ Geçersiz ID değerleri:', sortedIds);
    return res.status(400).json({error: 'Invalid category IDs'});
  }
  
  console.log('📝 Valid IDs:', validIds);
  
  // db.serialize() ve db.prepare() kullanarak her bir kategoriyi güncelle
  db.serialize(() => {
    const stmt = db.prepare('UPDATE categories SET sortOrder = ? WHERE id = ?');
    let completed = 0;
    let hasError = false;
    
    validIds.forEach((id, index) => {
      stmt.run(index, id, function(err) {
        if (err) {
          console.error(`❌ Kategori ${id} güncellenemedi:`, err);
          hasError = true;
        } else {
          console.log(`✓ Kategori ${id} sortOrder = ${index} (changes: ${this.changes})`);
        }
        
        completed++;
        if (completed === validIds.length) {
          stmt.finalize((finalizeErr) => {
            if (finalizeErr) {
              console.error('❌ Statement finalize hatası:', finalizeErr);
              return res.status(500).json({error: 'Sıralama kaydedilemedi'});
            }
            
            if (hasError) {
              console.error('❌ Bazı kategoriler güncellenemedi');
              return res.status(500).json({error: 'Sıralama kaydedilirken hata oluştu'});
            }
            
            console.log('✅ Tüm kategoriler başarıyla güncellendi');
            
            // Güncellemeleri doğrula - tüm kategorileri getir
            db.all("SELECT id, name, sortOrder FROM categories ORDER BY sortOrder ASC, id ASC", [], (verifyErr, rows) => {
              if (verifyErr) {
                console.error('❌ Doğrulama hatası:', verifyErr);
              } else {
                console.log('📋 Tüm kategoriler (sortOrder sırasına göre):', rows.map(r => ({ id: r.id, name: r.name, sortOrder: r.sortOrder })));
              }
              broadcast('categoriesSorted', {sortedIds: validIds});
              res.json({success: true});
            });
          });
        }
      });
    });
  });
});

// ========== ÜRÜNLER ==========

// Ürünleri listele
app.get('/api/products', (req, res) => {
  const categoryId = req.query.categoryId;
  let query = "SELECT p.*, c.name as categoryName, c.color as categoryColor FROM products p LEFT JOIN categories c ON p.categoryId = c.id";
  let params = [];
  
  if (categoryId) {
    query += " WHERE p.categoryId = ?";
    params.push(categoryId);
  }
  
  query += " ORDER BY p.sortOrder ASC, p.id ASC";
  
  db.all(query, params, (err, rows) => {
    if (err) {
      res.status(400).json({error: err.message});
    } else {
      console.log('📦 Ürünler gönderiliyor (ilk 3):', rows.slice(0, 3).map(r => ({ name: r.name, color: r.color })));
      res.json(rows);
    }
  });
});

// Ürün oluştur
app.post('/api/products', (req, res) => {
  const { name, price, categoryId, color } = req.body;
  const productColor = color || '#FFFFFF'; // Varsayılan beyaz
  // Yeni ürün için kategori içinde maksimum sortOrder + 1
  db.get("SELECT MAX(sortOrder) as maxOrder FROM products WHERE categoryId = ?", [categoryId], (err, row) => {
    if (err) {
      res.status(400).json({error: err.message});
      return;
    }
    const sortOrder = (row?.maxOrder || 0) + 1;
    db.run(`INSERT INTO products(name, price, categoryId, color, sortOrder) VALUES(?, ?, ?, ?, ?)`, 
      [name, price, categoryId, productColor, sortOrder], function(err) {
      if (err) res.status(400).json({error: err.message});
      else {
        const newProduct = {id: this.lastID, name, price, categoryId, color: productColor, sortOrder};
        broadcast('productCreated', newProduct);
        res.json(newProduct);
      }
    });
  });
});

// Ürün güncelle
app.put('/api/products/:id', (req, res) => {
  const { name, price, categoryId, color } = req.body;
  const id = req.params.id;
  const productColor = color || '#FFFFFF';
  db.run(`UPDATE products SET name = ?, price = ?, categoryId = ?, color = ? WHERE id = ?`, 
    [name, price, categoryId, productColor, id], function(err) {
    if (err) res.status(400).json({error: err.message});
    else {
      broadcast('productUpdated', {id, name, price, categoryId, color: productColor});
      res.json({id, name, price, categoryId, color: productColor});
    }
  });
});

// Ürün sil
app.delete('/api/products/:id', (req, res) => {
  const id = req.params.id;
  db.run(`DELETE FROM products WHERE id = ?`, [id], function(err) {
    if (err) res.status(400).json({error: err.message});
    else {
      broadcast('productDeleted', {id});
      res.json({success: true});
    }
  });
});

// Ürünler sıralamasını güncelle (kategori bazlı)
app.put('/api/products/sort', (req, res) => {
  const { categoryId, sortedIds } = req.body; // { categoryId: 1, sortedIds: [id1, id2, ...] }
  console.log('📥 Ürünler sıralaması güncelleniyor:', { categoryId, sortedIds });
  
  if (!categoryId || !Array.isArray(sortedIds)) {
    console.error('❌ categoryId veya sortedIds eksik:', { categoryId, sortedIds });
    return res.status(400).json({error: 'categoryId and sortedIds (array) are required'});
  }
  
  if (sortedIds.length === 0) {
    // Boş array ise direkt başarı döndür
    broadcast('productsSorted', {categoryId, sortedIds});
    return res.json({success: true});
  }
  
  // SQL injection'dan kaçınmak için id'leri kontrol et ve integer'a çevir
  const validIds = sortedIds.map(id => parseInt(id)).filter(id => !isNaN(id) && id > 0);
  const validCategoryId = parseInt(categoryId);
  
  if (validIds.length !== sortedIds.length || isNaN(validCategoryId)) {
    console.error('❌ Geçersiz ID değerleri:', { categoryId, sortedIds });
    return res.status(400).json({error: 'Invalid product or category IDs'});
  }
  
  console.log('📝 Valid IDs:', validIds, 'Category ID:', validCategoryId);
  
  // db.serialize() ve db.prepare() kullanarak her bir ürünü güncelle
  db.serialize(() => {
    const stmt = db.prepare('UPDATE products SET sortOrder = ? WHERE id = ? AND categoryId = ?');
    let completed = 0;
    let hasError = false;
    
    validIds.forEach((id, index) => {
      stmt.run(index, id, validCategoryId, function(err) {
        if (err) {
          console.error(`❌ Ürün ${id} (kategori ${validCategoryId}) güncellenemedi:`, err);
          hasError = true;
        } else {
          console.log(`✓ Ürün ${id} (kategori ${validCategoryId}) sortOrder = ${index} (changes: ${this.changes})`);
        }
        
        completed++;
        if (completed === validIds.length) {
          stmt.finalize((finalizeErr) => {
            if (finalizeErr) {
              console.error('❌ Statement finalize hatası:', finalizeErr);
              return res.status(500).json({error: 'Sıralama kaydedilemedi'});
            }
            
            if (hasError) {
              console.error('❌ Bazı ürünler güncellenemedi');
              return res.status(500).json({error: 'Sıralama kaydedilirken hata oluştu'});
            }
            
            console.log(`✅ Tüm ürünler başarıyla güncellendi (kategori ${validCategoryId})`);
            
            // Güncellemeleri doğrula
            db.all("SELECT id, name, categoryId, sortOrder FROM products WHERE categoryId = ? ORDER BY sortOrder ASC, id ASC", [validCategoryId], (verifyErr, rows) => {
              if (verifyErr) {
                console.error('❌ Doğrulama hatası:', verifyErr);
              } else {
                console.log(`📋 Kategori ${validCategoryId} için güncellenmiş ürünler:`, rows.map(r => ({ id: r.id, name: r.name, sortOrder: r.sortOrder })));
              }
              broadcast('productsSorted', {categoryId: validCategoryId, sortedIds: validIds});
              res.json({success: true});
            });
          });
        }
      });
    });
  });
});

// ========== SİPARİŞLER ==========

// Sipariş ekle
app.post('/api/orders', (req, res) => {
  const { tableId, productId, quantity } = req.body;
  
  // Ürün fiyatını al
  db.get(`SELECT price FROM products WHERE id = ?`, [productId], (err, product) => {
    if (err || !product) {
      res.status(400).json({error: 'Ürün bulunamadı'});
      return;
    }
    
    const total = product.price * quantity;
    
    db.run(`INSERT INTO orders(tableId, productId, quantity, total) VALUES(?,?,?,?)`,
      [tableId, productId, quantity, total],
      function(err) {
        if (err) res.status(400).json({error: err.message});
        else {
          updateTableTotal(tableId); // Bu fonksiyon hem total hem status'u güncelliyor
          broadcast('orderCreated', {id: this.lastID, tableId, productId, quantity, total});
          res.json({id: this.lastID});
        }
      });
  });
});

// Siparişleri listele (masa bazlı)
app.get('/api/orders/:tableId', (req, res) => {
  const tableId = req.params.tableId;
  db.all(`SELECT orders.id, orders.productId, products.name, products.price, orders.quantity, orders.total 
          FROM orders 
          JOIN products ON orders.productId = products.id 
          WHERE orders.tableId = ? 
          ORDER BY orders.createdAt DESC`, [tableId], (err, rows) => {
    if (err) res.status(400).json({error: err.message});
    else res.json(rows);
  });
});

// Sipariş güncelle (adet değiştir)
app.put('/api/orders/:id', (req, res) => {
  const { quantity } = req.body;
  const id = req.params.id;
  
  db.get(`SELECT productId, tableId FROM orders WHERE id = ?`, [id], (err, order) => {
    if (err || !order) {
      res.status(400).json({error: 'Sipariş bulunamadı'});
      return;
    }
    
    db.get(`SELECT price FROM products WHERE id = ?`, [order.productId], (err, product) => {
      if (err || !product) {
        res.status(400).json({error: 'Ürün bulunamadı'});
        return;
      }
      
      const total = product.price * quantity;
      
      db.run(`UPDATE orders SET quantity = ?, total = ? WHERE id = ?`,
        [quantity, total, id], function(err) {
        if (err) res.status(400).json({error: err.message});
        else {
          updateTableTotal(order.tableId);
          broadcast('orderUpdated', {id, quantity, total, tableId: order.tableId});
          res.json({id, quantity, total});
        }
      });
    });
  });
});

// Sipariş sil
app.delete('/api/orders/:id', (req, res) => {
  const id = req.params.id;
  
  db.get(`SELECT tableId FROM orders WHERE id = ?`, [id], (err, order) => {
    if (err || !order) {
      res.status(400).json({error: 'Sipariş bulunamadı'});
      return;
    }
    
    db.run(`DELETE FROM orders WHERE id = ?`, [id], function(err) {
      if (err) res.status(400).json({error: err.message});
      else {
        updateTableTotal(order.tableId);
        broadcast('orderDeleted', {id, tableId: order.tableId});
        res.json({success: true});
      }
    });
  });
});

// Masa değiştir - Siparişleri bir masadan diğerine taşı
app.post('/api/orders/transfer', (req, res) => {
  const { fromTableId, toTableId } = req.body;
  
  if (!fromTableId || !toTableId) {
    res.status(400).json({error: 'Kaynak ve hedef masa ID\'si gerekli'});
    return;
  }
  
  if (fromTableId === toTableId) {
    res.status(400).json({error: 'Aynı masaya taşınamaz'});
    return;
  }
  
  // Önce hedef masada mevcut siparişleri kontrol et
  db.all(`SELECT productId, quantity FROM orders WHERE tableId = ?`, [toTableId], (err, existingOrders) => {
    if (err) {
      res.status(400).json({error: err.message});
      return;
    }
    
    // Kaynak masadaki siparişleri al
    db.all(`SELECT productId, quantity FROM orders WHERE tableId = ?`, [fromTableId], (err, sourceOrders) => {
      if (err) {
        res.status(400).json({error: err.message});
        return;
      }
      
      if (sourceOrders.length === 0) {
        res.status(400).json({error: 'Kaynak masada sipariş yok'});
        return;
      }
      
      // Her sipariş için hedef masada aynı ürün var mı kontrol et
      const ordersToUpdate = [];
      const ordersToInsert = [];
      
      sourceOrders.forEach(sourceOrder => {
        const existing = existingOrders.find(e => e.productId === sourceOrder.productId);
        if (existing) {
          // Aynı ürün varsa, miktarı birleştir
          ordersToUpdate.push({
            productId: sourceOrder.productId,
            newQuantity: existing.quantity + sourceOrder.quantity
          });
        } else {
          // Yeni ürün, ekle
          ordersToInsert.push(sourceOrder);
        }
      });
      
      // Transaction başlat
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        // Mevcut siparişleri güncelle
        const updatePromises = ordersToUpdate.map(order => {
          return new Promise((resolve, reject) => {
            db.get(`SELECT price FROM products WHERE id = ?`, [order.productId], (err, product) => {
              if (err || !product) {
                reject(err || new Error('Ürün bulunamadı'));
                return;
              }
              const total = product.price * order.newQuantity;
              db.run(`UPDATE orders SET quantity = ?, total = ? WHERE tableId = ? AND productId = ?`,
                [order.newQuantity, total, toTableId, order.productId], (err) => {
                if (err) reject(err);
                else resolve();
              });
            });
          });
        });
        
        // Yeni siparişleri ekle
        const insertPromises = ordersToInsert.map(order => {
          return new Promise((resolve, reject) => {
            db.get(`SELECT price FROM products WHERE id = ?`, [order.productId], (err, product) => {
              if (err || !product) {
                reject(err || new Error('Ürün bulunamadı'));
                return;
              }
              const total = product.price * order.quantity;
              db.run(`INSERT INTO orders(tableId, productId, quantity, total) VALUES(?,?,?,?)`,
                [toTableId, order.productId, order.quantity, total], (err) => {
                if (err) reject(err);
                else resolve();
              });
            });
          });
        });
        
        // Kaynak masadaki siparişleri sil
        db.run(`DELETE FROM orders WHERE tableId = ?`, [fromTableId], (err) => {
          if (err) {
            db.run('ROLLBACK');
            res.status(400).json({error: err.message});
            return;
          }
          
          // Tüm işlemleri bekle
          Promise.all([...updatePromises, ...insertPromises])
            .then(() => {
              db.run('COMMIT', (err) => {
                if (err) {
                  res.status(400).json({error: err.message});
                  return;
                }
                
                // Masaları güncelle
                updateTableTotal(fromTableId);
                updateTableTotal(toTableId);
                
                // Broadcast
                broadcast('ordersTransferred', {fromTableId, toTableId});
                
                res.json({success: true, message: 'Siparişler başarıyla taşındı'});
              });
            })
            .catch((error) => {
              db.run('ROLLBACK');
              res.status(400).json({error: error.message});
            });
        });
      });
    });
  });
});

// ========== ÖDEMELER ==========

// Ödeme yap
app.post('/api/payments', (req, res) => {
  const { tableId, paymentType } = req.body;
  
  db.get(`SELECT total FROM tables WHERE id = ?`, [tableId], (err, table) => {
    if (err || !table) {
      res.status(400).json({error: 'Masa bulunamadı'});
      return;
    }
    
    db.run(`INSERT INTO payments(tableId, amount, paymentType) VALUES(?, ?, ?)`,
      [tableId, table.total, paymentType], function(err) {
      if (err) {
        res.status(400).json({error: err.message});
        return;
      }
      
      const paymentId = this.lastID;
      
      // Siparişleri ve masayı temizle
      db.run(`DELETE FROM orders WHERE tableId = ?`, [tableId]);
      db.run(`UPDATE tables SET total = 0, status = 'boş' WHERE id = ?`, [tableId], (err) => {
        if (!err) {
          broadcast('paymentCompleted', {tableId, amount: table.total, paymentType});
          broadcast('tableUpdated', {id: tableId, status: 'boş', total: 0});
          res.json({success: true, paymentId});
        } else {
          res.status(400).json({error: err.message});
        }
      });
    });
  });
});

// Ödeme geçmişi
app.get('/api/payments', (req, res) => {
  const date = req.query.date;
  let query = `SELECT p.*, t.name as tableName FROM payments p 
               JOIN tables t ON p.tableId = t.id`;
  let params = [];
  
  if (date) {
    // GMT+3 için local timezone'a çevir (UTC+3 = +3 hours)
    // datetime() ile local timezone'a çevirip DATE() ile karşılaştır
    query += ` WHERE DATE(datetime(p.createdAt, '+3 hours')) = ?`;
    params.push(date);
  }
  
  query += ` ORDER BY p.createdAt DESC`;
  
  db.all(query, params, (err, rows) => {
    if (err) res.status(400).json({error: err.message});
    else res.json(rows);
  });
});

// ========== RAPORLAR ==========

// Gün sonu raporu
app.get('/api/reports/daily', (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0];
  
  // GMT+3 için local timezone'a çevir (UTC+3 = +3 hours)
  // datetime() ile local timezone'a çevirip DATE() ile karşılaştır
  db.get(`SELECT 
    COUNT(DISTINCT p.tableId) as totalTables,
    COUNT(p.id) as totalPayments,
    SUM(p.amount) as totalRevenue,
    SUM(CASE WHEN p.paymentType = 'Nakit' THEN p.amount ELSE 0 END) as cashRevenue,
    SUM(CASE WHEN p.paymentType = 'Kart' THEN p.amount ELSE 0 END) as cardRevenue
    FROM payments p
    WHERE DATE(datetime(p.createdAt, '+3 hours')) = ?`, [date], (err, row) => {
    if (err) res.status(400).json({error: err.message});
    else res.json(row || {
      totalTables: 0,
      totalPayments: 0,
      totalRevenue: 0,
      cashRevenue: 0,
      cardRevenue: 0
    });
  });
});

// ========== AYARLAR ==========

// Ayarları getir
app.get('/api/settings', (req, res) => {
  db.all("SELECT * FROM settings", [], (err, rows) => {
    if (err) res.status(400).json({error: err.message});
    else {
      const settings = {};
      rows.forEach(row => {
        settings[row.key] = row.value;
      });
      res.json(settings);
    }
  });
});

// Ayar güncelle
app.put('/api/settings/:key', (req, res) => {
  const { value } = req.body;
  const key = req.params.key;
  db.run(`INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)`, 
    [key, value], function(err) {
    if (err) res.status(400).json({error: err.message});
    else {
      broadcast('settingUpdated', {key, value});
      res.json({key, value});
    }
  });
});

// ========== KULLANICI ==========

// Kullanıcı girişi
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  db.get(`SELECT * FROM users WHERE username = ? AND password = ?`, 
    [username, password], (err, user) => {
    if (err) res.status(400).json({error: err.message});
    else if (!user) res.status(401).json({error: 'Kullanıcı adı veya şifre hatalı'});
    else {
      const { password, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    }
  });
});

// ========== FİŞ YAZDIRMA ==========

// Fiş verilerini getir
app.get('/api/receipt/:tableId', (req, res) => {
  const tableId = req.params.tableId;
  
  db.get(`SELECT * FROM tables WHERE id = ?`, [tableId], (err, table) => {
    if (err || !table) {
      res.status(400).json({error: 'Masa bulunamadı'});
      return;
    }
    
    db.all(`SELECT orders.id, products.name, products.price, orders.quantity, orders.total 
            FROM orders 
            JOIN products ON orders.productId = products.id 
            WHERE orders.tableId = ? 
            ORDER BY orders.createdAt`, [tableId], (err, orders) => {
      if (err) {
        res.status(400).json({error: err.message});
        return;
      }
      
      db.get(`SELECT value as restaurantName FROM settings WHERE key = 'restaurantName'`, (err, setting) => {
        const receipt = {
          restaurantName: setting?.value || 'Emek Cafe Adisyon',
          tableName: table.name,
          orders: orders,
          total: table.total,
          date: new Date().toLocaleString('tr-TR')
        };
        res.json(receipt);
      });
    });
  });
});

// USB yazıcıları listele
app.get('/api/printers', (req, res) => {
  try {
    const printerList = [];
    
    // USB yazıcıları bul - escpos-usb paketinin doğru API'sini kullan
    let usbDevices = [];
    
    try {
      // escpos-usb paketinin farklı API versiyonlarını dene
      if (typeof escposUSB.find === 'function') {
        usbDevices = escposUSB.find();
      } else if (escposUSB.device && typeof escposUSB.device.find === 'function') {
        usbDevices = escposUSB.device.find();
      } else {
        // usb paketi ile manuel arama
        const allDevices = usb.getDeviceList();
        // ESC/POS yazıcıları için yaygın vendor ID'leri filtrele
        usbDevices = allDevices.filter(device => {
          const descriptor = device.deviceDescriptor;
          // Yaygın ESC/POS yazıcı vendor ID'leri (Xprinter, Epson, Star, vb.)
          const commonVendorIds = [0x04f9, 0x0483, 0x1504, 0x154f, 0x04e8];
          return commonVendorIds.includes(descriptor.idVendor);
        });
      }
    } catch (findError) {
      console.error('USB cihaz bulma hatası:', findError);
      // usb paketi ile fallback
      try {
        const allDevices = usb.getDeviceList();
        usbDevices = allDevices.slice(0, 5); // İlk 5 cihazı al
      } catch (usbError) {
        console.error('USB paketi hatası:', usbError);
      }
    }
    
    if (usbDevices && usbDevices.length > 0) {
      usbDevices.forEach((device, index) => {
        const descriptor = device.deviceDescriptor || device;
        printerList.push({
          id: index,
          name: descriptor.iProduct || `USB Yazıcı ${index + 1}`,
          vendorId: descriptor.idVendor,
          productId: descriptor.idProduct,
          type: 'usb'
        });
      });
    }
    
    res.json({ printers: printerList });
  } catch (error) {
    console.error('Yazıcı listesi alınamadı:', error);
    res.status(500).json({ error: 'Yazıcı listesi alınamadı: ' + error.message });
  }
});

// Test endpoint - route'un çalışıp çalışmadığını kontrol et
app.get('/api/print/test', (req, res) => {
  console.log('✅ /api/print/test endpoint çalışıyor');
  res.json({ success: true, message: 'Print endpoint çalışıyor' });
});

// Windows yazıcılarını listele (PowerShell öncelikli)
app.get('/api/printers/windows', (req, res) => {
  try {
    console.log('🔍 Windows yazıcıları aranıyor...');
    const { execSync } = require('child_process');
    let printers = [];
    
    // Önce PowerShell komutunu dene
    try {
      console.log('🔍 PowerShell komutu çalıştırılıyor...');
      const psOutput = execSync('powershell -Command "Get-Printer | Select-Object -ExpandProperty Name"', {
        encoding: 'utf-8',
        timeout: 5000,
        shell: true
      });
      
      const psLines = psOutput.split('\n')
        .map(line => line.trim())
        .filter(line => line && line.length > 0);
      
      printers = psLines.map((name, index) => ({
        name: name,
        isDefault: index === 0,
        status: 'ready'
      }));
      
      console.log('✅ PowerShell ile yazıcılar bulundu:', printers.length);
    } catch (psError) {
      console.error('❌ PowerShell komutu başarısız:', psError.message);
      
      // Fallback: wmic komutunu dene
      try {
        console.log('🔄 wmic komutu deneniyor...');
        const output = execSync('wmic printer get name', { 
          encoding: 'utf-8',
          timeout: 5000,
          shell: true
        });
        
        const lines = output.split('\n')
          .map(line => line.trim())
          .filter(line => line && line !== 'Name' && line.length > 0);
        
        printers = lines.map((name, index) => ({
          name: name,
          isDefault: index === 0,
          status: 'ready'
        }));
        
        console.log('✅ wmic ile yazıcılar bulundu:', printers.length);
      } catch (wmicError) {
        console.error('❌ wmic komutu da başarısız:', wmicError.message);
        throw new Error('Yazıcı listesi alınamadı. PowerShell ve wmic komutları başarısız oldu.');
      }
    }
    
    console.log('📋 Bulunan Windows yazıcıları:', printers.length);
    
    const printerList = printers.map((printerItem, index) => ({
      id: index,
      name: printerItem.name || printerItem,
      status: printerItem.status || 'ready',
      isDefault: printerItem.isDefault || index === 0,
      type: 'windows'
    }));
    
    res.json({ printers: printerList });
  } catch (error) {
    console.error('Windows yazıcı listesi alınamadı:', error);
    res.status(500).json({ error: 'Yazıcı listesi alınamadı: ' + error.message });
  }
});

// Windows yazıcıya fiş yazdır (node-printer kullanarak)
app.post('/api/print/receipt', (req, res) => {
  console.log('📝 /api/print/receipt endpoint çağrıldı');
  console.log('📦 Request body:', req.body);
  const { tableId, printerName, printerIndex } = req.body;
  
  if (!tableId) {
    res.status(400).json({ error: 'Masa ID gerekli' });
    return;
  }
  
  // Fiş verilerini al
  db.get(`SELECT * FROM tables WHERE id = ?`, [tableId], (err, table) => {
    if (err || !table) {
      res.status(400).json({ error: 'Masa bulunamadı' });
      return;
    }
    
    db.all(`SELECT orders.id, products.name, products.price, orders.quantity, orders.total 
            FROM orders 
            JOIN products ON orders.productId = products.id 
            WHERE orders.tableId = ? 
            ORDER BY orders.createdAt`, [tableId], (err, orders) => {
      if (err) {
        res.status(400).json({ error: err.message });
        return;
      }
      
      if (!orders || orders.length === 0) {
        res.status(400).json({ error: 'Bu masada sipariş bulunamadı' });
        return;
      }
      
      db.get(`SELECT value as restaurantName FROM settings WHERE key = 'restaurantName'`, (err, setting) => {
        const restaurantName = setting?.value || 'Emek Cafe Adisyon';
        
        try {
          // Windows yazıcılarını bul
          console.log('🔍 Windows yazıcıları aranıyor...');
          console.log('📦 printer objesi:', typeof printer, Object.keys(printer || {}));
          
          // Windows API kullanarak yazıcıları bul (PowerShell öncelikli, wmic fallback)
          let printers = [];
          const { execSync } = require('child_process');
          
          // Önce PowerShell komutunu dene (daha güvenilir)
          try {
            console.log('🔍 PowerShell komutu çalıştırılıyor...');
            const psOutput = execSync('powershell -Command "Get-Printer | Select-Object -ExpandProperty Name"', {
              encoding: 'utf-8',
              timeout: 5000,
              shell: true
            });
            
            console.log('📋 PowerShell çıktısı:', psOutput);
            
            const psLines = psOutput.split('\n')
              .map(line => line.trim())
              .filter(line => line && line.length > 0);
            
            console.log('📋 Bulunan yazıcı satırları:', psLines);
            
            printers = psLines.map((name, index) => ({
              name: name,
              isDefault: index === 0,
              status: 'ready'
            }));
            
            console.log('✅ PowerShell ile yazıcılar bulundu:', printers.length);
            printers.forEach((p, i) => {
              console.log(`  ${i + 1}. ${p.name} (default: ${p.isDefault})`);
            });
          } catch (psError) {
            console.error('❌ PowerShell komutu başarısız:', psError.message);
            
            // Fallback: wmic komutunu dene
            try {
              console.log('🔄 wmic komutu deneniyor...');
              const output = execSync('wmic printer get name', { 
                encoding: 'utf-8',
                timeout: 5000,
                shell: true
              });
              
              console.log('📋 wmic çıktısı:', output);
              
              const lines = output.split('\n')
                .map(line => line.trim())
                .filter(line => line && line !== 'Name' && line.length > 0);
              
              console.log('📋 Bulunan yazıcı satırları:', lines);
              
              printers = lines.map((name, index) => ({
                name: name,
                isDefault: index === 0,
                status: 'ready'
              }));
              
              console.log('✅ wmic ile yazıcılar bulundu:', printers.length);
              printers.forEach((p, i) => {
                console.log(`  ${i + 1}. ${p.name} (default: ${p.isDefault})`);
              });
            } catch (wmicError) {
              console.error('❌ wmic komutu da başarısız:', wmicError.message);
              
              // Son çare: Windows registry'den yazıcıları oku
              try {
                console.log('🔄 Registry\'den yazıcılar okunuyor...');
                const regPath = 'HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Devices';
                const regOutput = execSync(`reg query "${regPath}" /s`, {
                  encoding: 'utf-8',
                  timeout: 5000,
                  shell: true
                });
                
                // Registry çıktısını parse et
                const regLines = regOutput.split('\n')
                  .filter(line => line.includes('REG_SZ'))
                  .map(line => {
                    const match = line.match(/REG_SZ\s+(.+)/);
                    return match ? match[1].trim() : null;
                  })
                  .filter(name => name && name.length > 0);
                
                printers = regLines.map((name, index) => ({
                  name: name,
                  isDefault: index === 0,
                  status: 'ready'
                }));
                
                console.log('✅ Registry ile yazıcılar bulundu:', printers.length);
              } catch (regError) {
                console.error('❌ Registry okuma da başarısız:', regError.message);
                throw new Error('Yazıcı listesi alınamadı. PowerShell, wmic ve registry yöntemleri başarısız oldu.');
              }
            }
          }
          
          console.log('📋 Bulunan yazıcılar:', printers.length);
          
          if (!printers || printers.length === 0) {
            console.error('❌ Windows yazıcı bulunamadı');
            res.status(404).json({ error: 'Windows yazıcı bulunamadı. Lütfen yazıcınızın yüklü olduğundan emin olun.' });
            return;
          }
          
          // Yazıcı seçimi
          let selectedPrinter;
          if (typeof printerIndex === 'number' && printerIndex >= 0 && printerIndex < printers.length) {
            // Index ile yazıcı seç
            selectedPrinter = printers[printerIndex];
            console.log('📌 Index ile yazıcı seçildi:', selectedPrinter.name);
          } else if (printerName) {
            // Belirtilen yazıcıyı bul (case-insensitive, partial match)
            selectedPrinter = printers.find(p => 
              p.name.toLowerCase() === printerName.toLowerCase() || 
              p.name.toLowerCase().includes(printerName.toLowerCase()) ||
              printerName.toLowerCase().includes(p.name.toLowerCase())
            );
            if (!selectedPrinter) {
              console.error('❌ Belirtilen yazıcı bulunamadı:', printerName);
              console.log('📋 Mevcut yazıcılar:', printers.map(p => p.name));
              res.status(404).json({ 
                error: `Yazıcı bulunamadı: ${printerName}`,
                availablePrinters: printers.map(p => p.name)
              });
              return;
            }
          } else {
            // POS-80 veya benzeri yazıcıları öncelikle ara
            selectedPrinter = printers.find(p => 
              p.name.toLowerCase().includes('pos') || 
              p.name.toLowerCase().includes('80') ||
              p.name.toLowerCase().includes('q900')
            );
            
            // Bulunamazsa varsayılan yazıcıyı veya ilk yazıcıyı kullan
            if (!selectedPrinter) {
              selectedPrinter = printers.find(p => p.isDefault) || printers[0];
            }
          }
          
          if (!selectedPrinter) {
            console.error('❌ Hiç yazıcı bulunamadı');
            res.status(404).json({ error: 'Hiç yazıcı bulunamadı. Lütfen yazıcınızın yüklü olduğundan emin olun.' });
            return;
          }
          
          console.log('🖨️ Seçilen yazıcı:', selectedPrinter.name);
          
          // Fiş içeriğini ESC/POS formatında oluştur (POS-80 ESC/POS yazıcı için)
          let receiptContent = '';
          
          // ESC/POS komutları
          receiptContent += '\x1B\x40'; // Initialize printer
          receiptContent += '\x1B\x61\x01'; // Center align
          receiptContent += '\x1B\x21\x30'; // Double height and width
          receiptContent += `${restaurantName}\n`;
          receiptContent += '\x1B\x21\x00'; // Normal text
          receiptContent += '\x1B\x61\x00'; // Left align
          receiptContent += '--------------------------------\n';
          receiptContent += `Masa: ${table.name}\n`;
          receiptContent += `Tarih: ${new Date().toLocaleString('tr-TR')}\n`;
          receiptContent += '--------------------------------\n';
          receiptContent += '\n';
          
          // Siparişleri yazdır
          orders.forEach((order) => {
            const line = `${order.name} x${order.quantity}`;
            const price = `${order.total.toFixed(2)} ₺`;
            const spaces = 32 - line.length - price.length;
            receiptContent += `${line}${' '.repeat(Math.max(0, spaces))}${price}\n`;
          });
          
          receiptContent += '--------------------------------\n';
          receiptContent += '\x1B\x61\x02'; // Right align
          receiptContent += `TOPLAM: ${table.total.toFixed(2)} ₺\n`;
          receiptContent += '\x1B\x61\x00'; // Left align
          receiptContent += '\n';
          receiptContent += '--------------------------------\n';
          receiptContent += '\n';
          receiptContent += '\x1B\x61\x01'; // Center align
          receiptContent += 'Nişanca Mahallesi Türkeli Caddesi,\n';
          receiptContent += 'Kumkapı 70/B, 34130 Fatih/İstanbul\n';
          receiptContent += '\n';
          receiptContent += '(0212) 516 54 86\n';
          receiptContent += '\n';
          receiptContent += 'Bizi tercih ettiğiniz için\n';
          receiptContent += 'teşekkür ederiz!\n';
          receiptContent += '\n\n\n';
          receiptContent += '\x1D\x56\x00'; // Cut paper
          
          // EN BASİT YÖNTEM: Windows print komutu ile yazdır
          const fs = require('fs');
          const path = require('path');
          const { execSync } = require('child_process');
          
          // Geçici dosya oluştur
          const tempFile = path.join(os.tmpdir(), `receipt_${Date.now()}.txt`);
          
          try {
            fs.writeFileSync(tempFile, receiptContent, 'utf8');
            
            console.log('📄 Geçici dosya oluşturuldu:', tempFile);
            console.log('🖨️ Yazıcıya gönderiliyor:', selectedPrinter.name);
            
            // Windows print komutu ile yazdır
            // Yazıcı adındaki özel karakterleri escape et
            const escapedPrinterName = selectedPrinter.name.replace(/"/g, '\\"');
            
            execSync(`print /D:"${escapedPrinterName}" "${tempFile}"`, { 
              encoding: 'utf-8',
              timeout: 5000,
              shell: true
            });
            
            console.log('✅ Fiş yazıcıya gönderildi');
            
            // Geçici dosyayı sil (2 saniye sonra)
            setTimeout(() => {
              try {
                if (fs.existsSync(tempFile)) {
                  fs.unlinkSync(tempFile);
                  console.log('🗑️ Geçici dosya silindi');
                }
              } catch (e) {
                console.warn('⚠️ Geçici dosya silinemedi:', e.message);
              }
            }, 2000);
            
            res.json({ success: true, message: 'Fiş başarıyla yazdırıldı' });
          } catch (printError) {
            console.error('❌ Yazdırma hatası:', printError.message);
            
            // Geçici dosyayı hemen temizle
            try {
              if (fs.existsSync(tempFile)) {
                fs.unlinkSync(tempFile);
              }
            } catch (e) {
              console.warn('⚠️ Geçici dosya silinemedi:', e.message);
            }
            
            res.status(500).json({ error: 'Yazdırma hatası: ' + printError.message });
          }
        } catch (error) {
          console.error('❌ Genel yazdırma hatası:', error);
          res.status(500).json({ error: 'Yazdırma hatası: ' + error.message });
        }
      });
    });
  });
});

// Sunucu bilgilerini getir
// Health check endpoint - Backend hazır mı kontrolü için
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Backend is ready' });
});

app.get('/api/server/info', (req, res) => {
  res.json({
    ip: networkIP,
    port: port,
    url: `http://${networkIP}:${port}`
  });
});

// Production modunda dist klasörünü serve et (API route'larından sonra)
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('__dirname:', __dirname);
console.log('dist path:', path.join(__dirname, 'dist'));

if (process.env.NODE_ENV === 'production') {
  // distPath zaten yukarıda tanımlı (satır 32)
  console.log('Production mode: Static files servisi aktif');
  console.log('Dist klasörü mevcut:', require('fs').existsSync(distPath));
  
  // Static dosyaları serve et (CSS, JS, images, fonts vb.)
  app.use(express.static(distPath, {
    maxAge: '1y', // Cache için
    etag: true,
    lastModified: true
  }));
  
  // SPA Fallback - API dışındaki tüm istekleri index.html'e yönlendir
  // Middleware olarak ekle (Express 5 uyumlu)
  app.use((req, res, next) => {
    // API route'larını ve static dosyaları atla
    if (req.path.startsWith('/api') || req.path.includes('.')) {
      return next();
    }
    // Diğer tüm route'ları index.html'e yönlendir
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  console.log('Development mode: Vite dev server kullanılacak');
}

// Sunucu başlat
server.listen(port, '0.0.0.0', () => {
  console.log(`\n========================================`);
  console.log(`Emek Cafe Adisyon Başlatıldı`);
  console.log(`========================================`);
  console.log(`Yerel:    http://localhost:${port}`);
  console.log(`Ağ:       http://${networkIP}:${port}`);
  console.log(`📡 Socket.io aktif - Bağlantılar: http://${networkIP}:${port}`);
  console.log(`========================================\n`);
  console.log(`💡 Diğer cihazlardan bağlanmak için: http://${networkIP}:${port}`);
});
