import { useCallback, useState } from 'react';

/**
 * AlertModal state'ini kolay kullanmak için:
 *   const { alert, showAlert, confirm, closeAlert } = useAlert();
 *   showAlert('Hata', 'Mesaj', 'error');
 *   const ok = await confirm('Silinsin mi?', 'Bu işlem geri alınamaz');
 */
export function useAlert() {
  const [alert, setAlert] = useState({ isOpen: false, title: '', message: '', type: 'info', onConfirm: null });

  const closeAlert = useCallback(() => setAlert((prev) => ({ ...prev, isOpen: false, onConfirm: null })), []);

  const showAlert = useCallback((title, message, type = 'info') => {
    setAlert({ isOpen: true, title, message, type, onConfirm: null });
  }, []);

  const confirm = useCallback(
    (title, message, { type = 'warning', confirmText = 'Evet', cancelText = 'Vazgeç' } = {}) =>
      new Promise((resolve) => {
        setAlert({
          isOpen: true,
          title,
          message,
          type,
          confirmText,
          cancelText,
          onConfirm: () => {
            setAlert((prev) => ({ ...prev, isOpen: false, onConfirm: null }));
            resolve(true);
          },
          onCancel: () => resolve(false),
        });
      }),
    []
  );

  const alertProps = {
    isOpen: alert.isOpen,
    title: alert.title,
    message: alert.message,
    type: alert.type,
    onConfirm: alert.onConfirm,
    confirmText: alert.confirmText,
    cancelText: alert.cancelText,
    onClose: () => {
      alert.onCancel?.();
      closeAlert();
    },
  };

  return { alert, alertProps, showAlert, confirm, closeAlert };
}
