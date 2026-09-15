import React, { useEffect } from 'react';

const TYPE_STYLES = {
  success: { btn: 'btn-success', icon: '✅', title: 'text-emerald-600 dark:text-emerald-400' },
  error: { btn: 'btn-danger', icon: '❌', title: 'text-red-600 dark:text-red-400' },
  warning: { btn: 'btn-warning', icon: '⚠️', title: 'text-amber-600 dark:text-amber-400' },
  info: { btn: 'btn-primary', icon: 'ℹ️', title: 'text-blue-600 dark:text-blue-400' },
};

/**
 * Bilgi/uyarı penceresi. `onConfirm` verilirse onay penceresi olur (İptal / Onayla).
 */
const AlertModal = ({
  isOpen,
  onClose,
  title,
  message,
  type = 'info',
  icon = null,
  onConfirm = null,
  confirmText = 'Onayla',
  cancelText = 'İptal',
  closeText = 'Tamam',
}) => {
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
      if (e.key === 'Enter' && onConfirm) onConfirm();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose, onConfirm]);

  if (!isOpen) return null;
  const styles = TYPE_STYLES[type] || TYPE_STYLES.info;

  return (
    <div className="modal-backdrop z-[9999]" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-body text-center py-6">
          <div className="text-5xl mb-3 leading-none">{icon || styles.icon}</div>
          {title && <h2 className={`text-xl font-bold mb-2 ${styles.title}`}>{title}</h2>}
          {message && <p className="text-sm sm:text-base text-gray-700 dark:text-gray-300 whitespace-pre-line break-words">{message}</p>}
        </div>
        <div className="modal-footer justify-center">
          {onConfirm ? (
            <>
              <button type="button" onClick={onClose} className="btn btn-secondary flex-1">
                {cancelText}
              </button>
              <button type="button" onClick={onConfirm} className={`btn ${styles.btn} flex-1`} autoFocus>
                {confirmText}
              </button>
            </>
          ) : (
            <button type="button" onClick={onClose} className={`btn ${styles.btn} px-8`} autoFocus>
              {closeText}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default AlertModal;
