import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile, chmod, unlink, link } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { emptyData, validateData } from '../src/validation.ts';

const scrypt = promisify(scryptCallback);
export const OWNER_LOGIN = 'Aziiz1996';
export const OWNER_TECHNICAL_EMAIL = 'aziiz1996@owner.invalid';
async function privateFile(path, text) {
  const temporary = `${path}.${randomBytes(10).toString('hex')}.tmp`;
  try { await writeFile(temporary, text, { flag: 'wx', mode: 0o600 }); await link(temporary, path); await chmod(path, 0o600); }
  finally { await unlink(temporary).catch(() => {}); }
}

/** Opt-in bootstrap for an empty account database, never a second authentication service. */
export async function initializeOwner({ root, dataDir = resolve(root, '.leader-data'), ownerEmail = process.env.LEADER_OWNER_EMAIL, setupKey = process.env.LEADER_OWNER_SETUP_KEY }) {
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  await chmod(dataDir, 0o700);
  const path = resolve(dataDir, 'leader.sqlite');
  const db = new DatabaseSync(path);
  try {
    db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, salt TEXT NOT NULL, password_hash TEXT NOT NULL, owner INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL);');
    const existingOwner = db.prepare('SELECT id FROM users WHERE owner=1').get();
    if (existingOwner) return { created: false, reason: 'owner-exists' };
    if (db.prepare('SELECT COUNT(*) AS count FROM users').get().count) return { created: false, reason: 'accounts-exist' };
    if (String(ownerEmail || '').trim() || setupKey) return { created: false, reason: 'configured-owner-setup' };
    const privateDir = resolve(root, '.madar');
    await mkdir(privateDir, { recursive: true, mode: 0o700 });
    await chmod(privateDir, 0o700);
    const credentialsPath = join(privateDir, 'owner-credentials.txt');
    let password;
    try {
      const credentials = await readFile(credentialsPath, 'utf8');
      const name = /^username: (.+)$/m.exec(credentials)?.[1];
      password = /^password: (.+)$/m.exec(credentials)?.[1];
      if (name !== OWNER_LOGIN || typeof password !== 'string' || password.length < 12 || password.length > 128) throw new Error('invalid-private-credentials');
      await chmod(credentialsPath, 0o600);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      password = randomBytes(24).toString('base64url');
      try { await privateFile(credentialsPath, `username: ${OWNER_LOGIN}\npassword: ${password}\n`); }
      catch (writeError) { if (writeError.code === 'EEXIST') throw new Error('credential-race-retry'); throw writeError; }
    }
    let data = emptyData();
    let seeded = false;
    try {
      const profile = JSON.parse(await readFile(join(privateDir, 'profile.json'), 'utf8'));
      if (!validateData(profile)) throw new Error('invalid-private-profile');
      data = profile; seeded = true;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (!data.settings.name) data.settings.name = OWNER_LOGIN;
    // Use the shared library's inventory identity without adding a duplicate personal course.
    const inventory = data.courses.find(course => course.name.normalize('NFKC').replace(/[إأآ]/g,'ا').replace(/[\u064B-\u065Fـ]/g,'').replace(/\s+/g,' ').trim() === 'ادارة المخزون والمخازن');
    if (inventory && inventory.id !== 'inventory-management' && !data.courses.some(course => course.id === 'inventory-management')) {
      const oldId = inventory.id; inventory.id = 'inventory-management';
      for (const rows of [data.lectures, data.tasks, data.notes, data.universityEvents || []]) for (const row of rows) if (row.courseId === oldId) row.courseId = inventory.id;
    }
    const salt = randomBytes(16).toString('hex');
    const passwordHash = Buffer.from(await scrypt(password, salt, 64)).toString('hex');
    db.exec('BEGIN IMMEDIATE');
    try {
      if (db.prepare('SELECT COUNT(*) AS count FROM users').get().count) { db.exec('ROLLBACK'); return { created: false, reason: 'accounts-exist' }; }
      const id = randomUUID();
      db.prepare('INSERT INTO users (id,username,salt,password_hash,owner,data) VALUES (?,?,?,?,1,?)').run(id, OWNER_TECHNICAL_EMAIL, salt, passwordHash, JSON.stringify(data));
      db.exec('CREATE TABLE IF NOT EXISTS owner_bootstrap (user_id TEXT PRIMARY KEY, credentials_path TEXT NOT NULL)');
      db.prepare('INSERT INTO owner_bootstrap (user_id,credentials_path) VALUES (?,?)').run(id,credentialsPath);
      db.exec('COMMIT');
      await chmod(path, 0o600);
      return { created: true, login: OWNER_LOGIN, seeded, credentialsPath };
    } catch (error) { if (db.isTransaction) db.exec('ROLLBACK'); throw error; }
  } finally { db.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  try {
    const result = await initializeOwner({ root, dataDir: resolve(process.env.LEADER_DATA_DIR || join(root, '.leader-data')) });
    if (result.created) console.log('تم إنشاء حساب المالك داخل قاعدة الحسابات الحالية. الدخول باسم Aziiz1996؛ كلمة المرور في الملف الخاص .madar/owner-credentials.txt.');
    else console.log(result.reason === 'owner-exists' ? 'حساب المالك موجود؛ لم تتغير الحسابات أو كلمات المرور.' : result.reason === 'configured-owner-setup' ? 'إعدادات الاستضافة تحدد آلية تفعيل المالك؛ لم ننشئ حساباً بديلاً.' : 'توجد حسابات قائمة؛ لم ننشئ أو نغيّر أي حساب. استخدم آلية تفعيل المالك الحالية.');
  } catch { console.error('تعذّر تهيئة المالك؛ لم تُستبدل حسابات قائمة. راجع صلاحيات الملفات الخاصة وصحة النسخة المحلية.'); process.exitCode = 1; }
}
