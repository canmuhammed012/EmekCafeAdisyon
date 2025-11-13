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

  // Güncelleme indirildi - Yeniden başlatma gerekiyor
  if (updateInfo?.status === 'downloaded') {
    return (
      <div className="fixed top-4 right-4 bg-green-600 text-white px-6 py-4 rounded-lg shadow-2xl z-50 min-w-[300px]">
        <div className="flex items-center gap-3">
          <div className="text-2xl">✅</div>
          <div className="flex-1">
            <p className="font-bold">Güncelleme Hazır!</p>
            <p className="text-sm opacity-90">Versiyon: {updateInfo.version}</p>
            <p className="text-xs mt-1 opacity-75">
              Uygulamayı yeniden başlatın
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Güncelleme kontrol ediliyor - sadece konsola yazdır, UI'da gösterme
  return null;
};

export default UpdateNotification;

