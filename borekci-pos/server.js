const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const os = require('os');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const winRawPrint = require('./windows-raw-print');

// ---------------------------------------------------------------------------
// Temel kurulum
// ---------------------------------------------------------------------------
const app = express();
const server = http.createServer(app);
const port = Number(process.env.PORT) || 3000;
const distPath = [path.join(__dirname, 'dist'), path.join(__dirname, '..', 'dist')].find((p) => fs.existsSync(path.join(p, 'index.html'))) || path.join(__dirname, 'dist');
const isPrimaryServer = process.env.PRIMARY_SERVER !== 'false';

const io = socketIo(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingInterval: 25000,
  pingTimeout: 20000,
  transports: ['websocket', 'polling'],
});

app.use(cors());
app.use(express.json({ limit: '1mb' }));

process.on('uncaughtException', (err) => {
  console.error('❌ Yakalanmamış hata:', err);
});
process.on('unhandledRejection', (err) => {
  console.error('❌ İşlenmemiş promise hatası:', err);
});

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

// ---------------------------------------------------------------------------
// Veritabanı
// ---------------------------------------------------------------------------
const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'emekcafe.db');
console.log('📁 Veritabanı yolu:', dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error('❌ Veritabanı açılamadı:', err.message);
  else console.log('✓ SQLite veritabanı bağlı');
});

const dbRun = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
const dbGet = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
const dbAll = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
  });

async function addColumnIfMissing(table, column, definition) {
  const cols = await dbAll(`PRAGMA table_info(${table})`);
  if (!cols.some((c) => c.name === column)) {
    await dbRun(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`✓ ${table}.${column} kolonu eklendi`);
  }
}

// ---------------------------------------------------------------------------
// Şifre ve oturum yardımcıları
// ---------------------------------------------------------------------------
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 gün
const sessionCache = new Map(); // token -> { user, lastSeen }

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored) return false;
  if (!stored.startsWith('scrypt$')) {
    // Eski düz metin şifre (geçiş dönemi)
    return stored === String(password);
  }
  const [, salt, hash] = stored.split('$');
  const candidate = crypto.scryptSync(String(password), salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

async function createSession(user) {
  const token = crypto.randomBytes(32).toString('hex');
  await dbRun(`INSERT INTO sessions(token, userId, createdAt, lastSeenAt) VALUES(?, ?, ?, ?)`, [
    token,
    user.id,
    Date.now(),
    Date.now(),
  ]);
  sessionCache.set(token, { user, lastSeen: Date.now() });
  return token;
}

async function resolveSession(token) {
  if (!token || typeof token !== 'string' || token.length !== 64) return null;
  const cached = sessionCache.get(token);
  const now = Date.now();
  if (cached) {
    if (now - cached.lastSeen > SESSION_TTL_MS) {
      sessionCache.delete(token);
      await dbRun(`DELETE FROM sessions WHERE token = ?`, [token]).catch(() => {});
      return null;
    }
    if (now - cached.lastSeen > 60 * 1000) {
      cached.lastSeen = now;
      dbRun(`UPDATE sessions SET lastSeenAt = ? WHERE token = ?`, [now, token]).catch(() => {});
    }
    return cached.user;
  }
  const row = await dbGet(
    `SELECT s.token, s.lastSeenAt, u.id, u.username, u.role, u.displayName
     FROM sessions s JOIN users u ON u.id = s.userId WHERE s.token = ?`,
    [token]
  );
  if (!row) return null;
  if (now - Number(row.lastSeenAt || 0) > SESSION_TTL_MS) {
    await dbRun(`DELETE FROM sessions WHERE token = ?`, [token]).catch(() => {});
    return null;
  }
  const user = { id: row.id, username: row.username, role: row.role, displayName: row.displayName || row.username };
  sessionCache.set(token, { user, lastSeen: now });
  return user;
}

function invalidateUserSessions(userId) {
  for (const [token, entry] of sessionCache.entries()) {
    if (entry.user.id === userId) sessionCache.delete(token);
  }
  return dbRun(`DELETE FROM sessions WHERE userId = ?`, [userId]);
}

function tokenFromRequest(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
}

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const requireAuth = asyncHandler(async (req, res, next) => {
  const user = await resolveSession(tokenFromRequest(req));
  if (!user) {
    return res.status(401).json({ error: 'Oturum geçersiz, lütfen tekrar giriş yapın' });
  }
  req.user = user;
  next();
});

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'yönetici') {
    return res.status(403).json({ error: 'Bu işlem için yönetici yetkisi gerekir' });
  }
  next();
};

