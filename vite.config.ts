import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react(), {
    name: 'madar-personal-bootstrap',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__madar_profile', async (request, response) => {
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.setHeader('Cache-Control', 'no-store');
        if (request.method !== 'GET') { response.statusCode = 405; response.end('{}'); return; }
        try { response.end(await readFile(resolve(server.config.root, '.madar/profile.json'), 'utf8')); }
        catch { response.statusCode = 404; response.end('{}'); }
      });
    },
  }],
  base: './',
});
