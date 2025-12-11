// Backend'i Electron main process içinde çalıştır
const path = require('path');
const fs = require('fs');

let serverStarted = false;

function startBackend() {
  return new Promise((resolve, reject) => {
    try {
      console.log('\n=== BACKEND LOADER ===');
      
      // Electron require() otomatik olarak ASAR içinde arar
      // Production'da server.js ASAR dışında olmalı (asarUnpack ile)
      const { app } = require('electron');
      let serverModulePath;
      
      if (app.isPackaged) {
        // Production: server.js ASAR dışında (app.asar.unpacked klasöründe)
        // Electron Builder, asarUnpack ile belirtilen dosyaları app.asar.unpacked'a koyar
        const appPath = app.getAppPath(); // app.asar path'i
        const unpackedPath = appPath.replace('app.asar', 'app.asar.unpacked');
        serverModulePath = path.join(unpackedPath, 'server.js');
        
        // Alternatif path'ler de dene
        if (!fs.existsSync(serverModulePath)) {
          const altPath1 = path.join(process.resourcesPath, 'app.asar.unpacked', 'server.js');
          const altPath2 = path.join(process.resourcesPath, 'app', 'server.js');
          const altPath3 = path.join(process.resourcesPath, 'server.js');
          
          if (fs.existsSync(altPath1)) {
            serverModulePath = altPath1;
          } else if (fs.existsSync(altPath2)) {
            serverModulePath = altPath2;
          } else if (fs.existsSync(altPath3)) {
            serverModulePath = altPath3;
          }
        }
      } else {
        // Development: normal path
        serverModulePath = path.join(__dirname, '..', 'server.js');
      }
      
      console.log('Server module path:', serverModulePath);
      console.log('__dirname:', __dirname);
      console.log('App path:', app.isPackaged ? app.getAppPath() : 'development');
      console.log('Server file exists:', fs.existsSync(serverModulePath));
      
      // Veritabanı yolu - userData kullan (ASAR dışında)
      const userDataPath = app.getPath('userData');
      const dbPath = path.join(userDataPath, 'emekcafe.db');
      console.log('📁 Veritabanı konumu:');
      console.log('   UserData klasörü:', userDataPath);
      console.log('   Veritabanı dosyası:', dbPath);
      console.log('   Tam yol:', path.resolve(dbPath));
      
      // Environment variables
      process.env.NODE_ENV = 'production';
      process.env.PORT = '3000';
      process.env.DB_PATH = dbPath;
      
      // Working directory - userData kullan (ASAR dışında, yazılabilir)
      const workingDir = app.getPath('userData');
      process.chdir(workingDir);
      console.log('Working directory:', process.cwd());
      
      // Server'ı require et (Electron ASAR içinde otomatik arar)
      console.log('\nServer require ediliyor...\n');
      
      try {
        // Server dosyasının varlığını kontrol et
        if (!fs.existsSync(serverModulePath)) {
          throw new Error(`Server dosyası bulunamadı: ${serverModulePath}`);
        }
        
        // Absolute path kullan (require için)
        const absolutePath = path.resolve(serverModulePath);
        console.log('Requiring server from:', absolutePath);
        require(absolutePath);
        serverStarted = true;
        
        // Backend hazır olana kadar bekle (HTTP isteği ile kontrol et)
        const http = require('http');
        let checkCount = 0;
        const maxChecks = 50; // Maksimum 5 saniye (50 * 100ms)
        
        const checkBackend = setInterval(() => {
          checkCount++;
          const req = http.get('http://localhost:3000/api/health', { timeout: 200 }, (res) => {
            if (res.statusCode === 200) {
              // Backend hazır!
              clearInterval(checkBackend);
              console.log('✓ Backend hazır (API: http://localhost:3000)\n');
              resolve();
            }
          });
          req.on('error', () => {
            // Henüz hazır değil, tekrar dene
            if (checkCount >= maxChecks) {
              clearInterval(checkBackend);
              console.log('⚠ Backend başlatıldı (timeout - frontend devam edecek)\n');
              resolve(); // Timeout olsa bile resolve et, frontend çalışabilir
            }
          });
          req.on('timeout', () => {
            req.destroy();
          });
        }, 100); // Her 100ms'de bir kontrol et
      } catch (requireError) {
        console.error('Server require hatası:', requireError);
        console.error('Stack:', requireError.stack);
        reject(requireError);
      }
      
    } catch (error) {
      console.error('Backend loader hatası:', error);
      reject(error);
    }
  });
}

function stopBackend() {
  if (serverStarted) {
    console.log('Backend kapatılıyor...');
  }
}

module.exports = { startBackend, stopBackend };
