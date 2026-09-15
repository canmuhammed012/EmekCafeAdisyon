import React, { useEffect, useRef, useState } from 'react';
import { useDailyGoals } from './DailyGoalsModal';
import { todayISO } from '../utils/dateFormatter';

/** Kısa, neşeli bir "tamamlandı" melodisi (harici dosya gerektirmez) */
function playCelebrationSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const t = ctx.currentTime + i * 0.12;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      osc.start(t);
      osc.stop(t + 0.4);
    });
    setTimeout(() => ctx.close().catch(() => {}), 1500);
  } catch {
    /* ses desteklenmiyor */
  }
}

const CONFETTI = Array.from({ length: 28 }, (_, i) => ({
  left: `${(i * 37) % 100}%`,
  delay: `${(i % 7) * 0.12}s`,
  color: ['#F59E0B', '#10B981', '#3B82F6', '#EC4899', '#8B5CF6', '#EF4444'][i % 6],
  size: 8 + (i % 4) * 3,
}));

const storageKey = () => `goalsCelebrated:${todayISO()}`;
const readCelebrated = () => {
  try {
    return new Set(JSON.parse(localStorage.getItem(storageKey()) || '[]'));
  } catch {
    return new Set();
  }
};

/**
 * Bir günlük görev hedefine ulaşıldığında ses + kutlama bandı gösterir.
 * Aynı gün aynı görev için bir kez kutlar (cihaz başına).
 */
const GoalCelebration = ({ user }) => {
  const { goals, loading } = useDailyGoals(Boolean(user));
  const [toast, setToast] = useState(null);
  const initializedRef = useRef(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (loading) return;
    const celebrated = readCelebrated();
    const doneNow = goals.filter((g) => g.done);

    if (!initializedRef.current) {
      // İlk yüklemede zaten bitmiş olanları kutlamadan işaretle
      initializedRef.current = true;
      doneNow.forEach((g) => celebrated.add(g.id));
      localStorage.setItem(storageKey(), JSON.stringify([...celebrated]));
      return;
    }

    const fresh = doneNow.filter((g) => !celebrated.has(g.id));
    if (fresh.length === 0) return;
    fresh.forEach((g) => celebrated.add(g.id));
    localStorage.setItem(storageKey(), JSON.stringify([...celebrated]));

    playCelebrationSound();
    const allDone = goals.length > 0 && doneNow.length === goals.length;
    setToast({
      title: allDone ? '🏆 Bugünün tüm görevleri tamamlandı!' : '🎉 Hedef tamamlandı!',
      lines: fresh.map((g) => `${g.productName}: ${g.sold} / ${g.quota}`),
    });
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setToast(null), 6000);
  }, [goals, loading]);

  useEffect(() => () => timerRef.current && clearTimeout(timerRef.current), []);

  if (!toast) return null;

  return (
    <div className="fixed inset-0 z-[70] pointer-events-none overflow-hidden" aria-live="polite">
      {CONFETTI.map((c, i) => (
        <span
          key={i}
          className="absolute -top-4 rounded-sm animate-confetti"
          style={{ left: c.left, width: c.size, height: c.size * 0.6, backgroundColor: c.color, animationDelay: c.delay }}
        />
      ))}
      <div className="absolute left-1/2 top-6 -translate-x-1/2 w-[min(92vw,26rem)] pointer-events-auto">
        <button
          type="button"
          onClick={() => setToast(null)}
          className="w-full text-left card border-2 border-emerald-400 bg-white dark:bg-gray-800 shadow-2xl p-4 animate-pop-in"
        >
          <div className="text-lg font-bold">{toast.title}</div>
          <ul className="mt-1 text-sm text-gray-600 dark:text-gray-300 space-y-0.5">
            {toast.lines.map((l) => (
              <li key={l}>✅ {l}</li>
            ))}
          </ul>
          <div className="mt-2 text-[11px] text-gray-400">Kapatmak için dokunun</div>
        </button>
      </div>
    </div>
  );
};

export default GoalCelebration;
