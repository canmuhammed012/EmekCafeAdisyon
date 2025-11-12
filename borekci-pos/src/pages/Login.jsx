import React, { useState, useEffect } from 'react';
import { login, getServerInfo } from '../services/api';
import Footer from '../components/Footer';

const Login = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [serverIP, setServerIP] = useState(localStorage.getItem('serverIP') || '');
  const [currentDeviceIP, setCurrentDeviceIP] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showServerIP, setShowServerIP] = useState(!localStorage.getItem('serverIP'));

  // Cihazın kendi IP'sini al
  useEffect(() => {
    const fetchDeviceIP = async () => {
      try {
        // Önce localhost'tan dene (admin bilgisayarı)
        try {
          const response = await getServerInfo();
          if (response.data && response.data.ip) {
            setCurrentDeviceIP(response.data.ip);
            return;
          }
        } catch (err) {
          // localhost çalışmıyorsa, WebRTC ile local IP'yi al
          getLocalIP().then(ip => {
            if (ip) {
              setCurrentDeviceIP(ip);
            }
          });
        }
      } catch (error) {
        console.error('IP alınamadı:', error);
      }
    };

    fetchDeviceIP();
  }, []);

  // WebRTC kullanarak local IP'yi al
  const getLocalIP = () => {
    return new Promise((resolve) => {
      const RTCPeerConnection = window.RTCPeerConnection || 
                                window.mozRTCPeerConnection || 
                                window.webkitRTCPeerConnection;
      
      if (!RTCPeerConnection) {
        resolve(null);
        return;
      }

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });

      pc.createDataChannel('');
      
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const candidate = event.candidate.candidate;
          const match = candidate.match(/([0-9]{1,3}(\.[0-9]{1,3}){3})/);
          if (match && match[1]) {
            const ip = match[1];
            // Local IP'leri filtrele (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
            if (ip.startsWith('192.168.') || 
                ip.startsWith('10.') || 
                /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)) {
              pc.close();
              resolve(ip);
            }
          }
        }
      };

      pc.createOffer()
        .then(offer => pc.setLocalDescription(offer))
        .catch(() => {
          pc.close();
          resolve(null);
        });

      // Timeout
      setTimeout(() => {
        pc.close();
        resolve(null);
      }, 3000);
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
      // Eğer server IP girilmişse, önce bağlantıyı test et
      if (serverIP) {
        try {
          await getServerInfo();
        } catch (err) {
          setError(`Server'a bağlanılamadı: ${serverIP}:3000`);
          setLoading(false);
          return;
        }
      }

      const response = await login({ username, password });
      onLogin(response.data);
    } catch (err) {
      if (err.response?.status === 0 || err.code === 'ERR_NETWORK') {
        setError(`Server'a bağlanılamadı. IP adresini kontrol edin: ${serverIP || 'localhost'}:3000`);
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
              src="/logo.png" 
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

