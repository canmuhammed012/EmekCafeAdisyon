import React, { useState, useEffect, useCallback, useRef } from 'react';
import { login, getErrorMessage, SERVER_PORT, isBrowserMode } from '../services/api';
import { resetSocket } from '../services/socket';
import Footer from '../components/Footer';

const SERVER_INFO_TIMEOUT = 3000;
const IPV4_RE = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

async function fetchServerInfo(host, timeout = SERVER_INFO_TIMEOUT) {
  const base = `http://${host || 'localhost'}:${SERVER_PORT}`;
  const response = await fetch(`${base}/api/server/info`, { signal: AbortSignal.timeout(timeout) });
  if (!response.ok) throw new Error('Sunucu bilgisi alınamadı');
  return response.json();
}

/** WebRTC ile cihazın yerel IP'sini bul (internet gerekmez) */
function getLocalIP() {
  return new Promise((resolve) => {
    const RTC = window.RTCPeerConnection || window.webkitRTCPeerConnection;
    if (!RTC) return resolve(null);
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      try {
        pc.close();
      } catch {
        /* yoksay */
      }
      resolve(value);
    };
    const pc = new RTC({ iceServers: [] });
    pc.createDataChannel('');
    pc.onicecandidate = (event) => {
      const match = event.candidate?.candidate?.match(/(\d{1,3}(\.\d{1,3}){3})/);
      const ip = match?.[1];
      if (ip && (ip.startsWith('192.168.') || ip.startsWith('10.') || /^172\.(1[6-9]|2\d|3[01])\./.test(ip))) finish(ip);
    };
    pc.onicegatheringstatechange = () => {
      if (pc.iceGatheringState === 'complete') finish(null);
    };
    pc.createOffer()
      .then((offer) => pc.setLocalDescription(offer))
      .catch(() => finish(null));
    setTimeout(() => finish(null), 2000);
  });
}

/** Aynı ağdaki birincil (kasa) sunucuyu tara */
async function findAdminServer(onProgress) {
  const myIP = await getLocalIP();
  if (!myIP) return null;
  const subnet = myIP.split('.').slice(0, 3).join('.');
  const test = async (ip) => {
    try {
      const info = await fetchServerInfo(ip, 800);
      return info.isPrimaryServer ? ip : null;
    } catch {
      return null;
    }
  };
  const batchSize = 25;
  for (let start = 1; start <= 254; start += batchSize) {
    onProgress?.(Math.round((start / 254) * 100));
    const ips = [];
    for (let i = start; i < start + batchSize && i <= 254; i++) {
      const ip = `${subnet}.${i}`;
      if (ip !== myIP) ips.push(ip);
    }
    const results = await Promise.all(ips.map(test));
    const found = results.find(Boolean);
    if (found) return found;
  }
  return null;
}

