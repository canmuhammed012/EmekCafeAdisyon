import React from 'react';

const AlertModal = ({ isOpen, onClose, title, message, type = 'info', icon = null }) => {
  if (!isOpen) return null;

  // Tip'e göre renk ve varsayılan icon belirleme
  const getTypeStyles = () => {
    switch (type) {
      case 'success':
        return {
          bgColor: 'bg-green-600',
          hoverColor: 'hover:bg-green-700',
          icon: icon || '✅',
          titleColor: 'text-green-600 dark:text-green-400'
        };
      case 'error':
        return {
          bgColor: 'bg-red-600',
          hoverColor: 'hover:bg-red-700',
          icon: icon || '❌',
          titleColor: 'text-red-600 dark:text-red-400'
        };
      case 'warning':
        return {
          bgColor: 'bg-yellow-600',
          hoverColor: 'hover:bg-yellow-700',
          icon: icon || '⚠️',
          titleColor: 'text-yellow-600 dark:text-yellow-400'
        };
      default:
        return {
          bgColor: 'bg-blue-600',
          hoverColor: 'hover:bg-blue-700',
          icon: icon || 'ℹ️',
          titleColor: 'text-blue-600 dark:text-blue-400'
        };
    }
  };

  const styles = getTypeStyles();

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]"
      onClick={onClose}
    >
      <div 
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 transform transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-center mb-6">
          <div className="text-6xl mb-4">{styles.icon}</div>
          {title && (
            <h2 className={`text-2xl font-bold ${styles.titleColor} mb-2`}>
              {title}
            </h2>
          )}
          <p className="text-lg text-gray-700 dark:text-gray-300">
            {message}
          </p>
        </div>
        
        <div className="flex justify-center">
          <button
            onClick={onClose}
            className={`${styles.bgColor} ${styles.hoverColor} text-white font-bold py-3 px-8 rounded-lg transition-all duration-150 transform active:scale-95 text-lg`}
          >
            Tamam
          </button>
        </div>
      </div>
    </div>
  );
};

export default AlertModal;

