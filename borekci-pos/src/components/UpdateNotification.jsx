import React, { useState, useEffect } from 'react';

const UpdateNotification = () => {
  const [updateInfo, setUpdateInfo] = useState(null);
  const [downloadProgress, setDownloadProgress] = useState(null);

  useEffect(() => {
    const ipc = window.electron?.ipcRenderer;
    if (!ipc) return undefined;

    const currentVersion = String(window.electron?.getVersion?.() || '').replace(/^v/i, '').trim();
    const unsubs = [
      ipc.on('update-available', (_event, version) => setUpdateInfo({ status: 'available', version })),
      ipc.on('download-progress', (_event, progress) => setDownloadProgress(progress)),
      ipc.on('update-downloaded', (_event, version) => {
        if (String(version || '').replace(/^v/i, '').trim() === currentVersion) {
          setUpdateInfo(null);
          setDownloadProgress(null);
          return;
        }
        setUpdateInfo({ status: 'downloaded', version });
        setDownloadProgress(null);
      }),
      ipc.on('update-error', () => {
        setUpdateInfo(null);
        setDownloadProgress(null);
      }),
    ];
    return () => unsubs.forEach((u) => typeof u === 'function' && u());
  }, []);

  if (!updateInfo) return null;

  if (updateInfo.status === 'available' && downloadProgress) {
    const percent = Math.round(downloadProgress.percent || 0);
    const mb = (n) => ((n || 0) / 1024 / 1024).toFixed(1);
    return (
      <div className="fixed top-3 right-3 card px-4 py-3 z-50 w-[min(320px,calc(100vw-1.5rem))] border-blue-200 dark:border-blue-800">
        <div className="flex items-center gap-3">
          <div className="text-2xl animate-bounce">⬇️</div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm">Güncelleme indiriliyor</p>
            <p className="text-xs text-gray-500">Sürüm {updateInfo.version}</p>
            <div className="mt-2 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
              <div className="bg-blue-600 h-full transition-all duration-300" style={{ width: `${percent}%` }} />
            </div>
            <p className="text-[11px] mt-1 text-gray-500 tabular-nums">
              {percent}% · {mb(downloadProgress.transferred)}/{mb(downloadProgress.total)} MB
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (updateInfo.status === 'downloaded') {
    return (
      <div className="modal-backdrop z-[9999]">
        <div className="modal max-w-sm text-center">
          <div className="modal-body py-6">
            <div className="text-5xl mb-3">🚀</div>
            <h2 className="text-2xl font-bold mb-2">Güncelleme hazır</h2>
            <p className="text-gray-600 dark:text-gray-300">Yeni sürüm ({updateInfo.version}) indirildi.</p>
            <p className="text-sm text-gray-500 mt-1">Şimdi kurmak için uygulama yeniden başlatılır. Ertelerseniz kapatınca kurulur.</p>
          </div>
          <div className="modal-footer flex-col">
            <button type="button" onClick={() => window.electron?.ipcRenderer?.send('install-update')} className="btn btn-success btn-lg w-full">
              🚀 Şimdi yükle ve yeniden başlat
            </button>
            <button type="button" onClick={() => setUpdateInfo(null)} className="btn btn-secondary w-full">
              ⏳ Daha sonra
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default UpdateNotification;
