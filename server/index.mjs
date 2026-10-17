import { createServer } from 'node:http';
import { readFile, stat, realpath } from 'node:fs/promises';
import { extname, resolve, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOwnerMiddleware } from './owner.mjs';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.pdf': 'application/pdf', '.zip': 'application/zip' };

/** Serves only dist; private repository files are never static assets. */
export async function createAppServer({ root, publicOrigin, secureCookies } = {}) {
  const middleware = await createOwnerMiddleware({ root, publicOrigin, secureCookies });
  const dist = resolve(root, 'dist');
  async function serve(request, response) {
    const reject = (status, message) => { response.statusCode = status; response.setHeader('Content-Type', 'text/plain; charset=utf-8'); response.end(message); };
    if (request.method !== 'GET' && request.method !== 'HEAD') { response.setHeader('Allow', 'GET, HEAD'); reject(405, 'Method not allowed'); return; }
    let pathname;
    try { pathname = decodeURIComponent((request.url ?? '/').split('?')[0]); } catch { reject(400, 'Invalid URL'); return; }
    if (!pathname.startsWith('/') || pathname.includes('\\') || pathname.includes('\0') || pathname.split('/').some(part => part.startsWith('.'))) { reject(404, 'Not found'); return; }
    if (pathname === '/api' || pathname.startsWith('/api/') || pathname.startsWith('/__')) { reject(404, 'Not found'); return; }
    let file = resolve(dist, `.${pathname}`);
    if (file !== dist && !file.startsWith(dist + sep)) { reject(404, 'Not found'); return; }
    try {
      let info;
      try { info = await stat(file); } catch (error) { if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error; }
      if (info?.isDirectory()) file = resolve(file, 'index.html');
      else if (!info) {
        if (extname(pathname) || !(request.headers.accept ?? '').includes('text/html')) { reject(404, 'Not found'); return; }
        file = resolve(dist, 'index.html');
      }
      const actualDist = await realpath(dist), actualFile = await realpath(file);
      if (!actualFile.startsWith(actualDist + sep)) { reject(404, 'Not found'); return; }
      const bytes = await readFile(actualFile);
      response.statusCode = 200;
      response.setHeader('Content-Type', MIME[extname(file)] ?? 'application/octet-stream');
      response.setHeader('Content-Length', String(bytes.length));
      response.setHeader('Cache-Control', extname(file) === '.html' ? 'no-cache' : 'public, max-age=3600');
      response.setHeader('X-Content-Type-Options', 'nosniff');
      response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      response.setHeader('Permissions-Policy', 'microphone=(self), camera=()');
      if (request.method === 'HEAD') response.end(); else response.end(bytes);
    } catch { reject(404, 'Not found'); }
  }
  const server = createServer((request, response) => {
    middleware(request, response, () => { void serve(request, response).catch(() => { if (!response.headersSent) response.statusCode = 500; response.end(); }); });
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const port = Number(process.env.PORT || 4173);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
  const server = await createAppServer({ root, publicOrigin: process.env.MADAR_PUBLIC_ORIGIN, secureCookies: process.env.MADAR_SECURE_COOKIES === '1' ? true : undefined });
  server.listen(port, process.env.HOST || '0.0.0.0', () => console.log(`مدار يعمل على المنفذ ${port}.`));
}
