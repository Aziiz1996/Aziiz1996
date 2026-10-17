import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, chmod, unlink, link } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { validateData } from '../src/dataValidation.ts';
import { handleNewsRequest } from './news.mjs';

export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const BODY_LIMIT = 10 * 1024 * 1024;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const COOKIE_NAME = 'madar_owner';
const PAGES = ['dashboard', 'courses', 'plan', 'tasks', 'practice', 'logistics', 'teacher', 'updates', 'notes', 'finance', 'profile', 'opportunities', 'settings', 'owner'];
export const DEFAULT_DESIGN = Object.freeze({
  appName: 'مدار', welcomeTitle: 'خطوة اليوم تصنع غداً أجمل.',
  welcomeMessage: 'يا هلا بلوجستي المستقبل! نرتّب دراستك ومواعيدك ومصروفاتك، ونمشي معك خطوة بخطوة.',
  accentColor: '#6b4fe0', navigation: PAGES, hiddenPages: [],
});
const object = value => typeof value === 'object' && value !== null && !Array.isArray(value);
const hash = value => createHash('sha256').update(value).digest('hex');
const derivePassword = (password, salt) => new Promise((resolveHash, reject) => {
  scrypt(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolveHash(key));
});
const equal = (left, right) => {
  const a = Buffer.from(left), b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};

async function atomicPrivateFile(path, text, createOnly = false) {
  const temporary = `${path}.${randomBytes(10).toString('hex')}.tmp`;
  try {
    await writeFile(temporary, text, { mode: 0o600, flag: 'wx' });
    if (createOnly) await link(temporary, path);
    else await rename(temporary, path);
    await chmod(path, 0o600);
  } finally { await unlink(temporary).catch(() => {}); }
}

function validOwner(value) {
  return object(value) && value.version === 1 && value.role === 'owner' && typeof value.username === 'string' &&
    /^[A-Za-z0-9_.@-]{3,100}$/.test(value.username) && typeof value.salt === 'string' && /^[a-f0-9]{64}$/.test(value.salt) &&
    typeof value.passwordHash === 'string' && /^[a-f0-9]{128}$/.test(value.passwordHash);
}

/** The initial password is written only to the private credential file, never returned or logged. */
export async function initializeOwner({ root, username = 'Aziiz1996' }) {
  if (!/^[A-Za-z0-9_.@-]{3,100}$/.test(username)) throw new Error('اسم مستخدم المالك غير صالح.');
  const directory = resolve(root, '.madar');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const path = join(directory, 'owner.json');
  try {
    const existing = JSON.parse(await readFile(path, 'utf8'));
    if (!validOwner(existing)) throw new Error('ملف حساب المالك غير صالح؛ لم يُستبدل.');
    await chmod(path, 0o600);
    return { username: existing.username, created: false, credentialsPath: join(directory, 'owner-credentials.txt') };
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const password = randomBytes(24).toString('base64url');
  const salt = randomBytes(32).toString('hex');
  const owner = { version: 1, role: 'owner', username, salt, passwordHash: (await derivePassword(password, salt)).toString('hex') };
  try { await atomicPrivateFile(path, JSON.stringify(owner), true); }
  catch (error) { if (error.code === 'EEXIST') return initializeOwner({ root, username }); throw error; }
  await atomicPrivateFile(join(directory, 'owner-credentials.txt'), `username: ${username}\npassword: ${password}\n`);
  return { username, created: true, credentialsPath: join(directory, 'owner-credentials.txt') };
}

export function validateOwnerDesign(value) {
  const pages = items => Array.isArray(items) && items.length <= PAGES.length && items.every(page => PAGES.includes(page)) && new Set(items).size === items.length;
  if (!object(value) || typeof value.appName !== 'string' || !value.appName.trim() || value.appName.length > 80 ||
      typeof value.welcomeTitle !== 'string' || value.welcomeTitle.length > 200 || typeof value.welcomeMessage !== 'string' || value.welcomeMessage.length > 1000 ||
      typeof value.accentColor !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value.accentColor) || !pages(value.navigation) || !pages(value.hiddenPages) ||
      value.hiddenPages.includes('dashboard') || value.hiddenPages.includes('owner')) return null;
  return {
    appName: value.appName.trim(), welcomeTitle: value.welcomeTitle, welcomeMessage: value.welcomeMessage, accentColor: value.accentColor,
    navigation: [...value.navigation, ...PAGES.filter(page => !value.navigation.includes(page))], hiddenPages: [...value.hiddenPages],
  };
}

function json(response, status, value) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.end(JSON.stringify(value));
}

