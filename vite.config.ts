import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createOwnerMiddleware } from './server/owner.mjs';

export default defineConfig({
  plugins: [react(), {
    name: 'madar-owner-service',
    apply: 'serve',
    async configureServer(server) {
      server.middlewares.use(await createOwnerMiddleware({
        root: server.config.root,
        publicOrigin: process.env.MADAR_PUBLIC_ORIGIN,
        secureCookies: process.env.MADAR_SECURE_COOKIES === '1' ? true : undefined,
      }));
    },
  }],
  server: {
    fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.madar/**'] },
  },
  base: './',
});
