import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.madar/**', '**/.leader-data/**'] },
    proxy: {
      '/api': { target: 'http://127.0.0.1:3001', changeOrigin: false },
      '/personal-lessons': { target: 'http://127.0.0.1:3001', changeOrigin: false },
    },
  },
  base: './',
});
