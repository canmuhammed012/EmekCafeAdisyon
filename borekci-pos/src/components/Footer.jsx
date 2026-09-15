import React from 'react';

const version = (() => {
  try {
    return window.electron?.getVersion?.() || '';
  } catch {
    return '';
  }
})();

const Footer = ({ className = '' }) => (
  <footer className={`text-center py-2 px-3 ${className}`}>
    <p className="text-[11px] sm:text-xs text-gray-500 dark:text-gray-500 truncate">
      © {new Date().getFullYear()} Emek Cafe{version ? ` · v${version}` : ''}
    </p>
  </footer>
);

export default Footer;
