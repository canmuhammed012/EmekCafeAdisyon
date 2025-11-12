import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  base: './', // ÖNEMLİ: file:// ile düzgün yüklensin (relative paths)
  publicDir: 'public', // Public klasörü (logo.png buraya konulacak)
})

