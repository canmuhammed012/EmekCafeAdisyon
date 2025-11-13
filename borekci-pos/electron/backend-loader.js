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
      console.log('Server path kontrol:', fs.existsSync(serverModulePath) ? '✓ Mevcut' : '✗ Bulunamadı');
      
      try {
        // Relative path ile require - Electron ASAR-aware
        console.log('Require başlatılıyor...');
        require(serverModulePath);
        console.log('✓ Server.js require edildi');
        serverStarted = true;
        
        // Kısa bir bekleme (server başlatma için)
        setTimeout(() => {
          // Backend hazır olana kadar bekle (HTTP isteği ile kontrol et)
          const http = require('http');
          let checkCount = 0;
          const maxChecks = 100; // Maksimum 10 saniye (100 * 100ms)
          
          console.log('Backend hazır olana kadar bekleniyor...');
          
          const checkBackend = setInterval(() => {
            checkCount++;
            if (checkCount % 10 === 0) {
              console.log(`Backend kontrolü: ${checkCount}/${maxChecks}`);
            }
            
            const req = http.get('http://localhost:3000/api/health', { timeout: 500 }, (res) => {
              if (res.statusCode === 200) {
                // Backend hazır!
                clearInterval(checkBackend);
                console.log('✓ Backend hazır (API: http://localhost:3000)\n');
                resolve();
              }
            });
            req.on('error', (err) => {
              // Henüz hazır değil, tekrar dene
              if (checkCount >= maxChecks) {
                clearInterval(checkBackend);
                console.error('❌ Backend başlatılamadı (timeout)');
                console.error('Hata:', err.message);
                console.log('⚠ Frontend devam edecek ama backend çalışmayabilir\n');
                resolve(); // Timeout olsa bile resolve et, frontend çalışabilir
              }
            });
            req.on('timeout', () => {
              req.destroy();
            });
          }, 100); // Her 100ms'de bir kontrol et
        }, 500); // 500ms bekle (server başlatma için)
      } catch (requireError) {
        console.error('❌ Server require hatası:', requireError);
        console.error('Hata mesajı:', requireError.message);
        console.error('Stack:', requireError.stack);
        // Hata olsa bile resolve et, frontend yüklenebilir
        console.log('⚠ Frontend devam edecek ama backend çalışmayabilir\n');
        resolve(); // reject yerine resolve - frontend yüklenebilsin
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