// ---------------------------------------------------------------------------
// Şema ve migrasyonlar
// ---------------------------------------------------------------------------
async function initDatabase() {
  await dbRun(`CREATE TABLE IF NOT EXISTS tables (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    status TEXT DEFAULT 'boş',
    total REAL DEFAULT 0,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await dbRun(`CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    color TEXT DEFAULT '#3B82F6',
    sortOrder INTEGER DEFAULT 0
  )`);

  await dbRun(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    price REAL,
    categoryId INTEGER,
    color TEXT DEFAULT '#FFFFFF',
    sortOrder INTEGER DEFAULT 0,
    FOREIGN KEY(categoryId) REFERENCES categories(id)
  )`);

  await dbRun(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tableId INTEGER,
    productId INTEGER,
    quantity INTEGER,
    total REAL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(tableId) REFERENCES tables(id),
    FOREIGN KEY(productId) REFERENCES products(id)
  )`);

  await dbRun(`CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tableId INTEGER,
    tableName TEXT,
    amount REAL,
    paymentType TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(tableId) REFERENCES tables(id)
  )`);

  // Ödeme anında satılan kalemlerin kopyası (siparişler ödemede silinir; raporlar buradan beslenir)
  await dbRun(`CREATE TABLE IF NOT EXISTS payment_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    paymentId INTEGER,
    productId INTEGER,
    productName TEXT,
    quantity INTEGER,
    price REAL,
    total REAL,
    orderedAt DATETIME,
    paidAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(paymentId) REFERENCES payments(id)
  )`);

  await dbRun(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    role TEXT DEFAULT 'garson'
  )`);

  await dbRun(`CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    userId INTEGER,
    createdAt INTEGER,
    lastSeenAt INTEGER
  )`);

  await dbRun(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )`);

  // Eski veritabanları için kolon migrasyonları
  await addColumnIfMissing('products', 'color', `TEXT DEFAULT '#FFFFFF'`);
  await addColumnIfMissing('products', 'sortOrder', 'INTEGER DEFAULT 0');
  await addColumnIfMissing('categories', 'sortOrder', 'INTEGER DEFAULT 0');
  await addColumnIfMissing('orders', 'updatedAt', 'DATETIME');
  await addColumnIfMissing('payments', 'tableName', 'TEXT');
  await addColumnIfMissing('users', 'displayName', 'TEXT');
  // Tartılı/elle tutar girilen ürünler (örn. Tartılan Börek) ve satır bazlı birim fiyat
  await addColumnIfMissing('products', 'variablePrice', 'INTEGER DEFAULT 0');
  await addColumnIfMissing('orders', 'unitPrice', 'REAL');
  // Personel bazlı rapor: siparişi kim aldı, ödemeyi kim kapattı
  await addColumnIfMissing('orders', 'createdBy', 'INTEGER');
  await addColumnIfMissing('orders', 'createdByName', 'TEXT');
  await addColumnIfMissing('payment_items', 'createdBy', 'INTEGER');
  await addColumnIfMissing('payment_items', 'createdByName', 'TEXT');
  await addColumnIfMissing('payments', 'paidBy', 'INTEGER');
  await addColumnIfMissing('payments', 'paidByName', 'TEXT');

  // Günlük görev geçmişi: o gün hangi ürün için hangi kota tanımlıydı
  await dbRun(`CREATE TABLE IF NOT EXISTS daily_goal_log (
    date TEXT NOT NULL,
    productId INTEGER NOT NULL,
    quota INTEGER NOT NULL,
    PRIMARY KEY(date, productId)
  )`);

  // Günlük görevler (ürün başına günlük satış hedefi)
  await dbRun(`CREATE TABLE IF NOT EXISTS daily_goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    productId INTEGER UNIQUE,
    quota INTEGER NOT NULL DEFAULT 0,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(productId) REFERENCES products(id)
  )`);
  // Eski sürümde yönetici karşılama metni sabit isimdi; aynı görünüm korunur, Kullanıcılar sekmesinden değiştirilebilir
  await dbRun(`UPDATE users SET displayName = 'Selahattin CAN' WHERE username = 'admin' AND (displayName IS NULL OR displayName = '')`);
  await dbRun(`UPDATE products SET color = '#FFFFFF' WHERE color IS NULL`);
  await dbRun(`UPDATE orders SET updatedAt = COALESCE(updatedAt, createdAt, CURRENT_TIMESTAMP) WHERE updatedAt IS NULL`);
  // Masa silinmiş olsa bile ödeme geçmişi raporlarda kalsın
  await dbRun(`UPDATE payments SET tableName = (SELECT name FROM tables WHERE tables.id = payments.tableId) WHERE tableName IS NULL`);

  await dbRun(`CREATE INDEX IF NOT EXISTS idx_orders_table ON orders(tableId)`);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_payments_created ON payments(createdAt)`);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_products_category ON products(categoryId)`);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_payment_items_ordered ON payment_items(orderedAt)`);

  // Varsayılan ayarlar
  const defaults = [
    ['printerIP', ''],
    ['printerName', ''],
    ['taxRate', '0'],
    ['restaurantName', 'Emek Cafe Adisyon'],
  ];
  for (const [key, value] of defaults) {
    await dbRun(`INSERT OR IGNORE INTO settings(key, value) VALUES(?, ?)`, [key, value]);
  }

  // Varsayılan kullanıcılar (ilk kurulum). Şifreler hash'li saklanır.
  const userCount = await dbGet(`SELECT COUNT(*) as c FROM users`);
  if (!userCount || userCount.c === 0) {
    await dbRun(`INSERT INTO users(username, password, role) VALUES(?, ?, ?)`, ['admin', hashPassword('admin'), 'yönetici']);
    await dbRun(`INSERT INTO users(username, password, role) VALUES(?, ?, ?)`, ['garson', hashPassword('garson'), 'garson']);
    console.log('✓ Varsayılan kullanıcılar oluşturuldu (admin/admin, garson/garson) — lütfen şifreleri değiştirin');
  }

  // Düz metin saklanan eski şifreleri hash'le
  const plainUsers = await dbAll(`SELECT id, password FROM users WHERE password IS NOT NULL AND password NOT LIKE 'scrypt$%'`);
  for (const u of plainUsers) {
    await dbRun(`UPDATE users SET password = ? WHERE id = ?`, [hashPassword(u.password), u.id]);
  }
  if (plainUsers.length > 0) console.log(`✓ ${plainUsers.length} kullanıcı şifresi güvenli formata taşındı`);

  // Bir kez: "Börek" kategorisi varsa "Tartılan Börek" (tutarı elle girilen) ürününü ekle
  const seeded = await dbGet(`SELECT value FROM settings WHERE key = 'seed.tartilanBorek'`);
  if (!seeded) {
    // SQLite lower() Türkçe harfleri (Ö, İ) küçültmez; eşleştirmeyi JS tarafında yap ("BÖREK ÇEŞİTLERİ" gibi adlar için)
    const allCats = await dbAll(`SELECT id, name FROM categories ORDER BY sortOrder, id`);
    const norm = (v) => String(v || '').toLocaleLowerCase('tr').replace(/ö/g, 'o').replace(/ı/g, 'i');
    const borekCat = allCats.find((c) => norm(c.name).includes('borek'));
    if (borekCat) {
      const allProds = await dbAll(`SELECT id, name FROM products`);
      const exists = allProds.find((p) => norm(p.name) === 'tartilan borek');
      if (!exists) {
        const row = await dbGet(`SELECT MAX(sortOrder) as maxOrder FROM products WHERE categoryId = ?`, [borekCat.id]);
        await dbRun(`INSERT INTO products(name, price, categoryId, color, sortOrder, variablePrice) VALUES(?, 0, ?, '#F59E0B', ?, 1)`, ['Tartılan Börek', borekCat.id, (row?.maxOrder ?? -1) + 1]);
        console.log('✓ "Tartılan Börek" ürünü eklendi');
      }
      await dbRun(`INSERT OR REPLACE INTO settings(key, value) VALUES('seed.tartilanBorek', 'done')`);
    }
  }

  // Süresi geçmiş oturumları temizle
  await dbRun(`DELETE FROM sessions WHERE lastSeenAt < ?`, [Date.now() - SESSION_TTL_MS]);

  // Masa toplamlarını siparişlerle senkronla (tutarsızlık varsa düzelt)
  await dbRun(`UPDATE tables SET
    total = COALESCE((SELECT SUM(total) FROM orders WHERE orders.tableId = tables.id), 0),
    status = CASE WHEN EXISTS(SELECT 1 FROM orders WHERE orders.tableId = tables.id) THEN 'dolu' ELSE 'boş' END`);

  console.log('✓ Tablolar ve migrasyonlar tamamlandı');
}

// ---------------------------------------------------------------------------
// Socket.io — token doğrulamalı
// ---------------------------------------------------------------------------
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    const user = await resolveSession(token);
    if (!user) return next(new Error('unauthorized'));
    socket.data.user = user;
    next();
  } catch (err) {
    next(new Error('unauthorized'));
  }
});

io.on('connection', (socket) => {
  console.log(`✅ İstemci bağlandı: ${socket.id} (${socket.data.user?.username})`);
  socket.on('disconnect', (reason) => {
    console.log(`❌ İstemci ayrıldı: ${socket.id} (${reason})`);
  });
});

function broadcast(event, data) {
  io.emit(event, data);
}

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------
const toInt = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : NaN;
};
const isValidHexColor = (c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
const cleanName = (v, max = 60) => String(v ?? '').trim().slice(0, max);
const round2 = (n) => Math.round(Number(n) * 100) / 100;

function naturalSort(a, b) {
  return String(a.name || '').localeCompare(String(b.name || ''), 'tr', { numeric: true, sensitivity: 'base' });
}

async function updateTableTotal(tableId) {
  const row = await dbGet(`SELECT COUNT(*) as orderCount, SUM(total) as total FROM orders WHERE tableId = ?`, [tableId]);
  const total = round2(row?.total || 0);
  const status = (row?.orderCount || 0) > 0 ? 'dolu' : 'boş';
  await dbRun(`UPDATE tables SET total = ?, status = ? WHERE id = ?`, [total, status, tableId]);
  broadcast('tableUpdated', { id: tableId, status, total });
  return { total, status };
}

// ---------------------------------------------------------------------------
// Herkese açık uçlar
// ---------------------------------------------------------------------------
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend is ready' });
});

app.get('/api/server/info', (req, res) => {
  res.json({
    ip: networkIP,
    port,
    url: `http://${networkIP}:${port}`,
    isPrimaryServer,
    version: process.env.APP_VERSION || null,
  });
});

const loginAttempts = new Map(); // ip -> { count, firstAt }
app.post(
  '/api/auth/login',
  asyncHandler(async (req, res) => {
    const ip = req.ip || 'unknown';
    const attempt = loginAttempts.get(ip) || { count: 0, firstAt: Date.now() };
    if (Date.now() - attempt.firstAt > 10 * 60 * 1000) {
      attempt.count = 0;
      attempt.firstAt = Date.now();
    }
    if (attempt.count >= 20) {
      return res.status(429).json({ error: 'Çok fazla deneme. Lütfen 10 dakika sonra tekrar deneyin.' });
    }

    const username = cleanName(req.body?.username, 40);
    const password = String(req.body?.password ?? '');
    if (!username || !password) {
      return res.status(400).json({ error: 'Kullanıcı adı ve şifre gerekli' });
    }

    const user = await dbGet(`SELECT * FROM users WHERE username = ?`, [username]);
    if (!user || !verifyPassword(password, user.password)) {
      attempt.count += 1;
      loginAttempts.set(ip, attempt);
      return res.status(401).json({ error: 'Kullanıcı adı veya şifre hatalı' });
    }
    loginAttempts.delete(ip);

    // Eski düz metin şifreyi güvenli formata taşı
    if (!String(user.password).startsWith('scrypt$')) {
      await dbRun(`UPDATE users SET password = ? WHERE id = ?`, [hashPassword(password), user.id]);
    }

    const safeUser = { id: user.id, username: user.username, role: user.role, displayName: user.displayName || user.username };
    const token = await createSession(safeUser);
    res.json({ ...safeUser, token });
  })
);

