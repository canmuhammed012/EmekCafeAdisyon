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
  
  // Pencere boyutunu ekran boyutuna göre ayarla (90% kullan)
  const windowWidth = Math.min(1400, Math.floor(width * 0.9));
  const windowHeight = Math.min(900, Math.floor(height * 0.9));
  
  mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    minWidth: 800,
    minHeight: 600,
    frame: true, // Çerçeveyi göster (kapatma, küçültme butonları için)
    titleBarStyle: 'default', // Windows için varsayılan
    autoHideMenuBar: true, // Menü çubuğunu gizle
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
    // Production - DOSYADAN YÜKLE (HTTP değil!)
    showLoading();
    
    // Backend'i başlat (API için)
    setTimeout(() => {
      startBackend();
    }, 500);
    
    // Frontend'i dosyadan yükle (backend hazır olmasını bekleme)
    setTimeout(() => {
      loadFrontendFromFile();
    }, 2000);
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
  autoUpdater.checkForUpdatesAndNotify();
  
  autoUpdater.on('update-available', () => {
    console.log('🔄 Güncelleme mevcut');
  });
  
  autoUpdater.on('update-downloaded', () => {
    console.log('✅ Güncelleme indirildi, yeniden başlatılıyor...');
    autoUpdater.quitAndInstall();
  });
  
  autoUpdater.on('error', (error) => {
    console.error('❌ Güncelleme hatası:', error);
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
