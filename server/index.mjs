import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, createHash, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { emptyData, validateData } from '../src/validation.ts';

const scrypt = promisify(scryptCallback);
const dataDir = resolve(process.env.LEADER_DATA_DIR || '.leader-data');
mkdirSync(dataDir, { recursive: true, mode: 0o700 });
const db = new DatabaseSync(resolve(dataDir, 'leader.sqlite'));
db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, salt TEXT NOT NULL, password_hash TEXT NOT NULL, owner INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires INTEGER NOT NULL);');
const staticRoot = resolve('dist');
const attempts = new Map();
const hash = value => createHash('sha256').update(value).digest('hex');
const expiry = () => Date.now() + 7 * 24 * 60 * 60 * 1000;
const cookie = value => 'leader_session=' + value + '; HttpOnly; SameSite=Lax; Path=/; Max-Age=' + (value ? 604800 : 0) + (process.env.NODE_ENV === 'production' ? '; Secure' : '');
function json(res, status, value) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); }
function current(req) {
 const token = /(?:^|;\s*)leader_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
 if (!token) return null;
 return db.prepare('SELECT users.* FROM sessions JOIN users ON sessions.user_id=users.id WHERE sessions.hash=? AND sessions.expires>?').get(hash(token), Date.now()) || null;
}
async function body(req) {
 let count = 0; const chunks = [];
 for await (const chunk of req) { count += chunk.length; if (count > 4 * 1024 * 1024) throw new Error('body-size'); chunks.push(chunk); }
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function session(res, user) {
 db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
 const token = randomBytes(32).toString('hex');
 db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(hash(token), user.id, expiry());
 res.setHeader('Set-Cookie', cookie(token));
 json(res, 200, { user: { id: user.id, username: user.username, owner: !!user.owner }, data: JSON.parse(user.data) });
}
function validOrigin(req) {
 try { const origin = new URL(req.headers.origin || ''); return origin.host === req.headers.host && ['http:', 'https:'].includes(origin.protocol); } catch { return false; }
}
const server = http.createServer(async (req, res) => {
 try {
  const path = new URL(req.url, 'http://local').pathname;
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  if (path.startsWith('/api/')) {
   if (!['GET', 'POST', 'PUT'].includes(req.method)) return json(res, 405, { error: 'طريقة الطلب غير متاحة.' });
   if (req.method !== 'GET' && !validOrigin(req)) return json(res, 403, { error: 'الطلب لا يأتي من موقع التطبيق.' });
   if (['/api/auth/register', '/api/auth/login'].includes(path) && req.method === 'POST') {
    const ip = req.socket.remoteAddress || 'local'; const now = Date.now();
    const record = attempts.get(ip);
    const attempt = !record || record.until < now ? { count: 0, until: now + 15 * 60 * 1000 } : record;
    attempts.set(ip, attempt); if (++attempt.count > 20) return json(res, 429, { error: 'محاولات كثيرة. انتظر قليلاً ثم حاول مجدداً.' });
    const payload = await body(req); const username = String(payload.username || '').trim().normalize('NFKC').toLowerCase(); const password = payload.password;
    if (!/^[a-z0-9.!#$%&*+\/=?^_{}|~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(username) || username.length > 254 || typeof password !== 'string' || password.length < 10 || password.length > 128) return json(res, 400, { error: 'أدخل بريداً إلكترونياً صحيحاً وكلمة مرور من ١٠ إلى ١٢٨ حرفاً.' });
    let user = db.prepare('SELECT * FROM users WHERE username=?').get(username);
    if (path.endsWith('/register')) {
     if (user) return json(res, 409, { error: 'اسم المستخدم غير متاح.' });
     const salt = randomBytes(16).toString('hex'); const passwordHash = Buffer.from(await scrypt(password, salt, 64)).toString('hex');
     const ownerKey = process.env.LEADER_OWNER_SETUP_KEY;
     const owner = !!ownerKey && typeof payload.ownerKey === 'string' && timingSafeEqual(Buffer.from(hash(ownerKey)), Buffer.from(hash(payload.ownerKey))) && !db.prepare('SELECT id FROM users WHERE owner=1').get();
     const id = randomUUID(); const data = emptyData(); data.settings.name = username;
     db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?)').run(id, username, salt, passwordHash, owner ? 1 : 0, JSON.stringify(data));
     user = db.prepare('SELECT * FROM users WHERE id=?').get(id);
    } else {
     const expected = user ? Buffer.from(user.password_hash, 'hex') : Buffer.alloc(64);
     const actual = Buffer.from(await scrypt(password, user?.salt || 'invalid-user-salt', 64));
     if (!user || !timingSafeEqual(expected, actual)) return json(res, 401, { error: 'اسم المستخدم أو كلمة المرور غير صحيحة.' });
    }
    if (path.endsWith('/login')) attempts.delete(ip); return session(res, user);
   }
   const user = current(req);
   if (!user) return json(res, 401, { error: 'سجّل الدخول للمتابعة.' });
   if (path === '/api/auth/session' && req.method === 'GET') return json(res, 200, { user: { id: user.id, username: user.username, owner: !!user.owner }, data: JSON.parse(user.data) });
   if (path === '/api/auth/logout' && req.method === 'POST') {
    const token = /leader_session=([a-f0-9]{64})/.exec(req.headers.cookie || '')?.[1];
    if (token) db.prepare('DELETE FROM sessions WHERE hash=?').run(hash(token));
    res.setHeader('Set-Cookie', cookie('')); return json(res, 200, { ok: true });
   }
   if (path === '/api/data' && req.method === 'PUT') {
    if (req.headers['x-leader-account'] !== user.id) return json(res, 403, { error: 'تغيّر الحساب. أعد تسجيل الدخول قبل الحفظ.' });
    const value = await body(req);
    if (!validateData(value)) return json(res, 400, { error: 'البيانات غير صالحة ولم تُحفظ.' });
    db.prepare('UPDATE users SET data=? WHERE id=?').run(JSON.stringify(value), user.id);
    return json(res, 200, { ok: true });
   }
   return json(res, 404, { error: 'المسار غير موجود.' });
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'طريقة الطلب غير متاحة.' });
  if (path.startsWith('/personal-lessons/')) {
   const user = current(req);
   if (!user?.owner) return json(res, 404, { error: 'الملف غير متاح لهذا الحساب.' });
   res.setHeader('Cache-Control', 'private, no-store');
  }
  const file = resolve(staticRoot, '.' + decodeURIComponent(path === '/' ? '/index.html' : path));
  if (!file.startsWith(staticRoot + '/')) return json(res, 404, { error: 'غير موجود.' });
  let content; try { if (!statSync(file).isFile()) throw new Error(); content = readFileSync(file); } catch { return json(res, 404, { error: 'الملف غير موجود.' }); }
  const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.png':'image/png', '.json':'application/json; charset=utf-8', '.webmanifest':'application/manifest+json', '.pdf':'application/pdf' };
  if (!path.startsWith('/personal-lessons/')) res.setHeader('Cache-Control', path.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
  res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream'); res.writeHead(200); res.end(req.method === 'HEAD' ? undefined : content);
 } catch (error) { json(res, 400, { error: error.message === 'body-size' ? 'البيانات أكبر من الحد المسموح.' : 'تعذّر تنفيذ الطلب.' }); }
});
server.listen(Number(process.env.PORT || 3001), process.env.LEADER_BIND_HOST || '127.0.0.1', () => console.log('Leader server is ready.'));