// Buradan sonrası oturum gerektirir
app.use('/api', requireAuth);

app.post(
  '/api/auth/logout',
  asyncHandler(async (req, res) => {
    const token = tokenFromRequest(req);
    sessionCache.delete(token);
    await dbRun(`DELETE FROM sessions WHERE token = ?`, [token]);
    res.json({ success: true });
  })
);

app.get('/api/auth/me', (req, res) => {
  res.json(req.user);
});

// ---------------------------------------------------------------------------
// Kullanıcılar (yönetici)
// ---------------------------------------------------------------------------
app.get(
  '/api/users',
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.json(await dbAll(`SELECT id, username, role, COALESCE(displayName, username) as displayName FROM users ORDER BY id`));
  })
);

app.post(
  '/api/users',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const username = cleanName(req.body?.username, 40);
    const displayName = cleanName(req.body?.displayName, 60) || username;
    const password = String(req.body?.password ?? '');
    const role = req.body?.role === 'yönetici' ? 'yönetici' : 'garson';
    if (username.length < 2) return res.status(400).json({ error: 'Kullanıcı adı en az 2 karakter olmalı' });
    if (/\s/.test(username)) return res.status(400).json({ error: 'Kullanıcı adında boşluk olamaz (görünen ad kullanın)' });
    if (password.length < 4) return res.status(400).json({ error: 'Şifre en az 4 karakter olmalı' });
    const exists = await dbGet(`SELECT id FROM users WHERE lower(username) = lower(?)`, [username]);
    if (exists) return res.status(409).json({ error: 'Bu kullanıcı adı zaten kullanılıyor' });
    const result = await dbRun(`INSERT INTO users(username, displayName, password, role) VALUES(?, ?, ?, ?)`, [username, displayName, hashPassword(password), role]);
    res.json({ id: result.lastID, username, displayName, role });
  })
);

app.put(
  '/api/users/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = toInt(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Geçersiz kullanıcı' });
    const target = await dbGet(`SELECT id, username, role FROM users WHERE id = ?`, [id]);
    if (!target) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    const displayName = cleanName(req.body?.displayName, 60) || target.username;
    let role = target.role;
    if (req.body?.role && req.body.role !== target.role) {
      if (id === req.user.id) return res.status(400).json({ error: 'Kendi rolünüzü değiştiremezsiniz' });
      role = req.body.role === 'yönetici' ? 'yönetici' : 'garson';
      if (target.role === 'yönetici' && role !== 'yönetici') {
        const admins = await dbGet(`SELECT COUNT(*) as c FROM users WHERE role = 'yönetici'`);
        if ((admins?.c || 0) <= 1) return res.status(400).json({ error: 'Son yöneticinin rolü değiştirilemez' });
      }
    }
    await dbRun(`UPDATE users SET displayName = ?, role = ? WHERE id = ?`, [displayName, role, id]);
    // Oturum önbelleğindeki kullanıcı bilgisini güncelle
    for (const entry of sessionCache.values()) {
      if (entry.user.id === id) entry.user = { ...entry.user, displayName, role };
    }
    res.json({ id, username: target.username, displayName, role });
  })
);

app.put(
  '/api/users/:id/password',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = toInt(req.params.id);
    const password = String(req.body?.password ?? '');
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Geçersiz kullanıcı' });
    if (password.length < 4) return res.status(400).json({ error: 'Şifre en az 4 karakter olmalı' });
    const result = await dbRun(`UPDATE users SET password = ? WHERE id = ?`, [hashPassword(password), id]);
    if (!result.changes) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    // Şifre değişince diğer cihazlardaki oturumlar kapanır; mevcut oturum korunur
    const currentToken = tokenFromRequest(req);
    if (id !== req.user.id) {
      await invalidateUserSessions(id);
    } else {
      for (const [token, entry] of sessionCache.entries()) {
        if (entry.user.id === id && token !== currentToken) sessionCache.delete(token);
      }
      await dbRun(`DELETE FROM sessions WHERE userId = ? AND token != ?`, [id, currentToken]);
    }
    res.json({ success: true });
  })
);

app.delete(
  '/api/users/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = toInt(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Geçersiz kullanıcı' });
    if (id === req.user.id) return res.status(400).json({ error: 'Kendi hesabınızı silemezsiniz' });
    const target = await dbGet(`SELECT id, role FROM users WHERE id = ?`, [id]);
    if (!target) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    if (target.role === 'yönetici') {
      const admins = await dbGet(`SELECT COUNT(*) as c FROM users WHERE role = 'yönetici'`);
      if ((admins?.c || 0) <= 1) return res.status(400).json({ error: 'Son yönetici silinemez' });
    }
    await invalidateUserSessions(id);
    await dbRun(`DELETE FROM users WHERE id = ?`, [id]);
    res.json({ success: true });
  })
);

// ---------------------------------------------------------------------------
// Masalar
// ---------------------------------------------------------------------------
app.get(
  '/api/tables',
  asyncHandler(async (req, res) => {
    const rows = await dbAll(`SELECT * FROM tables`);
    res.json(rows.sort(naturalSort));
  })
);

app.get(
  '/api/tables/:id',
  asyncHandler(async (req, res) => {
    const id = toInt(req.params.id);
    const table = Number.isNaN(id) ? null : await dbGet(`SELECT * FROM tables WHERE id = ?`, [id]);
    if (!table) return res.status(404).json({ error: 'Masa bulunamadı' });
    res.json(table);
  })
);

app.post(
  '/api/tables',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const name = cleanName(req.body?.name);
    if (!name) return res.status(400).json({ error: 'Masa adı gerekli' });
    const exists = await dbGet(`SELECT id FROM tables WHERE lower(name) = lower(?)`, [name]);
    if (exists) return res.status(409).json({ error: 'Bu isimde bir masa zaten var' });
    const result = await dbRun(`INSERT INTO tables(name) VALUES(?)`, [name]);
    const newTable = { id: result.lastID, name, status: 'boş', total: 0 };
    broadcast('tableCreated', newTable);
    res.json(newTable);
  })
);

app.put(
  '/api/tables/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = toInt(req.params.id);
    const name = cleanName(req.body?.name);
    if (Number.isNaN(id) || !name) return res.status(400).json({ error: 'Geçersiz istek' });
    const dup = await dbGet(`SELECT id FROM tables WHERE lower(name) = lower(?) AND id != ?`, [name, id]);
    if (dup) return res.status(409).json({ error: 'Bu isimde bir masa zaten var' });
    const result = await dbRun(`UPDATE tables SET name = ? WHERE id = ?`, [name, id]);
    if (!result.changes) return res.status(404).json({ error: 'Masa bulunamadı' });
    await dbRun(`UPDATE payments SET tableName = ? WHERE tableId = ?`, [name, id]);
    broadcast('tableUpdated', { id, name });
    res.json({ id, name });
  })
);

app.delete(
  '/api/tables/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = toInt(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Geçersiz masa' });
    const open = await dbGet(`SELECT COUNT(*) as c FROM orders WHERE tableId = ?`, [id]);
    if ((open?.c || 0) > 0) {
      return res.status(409).json({ error: 'Bu masada açık sipariş var. Önce hesabı kapatın veya siparişleri taşıyın.' });
    }
    const result = await dbRun(`DELETE FROM tables WHERE id = ?`, [id]);
    if (!result.changes) return res.status(404).json({ error: 'Masa bulunamadı' });
    broadcast('tableDeleted', { id });
    res.json({ success: true });
  })
);

