import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, createHash, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { emptyData, validateData } from '../src/validation.ts';
import { LOGISTICS_LESSONS } from '../src/logisticsContent.ts';
import { connectMoodle, syncMoodle } from './moodle.mjs';
import { generateAcademicSummary } from './openai.mjs';

const scrypt = promisify(scryptCallback);
const dataDir = resolve(process.env.LEADER_DATA_DIR || '.leader-data');
mkdirSync(dataDir, { recursive: true, mode: 0o700 });
const db = new DatabaseSync(resolve(dataDir, 'leader.sqlite'));
db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, salt TEXT NOT NULL, password_hash TEXT NOT NULL, owner INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS course_summaries (user_id TEXT NOT NULL, course_id TEXT NOT NULL, summary_json TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(user_id, course_id));');
db.exec('CREATE TABLE IF NOT EXISTS recovery_codes (hash TEXT PRIMARY KEY, user_id TEXT UNIQUE NOT NULL)');
const staticRoot = resolve(process.env.LEADER_STATIC_DIR || 'dist');
const attempts = new Map();
const moodleConnections = new Map();
const moodleAttempts = new Map();
const summaryAttempts = new Map();
const hash = value => createHash('sha256').update(value).digest('hex');
const expiry = () => Date.now() + 7 * 24 * 60 * 60 * 1000;
const cookie = value => 'leader_session=' + value + '; HttpOnly; SameSite=Lax; Path=/; Max-Age=' + (value ? 604800 : 0) + (process.env.NODE_ENV === 'production' ? '; Secure' : '');
function json(res, status, value) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); }
function current(req) {
 const token = /(?:^|;\s*)leader_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
 if (!token) return null;
 return db.prepare('SELECT users.* FROM sessions JOIN users ON sessions.user_id=users.id WHERE sessions.hash=? AND sessions.expires>?').get(hash(token), Date.now()) || null;
}
function withSharedContent(user) {
 if (!user) return user;
 const data = JSON.parse(user.data);
 const before = JSON.stringify(data);
 const courseId = 'inventory-management';
 if (!data.courses.some(course => course.id === courseId)) data.courses.push({ id: courseId, name: 'إدارة المخزون والمخازن', color: '#7c3aed' });
 LOGISTICS_LESSONS.forEach((lesson, index) => {
  if (!data.lectures.some(lecture => lecture.id === lesson.id)) data.lectures.push({ id: lesson.id, courseId, day: index, start: '', end: '', location: lesson.title, timePending: 'حدّد الموعد ورابط الحضور من منصة مودل' });
  if (!data.notes.some(note => note.id === lesson.id)) data.notes.push({ id: lesson.id, courseId, title: lesson.title, content: lesson.summary, summary: lesson.summary, updatedAt: new Date().toISOString() });
 });
 const serialized = JSON.stringify(data);
 if (serialized !== before) db.prepare('UPDATE users SET data=? WHERE id=?').run(serialized, user.id);
 return { ...user, data: serialized };
}
function mergeMoodleData(user, result) {
 const data = JSON.parse(user.data);
 for (const course of result.courses) {
  const existing = data.courses.find(item => item.id === course.id);
  if (existing) { if (course.resources) existing.resources = course.resources; existing.name = course.name; if (course.code) existing.code = course.code; }
  else data.courses.push({ id:course.id, name:course.name, code:course.code, color:course.color, resources:course.resources });
 }
 const events = new Map((data.universityEvents ?? []).map(event => [event.id, event]));
 result.events.forEach(event => events.set(event.id, event));
 data.universityEvents = [...events.values()];
 for (const event of result.events.filter(item => item.kind === 'exam' || item.kind === 'assignment')) {
  const id = `${event.id}-task`; const kind = event.kind === 'exam' ? 'exam' : 'assignment';
  const task = data.tasks.find(item => item.id === id);
  const courseId = event.courseId && data.courses.some(course => course.id === event.courseId) ? event.courseId : '';
  const value = { id, title:event.title, courseId, kind, due:event.date, priority:kind === 'exam' ? 'high' : 'medium', minutes:kind === 'exam' ? 180 : 90, completed:task?.completed || false, time:event.time || undefined, endTime:event.endTime || undefined, timePending:event.time ? undefined : 'الوقت غير محدد في مودل' };
  if (task) Object.assign(task, value); else data.tasks.push(value);
 }
 const serialized = JSON.stringify(data);
 db.prepare('UPDATE users SET data=? WHERE id=?').run(serialized, user.id);
 return { ...user, data:serialized };
}
function accountJson(user, extra = {}) { return { ...extra, user:{ id:user.id, username:user.username, owner:!!user.owner }, data:JSON.parse(user.data) }; }
async function body(req) {
 let count = 0; const chunks = [];
 for await (const chunk of req) { count += chunk.length; if (count > 4 * 1024 * 1024) throw new Error('body-size'); chunks.push(chunk); }
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function session(res, user, extra = {}) {
 user = withSharedContent(user);
 db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
 const token = randomBytes(32).toString('hex');
 db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(hash(token), user.id, expiry());
 res.setHeader('Set-Cookie', cookie(token));
 json(res, 200, { ...extra, user: { id: user.id, username: user.username, owner: !!user.owner }, data: JSON.parse(user.data) });
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
   if (path === '/api/auth/recover' && req.method === 'POST') {
    const ip = req.socket.remoteAddress || 'local'; const now = Date.now();
    const key = 'recovery:' + ip; let record = attempts.get(key);
    if (!record || record.until < now) { record = { count:0, until:now + 15 * 60 * 1000 }; attempts.set(key, record); }
    if (++record.count > 10) return json(res, 429, { error:'محاولات كثيرة. انتظر ١٥ دقيقة.' });
    const payload = await body(req);
    if (typeof payload.newPassword !== 'string' || payload.newPassword.length < 5 || payload.newPassword.length > 128) return json(res, 400, { error:'كلمة المرور الجديدة يجب أن تكون ٥ خانات على الأقل.' });
    const code = String(payload.recoveryCode || '').replace(/[-\s]/g, '').toLowerCase();
    const match = /^[a-f0-9]{64}$/.test(code) ? db.prepare('SELECT user_id FROM recovery_codes WHERE hash=?').get(hash(code)) : null;
    if (!match) return json(res, 401, { error:'رمز الاسترداد غير صالح أو سبق استخدامه.' });
    const salt = randomBytes(16).toString('hex'); const passwordHash = Buffer.from(await scrypt(payload.newPassword, salt, 64)).toString('hex');
    // Consume the code after scrypt using a conditional delete so concurrent requests cannot replay it.
    db.exec('BEGIN IMMEDIATE');
    try {
     const consumed = db.prepare('DELETE FROM recovery_codes WHERE hash=?').run(hash(code));
     if (!consumed.changes) { db.exec('ROLLBACK'); return json(res,401,{ error:'رمز الاسترداد غير صالح أو سبق استخدامه.' }); }
     db.prepare('UPDATE users SET salt=?, password_hash=? WHERE id=?').run(salt,passwordHash,match.user_id);
     db.prepare('DELETE FROM sessions WHERE user_id=?').run(match.user_id); db.exec('COMMIT');
    } catch(error) { db.exec('ROLLBACK'); throw error; }
    moodleConnections.delete(match.user_id);
    return session(res,db.prepare('SELECT * FROM users WHERE id=?').get(match.user_id));
   }
   if (['/api/auth/register', '/api/auth/login'].includes(path) && req.method === 'POST') {
    const ip = req.socket.remoteAddress || 'local'; const now = Date.now();
    const record = attempts.get(ip);
    const attempt = !record || record.until < now ? { count: 0, until: now + 15 * 60 * 1000 } : record;
    attempts.set(ip, attempt); if (++attempt.count > 20) return json(res, 429, { error: 'محاولات كثيرة. انتظر قليلاً ثم حاول مجدداً.' });
    const payload = await body(req); const username = String(payload.username || '').trim().normalize('NFKC').toLowerCase(); const password = payload.password;
    if (!/^[a-z0-9.!#$%&*+\/=?^_{}|~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(username) || username.length > 254 || typeof password !== 'string' || password.length < (path.endsWith('/register') ? 5 : 3) || password.length > 128) return json(res, 400, { error: 'أدخل بريداً إلكترونياً صحيحاً وكلمة مرور جديدة من ٥ خانات على الأقل.' });
    let user = db.prepare('SELECT * FROM users WHERE username=?').get(username);
    if (path.endsWith('/register')) {
     if (user) return json(res, 409, { error: 'اسم المستخدم غير متاح.' });
     const salt = randomBytes(16).toString('hex'); const passwordHash = Buffer.from(await scrypt(password, salt, 64)).toString('hex');
     const ownerKey = process.env.LEADER_OWNER_SETUP_KEY;
     const ownerExists = !!db.prepare('SELECT id FROM users WHERE owner=1').get();
     const accountCount = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
     const validOwnerKey = !!ownerKey && typeof payload.ownerKey === 'string' && timingSafeEqual(Buffer.from(hash(ownerKey)), Buffer.from(hash(payload.ownerKey)));
     // On simple deployments without a setup key, the first account safely closes
     // the one-time owner bootstrap. Hosted deployments can still require a key.
     const owner = !ownerExists && (validOwnerKey || (!ownerKey && accountCount === 0));
     const id = randomUUID(); const data = emptyData(); data.settings.name = username;
     db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?)').run(id, username, salt, passwordHash, owner ? 1 : 0, JSON.stringify(data));
     user = db.prepare('SELECT * FROM users WHERE id=?').get(id);
    } else {
     const expected = user ? Buffer.from(user.password_hash, 'hex') : Buffer.alloc(64);
     const actual = Buffer.from(await scrypt(password, user?.salt || 'invalid-user-salt', 64));
     if (!user || !timingSafeEqual(expected, actual)) return json(res, 401, { error: 'اسم المستخدم أو كلمة المرور غير صحيحة.' });
     const ownerKey = process.env.LEADER_OWNER_SETUP_KEY;
     const ownerExists = !!db.prepare('SELECT id FROM users WHERE owner=1').get();
     const accountCount = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
     if (!ownerKey && !ownerExists && accountCount === 1) {
      db.prepare('UPDATE users SET owner=1 WHERE id=?').run(user.id);
      user = db.prepare('SELECT * FROM users WHERE id=?').get(user.id);
     }
    }
    if (path.endsWith('/login')) attempts.delete(ip); return session(res, user);
   }
   const user = current(req);
   if (!user) return json(res, 401, { error: 'سجّل الدخول للمتابعة.' });
   if (path === '/api/auth/session' && req.method === 'GET') {
    const hydrated = withSharedContent(user);
    return json(res, 200, { user: { id: hydrated.id, username: hydrated.username, owner: !!hydrated.owner }, data: JSON.parse(hydrated.data) });
   }
   if (['/api/auth/recovery-code', '/api/auth/password'].includes(path) && req.method === 'POST') {
    const key = 'credential:' + user.id; const now = Date.now(); let record = attempts.get(key);
    if (!record || record.until < now) { record = {count:0,until:now+15*60*1000}; attempts.set(key,record); }
    if (++record.count > 10) return json(res,429,{error:'محاولات كثيرة. انتظر ١٥ دقيقة.'});
   }
   if (path === '/api/auth/recovery-code' && req.method === 'POST') {
    const payload = await body(req); const password = payload.currentPassword;
    if (typeof password !== 'string' || password.length > 128) return json(res,400,{ error:'أدخل كلمة المرور الحالية.' });
    const actual = Buffer.from(await scrypt(password,user.salt,64));
    if (!timingSafeEqual(actual,Buffer.from(user.password_hash,'hex'))) return json(res,401,{ error:'كلمة المرور الحالية غير صحيحة.' });
    const code = randomBytes(32).toString('hex');
    db.prepare('INSERT INTO recovery_codes (hash,user_id) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET hash=excluded.hash').run(hash(code),user.id);
    return json(res,200,{ recoveryCode:code });
   }
   if (path === '/api/auth/logout' && req.method === 'POST') {
    const token = /leader_session=([a-f0-9]{64})/.exec(req.headers.cookie || '')?.[1];
    if (token) db.prepare('DELETE FROM sessions WHERE hash=?').run(hash(token));
    moodleConnections.delete(user.id);
    res.setHeader('Set-Cookie', cookie('')); return json(res, 200, { ok: true });
   }
   if (path === '/api/auth/password' && req.method === 'POST') {
    const payload = await body(req);
    const currentPassword = payload.currentPassword;
    const newPassword = payload.newPassword;
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || newPassword.length < 5 || newPassword.length > 128) return json(res, 400, { error: 'كلمة المرور الجديدة يجب أن تكون ٥ خانات على الأقل.' });
    const actual = Buffer.from(await scrypt(currentPassword, user.salt, 64));
    if (!timingSafeEqual(Buffer.from(user.password_hash, 'hex'), actual)) return json(res, 401, { error: 'كلمة المرور الحالية غير صحيحة.' });
    const salt = randomBytes(16).toString('hex');
    const passwordHash = Buffer.from(await scrypt(newPassword, salt, 64)).toString('hex');
    db.prepare('UPDATE users SET salt=?, password_hash=? WHERE id=?').run(salt, passwordHash, user.id);
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
    db.prepare('DELETE FROM recovery_codes WHERE user_id=?').run(user.id);
    return session(res, db.prepare('SELECT * FROM users WHERE id=?').get(user.id));
   }
   if (path === '/api/auth/claim-owner' && req.method === 'POST') {
    const existingOwner = db.prepare('SELECT id FROM users WHERE owner=1').get();
    if (existingOwner && existingOwner.id !== user.id) return json(res, 409, { error: 'تم تفعيل حساب مدير التطبيق مسبقاً.' });
    db.prepare('UPDATE users SET owner=1 WHERE id=?').run(user.id);
    return session(res, db.prepare('SELECT * FROM users WHERE id=?').get(user.id));
   }
   if (path === '/api/moodle/status' && req.method === 'GET') return json(res, 200, { connected:moodleConnections.has(user.id) });
   if (path === '/api/moodle/disconnect' && req.method === 'POST') {
    moodleConnections.delete(user.id); return json(res, 200, { connected:false });
   }
   if (path === '/api/moodle/connect' && req.method === 'POST') {
    const now = Date.now(); const record = moodleAttempts.get(user.id);
    const attempt = !record || record.until < now ? { count:0, until:now + 15 * 60 * 1000 } : record;
    moodleAttempts.set(user.id, attempt);
    if (++attempt.count > 5) return json(res, 429, { error:'محاولات كثيرة. انتظر ١٥ دقيقة ثم حاول مجدداً.' });
    const payload = await body(req); const username = String(payload.username || '').trim(); const password = payload.password;
    if (!username || username.length > 254 || typeof password !== 'string' || !password || password.length > 256) return json(res, 400, { error:'أدخل اسم مستخدم مودل وكلمة المرور.' });
    try {
     const token = await connectMoodle(username, password);
     const result = await syncMoodle(token);
     moodleConnections.set(user.id, token); moodleAttempts.delete(user.id);
     const updated = mergeMoodleData(user, result);
     return json(res, 200, accountJson(updated, { connected:true, moodle:{ siteName:result.siteName, fullName:result.fullName, courseCount:result.courses.length, eventCount:result.events.length, warnings:result.warnings } }));
    } catch { return json(res, 502, { error:'تعذّر ربط مودل. تحقق من البيانات، أو قد تكون خدمة تطبيقات مودل غير مفعّلة لدى الجامعة.' }); }
   }
   if (path === '/api/moodle/sync' && req.method === 'POST') {
    const token = moodleConnections.get(user.id);
    if (!token) return json(res, 409, { error:'أعد ربط مودل أولاً.' });
    try {
     const result = await syncMoodle(token); const updated = mergeMoodleData(user, result);
     return json(res, 200, accountJson(updated, { connected:true, moodle:{ siteName:result.siteName, fullName:result.fullName, courseCount:result.courses.length, eventCount:result.events.length } }));
    } catch { moodleConnections.delete(user.id); return json(res, 502, { error:'تعذّرت مزامنة مودل. أعد الربط وحاول مرة أخرى.' }); }
   }
   if (path === '/api/ai/course-summary' && req.method === 'POST') {
    if (!process.env.OPENAI_API_KEY) return json(res, 503, { error:'خدمة التلخيص الذكي غير مفعّلة بعد. أضف OPENAI_API_KEY في إعدادات Render.' });
    const now = Date.now(); const record = summaryAttempts.get(user.id);
    const attempt = !record || record.until < now ? { count:0, until:now + 24 * 60 * 60 * 1000 } : record;
    summaryAttempts.set(user.id, attempt);
    if (++attempt.count > 10) return json(res, 429, { error:'وصلت إلى حد ١٠ ملخصات ذكية اليوم. حاول غداً.' });
    const payload = await body(req); const courseId = String(payload.courseId || '');
    const data = JSON.parse(user.data); const course = data.courses.find(item => item.id === courseId);
    if (!course) return json(res, 404, { error:'المادة غير موجودة في حسابك.' });
    const syllabus = String(payload.syllabus || '').trim();
    if (syllabus.length > 30000) return json(res, 400, { error:'وصف المادة أطول من الحد المسموح.' });
    try {
     const generated = await generateAcademicSummary({ name:course.name, code:course.code || '', syllabus });
     const id = `ai-summary-${course.id}`.slice(0, 145);
     const note = { id, title:`ملخص ذكي — ${course.name}`, courseId:course.id, content:syllabus || generated.markdown, summary:generated.markdown, updatedAt:new Date().toISOString() };
     const index = data.notes.findIndex(item => item.id === id);
     if (index >= 0) data.notes[index] = note; else data.notes.push(note);
     if (!validateData(data)) throw new Error('invalid-summary');
     const serialized = JSON.stringify(data); const updatedAt = new Date().toISOString();
     db.prepare('UPDATE users SET data=? WHERE id=?').run(serialized, user.id);
     db.prepare('INSERT INTO course_summaries (user_id,course_id,summary_json,updated_at) VALUES (?,?,?,?) ON CONFLICT(user_id,course_id) DO UPDATE SET summary_json=excluded.summary_json, updated_at=excluded.updated_at').run(user.id, course.id, JSON.stringify(generated), updatedAt);
     return json(res, 200, accountJson({ ...user, data:serialized }, { summary:generated }));
    } catch { return json(res, 502, { error:'تعذّر إنشاء الملخص حالياً. تحقق من مفتاح OpenAI وحاول مجدداً.' }); }
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
  const decodedPath = decodeURIComponent(path);
  if (decodedPath.includes('\\') || decodedPath.split('/').some(part => part === '.' || part === '..')) return json(res, 404, { error: 'غير موجود.' });
  const privateLesson = decodedPath.replace(/\/+/g, '/').toLowerCase().startsWith('/personal-lessons/');
  if (privateLesson) {
   const user = current(req);
   if (!user?.owner) return json(res, 404, { error: 'الملف غير متاح لهذا الحساب.' });
   res.setHeader('Cache-Control', 'private, no-store');
  }
  const file = resolve(staticRoot, '.' + decodeURIComponent(path === '/' ? '/index.html' : path));
  if (!file.startsWith(staticRoot + sep)) return json(res, 404, { error: 'غير موجود.' });
  let content; try { if (!statSync(file).isFile()) throw new Error(); content = readFileSync(file); } catch { return json(res, 404, { error: 'الملف غير موجود.' }); }
  const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.png':'image/png', '.svg':'image/svg+xml', '.json':'application/json; charset=utf-8', '.webmanifest':'application/manifest+json', '.pdf':'application/pdf' };
  if (!privateLesson) res.setHeader('Cache-Control', path.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
  res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream'); res.writeHead(200); res.end(req.method === 'HEAD' ? undefined : content);
 } catch (error) { json(res, 400, { error: error.message === 'body-size' ? 'البيانات أكبر من الحد المسموح.' : 'تعذّر تنفيذ الطلب.' }); }
});
server.listen(Number(process.env.PORT || 3001), process.env.LEADER_BIND_HOST || '127.0.0.1', () => console.log('Leader server is ready.'));
