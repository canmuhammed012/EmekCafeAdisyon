import React from 'react';

const Footer = ({ className = '' }) => {
  return (
    <footer className={`text-center py-4 ${className}`}>
      <p className="text-sm text-gray-600 dark:text-gray-400">
        © {new Date().getFullYear()} Emek Cafe - All Rights Reserved
      </p>
    </footer>
  );
};

export default Footer;

