const { app, BrowserWindow, Menu, globalShortcut, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const http = require('http');
const fs = require('fs');

// Windows için app user model ID'yi en başta ayarla (güncelleme sonrası icon için)
if (process.platform === 'win32') {
  app.setAppUserModelId('com.emekcafe.adisyon');
}

// Tek instance kontrolü - uygulamanın 2 kere açılmasını engelle
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // Eğer başka bir instance zaten çalışıyorsa, bu instance'ı kapat
  console.log('⚠️ Uygulama zaten çalışıyor, bu instance kapatılıyor...');
  app.quit();
} else {
  // İlk instance - başka bir instance açılmaya çalışıldığında
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Eğer ana pencere minimize edilmişse veya gizlenmişse, göster
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });
}

let mainWindow;
let backendLoader;
let themeCheckInterval;

function getDeviceConfigPath() {
  return path.join(app.getPath('userData'), 'device-config.json');
}

function readDeviceConfig() {
  try {
    const configPath = getDeviceConfigPath();
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (err) {
    console.warn('device-config okunamadı:', err.message);
  }
  return { role: 'server' };
}

function writeDeviceConfig(config) {
  fs.writeFileSync(getDeviceConfigPath(), JSON.stringify(config, null, 2), 'utf8');
}

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
  
  // Icon path'i belirle (Windows için .ico dosyası kullan)
  let iconPath;
  if (app.isPackaged) {
    // Production: Electron Builder logo'yu resources klasörüne koyar
    // Önce dist klasöründe ara (ASAR içinde), sonra resources klasöründe
    const appPath = app.getAppPath();
    const distPath = path.join(appPath, 'logo.ico'); // .ico dosyası
    const resourcesPath = path.join(process.resourcesPath, 'logo.ico');
    const publicPath = path.join(process.resourcesPath, 'public', 'logo.ico');
    const extraResourcesPath = path.join(process.resourcesPath, 'logo.ico');
    
    // Sırayla kontrol et (.ico dosyası için)
    if (fs.existsSync(distPath)) {
      iconPath = distPath;
    } else if (fs.existsSync(resourcesPath)) {
      iconPath = resourcesPath;
    } else if (fs.existsSync(publicPath)) {
      iconPath = publicPath;
    } else if (fs.existsSync(extraResourcesPath)) {
      iconPath = extraResourcesPath;
    } else {
      // Fallback: .png dosyası dene
      const pngPath = path.join(process.resourcesPath, 'logo.png');
      if (fs.existsSync(pngPath)) {
        iconPath = pngPath;
      } else {
        iconPath = path.join(appPath, 'public', 'logo.ico');
      }
    }
    
    console.log('🔍 Icon path aranıyor...');
    console.log('  App path:', appPath);
    console.log('  Resources path:', process.resourcesPath);
    console.log('  Seçilen icon path:', iconPath);
    console.log('  Icon mevcut:', fs.existsSync(iconPath));
  } else {
    // Development: public klasöründen al (.ico veya .png)
    const icoPath = path.join(__dirname, '..', 'public', 'logo.ico');
    const pngPath = path.join(__dirname, '..', 'public', 'logo.png');
    if (fs.existsSync(icoPath)) {
      iconPath = icoPath;
    } else {
      iconPath = pngPath;
    }
    console.log('🔍 Development icon path:', iconPath);
    console.log('  Icon mevcut:', fs.existsSync(iconPath));
  }
  
  // Windows için app user model ID ayarla (görev çubuğu simgesi için)
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.emekcafe.adisyon');
  }
  
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
      preload: path.join(__dirname, 'preload.js')
    },
    show: false,
    backgroundColor: '#ffffff', // Varsayılan beyaz tema
  });

  // Windows için icon'u hemen ayarla (görev çubuğu için)
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.emekcafe.adisyon');
    if (iconPath && fs.existsSync(iconPath)) {
      mainWindow.setIcon(iconPath);
      console.log('✅ Icon ayarlandı (pencere oluşturulurken):', iconPath);
    }
  }
  
  // Menü çubuğunu tamamen kaldır
  mainWindow.setMenuBarVisibility(false);
  mainWindow.setMenu(null);

  mainWindow.once('ready-to-show', () => {
    // Icon'u tekrar ayarla (görev çubuğu için)
    if (process.platform === 'win32') {
      app.setAppUserModelId('com.emekcafe.adisyon');
      if (iconPath && fs.existsSync(iconPath)) {
        mainWindow.setIcon(iconPath);
        console.log('✅ Icon ayarlandı (ready-to-show):', iconPath);
      }
    }
    mainWindow.show();
  });
  
  // Frontend'den tema değişikliklerini dinle
  mainWindow.webContents.on('did-finish-load', () => {
    // Icon'u tekrar ayarla (güncelleme sonrası veya her yüklemede)
    if (process.platform === 'win32') {
      app.setAppUserModelId('com.emekcafe.adisyon');
      // Icon'u tekrar set et (güncelleme sonrası için)
      if (iconPath && fs.existsSync(iconPath)) {
        mainWindow.setIcon(iconPath);
        console.log('✅ Icon ayarlandı (did-finish-load):', iconPath);
      }
    }
    
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
    // Production - Frontend'i hemen yükle
    loadFrontendFromFile();
    
    // Sadece admin (server) cihazında yerel backend başlat
    const deviceConfig = readDeviceConfig();
    if (deviceConfig.role === 'client') {
      console.log('📱 İstemci (garson) modu — yerel backend başlatılmıyor');
    } else {
      process.env.PRIMARY_SERVER = 'true';
      startBackend().catch((err) => {
        console.error('Backend başlatma hatası:', err);
      });
    }
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
  
  // Production'da da DevTools'u açabilmek için webContents keyboard event listener
  mainWindow.webContents.on('before-input-event', (event, input) => {
    // Ctrl+Shift+I veya F12
    if ((input.control && input.shift && input.key.toLowerCase() === 'i') || input.key === 'F12') {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.toggleDevTools();
      }
    }
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

// IPC Handlers
ipcMain.handle('get-device-role', () => {
  return readDeviceConfig().role || 'server';
});

ipcMain.handle('set-device-role', (_event, role) => {
  const validRole = role === 'client' ? 'client' : 'server';
  writeDeviceConfig({ role: validRole });
  console.log(`📱 Cihaz rolü kaydedildi: ${validRole}`);
  return { ok: true, restartRequired: true };
});

function loadWinRawPrint() {
  const candidates = [
    path.join(__dirname, '..', 'windows-raw-print.js'),
    path.join(process.resourcesPath || '', 'windows-raw-print.js'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return require(candidate);
    }
  }
  throw new Error('windows-raw-print modülü bulunamadı');
}

ipcMain.handle('list-local-printers', () => {
  if (process.platform !== 'win32') {
    return { printers: [] };
  }
  try {
    const winRawPrint = loadWinRawPrint();
    return { printers: winRawPrint.listWindowsPrinters() };
  } catch (error) {
    console.error('Yerel yazıcı listesi:', error);
    return { printers: [], error: error.message };
  }
});

ipcMain.handle('print-receipt-local', (_event, { receipt, printerName }) => {
  if (process.platform !== 'win32') {
    return { success: false, error: 'Yerel yazdırma yalnızca Windows\'ta desteklenir' };
  }
  try {
    const winRawPrint = loadWinRawPrint();
    const printers = winRawPrint.listWindowsPrinters();
    const selected = winRawPrint.matchPrinter(printers, printerName || null);

    if (!selected) {
      return {
        success: false,
        error: 'Bu cihazda termal yazıcı bulunamadı',
        availablePrinters: printers.map((p) => p.name),
      };
    }

    const buffer = winRawPrint.buildEscPosReceipt({
      restaurantName: receipt.restaurantName,
      tableName: receipt.tableName,
      orders: receipt.orders,
      total: receipt.total,
      date: receipt.date,
    });

    winRawPrint.printRawWindows(selected.name, buffer);
    console.log(`✅ Yerel fiş yazdırıldı: ${selected.name}`);

    return {
      success: true,
      message: `Fiş yazdırıldı (${selected.name})`,
      printer: selected.name,
    };
  } catch (error) {
    console.error('Yerel yazdırma hatası:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.on('get-version', (event) => {
  event.returnValue = app.getVersion();
});

// Güncelleme kurulumu için IPC handler
ipcMain.on('install-update', () => {
  // Icon'u tekrar ayarla (güncelleme kurulumu öncesi)
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.emekcafe.adisyon');
  }
  // Uygulamayı kapat ve güncellemeyi kur
  autoUpdater.quitAndInstall(false, true);
});

// Windows için app user model ID'yi en başta ayarla (güncelleme sonrası icon için)
if (process.platform === 'win32') {
  app.setAppUserModelId('com.emekcafe.adisyon');
}

app.whenReady().then(() => {
  // Icon'u tekrar ayarla (güncelleme sonrası için - her başlatmada)
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.emekcafe.adisyon');
    console.log('✅ App User Model ID ayarlandı: com.emekcafe.adisyon');
    
    // Görev çubuğu icon'u için icon path'ini kontrol et ve ayarla
    let iconPath;
    if (app.isPackaged) {
      const resourcesPath = path.join(process.resourcesPath, 'logo.ico');
      if (fs.existsSync(resourcesPath)) {
        iconPath = resourcesPath;
        console.log('✅ Icon path bulundu (whenReady):', iconPath);
      } else {
        // Alternatif yolları dene
        const altPaths = [
          path.join(process.resourcesPath, 'public', 'logo.ico'),
          path.join(app.getAppPath(), 'logo.ico'),
          path.join(__dirname, '..', 'public', 'logo.ico')
        ];
        for (const altPath of altPaths) {
          if (fs.existsSync(altPath)) {
            iconPath = altPath;
            console.log('✅ Alternatif icon path bulundu:', iconPath);
            break;
          }
        }
      }
    } else {
      const icoPath = path.join(__dirname, '..', 'public', 'logo.ico');
      if (fs.existsSync(icoPath)) {
        iconPath = icoPath;
      }
    }
    
    // Ana pencere oluşturulduktan sonra icon'u set et
    if (iconPath) {
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.setIcon(iconPath);
          console.log('✅ Görev çubuğu icon ayarlandı (whenReady):', iconPath);
        }
      }, 200); // 200ms bekle (pencere oluşturulması için)
    }
  }
  
  createWindow();

  // Production'da DevTools'u açmak için global shortcut ekle
  // Ctrl+Shift+I veya F12
  globalShortcut.register('CommandOrControl+Shift+I', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.toggleDevTools();
    }
  });
  
  globalShortcut.register('F12', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.toggleDevTools();
    }
  });

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
  
  // Güncelleme kontrolünü hemen başlat - HER AÇILIŞTA KONTROL ET!
  console.log('\n========================================');
  console.log('🔍 AUTO-UPDATER BAŞLATILIYOR');
  console.log('========================================');
  console.log('📦 Mevcut versiyon:', app.getVersion());
  console.log('📡 Feed URL:', autoUpdater.getFeedURL());
  console.log('🔧 GitHub Repository:', 'canmuhammed012/EmekCafeAdisyon');
  console.log('========================================\n');
  
  // İLK KONTROL - HEMEN!
  setTimeout(() => {
    console.log('🔍 İlk güncelleme kontrolü BAŞLADI...');
    autoUpdater.checkForUpdates().catch((err) => {
      console.error('❌ Güncelleme kontrol hatası:', err);
    });
  }, 2000); // 2 saniye sonra (ağ bağlantısı için kısa bir bekleme)
  
  // PERİYODİK KONTROL - Her 3 dakikada bir (çok sık kontrol)
  setInterval(() => {
    console.log('🔍 Periyodik güncelleme kontrolü başlatılıyor...');
    console.log('📦 Mevcut versiyon:', app.getVersion());
    autoUpdater.checkForUpdates().catch((err) => {
      console.error('❌ Periyodik kontrol hatası:', err);
    });
  }, 3 * 60 * 1000); // 3 dakika
  
  autoUpdater.on('checking-for-update', () => {
    console.log('\n🔍 ========== GÜNCELLEME KONTROL EDİLİYOR ==========');
    console.log('📅 Zaman:', new Date().toLocaleString('tr-TR'));
    console.log('📦 Mevcut versiyon:', app.getVersion());
    
    // Renderer'a bildir
    if (mainWindow) {
      mainWindow.webContents.executeJavaScript(`console.log('🔍 MAIN: Güncelleme kontrol ediliyor...')`);
    }
  });
  
  autoUpdater.on('update-available', (info) => {
    console.log('\n🎉 ========== YENİ GÜNCELLEME MEVCUT! ==========');
    console.log('🆕 Yeni versiyon:', info.version);
    console.log('📦 Mevcut versiyon:', app.getVersion());
    
    // Versiyon karşılaştırması - v prefix'ini ve whitespace'i kaldır
    const currentVersion = app.getVersion().replace(/^v/i, '').trim();
    const newVersion = (info.version || '').replace(/^v/i, '').trim();
    
    console.log('🔍 Versiyon karşılaştırması:');
    console.log('   Mevcut (temizlenmiş):', currentVersion);
    console.log('   Yeni (temizlenmiş):', newVersion);
    
    // Eğer versiyonlar aynıysa, güncelleme yapma
    if (currentVersion === newVersion) {
      console.log('⚠️ Versiyonlar aynı! Güncelleme atlanıyor...');
      console.log('💡 Bu normal bir durum - zaten en güncel sürümü kullanıyorsunuz.');
      console.log('==============================================\n');
      return; // Güncellemeyi durdur
    }
    
    // Versiyonlar farklıysa devam et
    console.log('✅ Versiyonlar farklı, güncelleme devam ediyor...');
    console.log('📅 Release tarihi:', info.releaseDate);
    console.log('📝 Güncelleme notları:', info.releaseNotes || 'Yok');
    console.log('📦 Tam güncelleme bilgileri:', JSON.stringify(info, null, 2));
    console.log('📥 Cache dizini:', autoUpdater.downloadedUpdateHelperCacheDirName);
    
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
    console.log('💡 Manuel olarak indirme başlatılıyor...');
    console.log('==============================================\n');
    
    // Renderer process'e bildir (UI bildirim gösterecek)
    if (mainWindow) {
      mainWindow.webContents.send('update-available', info.version);
    }
    
    // MANUEL OLARAK İNDİRMEYİ BAŞLAT!
    // Bazen auto-updater otomatik indirmeyi başlatmıyor, manuel başlatmak gerekiyor
    console.log('📥 downloadUpdate() çağrılıyor...');
    
    // Renderer'a bildir
    if (mainWindow) {
      mainWindow.webContents.executeJavaScript(`console.log('📥 MAIN: downloadUpdate() çağrılıyor...')`);
    }
    
    autoUpdater.downloadUpdate().then(() => {
      console.log('✅ downloadUpdate() başarılı - indirme başladı');
      if (mainWindow) {
        mainWindow.webContents.executeJavaScript(`console.log('✅ MAIN: downloadUpdate() başarılı - indirme başladı')`);
      }
    }).catch((err) => {
      console.error('❌ downloadUpdate() hatası:', err);
      console.error('❌ Hata detayları:', JSON.stringify(err, null, 2));
      
      // Hatayı renderer'a da gönder
      if (mainWindow) {
        mainWindow.webContents.executeJavaScript(`console.error('❌ MAIN: downloadUpdate() hatası:', ${JSON.stringify(err.message || err.toString())})`);
        mainWindow.webContents.executeJavaScript(`console.error('❌ MAIN: Hata detayları:', ${JSON.stringify(JSON.stringify(err, Object.getOwnPropertyNames(err), 2))})`);
      }
    });
  });
  
  autoUpdater.on('update-not-available', (info) => {
    console.log('\n✅ ========== GÜNCELLEME YOK ==========');
    console.log('📦 Mevcut versiyon:', app.getVersion());
    
    // Eğer info varsa, karşılaştırma yap
    if (info && info.version) {
      const currentVersion = app.getVersion().replace(/^v/i, '').trim();
      const latestVersion = (info.version || '').replace(/^v/i, '').trim();
      console.log('🔍 Versiyon karşılaştırması:');
      console.log('   Mevcut:', currentVersion);
      console.log('   Latest:', latestVersion);
      
      if (currentVersion === latestVersion) {
        console.log('✅ Versiyonlar eşleşiyor - güncelleme gerekmiyor');
      }
    }
    
    console.log('✅ Zaten en güncel sürümü kullanıyorsunuz!');
    console.log('📅 Kontrol zamanı:', new Date().toLocaleString('tr-TR'));
    console.log('=====================================\n');
  });
  
  autoUpdater.on('download-progress', (progressObj) => {
    const percent = Math.round(progressObj.percent);
    const transferred = (progressObj.transferred / 1024 / 1024).toFixed(2);
    const total = (progressObj.total / 1024 / 1024).toFixed(2);
    const speed = (progressObj.bytesPerSecond / 1024 / 1024).toFixed(2);
    
    console.log(`📥 İndiriliyor: ${percent}% | ${transferred}/${total} MB | Hız: ${speed} MB/s`);
    
    // İndirme konumunu göster (sadece ilk kez)
    if (percent < 5) {
      const downloadPath = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'emek-cafe-adisyon-updater');
      console.log('📁 İndirme konumu:', downloadPath);
      if (fs.existsSync(downloadPath)) {
        console.log('📁 Klasör içeriği:', fs.readdirSync(downloadPath));
      }
      
      // Renderer'a da bildir
      if (mainWindow) {
        mainWindow.webContents.executeJavaScript(`console.log('📥 MAIN: İndirme başladı! Konum: ${downloadPath.replace(/\\/g, '\\\\')}')`);
      }
    }
    
    if (mainWindow) {
      mainWindow.webContents.send('download-progress', progressObj);
    }
  });
  
  autoUpdater.on('update-downloaded', (info) => {
    console.log('\n🎊 ========== GÜNCELLEME İNDİRİLDİ! ==========');
    console.log('✅ İndirilen versiyon:', info.version);
    console.log('📦 Mevcut versiyon:', app.getVersion());
    
    // Versiyon karşılaştırması - indirilen versiyon mevcut versiyonla aynıysa kurma
    const currentVersion = app.getVersion().replace(/^v/i, '').trim();
    const downloadedVersion = (info.version || '').replace(/^v/i, '').trim();
    
    console.log('🔍 Versiyon karşılaştırması (indirilen):');
    console.log('   Mevcut (temizlenmiş):', currentVersion);
    console.log('   İndirilen (temizlenmiş):', downloadedVersion);
    
    // Eğer versiyonlar aynıysa, kurulumu atla
    if (currentVersion === downloadedVersion) {
      console.log('⚠️ İndirilen versiyon mevcut versiyonla aynı! Kurulum atlanıyor...');
      console.log('💡 Bu normal bir durum - zaten en güncel sürümü kullanıyorsunuz.');
      console.log('==============================================\n');
      // Renderer'a bildirme - versiyonlar aynıysa güncelleme gerekmiyor
      return; // Kurulumu durdur
    }
    
    console.log('✅ Versiyonlar farklı, kurulum devam edebilir...');
    console.log('📅 İndirme zamanı:', new Date().toLocaleString('tr-TR'));
    console.log('📦 Güncelleme bilgileri:', JSON.stringify(info, null, 2));
    
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
    
    // Icon'u tekrar ayarla (güncelleme öncesi - görev çubuğu icon'u için)
    if (process.platform === 'win32') {
      app.setAppUserModelId('com.emekcafe.adisyon');
    }
    
    // Dialog kaldırıldı - artık modal kullanılıyor
    // Renderer process'te modal gösterilecek
  });
  
  autoUpdater.on('error', (error) => {
    console.error('\n❌ ========== GÜNCELLEME HATASI! ==========');
    console.error('❌ Hata mesajı:', error.message);
    console.error('❌ Hata tipi:', error.name);
    console.error('❌ Tam hata detayları:', error);
    console.error('📅 Hata zamanı:', new Date().toLocaleString('tr-TR'));
    console.error('==========================================\n');
    
    // Hatayı renderer'a da gönder
    if (mainWindow) {
      mainWindow.webContents.executeJavaScript(`console.error('❌ MAIN: AUTO-UPDATER HATASI! ${error.message || error.toString()}')`);
      mainWindow.webContents.executeJavaScript(`console.error('❌ MAIN: Hata detayları:', ${JSON.stringify(JSON.stringify(error, Object.getOwnPropertyNames(error), 2))})`);
    }
  });
}

app.on('window-all-closed', () => {
  // Global shortcut'ları temizle
  globalShortcut.unregisterAll();
  
  if (backendLoader && backendLoader.stopBackend) {
    backendLoader.stopBackend();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  // Global shortcut'ları temizle
  globalShortcut.unregisterAll();
  
  if (backendLoader && backendLoader.stopBackend) {
    backendLoader.stopBackend();
  }
});