// Masa hesap isteği (garson -> kasa)
const pendingPaymentRequests = [];
let paymentRequestSeq = 0;

app.post(
  '/api/tables/:tableId/request-payment',
  asyncHandler(async (req, res) => {
    const tableId = toInt(req.params.tableId);
    const table = Number.isNaN(tableId) ? null : await dbGet(`SELECT id, name, total FROM tables WHERE id = ?`, [tableId]);
    if (!table) return res.status(404).json({ error: 'Masa bulunamadı' });

    const request = {
      id: ++paymentRequestSeq,
      tableId: table.id,
      tableName: table.name || `Masa ${table.id}`,
      total: table.total || 0,
      requestedBy: req.user.displayName || req.user.username,
      createdAt: new Date().toISOString(),
    };
    broadcast('tableRequestPayment', request);
    pendingPaymentRequests.push(request);
    if (pendingPaymentRequests.length > 20) pendingPaymentRequests.shift();
    res.json({ success: true, message: 'Hesap isteği gönderildi' });
  })
);

// Socket bağlantısı kopan kasa için yedek sorgu (tüketmez; istemci id ile tekilleştirir)
app.get('/api/payment-requests', requireAdmin, (req, res) => {
  const since = toInt(req.query.since) || 0;
  const cutoff = Date.now() - 2 * 60 * 1000; // sadece son 2 dakika
  res.json({
    requests: pendingPaymentRequests.filter((r) => r.id > since && new Date(r.createdAt).getTime() > cutoff),
  });
});

// ---------------------------------------------------------------------------
// Kategoriler
// ---------------------------------------------------------------------------
app.get(
  '/api/categories',
  asyncHandler(async (req, res) => {
    res.json(await dbAll(`SELECT id, name, color, sortOrder FROM categories ORDER BY sortOrder ASC, id ASC`));
  })
);

// DİKKAT: /sort rotası /:id rotasından ÖNCE tanımlanmalı
app.put(
  '/api/categories/sort',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const sortedIds = req.body?.sortedIds;
    if (!Array.isArray(sortedIds)) return res.status(400).json({ error: 'sortedIds bir dizi olmalı' });
    const validIds = sortedIds.map((id) => toInt(id));
    if (validIds.some((id) => Number.isNaN(id) || id <= 0)) return res.status(400).json({ error: 'Geçersiz kategori ID' });

    await dbRun('BEGIN');
    try {
      for (let i = 0; i < validIds.length; i++) {
        await dbRun(`UPDATE categories SET sortOrder = ? WHERE id = ?`, [i, validIds[i]]);
      }
      await dbRun('COMMIT');
    } catch (err) {
      await dbRun('ROLLBACK').catch(() => {});
      throw err;
    }
    broadcast('categoriesSorted', { sortedIds: validIds });
    res.json({ success: true });
  })
);

app.post(
  '/api/categories',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const name = cleanName(req.body?.name);
    const color = isValidHexColor(req.body?.color) ? req.body.color.toUpperCase() : '#3B82F6';
    if (!name) return res.status(400).json({ error: 'Kategori adı gerekli' });
    const row = await dbGet(`SELECT MAX(sortOrder) as maxOrder FROM categories`);
    const sortOrder = (row?.maxOrder ?? -1) + 1;
    const result = await dbRun(`INSERT INTO categories(name, color, sortOrder) VALUES(?, ?, ?)`, [name, color, sortOrder]);
    const newCategory = { id: result.lastID, name, color, sortOrder };
    broadcast('categoryCreated', newCategory);
    res.json(newCategory);
  })
);

app.put(
  '/api/categories/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = toInt(req.params.id);
    const name = cleanName(req.body?.name);
    const color = isValidHexColor(req.body?.color) ? req.body.color.toUpperCase() : '#3B82F6';
    if (Number.isNaN(id) || !name) return res.status(400).json({ error: 'Geçersiz istek' });
    const result = await dbRun(`UPDATE categories SET name = ?, color = ? WHERE id = ?`, [name, color, id]);
    if (!result.changes) return res.status(404).json({ error: 'Kategori bulunamadı' });
    broadcast('categoryUpdated', { id, name, color });
    res.json({ id, name, color });
  })
);

app.delete(
  '/api/categories/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = toInt(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Geçersiz kategori' });
    const count = await dbGet(`SELECT COUNT(*) as c FROM products WHERE categoryId = ?`, [id]);
    if ((count?.c || 0) > 0) {
      return res.status(409).json({ error: `Bu kategoride ${count.c} ürün var. Önce ürünleri silin veya başka kategoriye taşıyın.` });
    }
    const result = await dbRun(`DELETE FROM categories WHERE id = ?`, [id]);
    if (!result.changes) return res.status(404).json({ error: 'Kategori bulunamadı' });
    broadcast('categoryDeleted', { id });
    res.json({ success: true });
  })
);

// ---------------------------------------------------------------------------
// Ürünler
// ---------------------------------------------------------------------------
app.get(
  '/api/products',
  asyncHandler(async (req, res) => {
    const categoryId = req.query.categoryId ? toInt(req.query.categoryId) : null;
    let query = `SELECT p.*, c.name as categoryName, c.color as categoryColor
                 FROM products p LEFT JOIN categories c ON p.categoryId = c.id`;
    const params = [];
    if (categoryId !== null && !Number.isNaN(categoryId)) {
      query += ' WHERE p.categoryId = ?';
      params.push(categoryId);
    }
    query += ' ORDER BY p.sortOrder ASC, p.id ASC';
    res.json(await dbAll(query, params));
  })
);

// DİKKAT: /sort rotası /:id rotasından ÖNCE tanımlanmalı
app.put(
  '/api/products/sort',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const categoryId = toInt(req.body?.categoryId);
    const sortedIds = req.body?.sortedIds;
    if (Number.isNaN(categoryId) || !Array.isArray(sortedIds)) {
      return res.status(400).json({ error: 'categoryId ve sortedIds (dizi) gerekli' });
    }
    const validIds = sortedIds.map((id) => toInt(id));
    if (validIds.some((id) => Number.isNaN(id) || id <= 0)) return res.status(400).json({ error: 'Geçersiz ürün ID' });

    await dbRun('BEGIN');
    try {
      for (let i = 0; i < validIds.length; i++) {
        await dbRun(`UPDATE products SET sortOrder = ? WHERE id = ? AND categoryId = ?`, [i, validIds[i], categoryId]);
      }
      await dbRun('COMMIT');
    } catch (err) {
      await dbRun('ROLLBACK').catch(() => {});
      throw err;
    }
    broadcast('productsSorted', { categoryId, sortedIds: validIds });
    res.json({ success: true });
  })
);

function parseProductBody(body) {
  const name = cleanName(body?.name, 80);
  const variablePrice = body?.variablePrice === true || body?.variablePrice === 1 || body?.variablePrice === '1' ? 1 : 0;
  const price = variablePrice ? Number(body?.price || 0) : Number(body?.price);
  const categoryId = toInt(body?.categoryId);
  const color = isValidHexColor(body?.color) ? body.color.toUpperCase() : '#FFFFFF';
  if (!name) return { error: 'Ürün adı gerekli' };
  if (!Number.isFinite(price) || price < 0) return { error: 'Geçerli bir fiyat girin' };
  if (Number.isNaN(categoryId)) return { error: 'Kategori seçin' };
  return { name, price: round2(price), categoryId, color, variablePrice };
}

app.post(
  '/api/products',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = parseProductBody(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const category = await dbGet(`SELECT id FROM categories WHERE id = ?`, [parsed.categoryId]);
    if (!category) return res.status(400).json({ error: 'Kategori bulunamadı' });
    const row = await dbGet(`SELECT MAX(sortOrder) as maxOrder FROM products WHERE categoryId = ?`, [parsed.categoryId]);
    const sortOrder = (row?.maxOrder ?? -1) + 1;
    const result = await dbRun(
      `INSERT INTO products(name, price, categoryId, color, sortOrder, variablePrice) VALUES(?, ?, ?, ?, ?, ?)`,
      [parsed.name, parsed.price, parsed.categoryId, parsed.color, sortOrder, parsed.variablePrice]
    );
    const newProduct = { id: result.lastID, ...parsed, sortOrder };
    broadcast('productCreated', newProduct);
    res.json(newProduct);
  })
);