function readBody(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? '')) {
    request.resume(); return Promise.reject({ status: 415, message: 'أرسل البيانات بصيغة JSON.' });
  }
  if (Number(request.headers['content-length']) > BODY_LIMIT) {
    request.resume(); return Promise.reject({ status: 413, message: 'حجم البيانات يتجاوز الحد المسموح.' });
  }
  return new Promise((resolveBody, reject) => {
    let length = 0, chunks = [], settled = false;
    const fail = error => { if (!settled) { settled = true; chunks = []; reject(error); } };
    request.on('data', chunk => {
      if (settled) return;
      length += chunk.length;
      if (length > BODY_LIMIT) { fail({ status: 413, message: 'حجم البيانات يتجاوز الحد المسموح.' }); return; }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (settled) return;
      try { const value = JSON.parse(Buffer.concat(chunks).toString('utf8')); settled = true; resolveBody(value); }
      catch { fail({ status: 400, message: 'صيغة البيانات غير صالحة.' }); }
    });
    request.on('error', () => fail({ status: 400, message: 'تعذّر استقبال البيانات.' }));
    request.on('aborted', () => fail({ status: 400, message: 'انقطع استقبال البيانات.' }));
  });
}

export async function createOwnerMiddleware({ root, publicOrigin, secureCookies } = {}) {
  if (!root) throw new Error('يجب تحديد مسار التطبيق.');
  const directory = resolve(root, '.madar');
  await initializeOwner({ root });
  let owner = JSON.parse(await readFile(join(directory, 'owner.json'), 'utf8'));
  const configuredOrigin = publicOrigin ? new URL(publicOrigin).origin : null;
  if (configuredOrigin && !/^https?:\/\//.test(configuredOrigin)) throw new Error('رابط التطبيق يجب أن يبدأ بـ HTTP أو HTTPS.');
  const sessions = new Map(), attempts = new Map();
  const csrfSecret = randomBytes(32);
  const csrf = token => createHmac('sha256', csrfSecret).update(token).digest('base64url');
  const cookie = (request, token, remove = false) => `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${remove ? 0 : SESSION_TTL_MS / 1000}${(secureCookies ?? (configuredOrigin?.startsWith('https:') || request.socket.encrypted)) ? '; Secure' : ''}`;
  const getToken = request => {
    const matches = (request.headers.cookie ?? '').split(';').map(part => part.trim()).filter(part => part.startsWith(`${COOKIE_NAME}=`));
    if (matches.length !== 1) return null;
    const token = matches[0].slice(COOKIE_NAME.length + 1);
    return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
  };
  const sessionFor = request => {
    const token = getToken(request);
    if (!token) return null;
    const key = hash(token), session = sessions.get(key);
    if (!session || session.expiresAt <= Date.now()) { sessions.delete(key); return null; }
    return { ...session, key, token };
  };
  const prune = () => {
    const now = Date.now();
    for (const [key, session] of sessions) if (session.expiresAt <= now) sessions.delete(key);
    for (const [key, attempt] of attempts) if (attempt.resetAt <= now) attempts.delete(key);
  };
  const sameOrigin = request => {
    let expected = configuredOrigin;
    if (!expected) {
      try { expected = new URL(`${request.socket.encrypted ? 'https' : 'http'}://${request.headers.host}`).origin; }
      catch { return false; }
    }
    return typeof request.headers.origin === 'string' && request.headers.origin === expected;
  };
  const requireMutation = (request, session) => sameOrigin(request) && typeof request.headers['x-csrf-token'] === 'string' && equal(request.headers['x-csrf-token'], csrf(session.token));
  const sessionJson = session => session ? { authenticated: true, username: owner.username, role: 'owner', csrfToken: csrf(session.token) } : { authenticated: false };

  async function handle(request, response, next) {
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname); }
    catch { json(response, 400, { error: 'الرابط غير صالح.' }); return; }
    // Also protect private files in development before Vite's file-serving middleware.
    if (pathname.split(/[\\/]/).includes('.madar')) { json(response, 404, { error: 'الملف غير موجود.' }); return; }
    if (await handleNewsRequest(request, response)) return;
    if (!pathname.startsWith('/api/') && pathname !== '/api' && pathname !== '/__madar_profile') { next(); return; }
    prune();
    const session = sessionFor(request);
    if (pathname === '/api/session' && request.method === 'GET') { json(response, 200, sessionJson(session)); return; }
    if (pathname === '/api/design' && request.method === 'GET') {
      let design;
      try { design = validateOwnerDesign(JSON.parse(await readFile(join(directory, 'design.json'), 'utf8'))); } catch { /* Safe defaults below. */ }
      json(response, 200, design ?? DEFAULT_DESIGN); return;
    }
    if (pathname === '/api/login' && request.method === 'POST') {
      if (!sameOrigin(request)) { json(response, 403, { error: 'مصدر الطلب غير مسموح.' }); return; }
      const key = request.socket.remoteAddress ?? 'unknown';
      let attempt = attempts.get(key);
      if (attempt && attempt.count >= 5) {
        response.setHeader('Retry-After', String(Math.ceil((attempt.resetAt - Date.now()) / 1000)));
        json(response, 429, { error: 'محاولات دخول كثيرة. حاول بعد ١٥ دقيقة.' }); return;
      }
      if (!attempt) {
        if (attempts.size >= 5000) { json(response, 429, { error: 'حاول تسجيل الدخول لاحقاً.' }); return; }
        attempt = { count: 0, resetAt: Date.now() + LOGIN_WINDOW_MS }; attempts.set(key, attempt);
      }
      attempt.count++;
      const body = await readBody(request);
      if (!object(body) || typeof body.username !== 'string' || body.username.length > 100 || typeof body.password !== 'string' || body.password.length > 1024) { json(response, 400, { error: 'أدخل اسم المستخدم وكلمة المرور.' }); return; }
      const computed = await derivePassword(body.password, owner.salt);
      if (!equal(hash(body.username), hash(owner.username)) || !equal(computed, Buffer.from(owner.passwordHash, 'hex'))) { json(response, 401, { error: 'اسم المستخدم أو كلمة المرور غير صحيح.' }); return; }
      attempts.delete(key);
      if (session) sessions.delete(session.key);
      if (sessions.size >= 1000) sessions.delete(sessions.keys().next().value);
      const token = randomBytes(32).toString('base64url');
      sessions.set(hash(token), { username: owner.username, expiresAt: Date.now() + SESSION_TTL_MS });
      response.setHeader('Set-Cookie', cookie(request, token));
      json(response, 200, sessionJson({ token })); return;
    }
    if (!session) { json(response, 401, { error: 'سجّل الدخول بحساب المالك للمتابعة.' }); return; }
    if (request.method !== 'GET' && request.method !== 'HEAD' && !requireMutation(request, session)) { json(response, 403, { error: 'تعذّر التحقق من الطلب. حدّث الصفحة وحاول مجدداً.' }); return; }
    if (pathname === '/api/logout' && request.method === 'POST') {
      sessions.delete(session.key); response.setHeader('Set-Cookie', cookie(request, '', true)); json(response, 200, { authenticated: false }); return;
    }
    if (pathname === '/api/owner/design' && request.method === 'PUT') {
      const design = validateOwnerDesign(await readBody(request));
      if (!design) { json(response, 400, { error: 'إعدادات المظهر أو القائمة غير صالحة.' }); return; }
      await atomicPrivateFile(join(directory, 'design.json'), JSON.stringify(design)); json(response, 200, design); return;
    }
    if ((pathname === '/api/owner/data' || pathname === '/__madar_profile') && request.method === 'GET') {
      let raw;
      try { raw = await readFile(join(directory, pathname === '/__madar_profile' ? 'profile.json' : 'owner-data.json'), 'utf8'); }
      catch (error) {
        if (error.code !== 'ENOENT' || pathname === '/__madar_profile') { json(response, 404, { error: 'لا توجد نسخة محفوظة بعد.' }); return; }
        try { raw = await readFile(join(directory, 'profile.json'), 'utf8'); } catch { json(response, 404, { error: 'لا توجد نسخة محفوظة بعد.' }); return; }
      }
      let data;
      try { data = JSON.parse(raw); } catch { /* Invalid private backups are never returned. */ }
      if (!validateData(data)) { json(response, 422, { error: 'النسخة المحفوظة غير صالحة؛ لم تتغير بياناتك.' }); return; }
      json(response, 200, data); return;
    }
    if (pathname === '/api/owner/data' && request.method === 'PUT') {
      const data = await readBody(request);
      if (!validateData(data)) { json(response, 400, { error: 'بيانات الطالب غير صالحة.' }); return; }
      await atomicPrivateFile(join(directory, 'owner-data.json'), JSON.stringify(data)); json(response, 200, { saved: true }); return;
    }
    if (pathname === '/api/owner/password' && request.method === 'POST') {
      const body = await readBody(request);
      if (!object(body) || typeof body.currentPassword !== 'string' || body.currentPassword.length > 1024 || typeof body.newPassword !== 'string' || body.newPassword.length < 12 || body.newPassword.length > 1024 || body.newPassword === body.currentPassword) { json(response, 400, { error: 'استخدم كلمة مرور جديدة مختلفة من ١٢ حرفاً على الأقل.' }); return; }
      const computed = await derivePassword(body.currentPassword, owner.salt);
      if (!equal(computed, Buffer.from(owner.passwordHash, 'hex'))) { json(response, 401, { error: 'كلمة المرور الحالية غير صحيحة.' }); return; }
      const salt = randomBytes(32).toString('hex');
      const updated = { ...owner, salt, passwordHash: (await derivePassword(body.newPassword, salt)).toString('hex') };
      await atomicPrivateFile(join(directory, 'owner.json'), JSON.stringify(updated));
      owner = updated; sessions.clear(); await unlink(join(directory, 'owner-credentials.txt')).catch(() => {});
      response.setHeader('Set-Cookie', cookie(request, '', true)); json(response, 200, { authenticated: false }); return;
    }
    json(response, 404, { error: 'الخدمة المطلوبة غير موجودة.' });
  }
  return function ownerMiddleware(request, response, next) {
    void handle(request, response, next).catch(error => {
      if (!response.headersSent) json(response, Number.isInteger(error?.status) ? error.status : 500, { error: Number.isInteger(error?.status) ? error.message : 'تعذّر إكمال العملية على الخادم.' });
      else response.end();
    });
  };
}
