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
      const dbPath = path.join(app.getPath('userData'), 'emekcafe.db');
      console.log('📁 Veritabanı ayarlanıyor:', dbPath);
      
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
        
        // Biraz bekle, sonra resolve et
        setTimeout(() => {
          console.log('✓ Backend loader tamamlandı\n');
          resolve();
        }, 1000);
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
