import React from 'react';

const Footer = () => {
  return (
    <footer className="text-center py-4 mt-auto">
      <p className="text-sm text-gray-600 dark:text-gray-400">
        © {new Date().getFullYear()} Emek Cafe - All Rights Reserved
      </p>
    </footer>
  );
};

export default Footer;

