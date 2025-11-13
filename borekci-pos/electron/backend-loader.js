// Backend'i Electron main process içinde çalıştır
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let serverProcess = null;
let serverStarted = false;

function startBackend() {
  return new Promise((resolve, reject) => {
    try {
      console.log('\n=== BACKEND LOADER ===');
      
      const { app } = require('electron');
      
      // Veritabanı yolu - userData kullan (ASAR dışında)
      const userDataPath = app.getPath('userData');
      const dbPath = path.join(userDataPath, 'emekcafe.db');
      console.log('📁 Veritabanı konumu:');
      console.log('   UserData klasörü:', userDataPath);
      console.log('   Veritabanı dosyası:', dbPath);
      console.log('   Tam yol:', path.resolve(dbPath));
      
      // Server.js yolunu bul (ASAR içinde veya dışında)
      let serverPath;
      if (app.isPackaged) {
        // Production: ASAR unpack ile server.js ASAR dışında olmalı
        // Electron Builder, asarUnpack ile server.js'yi app.asar.unpacked/server.js'ye koyar
        const appPath = app.getAppPath();
        const unpackedPath = appPath.replace('app.asar', 'app.asar.unpacked');
        const serverPathUnpacked = path.join(unpackedPath, 'server.js');
        const serverPathInAsar = path.join(appPath, 'server.js');
        
        // Önce unpacked klasöründe ara (ASAR dışı - native modüller için gerekli)
        if (fs.existsSync(serverPathUnpacked)) {
          serverPath = serverPathUnpacked;
          console.log('📄 Server.js bulundu (ASAR unpacked):', serverPath);
        } else if (fs.existsSync(serverPathInAsar)) {
          serverPath = serverPathInAsar;
          console.log('📄 Server.js bulundu (ASAR içinde):', serverPath);
        } else {
          // Son çare: app path'inde ara
          serverPath = path.join(appPath, 'server.js');
          console.log('📄 Server.js yolu (varsayılan):', serverPath);
        }
      } else {
        // Development: direkt server.js
        serverPath = path.join(__dirname, '..', 'server.js');
        console.log('📄 Server.js yolu (development):', serverPath);
      }
      
      console.log('📄 Server.js tam yolu:', path.resolve(serverPath));
      console.log('📄 Server.js mevcut:', fs.existsSync(serverPath));
      
      // Environment variables
      const env = {
        ...process.env,
        NODE_ENV: 'production',
        PORT: '3000',
        DB_PATH: dbPath
      };
      
      // Node.js executable yolunu bul
      const nodeExecutable = process.execPath; // Electron'un kendi Node.js'i
      console.log('📦 Node.js executable:', nodeExecutable);
      
      // Server'ı ayrı bir process olarak başlat
      console.log('\n🚀 Server başlatılıyor...\n');
      
      try {
        serverProcess = spawn(nodeExecutable, [serverPath], {
          env: env,
          cwd: path.dirname(serverPath),
          stdio: ['ignore', 'pipe', 'pipe'], // stdout ve stderr'ı yakala
          shell: false
        });
        
        serverStarted = true;
        
        // Server çıktılarını logla
        serverProcess.stdout.on('data', (data) => {
          const output = data.toString();
          console.log('[SERVER]', output.trim());
        });
        
        serverProcess.stderr.on('data', (data) => {
          const output = data.toString();
          console.error('[SERVER ERROR]', output.trim());
        });
        
        serverProcess.on('error', (error) => {
          console.error('❌ Server process hatası:', error);
          serverStarted = false;
          reject(error);
        });
        
        serverProcess.on('exit', (code, signal) => {
          console.log(`⚠️ Server process sonlandı (code: ${code}, signal: ${signal})`);
          serverStarted = false;
        });
        
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
      } catch (spawnError) {
        console.error('❌ Server spawn hatası:', spawnError);
        console.error('Stack:', spawnError.stack);
        serverStarted = false;
        reject(spawnError);
      }
      
    } catch (error) {
      console.error('❌ Backend loader hatası:', error);
      reject(error);
    }
  });
}

function stopBackend() {
  if (serverProcess && serverStarted) {
    console.log('🛑 Backend kapatılıyor...');
    try {
      serverProcess.kill('SIGTERM');
      serverStarted = false;
      console.log('✓ Backend kapatıldı');
    } catch (error) {
      console.error('❌ Backend kapatma hatası:', error);
    }
  }
}

module.exports = { startBackend, stopBackend };
