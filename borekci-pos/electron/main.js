const { app, BrowserWindow, ipcMain, screen, nativeTheme } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');

const APP_ID = 'com.emekcafe.adisyon';
const UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000; // 15 dakika (GitHub istek limitine takılmamak için)

if (process.platform === 'win32') {
  app.setAppUserModelId(APP_ID);
}

// Tek instance kontrolü
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

let mainWindow = null;
let backendLoader = null;

// ---------------------------------------------------------------------------
// Cihaz yapılandırması (server / client)
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------
function resolveIconPath() {
  const candidates = app.isPackaged
    ? [
        path.join(process.resourcesPath, 'logo.ico'),
        path.join(process.resourcesPath, 'public', 'logo.ico'),
        path.join(app.getAppPath(), 'public', 'logo.ico'),
        path.join(process.resourcesPath, 'logo.png'),
      ]
    : [path.join(__dirname, '..', 'public', 'logo.ico'), path.join(__dirname, '..', 'public', 'logo.png')];
  return candidates.find((p) => fs.existsSync(p)) || undefined;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

// ---------------------------------------------------------------------------
// Pencere
// ---------------------------------------------------------------------------
function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  // Küçük ekranlarda (ör. 1024x600, 1366x768) çalışma alanının tamamına yakınını kullan
  const windowWidth = Math.min(1920, Math.max(800, Math.floor(width * 0.96)));
  const windowHeight = Math.min(1080, Math.max(560, Math.floor(height * 0.95)));
  const minWidth = Math.min(800, width);
  const minHeight = Math.min(560, height);

  const iconPath = resolveIconPath();
  const darkMode = readDeviceConfig().darkMode === true;

  mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    minWidth,
    minHeight,
    autoHideMenuBar: true,
    icon: iconPath,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      spellcheck: false,
    },
    show: false,
    backgroundColor: darkMode ? '#111827' : '#f3f4f6',
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.setMenu(null);
  if (width <= 1366) {
    mainWindow.maximize();
  }

  mainWindow.once('ready-to-show', () => {
    if (process.platform === 'win32' && iconPath) mainWindow.setIcon(iconPath);
    mainWindow.show();
  });

  // Uygulama içinde DevTools: F12 veya Ctrl+Shift+I (yalnızca bu pencerede, sistem geneli değil)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if ((input.control && input.shift && input.key.toLowerCase() === 'i') || input.key === 'F12') {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  // Dış bağlantıların uygulama içinde açılmasını engelle
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = url.startsWith('file://') || url.startsWith('http://localhost:5173');
    if (!allowed) event.preventDefault();
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    loadFrontendFromFile();

    const deviceConfig = readDeviceConfig();
    if (deviceConfig.role === 'client') {
      console.log('📱 İstemci (garson) modu — yerel backend başlatılmıyor');
    } else {
      process.env.PRIMARY_SERVER = 'true';
      startBackend().catch((err) => console.error('Backend başlatma hatası:', err));
    }

    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
      console.error('❌ Sayfa yükleme hatası:', errorCode, errorDescription, validatedURL);
    });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function startBackend() {
  try {
    backendLoader = require('./backend-loader');
    await backendLoader.startBackend();
    console.log('✓ Backend başlatıldı (API: http://localhost:3000)');
  } catch (err) {
    console.error('✗ Backend başlatılamadı:', err);
  }
}

function loadFrontendFromFile(attempt = 1) {
  const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
  mainWindow.loadFile(indexPath).catch((err) => {
    console.error(`✗ Frontend yükleme hatası (deneme ${attempt}):`, err.message);
    if (attempt < 5 && mainWindow && !mainWindow.isDestroyed()) {
      // Geçici dosya kilidi vb. durumlar için kısa aralıkla yeniden dene
      setTimeout(() => loadFrontendFromFile(attempt + 1), 800 * attempt);
      return;
    }
    showError('Yükleme Hatası', `Arayüz yüklenemedi:
${err.message}

Dosya: ${indexPath}`);
  });
}

