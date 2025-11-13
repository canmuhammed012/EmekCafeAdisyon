const { app, BrowserWindow, Menu } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const http = require('http');
const fs = require('fs');

let mainWindow;
let backendLoader;
let themeCheckInterval;

function createWindow() {
  // Ekran boyutunu al
  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;
  const { scaleFactor } = primaryDisplay;
  
  // Pencere boyutunu ekran boyutuna göre ayarla
  // Küçük ekranlar için daha fazla alan kullan, büyük ekranlar için maksimum sınır
  const windowWidth = Math.min(1920, Math.max(1024, Math.floor(width * 0.95)));
  const windowHeight = Math.min(1080, Math.max(768, Math.floor(height * 0.95)));
  
  // Minimum boyutları ekran boyutuna göre ayarla
  const minWidth = Math.max(800, Math.floor(width * 0.6));
  const minHeight = Math.max(600, Math.floor(height * 0.6));
  
  // Icon path'i belirle
  const iconPath = app.isPackaged 
    ? path.join(process.resourcesPath, 'public', 'logo.png')
    : path.join(__dirname, '..', 'public', 'logo.png');
  
  mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    minWidth: minWidth,
    minHeight: minHeight,
    frame: true, // Çerçeveyi göster (kapatma, küçültme butonları için)
    titleBarStyle: 'default', // Windows için varsayılan
    autoHideMenuBar: true, // Menü çubuğunu gizle
    icon: iconPath, // Pencere icon'u
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    show: false,
    backgroundColor: '#ffffff', // Varsayılan beyaz tema
  });
  
  // Menü çubuğunu tamamen kaldır
  mainWindow.setMenuBarVisibility(false);
  mainWindow.setMenu(null);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });
  
  // Frontend'den tema değişikliklerini dinle
  mainWindow.webContents.on('did-finish-load', () => {
    // localStorage'dan tema bilgisini oku
    mainWindow.webContents.executeJavaScript(`
      (function() {
        const darkMode = localStorage.getItem('darkMode') === 'true';
        return darkMode;
      })();
    `).then((darkMode) => {
      // Çerçeve rengini tema rengine göre ayarla
      const backgroundColor = darkMode ? '#1f2937' : '#ffffff';
      mainWindow.setBackgroundColor(backgroundColor);
    }).catch(() => {
      // Hata durumunda varsayılan beyaz
      mainWindow.setBackgroundColor('#ffffff');
    });
    
    // Tema değişikliklerini dinle (localStorage değişiklikleri)
    themeCheckInterval = setInterval(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.executeJavaScript(`
          (function() {
            const darkMode = localStorage.getItem('darkMode') === 'true';
            return darkMode;
          })();
        `).then((darkMode) => {
          const backgroundColor = darkMode ? '#1f2937' : '#ffffff';
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.setBackgroundColor(backgroundColor);
          }
        }).catch(() => {});
      } else {
        clearInterval(themeCheckInterval);
      }
    }, 1000); // Her saniye kontrol et
  });

  // app.isPackaged kullan (daha güvenilir)
  const isDev = !app.isPackaged;
  
  if (isDev) {
    // Development modunda - Vite dev server
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    // Production - Frontend'i hemen yükle, backend paralel başlasın
    loadFrontendFromFile();
    
    // Backend'i paralel başlat (frontend'i bekletme)
    startBackend().catch((err) => {
      console.error('Backend başlatma hatası:', err);
    });
  }
  
  // Production'da reload'u engelle
  if (!isDev) {
    // did-fail-load event'inde reload yapma
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
      console.error('❌ Sayfa yükleme hatası:', errorCode, errorDescription, validatedURL);
      // ASLA reload yapma - sadece log
    });
    
    // did-navigate event'inde reload yapma
    mainWindow.webContents.on('did-navigate', (event, url) => {
      console.log('📍 Navigate:', url);
      // ASLA reload yapma
    });
  }

  mainWindow.on('closed', () => {
    if (themeCheckInterval) {
      clearInterval(themeCheckInterval);
      themeCheckInterval = null;
    }
    mainWindow = null;
  });
}