app.put(
  '/api/products/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = toInt(req.params.id);
    const parsed = parseProductBody(req.body);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Geçersiz ürün' });
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const result = await dbRun(
      `UPDATE products SET name = ?, price = ?, categoryId = ?, color = ?, variablePrice = ? WHERE id = ?`,
      [parsed.name, parsed.price, parsed.categoryId, parsed.color, parsed.variablePrice, id]
    );
    if (!result.changes) return res.status(404).json({ error: 'Ürün bulunamadı' });
    // Fiyat değiştiyse açık siparişlerin toplamlarını da güncelle (elle girilen tutarlar korunur)
    const affected = await dbAll(`SELECT DISTINCT tableId FROM orders WHERE productId = ? AND unitPrice IS NULL`, [id]);
    await dbRun(`UPDATE orders SET total = quantity * ? WHERE productId = ? AND unitPrice IS NULL`, [parsed.price, id]);
    for (const row of affected) await updateTableTotal(row.tableId);
    broadcast('productUpdated', { id, ...parsed });
    res.json({ id, ...parsed });
  })
);

app.delete(
  '/api/products/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = toInt(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Geçersiz ürün' });
    const open = await dbGet(`SELECT COUNT(*) as c FROM orders WHERE productId = ?`, [id]);
    if ((open?.c || 0) > 0) {
      return res.status(409).json({ error: 'Bu ürün açık masalarda sipariş olarak duruyor. Önce o hesaplar kapatılmalı.' });
    }
    const result = await dbRun(`DELETE FROM products WHERE id = ?`, [id]);
    if (!result.changes) return res.status(404).json({ error: 'Ürün bulunamadı' });
    await dbRun(`DELETE FROM daily_goals WHERE productId = ?`, [id]);
    broadcast('productDeleted', { id });
    res.json({ success: true });
  })
);

// ---------------------------------------------------------------------------
// Siparişler
// ---------------------------------------------------------------------------
const MERGE_WINDOW_SECONDS = 60;

app.post(
  '/api/orders',
  asyncHandler(async (req, res) => {
    const tableId = toInt(req.body?.tableId);
    const productId = toInt(req.body?.productId);
    const quantity = toInt(req.body?.quantity ?? 1);
    if (Number.isNaN(tableId) || Number.isNaN(productId)) return res.status(400).json({ error: 'Masa ve ürün gerekli' });
    if (Number.isNaN(quantity) || quantity < 1 || quantity > 999) return res.status(400).json({ error: 'Geçersiz adet' });

    const table = await dbGet(`SELECT id FROM tables WHERE id = ?`, [tableId]);
    if (!table) return res.status(404).json({ error: 'Masa bulunamadı' });
    const product = await dbGet(`SELECT price, variablePrice FROM products WHERE id = ?`, [productId]);
    if (!product) return res.status(404).json({ error: 'Ürün bulunamadı' });

    // Tutarı elle girilen ürün (tartılı): her giriş ayrı satır, birleştirme yok
    if (product.variablePrice) {
      const customPrice = Number(String(req.body?.customPrice ?? '').replace(',', '.'));
      if (!Number.isFinite(customPrice) || customPrice <= 0 || customPrice > 100000) {
        return res.status(400).json({ error: 'Bu ürün için geçerli bir tutar girin' });
      }
      const unitPrice = round2(customPrice);
      const total = round2(unitPrice * quantity);
      const result = await dbRun(
        `INSERT INTO orders(tableId, productId, quantity, total, unitPrice, createdBy, createdByName, updatedAt) VALUES(?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`,
        [tableId, productId, quantity, total, unitPrice, req.user.id, req.user.displayName || req.user.username]
      );
      await updateTableTotal(tableId);
      broadcast('orderCreated', { id: result.lastID, tableId, productId, quantity, total });
      return res.json({ id: result.lastID, merged: false });
    }

    // Son 60 saniye içinde aynı ürün eklenmişse adedi artır (yeni satır açma)
    const lastOrder = await dbGet(
      `SELECT id, quantity FROM orders
       WHERE tableId = ? AND productId = ? AND unitPrice IS NULL
         AND (strftime('%s','now') - strftime('%s', COALESCE(updatedAt, createdAt))) <= ?
       ORDER BY COALESCE(updatedAt, createdAt) DESC LIMIT 1`,
      [tableId, productId, MERGE_WINDOW_SECONDS]
    );

    if (lastOrder) {
      const newQuantity = lastOrder.quantity + quantity;
      const total = round2(product.price * newQuantity);
      await dbRun(`UPDATE orders SET quantity = ?, total = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`, [newQuantity, total, lastOrder.id]);
      await updateTableTotal(tableId);
      broadcast('orderUpdated', { id: lastOrder.id, quantity: newQuantity, total, tableId });
      return res.json({ id: lastOrder.id, merged: true });
    }

    const total = round2(product.price * quantity);
    const result = await dbRun(
      `INSERT INTO orders(tableId, productId, quantity, total, createdBy, createdByName, updatedAt) VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP)`,
      [tableId, productId, quantity, total, req.user.id, req.user.displayName || req.user.username]
    );
    await updateTableTotal(tableId);
    broadcast('orderCreated', { id: result.lastID, tableId, productId, quantity, total });
    res.json({ id: result.lastID, merged: false });
  })
);

// Masa değiştir — /:tableId rotasından önce
app.post(
  '/api/orders/transfer',
  asyncHandler(async (req, res) => {
    const fromTableId = toInt(req.body?.fromTableId);
    const toTableId = toInt(req.body?.toTableId);
    if (Number.isNaN(fromTableId) || Number.isNaN(toTableId)) return res.status(400).json({ error: 'Kaynak ve hedef masa gerekli' });
    if (fromTableId === toTableId) return res.status(400).json({ error: 'Aynı masaya taşınamaz' });

    const target = await dbGet(`SELECT id FROM tables WHERE id = ?`, [toTableId]);
    if (!target) return res.status(404).json({ error: 'Hedef masa bulunamadı' });
    const sourceOrders = await dbAll(`SELECT * FROM orders WHERE tableId = ?`, [fromTableId]);
    if (sourceOrders.length === 0) return res.status(400).json({ error: 'Kaynak masada sipariş yok' });

    await dbRun('BEGIN');
    try {
      const existing = await dbAll(`SELECT id, productId, quantity, unitPrice FROM orders WHERE tableId = ?`, [toTableId]);
      for (const src of sourceOrders) {
        const match = src.unitPrice == null ? existing.find((e) => e.productId === src.productId && e.unitPrice == null) : null;
        const product = await dbGet(`SELECT price FROM products WHERE id = ?`, [src.productId]);
        const price = src.unitPrice ?? product?.price ?? src.total / Math.max(1, src.quantity);
        if (match) {
          const qty = match.quantity + src.quantity;
          await dbRun(`UPDATE orders SET quantity = ?, total = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`, [qty, round2(price * qty), match.id]);
          match.quantity = qty;
          await dbRun(`DELETE FROM orders WHERE id = ?`, [src.id]);
        } else {
          await dbRun(`UPDATE orders SET tableId = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`, [toTableId, src.id]);
          existing.push({ id: src.id, productId: src.productId, quantity: src.quantity, unitPrice: src.unitPrice });
        }
      }
      await dbRun('COMMIT');
    } catch (err) {
      await dbRun('ROLLBACK').catch(() => {});
      throw err;
    }

    await updateTableTotal(fromTableId);
    await updateTableTotal(toTableId);
    broadcast('ordersTransferred', { fromTableId, toTableId });
    res.json({ success: true, message: 'Siparişler başarıyla taşındı' });
  })
);

