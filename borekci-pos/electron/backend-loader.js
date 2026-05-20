// Backend'i ayrı Node.js process olarak çalıştır
const path = require('path');
const fs = require('fs');
const { fork } = require('child_process');

let serverProcess = null;
let serverStarted = false;

function startBackend() {
  return new Promise((resolve, reject) => {
    try {
      console.log('\n=== BACKEND LOADER v3 (fork) ===');
      
      const { app } = require('electron');
      
      console.log('📍 Paths:');
      console.log('   __dirname:', __dirname);
      console.log('   app.getAppPath():', app.getAppPath());
      console.log('   process.resourcesPath:', process.resourcesPath);
      console.log('   app.isPackaged:', app.isPackaged);
      
      // Veritabanı yolu
      const userDataPath = app.getPath('userData');
      const dbPath = path.join(userDataPath, 'emekcafe.db');
      console.log('\n📁 Veritabanı:', dbPath);
      
      // Server.js path'ini belirle
      let serverPath;
      let nodePath;
      
      if (app.isPackaged) {
        // Production: server.js extraResources içinde
        serverPath = path.join(process.resourcesPath, 'server.js');
        
        // Native modüller için path'ler
        const appPath = app.getAppPath();
        const unpackedPath = appPath.replace('app.asar', 'app.asar.unpacked');
        const nodeModulesPath = path.join(appPath, 'node_modules');
        const unpackedNodeModulesPath = path.join(unpackedPath, 'node_modules');
        
        // NODE_PATH için (path.delimiter = Windows'ta ";", Unix'te ":")
        nodePath = [unpackedNodeModulesPath, nodeModulesPath].join(path.delimiter);
        
        console.log('\n📂 Production paths:');
        console.log('   Server:', serverPath);
        console.log('   Server mevcut:', fs.existsSync(serverPath));
        console.log('   NODE_PATH:', nodePath);
        
      } else {
        // Development
        serverPath = path.join(__dirname, '..', 'server.js');
        nodePath = path.join(__dirname, '..', 'node_modules');
        
        console.log('\n📂 Development paths:');
        console.log('   Server:', serverPath);
      }
      
      // Server dosyası var mı kontrol et
      if (!fs.existsSync(serverPath)) {
        const error = new Error(`Server dosyası bulunamadı: ${serverPath}`);
        console.error('❌', error.message);
        reject(error);
        return;
      }
      
      console.log('\n🚀 Server fork ediliyor...');
      
      // Server'ı ayrı process olarak başlat
      const isPrimaryServer = process.env.PRIMARY_SERVER === 'true';

      serverProcess = fork(serverPath, [], {
        env: {
          ...process.env,
          NODE_ENV: 'production',
          PORT: '3000',
          DB_PATH: dbPath,
          NODE_PATH: nodePath,
          PRIMARY_SERVER: isPrimaryServer ? 'true' : 'false',
        },
        stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
        // ASAR unpacked klasörünü cwd olarak kullan
        cwd: app.isPackaged 
          ? app.getAppPath().replace('app.asar', 'app.asar.unpacked')
          : path.dirname(serverPath)
      });
      
      // Process stdout'u logla
      serverProcess.stdout.on('data', (data) => {
        console.log('[SERVER]', data.toString().trim());
      });
      
      // Process stderr'ı logla
      serverProcess.stderr.on('data', (data) => {
        console.error('[SERVER ERROR]', data.toString().trim());
      });
      
      // Process hataları
      serverProcess.on('error', (error) => {
        console.error('❌ Server process hatası:', error);
        reject(error);
      });
      
      // Process kapandığında
      serverProcess.on('exit', (code, signal) => {
        console.log(`🛑 Server process kapandı (code: ${code}, signal: ${signal})`);
        serverStarted = false;
        serverProcess = null;
      });
      
      serverStarted = true;
      console.log('✅ Server process başlatıldı (PID:', serverProcess.pid, ')');
      
      // Backend hazır olana kadar bekle
      const http = require('http');
      let checkCount = 0;
      const maxChecks = 50;
      
      console.log('\n🔍 Backend health check...');
      
      const checkBackend = setInterval(() => {
        checkCount++;
        const req = http.get('http://localhost:3000/api/health', { timeout: 200 }, (res) => {
          if (res.statusCode === 200) {
            clearInterval(checkBackend);
            console.log('✅ Backend hazır! (http://localhost:3000)');
            console.log('=== BACKEND LOADER TAMAMLANDI ===\n');
            resolve();
          }
        });
        req.on('error', () => {
          if (checkCount >= maxChecks) {
            clearInterval(checkBackend);
            console.log('⚠️ Health check timeout (5s) - ama process çalışıyor');
            console.log('=== BACKEND LOADER TAMAMLANDI (timeout) ===\n');
            resolve();
          }
        });
        req.on('timeout', () => req.destroy());
      }, 100);
      
    } catch (error) {
      console.error('\n❌ BACKEND LOADER HATASI!');
      console.error('   Mesaj:', error.message);
      console.error('   Stack:', error.stack);
      reject(error);
    }
  });
}

function stopBackend() {
  if (serverProcess) {
    console.log('🛑 Server process durduruluyor...');
    serverProcess.kill('SIGTERM');
    serverProcess = null;
    serverStarted = false;
  }
}

module.exports = { startBackend, stopBackend };
