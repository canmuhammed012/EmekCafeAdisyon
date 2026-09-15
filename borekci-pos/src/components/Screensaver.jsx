import React, { useEffect, useRef, useState } from 'react';

const Screensaver = ({ onDismiss }) => {
  const canDismissRef = useRef(false);
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const handleInteraction = () => {
      if (canDismissRef.current) onDismiss();
    };
    const events = ['click', 'touchstart', 'keydown', 'mousedown'];
    events.forEach((event) => window.addEventListener(event, handleInteraction));
    const enableTimer = setTimeout(() => {
      canDismissRef.current = true;
    }, 300);
    const clock = setInterval(() => setTime(new Date()), 1000);
    return () => {
      events.forEach((event) => window.removeEventListener(event, handleInteraction));
      clearTimeout(enableTimer);
      clearInterval(clock);
    };
  }, [onDismiss]);

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center cursor-pointer select-none bg-gradient-to-br from-gray-950 via-slate-900 to-blue-950 text-white">
      <img src="./logo.png" alt="" className="h-24 w-24 sm:h-32 sm:w-32 object-contain mb-6 drop-shadow-2xl animate-pulse" onError={(e) => (e.currentTarget.style.display = 'none')} />
      <div className="text-4xl sm:text-6xl font-bold tracking-tight">Emek Cafe</div>
      <div className="mt-6 text-5xl sm:text-7xl font-light tabular-nums">
        {time.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
      </div>
      <div className="mt-2 text-base sm:text-lg text-white/70">
        {time.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
      </div>
      <div className="absolute bottom-8 text-sm text-white/50 animate-pulse">Devam etmek için ekrana dokunun</div>
    </div>
  );
};

export default Screensaver;