app.get(
  '/api/orders/:tableId',
  asyncHandler(async (req, res) => {
    const tableId = toInt(req.params.tableId);
    if (Number.isNaN(tableId)) return res.status(400).json({ error: 'Geçersiz masa' });
    const rows = await dbAll(
      `SELECT orders.id, orders.productId, products.name, COALESCE(orders.unitPrice, products.price) as price,
              orders.unitPrice, products.variablePrice, orders.quantity, orders.total,
              orders.createdAt, orders.updatedAt
       FROM orders JOIN products ON orders.productId = products.id
       WHERE orders.tableId = ?
       ORDER BY COALESCE(orders.updatedAt, orders.createdAt) DESC, orders.id DESC`,
      [tableId]
    );
    res.json(rows);
  })
);

app.put(
  '/api/orders/:id',
  asyncHandler(async (req, res) => {
    const id = toInt(req.params.id);
    const quantity = toInt(req.body?.quantity);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Geçersiz sipariş' });
    if (Number.isNaN(quantity) || quantity < 1 || quantity > 999) return res.status(400).json({ error: 'Geçersiz adet' });

    const order = await dbGet(`SELECT productId, tableId, unitPrice FROM orders WHERE id = ?`, [id]);
    if (!order) return res.status(404).json({ error: 'Sipariş bulunamadı' });
    const product = await dbGet(`SELECT price FROM products WHERE id = ?`, [order.productId]);
    if (!product) return res.status(404).json({ error: 'Ürün bulunamadı' });

    const total = round2((order.unitPrice ?? product.price) * quantity);
    await dbRun(`UPDATE orders SET quantity = ?, total = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`, [quantity, total, id]);
    await updateTableTotal(order.tableId);
    broadcast('orderUpdated', { id, quantity, total, tableId: order.tableId });
    res.json({ id, quantity, total });
  })
);

app.delete(
  '/api/orders/:id',
  asyncHandler(async (req, res) => {
    const id = toInt(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Geçersiz sipariş' });
    const order = await dbGet(`SELECT tableId FROM orders WHERE id = ?`, [id]);
    if (!order) return res.status(404).json({ error: 'Sipariş bulunamadı' });
    await dbRun(`DELETE FROM orders WHERE id = ?`, [id]);
    await updateTableTotal(order.tableId);
    broadcast('orderDeleted', { id, tableId: order.tableId });
    res.json({ success: true });
  })
);

// ---------------------------------------------------------------------------
// Ödemeler
// ---------------------------------------------------------------------------
app.post(
  '/api/payments',
  asyncHandler(async (req, res) => {
    const tableId = toInt(req.body?.tableId);
    const paymentType = req.body?.paymentType === 'Kart' ? 'Kart' : req.body?.paymentType === 'Nakit' ? 'Nakit' : null;
    if (Number.isNaN(tableId)) return res.status(400).json({ error: 'Masa gerekli' });
    if (!paymentType) return res.status(400).json({ error: 'Ödeme türü Nakit veya Kart olmalı' });

    const table = await dbGet(`SELECT id, name FROM tables WHERE id = ?`, [tableId]);
    if (!table) return res.status(404).json({ error: 'Masa bulunamadı' });
    const sum = await dbGet(`SELECT COUNT(*) as c, SUM(total) as total FROM orders WHERE tableId = ?`, [tableId]);
    if (!sum || sum.c === 0) return res.status(400).json({ error: 'Bu masada ödenecek sipariş yok' });
    const amount = round2(sum.total || 0);

    await dbRun('BEGIN');
    let paymentId;
    try {
      const result = await dbRun(
        `INSERT INTO payments(tableId, tableName, amount, paymentType, paidBy, paidByName) VALUES(?, ?, ?, ?, ?, ?)`,
        [tableId, table.name, amount, paymentType, req.user.id, req.user.displayName || req.user.username]
      );
      paymentId = result.lastID;
      await dbRun(
        `INSERT INTO payment_items(paymentId, productId, productName, quantity, price, total, orderedAt, createdBy, createdByName)
         SELECT ?, o.productId, COALESCE(p.name, 'Silinmiş ürün'), o.quantity, COALESCE(o.unitPrice, p.price, o.total / MAX(o.quantity, 1)), o.total, COALESCE(o.createdAt, CURRENT_TIMESTAMP), o.createdBy, o.createdByName
         FROM orders o LEFT JOIN products p ON p.id = o.productId WHERE o.tableId = ?`,
        [paymentId, tableId]
      );
      await dbRun(`DELETE FROM orders WHERE tableId = ?`, [tableId]);
      await dbRun(`UPDATE tables SET total = 0, status = 'boş' WHERE id = ?`, [tableId]);
      await dbRun('COMMIT');
    } catch (err) {
      await dbRun('ROLLBACK').catch(() => {});
      throw err;
    }

    broadcast('paymentCompleted', { tableId, amount, paymentType });
    broadcast('tableUpdated', { id: tableId, status: 'boş', total: 0 });
    res.json({ success: true, paymentId, amount });
  })
);

const isValidDate = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
const localDateExpr = (col) => `DATE(datetime(${col}, '+3 hours'))`; // Türkiye saati (UTC+3)

app.get(
  '/api/payments',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const date = req.query.date;
    let query = `SELECT p.id, p.tableId, p.amount, p.paymentType, p.createdAt,
                        COALESCE(p.tableName, t.name, 'Silinmiş masa') as tableName
                 FROM payments p LEFT JOIN tables t ON p.tableId = t.id`;
    const params = [];
    if (date) {
      if (!isValidDate(date)) return res.status(400).json({ error: 'Tarih formatı YYYY-AA-GG olmalı' });
      query += ` WHERE ${localDateExpr('p.createdAt')} = ?`;
      params.push(date);
    }
    query += ' ORDER BY p.createdAt DESC LIMIT 2000';
    res.json(await dbAll(query, params));
  })
);

// ---------------------------------------------------------------------------
// Raporlar (yönetici)
// ---------------------------------------------------------------------------
app.get(
  '/api/reports/daily',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const date = req.query.date;
    if (date && !isValidDate(date)) return res.status(400).json({ error: 'Tarih formatı YYYY-AA-GG olmalı' });
    const where = date ? `WHERE ${localDateExpr('p.createdAt')} = ?` : `WHERE ${localDateExpr('p.createdAt')} = ${localDateExpr("'now'")}`;
    const row = await dbGet(
      `SELECT COUNT(DISTINCT p.tableId) as totalTables,
              COUNT(p.id) as totalPayments,
              COALESCE(SUM(p.amount), 0) as totalRevenue,
              COALESCE(SUM(CASE WHEN p.paymentType = 'Nakit' THEN p.amount ELSE 0 END), 0) as cashRevenue,
              COALESCE(SUM(CASE WHEN p.paymentType = 'Kart' THEN p.amount ELSE 0 END), 0) as cardRevenue
       FROM payments p ${where}`,
      date ? [date] : []
    );
    res.json(row || { totalTables: 0, totalPayments: 0, totalRevenue: 0, cashRevenue: 0, cardRevenue: 0 });
  })
);

app.get(
  '/api/reports/hourly',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const date = req.query.date;
    if (date && !isValidDate(date)) return res.status(400).json({ error: 'Tarih formatı YYYY-AA-GG olmalı' });
    const dateParam = date || null;
    const whereDate = (col) => (dateParam ? `${localDateExpr(col)} = ?` : `${localDateExpr(col)} = ${localDateExpr("'now'")}`);
    const params = dateParam ? [dateParam, dateParam] : [];

    // Satılan (ödenmiş) kalemler + hâlâ açık masalardaki kalemler, sipariş saatine göre
    const rows = await dbAll(
      `SELECT hour, productId, productName, SUM(quantity) as totalQuantity, SUM(total) as totalRevenue, SUM(paid) as paidQuantity FROM (
         SELECT strftime('%H', datetime(pi.orderedAt, '+3 hours')) as hour, pi.productId, pi.productName, pi.quantity, pi.total, pi.quantity as paid
         FROM payment_items pi WHERE ${whereDate('pi.orderedAt')}
         UNION ALL
         SELECT strftime('%H', datetime(o.createdAt, '+3 hours')) as hour, o.productId, p.name as productName, o.quantity, o.total, 0 as paid
         FROM orders o JOIN products p ON o.productId = p.id WHERE ${whereDate('o.createdAt')}
       )
       GROUP BY hour, productId, productName
       ORDER BY hour, totalQuantity DESC`,
      params
    );
    const hourly = {};
    rows.forEach((row) => {
      const hour = parseInt(row.hour, 10);
      if (!hourly[hour]) hourly[hour] = [];
      hourly[hour].push({
        productId: row.productId,
        productName: row.productName,
        quantity: row.totalQuantity,
        revenue: round2(row.totalRevenue),
        openQuantity: row.totalQuantity - row.paidQuantity,
      });
    });
    const result = [];
    for (let hour = 0; hour < 24; hour++) {
      result.push({ hour, hourLabel: `${String(hour).padStart(2, '0')}:00`, products: hourly[hour] || [] });
    }
    res.json(result);
  })
);

