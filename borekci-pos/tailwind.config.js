/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      screens: {
        // Dokunmatik cihazlarda (parmakla kullanım) daha büyük hedefler için: touch:h-12 gibi
        touch: { raw: '(pointer: coarse)' },
      },
    },
  },
  plugins: [],
}