const Login = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [serverIP, setServerIP] = useState(localStorage.getItem('serverIP') || '');
  const [manualIP, setManualIP] = useState(localStorage.getItem('serverIP') || '');
  const [editingIP, setEditingIP] = useState(false);
  const [deviceRole, setDeviceRole] = useState(localStorage.getItem('deviceRole') || 'server');
  const [roleChanged, setRoleChanged] = useState(false);
  const [lowPerf, setLowPerf] = useState(() => localStorage.getItem('lowPerformance') === 'true');
  const [perfChanged, setPerfChanged] = useState(false);

  const applyLowPerf = async (enabled) => {
    setLowPerf(enabled);
    localStorage.setItem('lowPerformance', String(enabled));
    document.documentElement.classList.toggle('reduce-motion', enabled);
    if (window.electron?.setPerformanceMode) {
      await window.electron.setPerformanceMode(enabled);
      setPerfChanged(true);
    }
  };
  const [serverStatus, setServerStatus] = useState({ state: 'idle', message: '' }); // idle | searching | ok | error
  const [scanProgress, setScanProgress] = useState(0);
  const [deviceIP, setDeviceIP] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const busyRef = useRef(false);

  const version = window.electron?.getVersion?.() || '';

  useEffect(() => {
    (async () => {
      if (window.electron?.getDeviceRole) {
        try {
          const role = await window.electron.getDeviceRole();
          setDeviceRole(role);
          localStorage.setItem('deviceRole', role);
        } catch {
          /* yoksay */
        }
      }
    })();
  }, []);

  const saveServerIP = (ip) => {
    if (ip) localStorage.setItem('serverIP', ip);
    else localStorage.removeItem('serverIP');
    setServerIP(ip);
    setManualIP(ip);
  };

  /** Kasa sunucusunu bul: önce localhost, sonra kayıtlı IP, sonra ağ taraması */
  const resolveServer = useCallback(async () => {
    if (busyRef.current) return null;
    busyRef.current = true;
    setServerStatus({ state: 'searching', message: 'Kasa sunucusu aranıyor…' });
    setScanProgress(0);
    try {
      // Telefon/tablet tarayıcısından http://<kasa-ip>:3000 ile açıldı: sunucu bu adres
      if (isBrowserMode()) {
        try {
          const response = await fetch(`${window.location.origin}/api/server/info`, { signal: AbortSignal.timeout(SERVER_INFO_TIMEOUT) });
          const info = await response.json();
          setServerStatus({ state: 'ok', message: `Kasa sunucusuna bağlı (${info.ip || window.location.hostname})` });
          return window.location.hostname;
        } catch {
          setServerStatus({ state: 'error', message: 'Kasa sunucusuna ulaşılamadı. Kasa bilgisayarının açık olduğundan emin olun.' });
          return null;
        }
      }
      if (deviceRole === 'server') {
        try {
          const info = await fetchServerInfo(null);
          if (info.isPrimaryServer) {
            setDeviceIP(info.ip);
            saveServerIP('');
            setServerStatus({ state: 'ok', message: `Bu cihaz kasa sunucusu (${info.ip})` });
            return '';
          }
        } catch {
          /* yerel sunucu yok */
        }
      }

      const saved = localStorage.getItem('serverIP');
      if (saved) {
        try {
          const info = await fetchServerInfo(saved);
          if (info.isPrimaryServer) {
            saveServerIP(saved);
            setServerStatus({ state: 'ok', message: `Kasa sunucusuna bağlı: ${saved}` });
            return saved;
          }
        } catch {
          /* kayıtlı IP artık geçerli değil */
        }
      }

      const found = await findAdminServer(setScanProgress);
      if (found) {
        saveServerIP(found);
        setServerStatus({ state: 'ok', message: `Kasa sunucusu bulundu: ${found}` });
        return found;
      }

      const ip = await getLocalIP();
      if (ip) setDeviceIP(ip);
      setServerStatus({
        state: 'error',
        message:
          deviceRole === 'server'
            ? 'Yerel sunucu çalışmıyor. Uygulamayı yeniden başlatın veya bu cihazı "Garson" olarak ayarlayın.'
            : 'Kasa sunucusu bulunamadı. Aynı Wi‑Fi ağında olduğunuzdan emin olun veya IP adresini elle girin.',
      });
      return null;
    } finally {
      busyRef.current = false;
    }
  }, [deviceRole]);

  useEffect(() => {
    resolveServer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceRole]);

  const applyDeviceRole = async (role) => {
    if (role === deviceRole) return;
    setDeviceRole(role);
    localStorage.setItem('deviceRole', role);
    if (window.electron?.setDeviceRole) {
      await window.electron.setDeviceRole(role);
      setRoleChanged(true);
    }
  };

  const applyManualIP = async () => {
    const ip = manualIP.trim();
    if (!IPV4_RE.test(ip)) {
      setError('Geçerli bir IP adresi girin (örn. 192.168.1.100)');
      return;
    }
    setError('');
    setServerStatus({ state: 'searching', message: `${ip} kontrol ediliyor…` });
    try {
      const info = await fetchServerInfo(ip);
      if (!info.isPrimaryServer) {
        setServerStatus({ state: 'error', message: `${ip} kasa sunucusu değil (garson cihazı olabilir).` });
        return;
      }
      saveServerIP(ip);
      setEditingIP(false);
      setServerStatus({ state: 'ok', message: `Kasa sunucusuna bağlı: ${ip}` });
    } catch {
      setServerStatus({ state: 'error', message: `${ip}:${SERVER_PORT} adresine ulaşılamadı.` });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (serverStatus.state !== 'ok') {
        const resolved = await resolveServer();
        if (resolved === null) {
          setLoading(false);
          return;
        }
      }
      resetSocket();
      const response = await login({ username: username.trim(), password });
      onLogin(response.data);
    } catch (err) {
      setError(getErrorMessage(err, 'Giriş başarısız'));
    } finally {
      setLoading(false);
    }
  };

  const statusColor = {
    ok: 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-900/30 dark:border-emerald-800 dark:text-emerald-200',
    error: 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-900/30 dark:border-amber-800 dark:text-amber-200',
    searching: 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-200',
    idle: 'bg-gray-50 border-gray-200 text-gray-700 dark:bg-gray-700/40 dark:border-gray-600 dark:text-gray-200',
  }[serverStatus.state];

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-700 dark:from-gray-950 dark:via-slate-900 dark:to-indigo-950">
      <div className="flex-1 flex items-center justify-center p-3 sm:p-6">
        <div className="card w-full max-w-md p-5 sm:p-7 shadow-2xl">
          <div className="flex flex-col items-center mb-5">
            <img src="./logo.png" alt="Emek Cafe" className="h-16 sm:h-20 w-auto object-contain mb-2" onError={(e) => (e.currentTarget.style.display = 'none')} />
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Emek Cafe Adisyon</h1>
            {version && <p className="text-xs text-gray-400 mt-0.5">v{version}</p>}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Cihaz rolü (yalnızca masaüstü uygulamasında) */}
            {!isBrowserMode() && (
            <div>
              <span className="label">Bu cihazın görevi</span>
              <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-gray-100 dark:bg-gray-900">
                {[
                  { value: 'server', icon: '🖥️', label: 'Kasa / Yönetici', hint: 'Sunucu bu cihazda' },
                  { value: 'client', icon: '📱', label: 'Garson', hint: 'Kasaya bağlanır' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => applyDeviceRole(opt.value)}
                    className={`rounded-lg px-2 py-2 text-left transition ${
                      deviceRole === opt.value ? 'bg-white dark:bg-gray-700 shadow-sm ring-1 ring-blue-500' : 'hover:bg-white/60 dark:hover:bg-gray-800'
                    }`}
                  >
                    <div className="text-sm font-semibold flex items-center gap-1.5">
                      <span>{opt.icon}</span>
                      <span className="truncate">{opt.label}</span>
                    </div>
                    <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{opt.hint}</div>
                  </button>
                ))}
              </div>
              {roleChanged && (
                <div className="mt-2 flex items-center justify-between gap-2 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                  <span>Rol değişikliği için uygulamayı yeniden başlatın.</span>
                  {window.electron?.relaunchApp && (
                    <button type="button" onClick={() => window.electron.relaunchApp()} className="btn btn-sm btn-warning">
                      Yeniden başlat
                    </button>
                  )}
                </div>
              )}
              <label className="mt-2 flex items-start gap-2 text-sm cursor-pointer select-none">
                <input type="checkbox" className="mt-1 h-5 w-5 accent-blue-600" checked={lowPerf} onChange={(e) => applyLowPerf(e.target.checked)} />
                <span>
                  <span className="font-medium">🐢 Zayıf bilgisayar modu</span>
                  <span className="block text-xs text-gray-500 dark:text-gray-400">Animasyon ve gölgeleri kapatır, donanım hızlandırmayı devre dışı bırakır. Eski/yavaş cihazlarda takılmayı azaltır.</span>
                </span>
              </label>
              {perfChanged && (
                <div className="mt-2 flex items-center justify-between gap-2 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                  <span>Donanım ayarı yeniden başlatmada etkin olur.</span>
                  {window.electron?.relaunchApp && (
                    <button type="button" onClick={() => window.electron.relaunchApp()} className="btn btn-sm btn-warning">
                      Yeniden başlat
                    </button>
                  )}
                </div>
              )}
            </div>
            )}

            {/* Sunucu durumu */}
            <div className={`rounded-xl border px-3 py-2.5 text-sm ${statusColor}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {serverStatus.state === 'searching' && <span className="inline-block h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" />}
                    <span className="font-medium break-words">{serverStatus.message || 'Sunucu durumu bilinmiyor'}</span>
                  </div>
                  {serverStatus.state === 'searching' && scanProgress > 0 && <div className="text-xs opacity-70 mt-0.5">Ağ taraması %{scanProgress}</div>}
                  {deviceIP && deviceRole === 'server' && (
                    <div className="text-xs opacity-80 mt-1">
                      Garson cihazlarına verilecek IP: <b className="select-all">{deviceIP}</b>
                    </div>
                  )}
                </div>
                {deviceRole === 'client' && !isBrowserMode() && (
                  <button type="button" onClick={() => setEditingIP((v) => !v)} className="text-xs underline whitespace-nowrap">
                    {editingIP ? 'Kapat' : 'IP gir'}
                  </button>
                )}
              </div>
              {editingIP && (
                <div className="mt-2 flex gap-2">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={manualIP}
                    onChange={(e) => setManualIP(e.target.value)}
                    placeholder="192.168.1.100"
                    className="input flex-1"
                    autoComplete="off"
                  />
                  <button type="button" onClick={applyManualIP} className="btn btn-primary">
                    Bağlan
                  </button>
                </div>
              )}
            </div>

            <div>
              <label className="label" htmlFor="username">
                Kullanıcı adı
              </label>
              <input id="username" type="text" value={username} onChange={(e) => setUsername(e.target.value)} className="input" required autoComplete="username" autoCapitalize="none" />
            </div>
            <div>
              <label className="label" htmlFor="password">
                Şifre
              </label>
              <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input" required autoComplete="current-password" />
            </div>

            {error && <div className="rounded-xl bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-200 px-3 py-2 text-sm whitespace-pre-line">{error}</div>}

            <button type="submit" disabled={loading || serverStatus.state === 'searching'} className="btn btn-primary btn-lg w-full">
              {loading ? 'Giriş yapılıyor…' : serverStatus.state === 'searching' ? 'Sunucu aranıyor…' : 'Giriş Yap'}
            </button>
          </form>
        </div>
      </div>
      <Footer className="text-white/70 [&_p]:text-white/70" />
    </div>
  );
};

export default Login;
