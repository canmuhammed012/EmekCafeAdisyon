import React, { useState, useEffect, useCallback } from 'react';
import { getSettings, updateSetting, getWindowsPrinters, printTestReceipt, getServerInfo, getErrorMessage } from '../../services/api';
import GoalHistory from './GoalHistory';

const SettingsTab = ({ showAlert }) => {
  const [settings, setSettings] = useState({ restaurantName: '', printerName: '' });
  const [serverPrinters, setServerPrinters] = useState([]);
  const [localPrinters, setLocalPrinters] = useState([]);
  const [serverInfo, setServerInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, info] = await Promise.all([getSettings(), getServerInfo().catch(() => ({ data: null }))]);
      setSettings({ restaurantName: s.data?.restaurantName || '', printerName: s.data?.printerName || '' });
      setServerInfo(info.data);
    } catch (err) {
      showAlert('Hata', getErrorMessage(err, 'Ayarlar yüklenemedi'), 'error');
    } finally {
      setLoading(false);
    }
    getWindowsPrinters()
      .then((r) => setServerPrinters(r.data?.printers || []))
      .catch(() => setServerPrinters([]));
    if (window.electron?.listLocalPrinters) {
      window.electron
        .listLocalPrinters()
        .then((r) => setLocalPrinters(r?.printers || []))
        .catch(() => setLocalPrinters([]));
    }
  }, [showAlert]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (key, value) => {
    setBusy(key);
    try {
      await updateSetting(key, value);
      if (key === 'printerName') localStorage.setItem('printerName', value);
      showAlert('Kaydedildi', 'Ayar güncellendi.', 'success');
    } catch (err) {
      showAlert('Hata', getErrorMessage(err, 'Ayar kaydedilemedi'), 'error');
    } finally {
      setBusy('');
    }
  };

  const testPrint = async () => {
    setBusy('test');
    try {
      const response = await printTestReceipt(settings.printerName || null);
      showAlert('Test fişi', response.data?.message || 'Test fişi gönderildi.', 'success');
    } catch (err) {
      const data = err.response?.data;
      const extra = data?.availablePrinters?.length ? `\n\nBulunan yazıcılar: ${data.availablePrinters.join(', ')}` : '';
      showAlert('Yazdırılamadı', getErrorMessage(err, 'Test fişi yazdırılamadı') + extra, 'error');
    } finally {
      setBusy('');
    }
  };

  if (loading) return <p className="text-center py-10 text-gray-500">Yükleniyor…</p>;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* İşletme */}
      <section className="card p-4 space-y-3">
        <h3 className="font-bold">İşletme</h3>
        <div>
          <label className="label" htmlFor="rest-name">
            Fişte görünen ad
          </label>
          <div className="flex gap-2">
            <input id="rest-name" type="text" className="input" value={settings.restaurantName} onChange={(e) => setSettings({ ...settings, restaurantName: e.target.value })} maxLength={60} />
            <button type="button" className="btn btn-primary" onClick={() => save('restaurantName', settings.restaurantName.trim() || 'Emek Cafe Adisyon')} disabled={busy === 'restaurantName'}>
              Kaydet
            </button>
          </div>
        </div>
      </section>

      {/* Ağ */}
      <section className="card p-4 space-y-2">
        <h3 className="font-bold">Ağ bilgisi</h3>
        {serverInfo ? (
          <>
            <p className="text-sm text-gray-600 dark:text-gray-300">Garson cihazları bu adrese bağlanır:</p>
            <div className="flex items-center gap-2">
              <code className="rounded-lg bg-gray-100 dark:bg-gray-900 px-3 py-1.5 font-mono text-base select-all">{serverInfo.ip}</code>
              <span className="text-xs text-gray-500">port {serverInfo.port}</span>
              <span className={`badge ${serverInfo.isPrimaryServer ? 'badge-green' : 'badge-amber'}`}>{serverInfo.isPrimaryServer ? 'Kasa sunucusu' : 'İstemci'}</span>
            </div>
            <p className="text-xs text-gray-500">Garson cihazlarında IP genellikle otomatik bulunur; bulunamazsa giriş ekranında "IP gir" ile bu adresi yazın. Kasa bilgisayarının IP'si değişirse (modem yeniden başlatma) garsonlar tekrar otomatik arar.</p>
          </>
        ) : (
          <p className="text-sm text-gray-500">Sunucu bilgisi alınamadı.</p>
        )}
      </section>

      {/* Günlük görev geçmişi */}
      <GoalHistory showAlert={showAlert} />

      {/* Yazıcı */}
      <section className="card p-4 space-y-3 lg:col-span-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-bold">Termal fiş yazıcısı</h3>
          <button type="button" className="btn btn-secondary btn-sm" onClick={load}>
            ↻ Yenile
          </button>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Fiş, önce kasa bilgisayarındaki yazıcıdan çıkar; kasada termal yazıcı yoksa istek yazıcının bağlı olduğu cihaza (örn. garson tableti) iletilir.
          Yazıcı adı belirlenmezse "XP-80 / XP-90 / Xprinter / POS-80" gibi adlar otomatik tanınır. Ofis yazıcılarına fiş gönderilmez.
        </p>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] items-end">
          <div>
            <label className="label" htmlFor="printer-name">
              Yazıcı adı (Windows'taki adı)
            </label>
            <input id="printer-name" list="printer-options" type="text" className="input" value={settings.printerName} onChange={(e) => setSettings({ ...settings, printerName: e.target.value })} placeholder="Boş bırak: otomatik tanı" />
            <datalist id="printer-options">
              {[...new Set([...serverPrinters, ...localPrinters].map((p) => p.name))].map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn btn-primary" onClick={() => save('printerName', settings.printerName.trim())} disabled={busy === 'printerName'}>
              Kaydet
            </button>
            <button type="button" className="btn btn-secondary" onClick={testPrint} disabled={busy === 'test'}>
              🖨️ Test fişi
            </button>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2 text-sm">
          <div>
            <p className="label">Kasa bilgisayarındaki yazıcılar</p>
            {serverPrinters.length === 0 ? (
              <p className="text-gray-500">Yazıcı bulunamadı</p>
            ) : (
              <ul className="space-y-1">
                {serverPrinters.map((p) => (
                  <li key={p.name} className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 dark:bg-gray-900/40 px-2.5 py-1.5">
                    <span className="truncate">{p.name}</span>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSettings({ ...settings, printerName: p.name })}>
                      Seç
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {window.electron && (
            <div>
              <p className="label">Bu cihazdaki yazıcılar</p>
              {localPrinters.length === 0 ? (
                <p className="text-gray-500">Yazıcı bulunamadı</p>
              ) : (
                <ul className="space-y-1">
                  {localPrinters.map((p) => (
                    <li key={p.name} className="rounded-lg bg-gray-50 dark:bg-gray-900/40 px-2.5 py-1.5 truncate">
                      {p.name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default SettingsTab;
