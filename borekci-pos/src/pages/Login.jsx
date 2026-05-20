import React, { useState, useEffect } from 'react';
import { login } from '../services/api';
import { resetSocket } from '../services/socket';
import Footer from '../components/Footer';

const SERVER_INFO_TIMEOUT = 3000;

async function fetchServerInfo(host) {
  const base = host ? `http://${host}:3000` : 'http://localhost:3000';
  const response = await fetch(`${base}/api/server/info`, {
    method: 'GET',
    signal: AbortSignal.timeout(SERVER_INFO_TIMEOUT),
  });
  if (!response.ok) {
    throw new Error('Server info alınamadı');
  }
  return response.json();
}

const Login = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [serverIP, setServerIP] = useState(localStorage.getItem('serverIP') || '');
  const [currentDeviceIP, setCurrentDeviceIP] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showServerIP, setShowServerIP] = useState(!localStorage.getItem('serverIP'));
  const [deviceRole, setDeviceRole] = useState(
    localStorage.getItem('deviceRole') || 'server'
  );

  // Cihaz rolünü yükle (Electron istemci modu)
  useEffect(() => {
    const loadDeviceRole = async () => {
      if (window.electron?.getDeviceRole) {
        try {
          const role = await window.electron.getDeviceRole();
          setDeviceRole(role);
          localStorage.setItem('deviceRole', role);
        } catch (e) {
          console.log('Cihaz rolü okunamadı:', e);
        }
      }
    };
    loadDeviceRole();
  }, []);

  const applyDeviceRole = async (role) => {
    setDeviceRole(role);
    localStorage.setItem('deviceRole', role);
    if (window.electron?.setDeviceRole) {
      await window.electron.setDeviceRole(role);
    }
  };

  // Admin sunucusunu bul (birincil sunucu = isPrimaryServer)
  const resolveAdminServerIP = async () => {
    if (deviceRole === 'server') {
      try {
        const info = await fetchServerInfo(null);
        if (info.isPrimaryServer) {
          setCurrentDeviceIP(info.ip);
          localStorage.removeItem('serverIP');
          setServerIP('');
          setShowServerIP(false);
          return '';
        }
        console.log('Localhost birincil sunucu değil, ağda admin aranıyor...');
      } catch (err) {
        console.log('Localhost erişilemedi:', err.message);
      }
    }

    const savedIP = localStorage.getItem('serverIP');
    if (savedIP) {
      try {
        const info = await fetchServerInfo(savedIP);
        if (info.isPrimaryServer) {
          setServerIP(savedIP);
          setShowServerIP(false);
          return savedIP;
        }
      } catch (e) {
        console.log('Kaydedilmiş IP birincil sunucu değil:', savedIP);
      }
    }

    const foundIP = await findAdminServer();
    if (foundIP) {
      setServerIP(foundIP);
      localStorage.setItem('serverIP', foundIP);
      setShowServerIP(false);
      return foundIP;
    }

    getLocalIP().then((ip) => {
      if (ip) setCurrentDeviceIP(ip);
    }).catch(() => {});

    return null;
  };

  useEffect(() => {
    resolveAdminServerIP().catch(() => {
      console.log('Admin sunucu otomatik bulunamadı');
    });
  }, [deviceRole]);

  // Network'te admin server'ı otomatik bul (aynı WiFi ağında)
  const findAdminServer = async () => {
    return new Promise((resolve) => {
      // Kendi IP'mizi al
      getLocalIP().then(myIP => {
        if (!myIP) {
          resolve(null);
          return;
        }
        
        // IP'nin subnet'ini bul (örn: 192.168.1.100 -> 192.168.1)
        const ipParts = myIP.split('.');
        if (ipParts.length !== 4) {
          resolve(null);
          return;
        }
        
        const subnet = `${ipParts[0]}.${ipParts[1]}.${ipParts[2]}`;
        console.log(`🔍 Network taraması başlatılıyor: ${subnet}.x`);
        
        // IP test fonksiyonu
        const testIP = (ip) => {
          return new Promise((resolveTest) => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 800); // 800ms timeout
            
            fetch(`http://${ip}:3000/api/server/info`, {
              method: 'GET',
              signal: controller.signal
            })
            .then(async (response) => {
              clearTimeout(timeoutId);
              if (response.ok) {
                try {
                  const data = await response.json();
                  resolveTest(data.isPrimaryServer ? ip : null);
                } catch {
                  resolveTest(null);
                }
              } else {
                resolveTest(null);
              }
            })
            .catch(() => {
              clearTimeout(timeoutId);
              resolveTest(null);
            });
          });
        };
        
        // Batch'ler halinde tara (her seferinde 20 IP, daha hızlı)
        const batchSize = 20;
        let currentBatch = 0;
        let found = false;
        
        const scanBatch = async () => {
          if (found) return;
          
          const start = currentBatch * batchSize + 1;
          const end = Math.min((currentBatch + 1) * batchSize, 254);
          
          const promises = [];
          for (let i = start; i <= end; i++) {
            const testIPAddr = `${subnet}.${i}`;
            // Kendi IP'mizi atla
            if (testIPAddr === myIP) continue;
            promises.push(testIP(testIPAddr));
          }
          
          // İlk bulunan IP'yi kullan
          const results = await Promise.allSettled(promises);
          for (const result of results) {
            if (result.status === 'fulfilled' && result.value) {
              console.log(`✅ Admin server bulundu: ${result.value}`);
              found = true;
              resolve(result.value);
              return;
            }
          }
          
          // Sonraki batch'e geç
          currentBatch++;
          if (currentBatch * batchSize < 254 && !found) {
            setTimeout(scanBatch, 50); // 50ms bekle, sonra devam et
          } else if (!found) {
            console.log('❌ Admin server bulunamadı');
            resolve(null);
          }
        };
        
        // İlk batch'i başlat
        scanBatch();
      }).catch(() => {
        resolve(null);
      });
    });
  };

  // WebRTC kullanarak local IP'yi al (internet gerektirmez, sadece local network)
  const getLocalIP = () => {
    return new Promise((resolve, reject) => {
      const RTCPeerConnection = window.RTCPeerConnection || 
                                window.mozRTCPeerConnection || 
                                window.webkitRTCPeerConnection;
      
      if (!RTCPeerConnection) {
        resolve(null);
        return;
      }

      // STUN server olmadan da çalışabilir (internet gerektirmez)
      // Ancak bazı tarayıcılarda STUN olmadan çalışmayabilir, o yüzden boş array kullanıyoruz
      const pc = new RTCPeerConnection({
        iceServers: [] // STUN server olmadan - internet gerektirmez
      });

      pc.createDataChannel('');
      
      let resolved = false;
      
      pc.onicecandidate = (event) => {
        if (event.candidate && !resolved) {
          const candidate = event.candidate.candidate;
          const match = candidate.match(/([0-9]{1,3}(\.[0-9]{1,3}){3})/);
          if (match && match[1]) {
            const ip = match[1];
            // Local IP'leri filtrele (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
            if (ip.startsWith('192.168.') || 
                ip.startsWith('10.') || 
                /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)) {
              resolved = true;
              pc.close();
              resolve(ip);
            }
          }
        }
      };

      // Ice gathering tamamlandığında kontrol et
      pc.onicegatheringstatechange = () => {
        if (pc.iceGatheringState === 'complete' && !resolved) {
          // IP bulunamadı, sessizce null döndür
          pc.close();
          resolve(null);
        }
      };

      pc.createOffer()
        .then(offer => pc.setLocalDescription(offer))
        .catch(() => {
          if (!resolved) {
            pc.close();
            resolve(null);
          }
        });

      // Timeout - 2 saniye yeterli (local network için)
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          pc.close();
          resolve(null);
        }
      }, 2000);
    });
  };

  // Server IP değiştiğinde localStorage'a kaydet
  const handleServerIPChange = (newIP) => {
    setServerIP(newIP);
    if (newIP) {
      localStorage.setItem('serverIP', newIP);
    } else {
      localStorage.removeItem('serverIP');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      let finalServerIP = serverIP;

      if (!finalServerIP) {
        setError('Admin sunucu aranıyor, lütfen bekleyin...');
        const resolved = await resolveAdminServerIP();
        setError('');
        if (resolved === '') {
          finalServerIP = '';
        } else if (resolved) {
          finalServerIP = resolved;
        } else if (deviceRole === 'server') {
          setError('Admin sunucu bulunamadı. Bu cihaz admin bilgisayarıysa uygulamayı yeniden başlatın.');
          setLoading(false);
          return;
        } else {
          setError('Admin sunucu bulunamadı. Modem/WiFi ağında olduğunuzdan ve admin PC\'nin açık olduğundan emin olun. IP\'yi manuel girin.');
          setLoading(false);
          return;
        }
      }

      if (finalServerIP) {
        localStorage.setItem('serverIP', finalServerIP);
        try {
          const info = await fetchServerInfo(finalServerIP);
          if (!info.isPrimaryServer) {
            setError(`Bu IP birincil (admin) sunucu değil: ${finalServerIP}:3000`);
            setLoading(false);
            return;
          }
        } catch (err) {
          setError(`Server'a bağlanılamadı: ${finalServerIP}:3000\nİnternet gerekmez — modem/WiFi üzerinden aynı ağda olun.`);
          setLoading(false);
          return;
        }
      } else {
        localStorage.removeItem('serverIP');
      }

      resetSocket();

      const response = await login({ username, password });
      onLogin(response.data);
    } catch (err) {
      if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
        setError(`Bağlantı zaman aşımına uğradı. İnternet bağlantısı gerekmez, sadece WiFi ağına bağlı olduğunuzdan emin olun.\nServer IP: ${serverIP || 'localhost'}:3000`);
      } else if (err.response?.status === 0 || err.code === 'ERR_NETWORK') {
        // Network hatası - belki IP değişti, tekrar dene
        if (!serverIP) {
          setError(`Server'a bağlanılamadı. Admin server otomatik bulunamadı.\nLütfen admin bilgisayarının IP adresini manuel olarak girin.`);
        } else {
          setError(`Server'a bağlanılamadı. IP adresini kontrol edin: ${serverIP}:3000\nİnternet bağlantısı gerekmez, sadece WiFi ağına bağlı olduğunuzdan emin olun.`);
        }
      } else {
        setError(err.response?.data?.error || 'Giriş başarısız');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-blue-500 to-purple-600 dark:from-gray-900 dark:to-gray-800">
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-xl w-full max-w-md">
          <div className="flex justify-center mb-4">
            <img 
              src="./logo.png" 
              alt="Emek Cafe Logo" 
              className="h-24 w-auto object-contain"
              onError={(e) => {
                // Logo yoksa gizle
                e.target.style.display = 'none';
              }}
            />
          </div>
          <h1 className="text-3xl font-bold text-center mb-6 text-gray-800 dark:text-white">
            Emek Cafe Adisyon
          </h1>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg p-3 space-y-2">
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Bu cihaz hangi rolde?</p>
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                <input
                  type="radio"
                  name="deviceRole"
                  checked={deviceRole === 'server'}
                  onChange={() => applyDeviceRole('server')}
                />
                Admin / Kasa (sunucu bu cihazda çalışır)
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                <input
                  type="radio"
                  name="deviceRole"
                  checked={deviceRole === 'client'}
                  onChange={() => applyDeviceRole('client')}
                />
                Garson / Tablet (admin bilgisayarına bağlanır)
              </label>
              {deviceRole === 'client' && (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  İstemci modu seçildikten sonra uygulamayı bir kez kapatıp açın (yerel sunucu kapanır).
                </p>
              )}
            </div>
            {/* Cihazın Kendi IP'si */}
            {currentDeviceIP && (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
                <p className="text-sm font-medium text-green-800 dark:text-green-200">
                  Bu Cihazın IP Adresi: <span className="font-bold">{currentDeviceIP}</span>
                </p>
                <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                  {!serverIP ? 'Admin bilgisayarıysanız, bu IP\'yi garson bilgisayarına verin.' : 'Garson bilgisayarıysanız, admin bilgisayarının IP\'sini girin.'}
                </p>
              </div>
            )}
            {/* Server IP Girişi - Sadece garson bilgisayarı için */}
            {showServerIP && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Server IP (Admin Bilgisayarı IP'si)
                </label>
                <input
                  type="text"
                  value={serverIP}
                  onChange={(e) => handleServerIPChange(e.target.value)}
                  placeholder="örn: 192.168.1.100 (boş bırakırsanız localhost kullanılır)"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Admin bilgisayarının IP adresini girin (örn: 192.168.1.100)
                </p>
              </div>
            )}
            {!showServerIP && serverIP && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                    Server IP: {serverIP}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowServerIP(true);
                    setServerIP('');
                    localStorage.removeItem('serverIP');
                  }}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Değiştir
                </button>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Kullanıcı Adı
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Şifre
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                required
              />
            </div>
            {error && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition duration-200 disabled:opacity-50"
            >
              {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
            </button>
          </form>
          <div className="mt-4 text-sm text-gray-600 dark:text-gray-400 text-center">
            <p>Varsayılan: admin/admin veya garson/garson</p>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default Login;