// ---------------------------------------------------------------------------
// Günlük görevler (ürün başına günlük satış hedefi)
// ---------------------------------------------------------------------------
async function getGoalsWithProgress() {
  const today = localDateExpr("'now'");
  // Bugünün kotalarını geçmiş kaydına işle (görev geçmişi raporu için)
  await dbRun(`INSERT OR REPLACE INTO daily_goal_log(date, productId, quota) SELECT ${today}, productId, quota FROM daily_goals`);
  const rows = await dbAll(
    `SELECT g.id, g.productId, g.quota, p.name as productName, c.name as categoryName, c.color as categoryColor,
            COALESCE((SELECT SUM(pi.quantity) FROM payment_items pi WHERE pi.productId = g.productId AND ${localDateExpr('pi.orderedAt')} = ${today}), 0) as paid,
            COALESCE((SELECT SUM(o.quantity) FROM orders o WHERE o.productId = g.productId AND ${localDateExpr('o.createdAt')} = ${today}), 0) as open
     FROM daily_goals g
     JOIN products p ON p.id = g.productId
     LEFT JOIN categories c ON c.id = p.categoryId
     ORDER BY p.name COLLATE NOCASE`
  );
  return rows.map((r) => {
    const sold = (r.paid || 0) + (r.open || 0);
    return { ...r, sold, remaining: Math.max(0, r.quota - sold), done: sold >= r.quota };
  });
}

app.get(
  '/api/goals',
  asyncHandler(async (req, res) => {
    res.json(await getGoalsWithProgress());
  })
);

/** Gün bazında görev geçmişi: o günkü kota + o gün sipariş edilen adet */
app.get(
  '/api/goals/history',
  asyncHandler(async (req, res) => {
    const days = Math.min(90, Math.max(1, toInt(req.query.days) || 30));
    const today = localDateExpr("'now'");
    await dbRun(`INSERT OR REPLACE INTO daily_goal_log(date, productId, quota) SELECT ${today}, productId, quota FROM daily_goals`);
    const rows = await dbAll(
      `SELECT l.date, l.productId, l.quota, COALESCE(p.name, 'Silinmiş ürün') as productName, c.name as categoryName, c.color as categoryColor,
              COALESCE((SELECT SUM(pi.quantity) FROM payment_items pi WHERE pi.productId = l.productId AND ${localDateExpr('pi.orderedAt')} = l.date), 0) as paid,
              COALESCE((SELECT SUM(o.quantity) FROM orders o WHERE o.productId = l.productId AND ${localDateExpr('o.createdAt')} = l.date), 0) as open
       FROM daily_goal_log l
       LEFT JOIN products p ON p.id = l.productId
       LEFT JOIN categories c ON c.id = p.categoryId
       WHERE l.date >= DATE(${today}, ?)
       ORDER BY l.date DESC, productName COLLATE NOCASE`,
      [`-${days - 1} days`]
    );
    const byDate = new Map();
    rows.forEach((r) => {
      const sold = (r.paid || 0) + (r.open || 0);
      const goal = { ...r, sold, remaining: Math.max(0, r.quota - sold), done: sold >= r.quota, percent: r.quota ? Math.min(100, Math.round((sold / r.quota) * 100)) : 0 };
      if (!byDate.has(r.date)) byDate.set(r.date, { date: r.date, goals: [], doneCount: 0 });
      const day = byDate.get(r.date);
      day.goals.push(goal);
      if (goal.done) day.doneCount += 1;
    });
    res.json([...byDate.values()].map((d) => ({ ...d, total: d.goals.length, allDone: d.goals.length > 0 && d.doneCount === d.goals.length })));
  })
);

app.post(
  '/api/goals',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const productId = toInt(req.body?.productId);
    const quota = toInt(req.body?.quota);
    if (Number.isNaN(productId)) return res.status(400).json({ error: 'Ürün seçin' });
    if (Number.isNaN(quota) || quota < 1 || quota > 100000) return res.status(400).json({ error: 'Kota 1 veya daha büyük olmalı' });
    const product = await dbGet(`SELECT id FROM products WHERE id = ?`, [productId]);
    if (!product) return res.status(404).json({ error: 'Ürün bulunamadı' });
    await dbRun(`INSERT INTO daily_goals(productId, quota) VALUES(?, ?) ON CONFLICT(productId) DO UPDATE SET quota = excluded.quota`, [productId, quota]);
    broadcast('goalsUpdated', {});
    res.json({ success: true });
  })
);

app.put(
  '/api/goals/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = toInt(req.params.id);
    const quota = toInt(req.body?.quota);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Geçersiz görev' });
    if (Number.isNaN(quota) || quota < 1 || quota > 100000) return res.status(400).json({ error: 'Kota 1 veya daha büyük olmalı' });
    const result = await dbRun(`UPDATE daily_goals SET quota = ? WHERE id = ?`, [quota, id]);
    if (!result.changes) return res.status(404).json({ error: 'Görev bulunamadı' });
    broadcast('goalsUpdated', {});
    res.json({ id, quota });
  })
);

app.delete(
  '/api/goals/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = toInt(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Geçersiz görev' });
    await dbRun(`DELETE FROM daily_goals WHERE id = ?`, [id]);
    broadcast('goalsUpdated', {});
    res.json({ success: true });
  })
);

