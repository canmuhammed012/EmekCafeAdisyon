import React, { useState, useEffect } from 'react';
import { formatCurrency } from '../utils/dateFormatter';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', '⌫'];

/**
 * Tutar girişi için dokunmatik rakam klavyesi (Tartılan Börek gibi tutarı elle girilen ürünler).
 * onConfirm(amount: number) ile sayısal tutar döner.
 */
const NumPadModal = ({ open, title, subtitle, onConfirm, onCancel, confirmText = 'Onayla' }) => {
  const [value, setValue] = useState('');

  useEffect(() => {
    if (open) setValue('');
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key >= '0' && e.key <= '9') press(e.key);
      else if (e.key === ',' || e.key === '.') press(',');
      else if (e.key === 'Backspace') press('⌫');
      else if (e.key === 'Enter') confirm();
      else if (e.key === 'Escape') onCancel?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, value]);

  if (!open) return null;

  const amount = Number(value.replace(',', '.')) || 0;
  const isValid = amount > 0;

  function press(key) {
    setValue((prev) => {
      if (key === '⌫') return prev.slice(0, -1);
      if (key === ',') {
        if (prev.includes(',')) return prev;
        return prev === '' ? '0,' : `${prev},`;
      }
      const [whole = '', frac] = prev.split(',');
      if (frac !== undefined) {
        if (frac.length >= 2) return prev;
        return `${prev}${key}`;
      }
      if (whole.length >= 6) return prev;
      if (whole === '0') return key;
      return `${prev}${key}`;
    });
  }

  function confirm() {
    if (isValid) onConfirm?.(Math.round(amount * 100) / 100);
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal max-w-xs" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="min-w-0">
            <h2 className="font-bold truncate">{title || 'Tutar girin'}</h2>
            {subtitle && <p className="text-xs text-gray-500 truncate">{subtitle}</p>}
          </div>
          <button type="button" onClick={onCancel} className="btn btn-ghost btn-sm text-xl leading-none" aria-label="Kapat">
            ×
          </button>
        </div>
        <div className="modal-body space-y-3">
          <div className="rounded-xl bg-gray-100 dark:bg-gray-900 px-4 py-3 text-right">
            <div className="text-3xl font-bold tabular-nums leading-none min-h-[2.25rem]">{value ? `${value} ₺` : <span className="text-gray-400">0 ₺</span>}</div>
            <div className="text-xs text-gray-500 mt-1 tabular-nums">{isValid ? formatCurrency(amount) : 'Tutarı tuşlayın'}</div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {KEYS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => press(k)}
                className={`h-14 touch:h-16 rounded-xl text-2xl font-bold active:scale-95 transition select-none ${
                  k === '⌫' ? 'bg-gray-200 dark:bg-gray-700 text-red-600' : 'bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                }`}
                aria-label={k === '⌫' ? 'Sil' : k}
              >
                {k}
              </button>
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" onClick={onCancel} className="btn btn-secondary btn-lg flex-1">
            İptal
          </button>
          <button type="button" onClick={confirm} disabled={!isValid} className="btn btn-success btn-lg flex-1">
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default NumPadModal;
