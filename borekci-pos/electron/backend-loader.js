// Backend'i Electron main process içinde çalıştır
const path = require('path');
const fs = require('fs');

let serverStarted = false;

function startBackend() {
  return new Promise((resolve, reject) => {
    try {
      console.log('\n=== BACKEND LOADER ===');
      
      // Electron require() otomatik olarak ASAR içinde arar
      // Relative path kullan (__dirname electron/ klasörü)
      const serverModulePath = path.join(__dirname, '..', 'server.js');
      console.log('Server module path:', serverModulePath);
      console.log('__dirname:', __dirname);
      
      // Veritabanı yolu - userData kullan (ASAR dışında)
      const { app } = require('electron');
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
        // Relative path ile require - Electron ASAR-aware
        require(serverModulePath);
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
