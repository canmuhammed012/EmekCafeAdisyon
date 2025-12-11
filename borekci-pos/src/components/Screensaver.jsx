import React, { useEffect, useRef, useState } from 'react';

const Screensaver = ({ onDismiss }) => {
  const videoRef = useRef(null);
  const [videoError, setVideoError] = useState(false);

  useEffect(() => {
    // Video oynatmayı dene
    if (videoRef.current) {
      videoRef.current.play().catch((error) => {
        console.warn('Video oynatılamadı:', error);
        setVideoError(true);
      });
    }

    // Herhangi bir tıklama, dokunma veya klavye tuşuna basıldığında ekran koruyucuyu kapat
    const handleInteraction = (e) => {
      // Sadece gerçek kullanıcı etkileşimlerini dinle (mousemove'u atla)
      if (e.type === 'mousemove') {
        return;
      }
      onDismiss();
    };

    // Tüm etkileşim event'lerini dinle (mousemove hariç)
    const events = ['click', 'touchstart', 'keydown', 'mousedown'];
    events.forEach(event => {
      window.addEventListener(event, handleInteraction);
    });

    return () => {
      events.forEach(event => {
        window.removeEventListener(event, handleInteraction);
      });
    };
  }, [onDismiss]);

  return (
    <div 
      className="fixed inset-0 bg-black z-[9999] flex items-center justify-center"
      onClick={onDismiss}
      style={{ cursor: 'pointer' }}
    >
      {!videoError ? (
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          autoPlay
          loop
          muted
          playsInline
          onError={() => setVideoError(true)}
        >
          <source src="/screensaver.mp4" type="video/mp4" />
          <source src="/screensaver.webm" type="video/webm" />
          {/* Video yüklenemezse fallback */}
        </video>
      ) : (
        // Video yüklenemezse animasyonlu placeholder
        <div className="flex flex-col items-center justify-center text-white">
          <div className="text-6xl mb-4 animate-pulse">☕</div>
          <div className="text-2xl font-bold animate-pulse">Emek Cafe</div>
        </div>
      )}
    </div>
  );
};

export default Screensaver;

