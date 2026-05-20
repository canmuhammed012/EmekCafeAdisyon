import React, { useState, useEffect } from 'react';

const UpdateNotification = () => {
  const [updateInfo, setUpdateInfo] = useState(null);
  const [downloadProgress, setDownloadProgress] = useState(null);
  const [isElectron, setIsElectron] = useState(false);

  useEffect(() => {
    // Electron ortamında mıyız kontrol et
    const checkElectron = window.electron !== undefined;
    setIsElectron(checkElectron);

    if (!checkElectron) {
      console.log('📱 Tarayıcı modunda çalışıyor (Electron değil)');
      return;
    }

    console.log('🔍 AUTO-UPDATER: Renderer process dinleme başlatıldı');

    // Electron IPC event listener'ları
    const handleUpdateAvailable = (event, version) => {
      console.log('🎉 AUTO-UPDATER: Yeni güncelleme mevcut!', version);
      setUpdateInfo({ status: 'available', version });
    };

    const handleDownloadProgress = (event, progress) => {
      console.log('📥 AUTO-UPDATER: İndiriliyor...', progress);
      setDownloadProgress(progress);
    };

    const handleUpdateDownloaded = (event, version) => {
      console.log('✅ AUTO-UPDATER: Güncelleme indirildi!', version);
      
      // Versiyon kontrolü - mevcut versiyonla karşılaştır
      const currentVersion = window.electron?.getVersion?.() || '';
      const downloadedVersion = (version || '').replace(/^v/i, '').trim();
      const currentVersionClean = currentVersion.replace(/^v/i, '').trim();
      
      console.log('🔍 Versiyon karşılaştırması (UpdateNotification):');
      console.log('   Mevcut:', currentVersionClean);
      console.log('   İndirilen:', downloadedVersion);
      
      // Eğer versiyonlar aynıysa, kurulumu atla
      if (currentVersionClean === downloadedVersion) {
        console.log('⚠️ İndirilen versiyon mevcut versiyonla aynı! Kurulum atlanıyor...');
        setUpdateInfo(null); // Bildirimi kapat
        setDownloadProgress(null);
        return;
      }
      
      setUpdateInfo({ status: 'downloaded', version });
      setDownloadProgress(null);
    };

    // Event listener'ları ekle
    if (window.electron && window.electron.ipcRenderer) {
      window.electron.ipcRenderer.on('update-available', handleUpdateAvailable);
      window.electron.ipcRenderer.on('download-progress', handleDownloadProgress);
      window.electron.ipcRenderer.on('update-downloaded', handleUpdateDownloaded);

      // Console'a bilgi yazdır
      console.log('✅ AUTO-UPDATER: Event listenerlar eklendi');
      console.log('📦 Mevcut versiyon:', window.electron?.getVersion?.() || 'bilinmiyor');
    }

    // Cleanup
    return () => {
      if (window.electron && window.electron.ipcRenderer) {
        window.electron.ipcRenderer.removeAllListeners('update-available');
        window.electron.ipcRenderer.removeAllListeners('download-progress');
        window.electron.ipcRenderer.removeAllListeners('update-downloaded');
      }
    };
  }, []);

  // Electron değilse hiçbir şey gösterme
  if (!isElectron) {
    return null;
  }

  // Güncelleme mevcut - İndiriliyor
  if (updateInfo?.status === 'available' && downloadProgress) {
    return (
      <div className="fixed top-4 right-4 bg-blue-600 text-white px-6 py-4 rounded-lg shadow-2xl z-50 min-w-[300px]">
        <div className="flex items-center gap-3">
          <div className="animate-spin">⬇️</div>
          <div className="flex-1">
            <p className="font-bold">Güncelleme İndiriliyor</p>
            <p className="text-sm opacity-90">Versiyon: {updateInfo.version}</p>
            <div className="mt-2 bg-blue-800 rounded-full h-2 overflow-hidden">
              <div 
                className="bg-white h-full transition-all duration-300"
                style={{ width: `${downloadProgress.percent || 0}%` }}
              ></div>
            </div>
            <p className="text-xs mt-1 opacity-75">
              {Math.round(downloadProgress.percent || 0)}% - {(downloadProgress.transferred / 1024 / 1024).toFixed(1)}/{(downloadProgress.total / 1024 / 1024).toFixed(1)} MB
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Güncelleme indirildi - Modal göster
  if (updateInfo?.status === 'downloaded') {
    const handleInstallNow = () => {
      if (window.electron && window.electron.ipcRenderer) {
        window.electron.ipcRenderer.send('install-update');
      }
    };

    const handleInstallLater = () => {
      setUpdateInfo(null);
    };

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 text-center">
          <div className="mb-6">
            <div className="text-6xl mb-4">🚀</div>
            <h2 className="text-3xl font-bold text-gray-800 dark:text-white mb-4">
              Güncelleme Hazır
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-300 mb-2">
              Yeni sürüm ({updateInfo.version}) indirildi!
            </p>
            <p className="text-base text-gray-500 dark:text-gray-400">
              Uygulamayı yeniden başlatarak bu güncellemeyi hemen yükleyebilir veya daha sonra yüklemek üzere erteleyebilirsiniz.
            </p>
          </div>
          
          <div className="flex flex-col gap-3">
            <button
              onClick={handleInstallNow}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-6 rounded-lg transition-all duration-150 transform active:scale-95 text-lg flex items-center justify-center gap-2"
            >
              <span>🚀</span>
              <span>Güncellemeyi Şimdi Yükle</span>
            </button>
            <button
              onClick={handleInstallLater}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-4 px-6 rounded-lg transition-all duration-150 transform active:scale-95 text-lg flex items-center justify-center gap-2"
            >
              <span>⏳</span>
              <span>Daha Sonra Yükle</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Güncelleme kontrol ediliyor - sadece konsola yazdır, UI'da gösterme
  return null;
};

export default UpdateNotification;

