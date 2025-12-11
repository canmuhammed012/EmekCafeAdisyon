import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSocket } from '../services/socket';
import { getPaymentRequests } from '../services/api';

const PaymentRequestNotification = ({ user }) => {
  const [paymentRequest, setPaymentRequest] = useState(null);
  const [isBlinking, setIsBlinking] = useState(false);
  const blinkIntervalRef = useRef(null);
  const soundIntervalRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    // Sadece yönetici kullanıcılar için bildirim göster
    if (user?.role !== 'yönetici') {
      return;
    }

    let socket = null;
    let isMounted = true;
    let pollTimer = null;

    const setupPaymentRequestListener = async () => {
      try {
        socket = await getSocket();
        if (!socket) {
          console.warn('⚠ Socket bağlantısı kurulamadı (PaymentRequestNotification)');
          return;
        }

        // Socket bağlantısını bekle
        if (!socket.connected) {
          socket.once('connect', () => {
            console.log('✅ Socket bağlandı (PaymentRequestNotification), listener ekleniyor...');
            setupListener();
          });
        } else {
          setupListener();
        }

        function setupListener() {
          socket.on('tableRequestPayment', (data) => {
            console.log('📢 Masa hesap isteği alındı (Global):', data);
            if (!isMounted) return;

            setPaymentRequest(data);
            setIsBlinking(true);

            // Yanıp sönme efekti
            if (blinkIntervalRef.current) {
              clearInterval(blinkIntervalRef.current);
            }
            blinkIntervalRef.current = setInterval(() => {
              setIsBlinking(prev => !prev);
            }, 500);

            // Ses çalma (her 2 saniyede bir)
            const playSound = () => {
              try {
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();

                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);

                // Dikkat çekici bir bip sesi
                oscillator.frequency.value = 1000;
                oscillator.type = 'sine';

                gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);

                oscillator.start(audioContext.currentTime);
                oscillator.stop(audioContext.currentTime + 0.2);
              } catch (error) {
                console.warn('Ses çalınamadı:', error);
              }
            };

            // İlk sesi hemen çal
            playSound();

            // Her 2 saniyede bir ses çal
            if (soundIntervalRef.current) {
              clearInterval(soundIntervalRef.current);
            }
            soundIntervalRef.current = setInterval(() => {
              playSound();
            }, 2000);
          });

          console.log('✅ Masa hesap isteği listener eklendi (Global)');
        }
      } catch (error) {
        console.error('❌ Socket listener kurulum hatası (PaymentRequestNotification):', error);
      }
    };

    setupPaymentRequestListener();

    // Fallback: 5 saniyede bir bekleyen hesap isteklerini poll et
    const poll = async () => {
      try {
        const response = await getPaymentRequests();
        const items = response.data?.requests || [];
        if (items.length > 0) {
          const latest = items[items.length - 1];
          setPaymentRequest(latest);
          setIsBlinking(true);

          if (blinkIntervalRef.current) clearInterval(blinkIntervalRef.current);
          blinkIntervalRef.current = setInterval(() => setIsBlinking(prev => !prev), 500);

          if (soundIntervalRef.current) clearInterval(soundIntervalRef.current);
          const playSound = () => {
            try {
              const audioContext = new (window.AudioContext || window.webkitAudioContext)();
              const oscillator = audioContext.createOscillator();
              const gainNode = audioContext.createGain();

              oscillator.connect(gainNode);
              gainNode.connect(audioContext.destination);

              oscillator.frequency.value = 1000;
              oscillator.type = 'sine';

              gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
              gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);

              oscillator.start(audioContext.currentTime);
              oscillator.stop(audioContext.currentTime + 0.2);
            } catch (error) {
              console.warn('Ses çalınamadı (poll):', error);
            }
          };
          playSound();
          soundIntervalRef.current = setInterval(playSound, 2000);
        }
      } catch (err) {
        // sessizce geç
      }
    };
    pollTimer = setInterval(poll, 5000);

    return () => {
      isMounted = false;
      if (socket) {
        socket.off('tableRequestPayment');
      }
      if (blinkIntervalRef.current) {
        clearInterval(blinkIntervalRef.current);
      }
      if (soundIntervalRef.current) {
        clearInterval(soundIntervalRef.current);
      }
      if (pollTimer) {
        clearInterval(pollTimer);
      }
    };
  }, [user]);

  // Bildirimi kapat
  const handleClosePaymentRequest = () => {
    setPaymentRequest(null);
    setIsBlinking(false);
    if (blinkIntervalRef.current) {
      clearInterval(blinkIntervalRef.current);
    }
    if (soundIntervalRef.current) {
      clearInterval(soundIntervalRef.current);
    }
  };

  // Hesabı Al butonuna basıldığında
  const handleAcceptPaymentRequest = () => {
    if (paymentRequest?.tableId) {
      // Masa detay sayfasına yönlendir
      navigate(`/table/${paymentRequest.tableId}`);
      handleClosePaymentRequest();
    }
  };

  if (!paymentRequest || user?.role !== 'yönetici') {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
      <div
        className={`bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 text-center transition-all duration-300 ${
          isBlinking ? 'scale-105 ring-4 ring-orange-500' : 'scale-100'
        }`}
        style={{
          animation: isBlinking ? 'pulse 0.5s ease-in-out infinite' : 'none'
        }}
      >
        <div className="mb-6">
          <div className="text-6xl mb-4">📢</div>
          <h2 className="text-3xl font-bold text-gray-800 dark:text-white mb-4">
            {paymentRequest.tableName || `${paymentRequest.tableId} Numaralı Masa`}
          </h2>
          <p className="text-xl text-gray-600 dark:text-gray-300">
            Hesap Ödemek İçin Kasaya Gelmektedir!
          </p>
        </div>

        <div className="flex gap-4">
          <button
            onClick={handleAcceptPaymentRequest}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-6 rounded-lg transition-all duration-150 transform active:scale-95 text-lg"
          >
            Hesabı Al
          </button>
          <button
            onClick={handleClosePaymentRequest}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-4 px-6 rounded-lg transition-all duration-150 transform active:scale-95 text-lg"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
};

export default PaymentRequestNotification;

