import React, { useEffect, useRef } from 'react';

const Screensaver = ({ onDismiss }) => {
  const canDismissRef = useRef(false);

  useEffect(() => {
    const handleInteraction = (e) => {
      if (!canDismissRef.current) return;
      if (e.type === 'mousemove') return;
      onDismiss();
    };

    const events = ['click', 'touchstart', 'keydown', 'mousedown'];
    events.forEach(event => {
      window.addEventListener(event, handleInteraction);
    });

    const enableTimer = setTimeout(() => {
      canDismissRef.current = true;
    }, 200);

    return () => {
      events.forEach(event => {
        window.removeEventListener(event, handleInteraction);
      });
      clearTimeout(enableTimer);
    };
  }, [onDismiss]);

  return (
    <div 
      className="fixed inset-0 bg-black z-[9999] flex items-center justify-center"
      style={{ cursor: 'pointer' }}
    >
      {/* Video bulunmasa bile her zaman fallback animasyon göster */}
      <div className="flex flex-col items-center justify-center text-white">
        <div className="text-8xl mb-6 animate-bounce">☕</div>
        <div className="text-4xl font-bold animate-pulse">Emek Cafe</div>
      </div>
    </div>
  );
};

export default Screensaver;