function showLoading() {
  const loadingHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body {
          margin: 0; padding: 0; display: flex; align-items: center;
          justify-content: center; height: 100vh;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
        }
        .container { text-align: center; color: white; }
        .spinner {
          width: 50px; height: 50px; margin: 20px auto;
          border: 5px solid rgba(255,255,255,0.3);
          border-top-color: white; border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        h1 { margin: 0 0 10px; font-size: 24px; }
        p { margin: 5px 0; opacity: 0.9; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Emek Cafe Adisyon</h1>
        <div class="spinner"></div>
        <p>Başlatılıyor...</p>
      </div>
    </body>
    </html>
  `;
  
  const loadingPath = path.join(app.getPath('temp'), 'loading.html');
  fs.writeFileSync(loadingPath, loadingHTML, 'utf-8');
  mainWindow.loadFile(loadingPath);
}

// Backend'i başlat (API için)
async function startBackend() {
  try {
    console.log('\n========================================');
    console.log('EMEK CAFE ADİSYON - BACKEND BAŞLATILIYOR');
    console.log('========================================\n');
    
    // Backend loader'ı yükle
    try {
      backendLoader = require('./backend-loader');
      console.log('✓ Backend loader yüklendi');
      
      // Backend'i başlat
      await backendLoader.startBackend();
      console.log('✓ Backend başlatıldı (API: http://localhost:3000)');
      
    } catch (err) {
      console.error('✗ Backend loader hatası:', err);
      // Backend hatası olsa bile frontend yüklenebilir
    }
  } catch (error) {
    console.error('\n❌ Backend başlatma hatası:', error);
    // Hata olsa bile devam et
  }
}

// Frontend'i dosyadan yükle
function loadFrontendFromFile() {
  try {
    console.log('\n📄 Frontend dosyadan yükleniyor...\n');
    
    // Electron loadFile() ASAR-aware - relative path kullan
    // __dirname = electron/ klasörü, .. = app root, dist/index.html
    const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
    console.log('Frontend path (relative):', indexPath);
    console.log('__dirname:', __dirname);
    
    // Electron loadFile otomatik olarak ASAR içinde arar
    mainWindow.loadFile(indexPath)
      .then(() => {
        console.log('✓ Frontend dosyadan başarıyla yüklendi\n');
      })
      .catch((err) => {
        console.error('✗ Frontend yükleme hatası:', err);
        console.error('Path denenmiş:', indexPath);
        showError('Yükleme Hatası', `Frontend yüklenemedi:\n${err.message}\n\nPath: ${indexPath}`);
      });
  } catch (error) {
    console.error('❌ Frontend yükleme hatası:', error);
    showError('Yükleme Hatası', error.message);
  }
}

// waitForBackend fonksiyonu kaldırıldı - artık gerekli değil
// Frontend dosyadan yükleniyor, backend ayrı başlatılıyor

function showError(title, message) {
  const errorHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body {
          margin: 0; padding: 40px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
          background: #f5f5f5;
        }
        .container {
          max-width: 600px; margin: 0 auto; background: white;
          padding: 30px; border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 { color: #e74c3c; margin: 0 0 20px; font-size: 24px; }
        p { color: #333; line-height: 1.6; white-space: pre-wrap; }
        button {
          margin-top: 20px; padding: 10px 20px;
          background: #3498db; color: white; border: none;
          border-radius: 5px; cursor: pointer; font-size: 14px;
        }
        button:hover { background: #2980b9; }
        .note {
          margin-top: 20px; padding: 15px;
          background: #fff3cd; border-left: 4px solid #ffc107;
          color: #856404; font-size: 13px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>${title}</h1>
        <p>${message}</p>
        <div class="note">
          💡 DevTools Console'da daha detaylı log bulabilirsiniz.
        </div>
        <button onclick="window.location.href='http://localhost:3000'">Tekrar Dene</button>
      </div>
    </body>
    </html>
  `;
  
  const errorPath = path.join(app.getPath('temp'), 'error.html');
  fs.writeFileSync(errorPath, errorHTML, 'utf-8');
  mainWindow.loadFile(errorPath);
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Auto-updater ayarları (sadece production'da)
if (app.isPackaged) {
  // Auto-updater yapılandırması
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: 'canmuhammed012',
    repo: 'EmekCafeAdisyon'
  });
  
  // Auto-updater cache konumunu logla
  console.log('📁 Auto-updater cache konumu:', autoUpdater.downloadedUpdateHelperCacheDirName);
  console.log('📁 App userData:', app.getPath('userData'));
  console.log('📁 App temp:', app.getPath('temp'));
  console.log('📁 App appData:', app.getPath('appData'));
  console.log('📁 LocalAppData (tahmini):', path.join(process.env.LOCALAPPDATA || '', 'Programs', 'emek-cafe-adisyon-updater'));
  
  // Veritabanı konumunu göster
  const dbPath = path.join(app.getPath('userData'), 'emekcafe.db');
  console.log('📁 VERİTABANI KONUMU:');
  console.log('   Klasör:', app.getPath('userData'));
  console.log('   Dosya:', dbPath);
  console.log('   Tam yol:', path.resolve(dbPath));
  // Veritabanı dosyasının var olup olmadığını kontrol et
  try {
    if (fs.existsSync(dbPath)) {
      const stats = fs.statSync(dbPath);
      console.log('   ✓ Veritabanı mevcut');
      console.log('   📊 Boyut:', (stats.size / 1024).toFixed(2), 'KB');
    } else {
      console.log('   ✗ Veritabanı henüz oluşturulmamış (ilk çalıştırmada oluşturulacak)');
    }
  } catch (e) {
    console.log('   ? Kontrol edilemedi:', e.message);
  }
  
  // Güncelleme kontrolü - uygulama açıldıktan 5 saniye sonra (app.whenReady zaten çağrıldı)
  setTimeout(() => {
    console.log('🔍 Güncelleme kontrol ediliyor...');
    console.log('📡 Feed URL:', autoUpdater.getFeedURL());
    autoUpdater.checkForUpdates();
  }, 5000);
  
  // Her 30 dakikada bir kontrol et
  setInterval(() => {
    console.log('🔍 Güncelleme kontrol ediliyor (periyodik)...');
    autoUpdater.checkForUpdates();
  }, 30 * 60 * 1000); // 30 dakika
  
  autoUpdater.on('checking-for-update', () => {
    console.log('🔍 Güncelleme kontrol ediliyor...');
  });
  
  autoUpdater.on('update-available', (info) => {
    console.log('🔄 Güncelleme mevcut:', info.version);
    console.log('📦 Güncelleme bilgileri:', JSON.stringify(info, null, 2));
    console.log('📥 Auto-updater cache dir:', autoUpdater.downloadedUpdateHelperCacheDirName);
    // Windows'ta genellikle şu konumlar kullanılır:
    const possiblePaths = [
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'emek-cafe-adisyon-updater'),
      path.join(app.getPath('userData'), '..', 'Programs', 'emek-cafe-adisyon-updater'),
      path.join(app.getPath('temp'), 'emek-cafe-adisyon-updater'),
      path.join(app.getPath('appData'), 'emek-cafe-adisyon-updater')
    ];
    console.log('📁 Olası indirme konumları:');
    possiblePaths.forEach((p, i) => {
      console.log(`  ${i + 1}. ${p}`);
      try {
        if (fs.existsSync(p)) {
          console.log(`     ✓ Klasör mevcut`);
        } else {
          console.log(`     ✗ Klasör yok`);
        }
      } catch (e) {
        console.log(`     ? Kontrol edilemedi`);
      }
    });
    if (mainWindow) {
      mainWindow.webContents.send('update-available', info.version);
    }
  });
  
  autoUpdater.on('update-not-available', (info) => {
    console.log('✅ Güncel sürüm kullanılıyor:', info.version);
  });
  
  autoUpdater.on('download-progress', (progressObj) => {
    let log_message = "İndiriliyor: " + progressObj.percent + "%";
    log_message = log_message + ' (' + progressObj.transferred + "/" + progressObj.total + ')';
    console.log(log_message);
    // İndirme konumunu göster
    const downloadPath = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'emek-cafe-adisyon-updater');
    console.log('📁 İndirme konumu:', downloadPath);
    if (fs.existsSync(downloadPath)) {
      console.log('📁 Klasör içeriği:', fs.readdirSync(downloadPath));
    }
    if (mainWindow) {
      mainWindow.webContents.send('download-progress', progressObj);
    }
  });
  
  autoUpdater.on('update-downloaded', (info) => {
    console.log('✅ Güncelleme indirildi:', info.version);
    console.log('📦 İndirilen güncelleme bilgileri:', JSON.stringify(info, null, 2));
    
    // İndirme konumunu göster - tüm olası konumları kontrol et
    const possiblePaths = [
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'emek-cafe-adisyon-updater'),
      path.join(app.getPath('userData'), '..', 'Programs', 'emek-cafe-adisyon-updater'),
      path.join(app.getPath('temp'), 'emek-cafe-adisyon-updater'),
      path.join(app.getPath('appData'), 'emek-cafe-adisyon-updater'),
      path.join(app.getPath('userData'), 'updates')
    ];
    
    console.log('📁 Güncelleme dosyası konumları kontrol ediliyor:');
    possiblePaths.forEach((p, i) => {
      const fullPath = path.resolve(p);
      console.log(`  ${i + 1}. ${fullPath}`);
      try {
        if (fs.existsSync(fullPath)) {
          console.log(`     ✓ Klasör mevcut`);
          const files = fs.readdirSync(fullPath);
          console.log(`     📄 Dosyalar:`, files);
        } else {
          console.log(`     ✗ Klasör yok`);
        }
      } catch (e) {
        console.log(`     ? Hata:`, e.message);
      }
    });
    
    if (mainWindow) {
      mainWindow.webContents.send('update-downloaded', info.version);
    }
    // Kullanıcıya sor - otomatik yükleme yerine
    // autoUpdater.quitAndInstall();
  });
  
  autoUpdater.on('error', (error) => {
    console.error('❌ Güncelleme hatası:', error.message);
    console.error('❌ Hata detayları:', error);
  });
}

app.on('window-all-closed', () => {
  if (backendLoader && backendLoader.stopBackend) {
    backendLoader.stopBackend();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (backendLoader && backendLoader.stopBackend) {
    backendLoader.stopBackend();
  }
});