function showError(title, message) {
  const errorHTML = `<!DOCTYPE html>
<html lang="tr"><head><meta charset="UTF-8">
<style>
  body{margin:0;padding:40px;font-family:'Segoe UI',Arial,sans-serif;background:#f5f5f5}
  .box{max-width:600px;margin:0 auto;background:#fff;padding:30px;border-radius:12px;box-shadow:0 2px 10px rgba(0,0,0,.1)}
  h1{color:#e74c3c;margin:0 0 20px;font-size:22px}
  p{color:#333;line-height:1.6;white-space:pre-wrap}
  .note{margin-top:20px;padding:15px;background:#fff3cd;border-left:4px solid #ffc107;color:#856404;font-size:13px}
</style></head>
<body><div class="box"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>
<div class="note">Detaylı kayıt için F12 ile geliştirici konsolunu açabilirsiniz.</div></div></body></html>`;
  const errorPath = path.join(app.getPath('temp'), 'emekcafe-error.html');
  fs.writeFileSync(errorPath, errorHTML, 'utf-8');
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.loadFile(errorPath);
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------
ipcMain.handle('get-device-role', () => readDeviceConfig().role || 'server');

ipcMain.handle('set-device-role', (_event, role) => {
  const validRole = role === 'client' ? 'client' : 'server';
  writeDeviceConfig({ ...readDeviceConfig(), role: validRole });
  console.log(`📱 Cihaz rolü kaydedildi: ${validRole}`);
  return { ok: true, restartRequired: true };
});

ipcMain.handle('relaunch-app', () => {
  app.relaunch();
  app.exit(0);
});

ipcMain.on('set-background-color', (_event, color) => {
  if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) return;
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setBackgroundColor(color);
  const isDark = color.toLowerCase() === '#111827';
  nativeTheme.themeSource = isDark ? 'dark' : 'light';
  try {
    writeDeviceConfig({ ...readDeviceConfig(), darkMode: isDark });
  } catch {
    /* yoksay */
  }
});

function loadWinRawPrint() {
  const candidates = [path.join(__dirname, '..', 'windows-raw-print.js'), path.join(process.resourcesPath || '', 'windows-raw-print.js')];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return require(candidate);
  }
  throw new Error('windows-raw-print modülü bulunamadı');
}

ipcMain.handle('list-local-printers', () => {
  if (process.platform !== 'win32') return { printers: [] };
  try {
    return { printers: loadWinRawPrint().listWindowsPrinters() };
  } catch (error) {
    console.error('Yerel yazıcı listesi:', error);
    return { printers: [], error: error.message };
  }
});

ipcMain.handle('print-receipt-local', (_event, payload) => {
  if (process.platform !== 'win32') {
    return { success: false, error: "Yerel yazdırma yalnızca Windows'ta desteklenir" };
  }
  try {
    const { receipt, printerName } = payload || {};
    if (!receipt || !Array.isArray(receipt.orders)) return { success: false, error: 'Geçersiz fiş verisi' };
    const winRawPrint = loadWinRawPrint();
    const printers = winRawPrint.listWindowsPrinters();
    const selected = winRawPrint.matchPrinter(printers, printerName || null);
    if (!selected) {
      return { success: false, error: 'Bu cihazda termal yazıcı bulunamadı', availablePrinters: printers.map((p) => p.name) };
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
    return { success: true, message: `Fiş yazdırıldı (${selected.name})`, printer: selected.name };
  } catch (error) {
    console.error('Yerel yazdırma hatası:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.on('get-version', (event) => {
  event.returnValue = app.getVersion();
});

ipcMain.on('install-update', () => {
  autoUpdater.quitAndInstall(false, true);
});

// ---------------------------------------------------------------------------
// Uygulama yaşam döngüsü
// ---------------------------------------------------------------------------
app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// ---------------------------------------------------------------------------
// Otomatik güncelleme (yalnızca paketli sürümde)
// ---------------------------------------------------------------------------
if (app.isPackaged) {
  autoUpdater.setFeedURL({ provider: 'github', owner: 'canmuhammed012', repo: 'EmekCafeAdisyon' });
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  const normalize = (v) => String(v || '').replace(/^v/i, '').trim();

  const checkForUpdates = () => {
    autoUpdater.checkForUpdates().catch((err) => console.error('❌ Güncelleme kontrol hatası:', err.message));
  };

  setTimeout(checkForUpdates, 5000);
  setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL_MS);

  autoUpdater.on('update-available', (info) => {
    if (normalize(info.version) === normalize(app.getVersion())) return;
    console.log('🎉 Yeni güncelleme mevcut:', info.version);
    sendToRenderer('update-available', info.version);
  });

  autoUpdater.on('update-not-available', () => {
    console.log('✅ Güncelleme yok, sürüm güncel:', app.getVersion());
  });

  autoUpdater.on('download-progress', (progressObj) => {
    sendToRenderer('download-progress', progressObj);
  });

  autoUpdater.on('update-downloaded', (info) => {
    if (normalize(info.version) === normalize(app.getVersion())) return;
    console.log('🎊 Güncelleme indirildi:', info.version);
    sendToRenderer('update-downloaded', info.version);
  });

  autoUpdater.on('error', (error) => {
    console.error('❌ Güncelleme hatası:', error?.message || error);
    sendToRenderer('update-error', error?.message || String(error));
  });
}

app.on('window-all-closed', () => {
  if (backendLoader && backendLoader.stopBackend) backendLoader.stopBackend();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (backendLoader && backendLoader.stopBackend) backendLoader.stopBackend();
});
