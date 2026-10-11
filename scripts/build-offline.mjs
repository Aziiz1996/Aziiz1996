import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const assets = (await readdir('dist/assets')).map(name => './assets/' + name);
const html = await readFile('dist/index.html', 'utf8');
const version = createHash('sha256').update(html + assets.join('')).digest('hex').slice(0, 12);
const urls = ['./', './index.html', './leader-icon.png', './leader-icon-large.png', './logistics-warehouse.svg', './logistics-network.svg', './logistics-planning.svg', './manifest.webmanifest', ...assets];
const sw = `const CACHE = 'az-logistics-${version}';
const URLS = ${JSON.stringify(urls)};
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(URLS))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => (key.startsWith('aziz-leader-') || key.startsWith('az-logistics-')) && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
 const request = event.request;
 const url = new URL(request.url);
 if (request.method !== 'GET' || url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
 if (request.mode === 'navigate') {
  event.respondWith(fetch(request).catch(async () => (await caches.match(new URL('./index.html', self.registration.scope))) || Response.error()));
  return;
 }
 if (url.pathname.includes('/api/') || url.pathname.includes('/personal-lessons/')) return;
 event.respondWith(caches.open(CACHE).then(async cache => {
  const saved = await cache.match(request);
  if (saved) return saved;
  const response = await fetch(request);
  if (response.ok && url.pathname.includes('/assets/')) await cache.put(request, response.clone());
  return response;
 }));
});
`;
await writeFile('dist/sw.js', sw);
console.log('Offline app shell generated.');