// ---------------------------------------------------------------------------
// Personel raporu: kim ne kadar sipariş aldı, kim kaç hesap kapattı
// ---------------------------------------------------------------------------
app.get(
  '/api/reports/staff',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const date = req.query.date;
    if (date && !isValidDate(date)) return res.status(400).json({ error: 'Tarih formatı YYYY-AA-GG olmalı' });
    const dateExpr = date ? '?' : localDateExpr("'now'");
    const params = (n) => (date ? Array(n).fill(date) : []);

    const sold = await dbAll(
      `SELECT COALESCE(pi.createdBy, 0) as userId, COALESCE(pi.createdByName, 'Bilinmiyor') as name,
              COUNT(*) as lines, SUM(pi.quantity) as quantity, SUM(pi.total) as revenue
       FROM payment_items pi WHERE ${localDateExpr('pi.orderedAt')} = ${dateExpr}
       GROUP BY COALESCE(pi.createdBy, 0), COALESCE(pi.createdByName, 'Bilinmiyor')`,
      params(1)
    );
    const open = await dbAll(
      `SELECT COALESCE(o.createdBy, 0) as userId, COALESCE(o.createdByName, 'Bilinmiyor') as name,
              COUNT(*) as lines, SUM(o.quantity) as quantity, SUM(o.total) as revenue
       FROM orders o WHERE ${localDateExpr('o.createdAt')} = ${dateExpr}
       GROUP BY COALESCE(o.createdBy, 0), COALESCE(o.createdByName, 'Bilinmiyor')`,
      params(1)
    );
    const paid = await dbAll(
      `SELECT COALESCE(p.paidBy, 0) as userId, COALESCE(p.paidByName, 'Bilinmiyor') as name,
              COUNT(*) as payments, SUM(p.amount) as amount,
              SUM(CASE WHEN p.paymentType = 'Nakit' THEN p.amount ELSE 0 END) as cash,
              SUM(CASE WHEN p.paymentType = 'Kart' THEN p.amount ELSE 0 END) as card
       FROM payments p WHERE ${localDateExpr('p.createdAt')} = ${dateExpr}
       GROUP BY COALESCE(p.paidBy, 0), COALESCE(p.paidByName, 'Bilinmiyor')`,
      params(1)
    );
    const topProducts = await dbAll(
      `SELECT userId, name, productName, SUM(quantity) as quantity FROM (
         SELECT COALESCE(pi.createdBy, 0) as userId, COALESCE(pi.createdByName, 'Bilinmiyor') as name, pi.productName, pi.quantity
         FROM payment_items pi WHERE ${localDateExpr('pi.orderedAt')} = ${dateExpr}
         UNION ALL
         SELECT COALESCE(o.createdBy, 0), COALESCE(o.createdByName, 'Bilinmiyor'), p.name, o.quantity
         FROM orders o JOIN products p ON p.id = o.productId WHERE ${localDateExpr('o.createdAt')} = ${dateExpr}
       ) GROUP BY userId, name, productName ORDER BY quantity DESC`,
      params(2)
    );

    const staff = new Map();
    const get = (userId, name) => {
      const key = `${userId}|${name}`;
      if (!staff.has(key)) staff.set(key, { userId, name, soldQuantity: 0, soldRevenue: 0, openQuantity: 0, openRevenue: 0, payments: 0, paymentAmount: 0, cash: 0, card: 0, topProducts: [] });
      return staff.get(key);
    };
    sold.forEach((r) => { const s1 = get(r.userId, r.name); s1.soldQuantity += r.quantity || 0; s1.soldRevenue += r.revenue || 0; });
    open.forEach((r) => { const s1 = get(r.userId, r.name); s1.openQuantity += r.quantity || 0; s1.openRevenue += r.revenue || 0; });
    paid.forEach((r) => { const s1 = get(r.userId, r.name); s1.payments += r.payments || 0; s1.paymentAmount += r.amount || 0; s1.cash += r.cash || 0; s1.card += r.card || 0; });
    topProducts.forEach((r) => { const s1 = get(r.userId, r.name); if (s1.topProducts.length < 5) s1.topProducts.push({ name: r.productName, quantity: r.quantity }); });

    const result = [...staff.values()].map((s1) => ({
      ...s1,
      soldRevenue: round2(s1.soldRevenue),
      openRevenue: round2(s1.openRevenue),
      totalQuantity: s1.soldQuantity + s1.openQuantity,
      totalRevenue: round2(s1.soldRevenue + s1.openRevenue),
      paymentAmount: round2(s1.paymentAmount),
      cash: round2(s1.cash),
      card: round2(s1.card),
    }));
    result.sort((a, b) => b.totalRevenue - a.totalRevenue);
    res.json(result);
  })
);

// ---------------------------------------------------------------------------
// Ayarlar
// ---------------------------------------------------------------------------
const ALLOWED_SETTINGS = new Set(['printerIP', 'printerName', 'taxRate', 'restaurantName']);

app.get(
  '/api/settings',
  asyncHandler(async (req, res) => {
    const rows = await dbAll(`SELECT * FROM settings`);
    const settings = {};
    rows.forEach((row) => (settings[row.key] = row.value));
    res.json(settings);
  })
);

app.put(
  '/api/settings/:key',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const key = req.params.key;
    if (!ALLOWED_SETTINGS.has(key)) return res.status(400).json({ error: 'Bilinmeyen ayar' });
    const value = String(req.body?.value ?? '').slice(0, 200);
    await dbRun(`INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)`, [key, value]);
    broadcast('settingUpdated', { key, value });
    res.json({ key, value });
  })
);

// ---------------------------------------------------------------------------
// Fiş ve yazıcı
// ---------------------------------------------------------------------------
app.get(
  '/api/receipt/:tableId',
  asyncHandler(async (req, res) => {
    const tableId = toInt(req.params.tableId);
    const table = Number.isNaN(tableId) ? null : await dbGet(`SELECT * FROM tables WHERE id = ?`, [tableId]);
    if (!table) return res.status(404).json({ error: 'Masa bulunamadı' });
    const orders = await dbAll(
      `SELECT orders.id, products.name, COALESCE(orders.unitPrice, products.price) as price, orders.quantity, orders.total
       FROM orders JOIN products ON orders.productId = products.id
       WHERE orders.tableId = ? ORDER BY orders.createdAt`,
      [tableId]
    );
    const setting = await dbGet(`SELECT value FROM settings WHERE key = 'restaurantName'`);
    res.json({
      restaurantName: setting?.value || 'Emek Cafe Adisyon',
      tableName: table.name,
      orders,
      total: table.total,
      date: new Date().toLocaleString('tr-TR'),
    });
  })
);

app.get('/api/printers/windows', requireAdmin, (req, res) => {
  try {
    if (process.platform !== 'win32') return res.json({ printers: [] });
    res.json({ printers: winRawPrint.listWindowsPrinters() });
  } catch (error) {
    console.error('Windows yazıcı listesi alınamadı:', error);
    res.status(500).json({ error: 'Yazıcı listesi alınamadı: ' + error.message });
  }
});

app.post(
  '/api/print/test',
  requireAdmin,
  asyncHandler(async (req, res) => {
    if (process.platform !== 'win32') return res.status(400).json({ error: 'Test yazdırma yalnızca Windows üzerinde desteklenir' });
    const setting = await dbGet(`SELECT value FROM settings WHERE key = 'printerName'`);
    const requested = (req.body?.printerName || setting?.value || '').trim() || null;
    const printers = winRawPrint.listWindowsPrinters();
    const selected = winRawPrint.matchPrinter(printers, requested);
    if (!selected) {
      return res.status(404).json({ error: 'Termal yazıcı bulunamadı. Ayarlar sekmesinden yazıcı seçin.', availablePrinters: printers.map((p) => p.name) });
    }
    const buffer = winRawPrint.buildEscPosReceipt({
      restaurantName: 'Emek Cafe Adisyon',
      tableName: 'TEST',
      orders: [{ name: 'Test Urun', quantity: 1, total: 1 }],
      total: 1,
      date: new Date().toLocaleString('tr-TR'),
    });
    winRawPrint.printRawWindows(selected.name, buffer);
    res.json({ success: true, message: `Test fişi yazdırıldı: ${selected.name}`, printer: selected.name });
  })
);

const { registerPrintReceiptRoute } = require('./print-receipt-route');
registerPrintReceiptRoute(app, db, winRawPrint, broadcast);

// ---------------------------------------------------------------------------
// Statik dosyalar (tarayıcıdan erişim) ve hata yönetimi
// ---------------------------------------------------------------------------
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Bulunamadı' });
});

if (process.env.NODE_ENV === 'production' && fs.existsSync(distPath)) {
  app.use(
    express.static(distPath, {
      etag: true,
      lastModified: true,
      setHeaders: (res, filePath) => {
        // index.html her zaman güncel kalsın; hash'li asset'ler uzun süre cache'lensin
        if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
        else res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      },
    })
  );
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.includes('.')) return next();
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('❌ API hatası:', req.method, req.originalUrl, err.message);
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Geçersiz istek gövdesi' });
  res.status(500).json({ error: 'Sunucu hatası: ' + err.message });
});

// ---------------------------------------------------------------------------
// Başlat
// ---------------------------------------------------------------------------
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${port} kullanımda (başka bir sunucu çalışıyor olabilir). Yeniden denenecek.`);
  } else {
    console.error('❌ Sunucu hatası:', err.message);
  }
  process.exit(1);
});

initDatabase()
  .then(() => {
    server.listen(port, '0.0.0.0', () => {
      console.log('\n========================================');
      console.log('Emek Cafe Adisyon Başlatıldı');
      console.log('========================================');
      console.log(`Yerel:    http://localhost:${port}`);
      console.log(`Ağ:       http://${networkIP}:${port}`);
      console.log(`Birincil sunucu: ${isPrimaryServer ? 'evet' : 'hayır'}`);
      console.log('========================================\n');
    });
  })
  .catch((err) => {
    console.error('❌ Veritabanı başlatılamadı:', err);
    process.exit(1);
  });

function shutdown() {
  console.log('🛑 Sunucu kapatılıyor...');
  server.close(() => {
    db.close(() => process.exit(0));
  });
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
