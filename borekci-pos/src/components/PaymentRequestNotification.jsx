import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSocket } from '../contexts/SocketContext';
import { getPaymentRequests } from '../services/api';
import { formatCurrency } from '../utils/dateFormatter';

function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 1000;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.2);
    osc.onended = () => ctx.close().catch(() => {});
  } catch {
    /* ses desteklenmiyor */
  }
}

/**
 * Garson "Masayı hesaba yolla" dediğinde kasada (yönetici) çıkan uyarı.
 * Aynı istek hem socket hem yedek sorgudan gelse bile id ile tekilleştirilir.
 */
const PaymentRequestNotification = ({ user }) => {
  const { socket, isConnected } = useSocket();
  const [queue, setQueue] = useState([]);
  const seenIdsRef = useRef(new Set());
  const lastIdRef = useRef(0);
  const soundTimerRef = useRef(null);
  const isAdmin = user?.role === 'yönetici';

  const pushRequest = useCallback((request) => {
    if (!request?.tableId) return;
    const key = request.id ?? `${request.tableId}-${request.createdAt}`;
    if (seenIdsRef.current.has(key)) return;
    seenIdsRef.current.add(key);
    if (typeof request.id === 'number') lastIdRef.current = Math.max(lastIdRef.current, request.id);
    setQueue((prev) => [...prev, request]);
  }, []);

  // Socket ile anlık bildirim
  useEffect(() => {
    if (!isAdmin || !socket) return undefined;
    const handler = (data) => pushRequest(data);
    socket.on('tableRequestPayment', handler);
    return () => socket.off('tableRequestPayment', handler);
  }, [socket, isAdmin, pushRequest]);

  // Socket kopuksa yedek sorgu (yalnızca bağlantı yokken çalışır)
  useEffect(() => {
    if (!isAdmin || isConnected) return undefined;
    const poll = async () => {
      try {
        const response = await getPaymentRequests(lastIdRef.current);
        (response.data?.requests || []).forEach(pushRequest);
      } catch {
        /* sessiz */
      }
    };
    const timer = setInterval(poll, 5000);
    return () => clearInterval(timer);
  }, [isAdmin, isConnected, pushRequest]);

  // Bekleyen istek varken ses
  useEffect(() => {
    if (queue.length === 0) {
      if (soundTimerRef.current) clearInterval(soundTimerRef.current);
      soundTimerRef.current = null;
      return undefined;
    }
    playBeep();
    soundTimerRef.current = setInterval(playBeep, 2500);
    return () => {
      if (soundTimerRef.current) clearInterval(soundTimerRef.current);
      soundTimerRef.current = null;
    };
  }, [queue.length]);

  if (!isAdmin || queue.length === 0) return null;
  const current = queue[0];
  const dismiss = () => setQueue((prev) => prev.slice(1));
  const accept = () => {
    window.location.hash = `#/table/${current.tableId}`;
    dismiss();
  };

  return (
    <div className="modal-backdrop z-[60]">
      <div className="modal max-w-sm text-center animate-ring border-2 border-orange-500">
        <div className="modal-body py-6">
          <div className="text-5xl mb-3">📢</div>
          <h2 className="text-2xl font-bold mb-1">{current.tableName || `Masa ${current.tableId}`}</h2>
          <p className="text-gray-600 dark:text-gray-300">Hesap ödemek için kasaya geliyor</p>
          {current.total > 0 && <p className="mt-2 text-xl font-bold text-blue-600 dark:text-blue-400">{formatCurrency(current.total)}</p>}
          {current.requestedBy && <p className="mt-1 text-xs text-gray-500">İsteyen: {current.requestedBy}</p>}
          {queue.length > 1 && <p className="mt-2 badge badge-amber">+{queue.length - 1} bekleyen istek</p>}
        </div>
        <div className="modal-footer">
          <button type="button" onClick={dismiss} className="btn btn-secondary flex-1">
            Kapat
          </button>
          <button type="button" onClick={accept} className="btn btn-success flex-1" autoFocus>
            Hesabı Al
          </button>
        </div>
      </div>
    </div>
  );
};

export default PaymentRequestNotification;
