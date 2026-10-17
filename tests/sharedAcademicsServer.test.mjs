import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash, scryptSync } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { emptyData, validateData } from '../src/validation.ts';
import { SHARED_ACADEMIC_CATALOG } from '../src/sharedAcademics.ts';
import { PROVIDED_MATERIALS } from '../src/providedMaterials.ts';
import { LOGISTICS_LESSONS } from '../src/logisticsContent.ts';

const PORT = 31492;
const BASE = `http://127.0.0.1:${PORT}`;
const hash = value => createHash('sha256').update(value).digest('hex');
const PASSWORD = 'synthetic-shared-academic-password';

function seedDatabase(path) {
  const database = new DatabaseSync(path);
  database.exec('CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, salt TEXT NOT NULL, password_hash TEXT NOT NULL, owner INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL); CREATE TABLE sessions (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires INTEGER NOT NULL);');
  const insertUser = database.prepare('INSERT INTO users VALUES (?,?,?,?,?,?)');
  const insertSession = database.prepare('INSERT INTO sessions VALUES (?,?,?)');
  function insert(id, data, token, owner = 0) {
    assert.ok(validateData(data));
    const salt = `synthetic-salt-${id}`;
    insertUser.run(id, `${id}@example.test`, salt, scryptSync(PASSWORD, salt, 64).toString('hex'), owner, JSON.stringify(data));
    insertSession.run(hash(token), id, Date.now() + 60_000 * 30);
  }
  const owner = emptyData(); owner.settings.name = 'PRIVATE_OWNER_NAME';
  owner.transactions.push({ id:'private-owner-income', title:'PRIVATE_OWNER_INCOME', kind:'income', amount:1234, date:'2026-10-17', category:'خاص' });
  const legacy = emptyData(); legacy.settings.name = 'PRIVATE_LEGACY_NAME';
  legacy.courses = [{ id:'inventory', name:'إدارة المخزون والمخازن', color:'#123456' }];
  legacy.lectures = LOGISTICS_LESSONS.map((lesson, day) => ({ id:lesson.id, courseId:'inventory', day, start:'', end:'', location:lesson.title, timePending:'حدّد الموعد ورابط الحضور من منصة مودل' }));
  legacy.lectures[0] = { ...legacy.lectures[0], day:1, start:'17:00', end:'19:00', attendanceUrl:'https://example.test/my-lecture' };
  legacy.lectures.push({ id:'personal-blank-lecture', courseId:'inventory', day:5, start:'', end:'', location:'PRIVATE_LOCATION', timePending:'سأتأكد من المحاضر' });
  legacy.notes.push({ id:LOGISTICS_LESSONS[0].id, courseId:'inventory', title:'PRIVATE_REVIEW_TITLE', content:'PRIVATE_REVIEW_CONTENT', summary:'PRIVATE_REVIEW_SUMMARY', updatedAt:'2026-10-17T12:00:00.000Z' });
  legacy.tasks.push({ id:'exam-inventory', title:'PRIVATE_RESCHEDULED_EXAM', courseId:'inventory', kind:'exam', due:'2026-10-25', time:'22:00', endTime:'23:00', priority:'medium', minutes:12.5, completed:true });
  const capacity = emptyData(); capacity.settings.name = 'PRIVATE_CAPACITY_NAME';
  capacity.courses = [{ id:'inventory-management', name:'إدارة المخزون والمخازن', color:'#123456' }];
  capacity.tasks = Array.from({ length:10_000 }, (_, index) => ({ id:`personal-${index}`, title:`PRIVATE_ASSIGNMENT_${index}`, courseId:'inventory-management', kind:'assignment', due:'2027-01-01', priority:'low', minutes:1, completed:false }));
  insert('shared-owner', owner, 'a'.repeat(64), 1);
  insert('shared-legacy', legacy, 'b'.repeat(64));
  insert('shared-capacity', capacity, 'c'.repeat(64));
  database.close();
  return { owner, legacy, capacity };
}

async function request(path, { method='GET', cookie='', value, account } = {}) {
  const response = await fetch(BASE + path, {
    method, signal:AbortSignal.timeout(10_000),
    headers:{ Origin:BASE, ...(cookie ? { Cookie:cookie } : {}), ...(account ? { 'X-Leader-Account':account } : {}), ...(value !== undefined ? { 'Content-Type':'application/json' } : {}) },
    ...(value !== undefined ? { body:JSON.stringify(value) } : {}),
  });
  return { response, json:await response.json(), cookie:response.headers.get('set-cookie')?.split(';')[0] ?? '' };
}

function assertStarter(data) {
  assert.ok(validateData(data));
  assert.equal(data.courses.length, 5);
  assert.equal(data.lectures.length, 5);
  assert.equal(data.tasks.filter(task => task.kind === 'exam').length, 5);
  assert.equal(data.notes.length, LOGISTICS_LESSONS.length + PROVIDED_MATERIALS.summaries.length);
  assert.ok(LOGISTICS_LESSONS.every(lesson => data.notes.some(note => note.id === lesson.id)));
  assert.ok(PROVIDED_MATERIALS.summaries.every(summary => data.notes.some(note => note.id === summary.id)));
  assert.ok(PROVIDED_MATERIALS.quizzes.every(quiz => data.quizzes.some(item => item.id === quiz.id)));
  for (const source of SHARED_ACADEMIC_CATALOG.lectures) assert.deepEqual(data.lectures.find(lecture => lecture.id === source.id), source);
  for (const source of SHARED_ACADEMIC_CATALOG.exams) assert.deepEqual(data.tasks.find(task => task.id === source.id), source);
  assert.equal(data.lectures.find(lecture => lecture.id === 'lecture-inventory').end, '');
  for (const id of ['exam-supply', 'exam-business', 'exam-transport']) assert.equal(data.tasks.find(task => task.id === id).time, undefined);
  assert.equal(data.tasks.find(task => task.id === 'exam-procurement').endTime, undefined);
}

test('shared academics migrate existing SQLite accounts and stay independent from private account edits', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'az-shared-academics-server-'));
  const staticRoot = join(directory, 'static'); mkdirSync(staticRoot);
  const databasePath = join(directory, 'leader.sqlite');
  const seeded = seedDatabase(databasePath);
  const child = spawn(process.execPath, ['--experimental-strip-types', 'server/index.mjs'], {
    cwd:resolve(import.meta.dirname, '..'),
    env:{ ...process.env, NODE_ENV:'test', PORT:String(PORT), LEADER_BIND_HOST:'127.0.0.1', LEADER_DATA_DIR:directory, LEADER_STATIC_DIR:staticRoot, LEADER_OWNER_EMAIL:'', LEADER_OWNER_SETUP_KEY:'synthetic-unused-key', OPENAI_API_KEY:'' },
    stdio:['ignore', 'pipe', 'pipe'],
  });
  let diagnostics = '';
  child.stderr.on('data', chunk => { diagnostics = (diagnostics + chunk.toString()).slice(-4000); });
  try {
    await Promise.race([
      once(child.stdout, 'data'),
      once(child, 'error').then(([error]) => { throw error; }),
      once(child, 'exit').then(([code]) => { throw new Error(`Synthetic academic server exited ${code}: ${diagnostics}`); }),
      new Promise((_, reject) => { const timeout = setTimeout(() => reject(new Error('Synthetic academic server startup timed out')), 10_000); timeout.unref(); }),
    ]);
    const ownerCookie = `leader_session=${'a'.repeat(64)}`;
    const legacyCookie = `leader_session=${'b'.repeat(64)}`;
    const capacityCookie = `leader_session=${'c'.repeat(64)}`;
    await t.test('startup enriches old SQLite accounts before their first session request', () => {
      const database = new DatabaseSync(databasePath, { readOnly:true });
      try {
        const owner = JSON.parse(database.prepare('SELECT data FROM users WHERE id=?').get('shared-owner').data);
        assertStarter(owner);
        assert.equal(owner.settings.name, seeded.owner.settings.name);
        assert.deepEqual(owner.transactions, seeded.owner.transactions);
        const legacy = JSON.parse(database.prepare('SELECT data FROM users WHERE id=?').get('shared-legacy').data);
        assert.equal(legacy.tasks.filter(task => task.kind === 'exam').length, 5);
        assert.deepEqual(legacy.tasks.find(task => task.id === 'exam-inventory'), seeded.legacy.tasks[0]);
        assert.equal(legacy.lectures.length, 7);
        assert.deepEqual(legacy.lectures.find(lecture => lecture.id === LOGISTICS_LESSONS[0].id), seeded.legacy.lectures[0]);
        assert.deepEqual(legacy.lectures.find(lecture => lecture.id === 'personal-blank-lecture'), seeded.legacy.lectures.at(-1));
        assert.ok(LOGISTICS_LESSONS.slice(1).every(lesson => !legacy.lectures.some(lecture => lecture.id === lesson.id)));
        assert.ok(LOGISTICS_LESSONS.every(lesson => legacy.notes.some(note => note.id === lesson.id)));
        assert.deepEqual(legacy.notes.find(note => note.id === LOGISTICS_LESSONS[0].id), seeded.legacy.notes[0]);
      } finally { database.close(); }
    });
    await t.test('shared catalog requires login and contains no account or finance fields', async () => {
      assert.equal((await request('/api/academic/shared')).response.status, 401);
      const owner = await request('/api/academic/shared', { cookie:ownerCookie });
      const member = await request('/api/academic/shared', { cookie:legacyCookie });
      assert.equal(owner.response.status, 200); assert.equal(member.response.status, 200);
      assert.deepEqual(owner.json, { catalog:SHARED_ACADEMIC_CATALOG, materials:PROVIDED_MATERIALS, reviewLessons:LOGISTICS_LESSONS });
      assert.deepEqual(member.json, owner.json);
      assert.equal(owner.response.headers.get('cache-control'), 'no-store');
      assert.ok(!JSON.stringify(owner.json).includes('PRIVATE_'));
      assert.ok(!('settings' in owner.json) && !('transactions' in owner.json) && !('user' in owner.json));
    });
    let registered;
    await t.test('new account registration receives real weekly appointments, exams and shared study resources', async () => {
      registered = await request('/api/auth/register', { method:'POST', value:{ username:'new-academic-member@example.test', password:PASSWORD } });
      assert.equal(registered.response.status, 200); assert.equal(registered.json.user.owner, false);
      assertStarter(registered.json.data);
      assert.deepEqual(registered.json.data.transactions, []);
      assert.equal(registered.json.data.settings.name, 'new-academic-member@example.test');
    });
    await t.test('saving and repeated session/login hydration preserve edits without changing the common catalog', async () => {
      assert.ok(registered);
      const personal = structuredClone(registered.json.data);
      personal.settings.name = 'PRIVATE_MEMBER_NAME'; personal.courses[0].color = '#112233';
      const exam = personal.tasks.find(task => task.id === 'exam-inventory');
      Object.assign(exam, { title:'PRIVATE_MEMBER_EXAM', due:'2026-12-18', time:'22:00', endTime:'23:00', completed:true, minutes:12.5 });
      const lecture = personal.lectures.find(item => item.id === 'lecture-supply');
      Object.assign(lecture, { day:1, start:'19:00', end:'21:00', location:'PRIVATE_MEMBER_ROOM' });
      personal.notes[0].summary = 'PRIVATE_MEMBER_SUMMARY';
      personal.transactions.push({ id:'private-income', title:'PRIVATE_MEMBER_INCOME', kind:'income', amount:4321, date:'2026-10-17', category:'خاص' });
      assert.ok(validateData(personal));
      const saved = await request('/api/data', { method:'PUT', cookie:registered.cookie, account:registered.json.user.id, value:personal });
      assert.equal(saved.response.status, 200);
      const first = await request('/api/auth/session', { cookie:registered.cookie });
      const second = await request('/api/auth/session', { cookie:registered.cookie });
      assert.deepEqual(first.json.data, personal); assert.deepEqual(second.json.data, personal);
      assert.equal(second.json.data.lectures.length, 5); assert.equal(second.json.data.tasks.length, 5);
      const login = await request('/api/auth/login', { method:'POST', value:{ username:'new-academic-member@example.test', password:PASSWORD } });
      assert.equal(login.response.status, 200); assert.deepEqual(login.json.data, personal);
      const catalog = await request('/api/academic/shared', { cookie:login.cookie });
      assert.deepEqual(catalog.json.catalog, SHARED_ACADEMIC_CATALOG); assert.ok(!JSON.stringify(catalog.json).includes('PRIVATE_'));
      const owner = await request('/api/auth/session', { cookie:ownerCookie });
      assertStarter(owner.json.data); assert.equal(owner.json.data.settings.name, 'PRIVATE_OWNER_NAME');
    });
    await t.test('an account at capacity stays valid and accessible with every personal task intact', async () => {
      const first = await request('/api/auth/session', { cookie:capacityCookie });
      assert.equal(first.response.status, 200); assert.ok(validateData(first.json.data));
      assert.deepEqual(first.json.data.tasks, seeded.capacity.tasks);
      assert.equal(first.json.data.settings.name, 'PRIVATE_CAPACITY_NAME');
      const second = await request('/api/auth/session', { cookie:capacityCookie });
      assert.deepEqual(second.json.data, first.json.data);
      const catalog = await request('/api/academic/shared', { cookie:capacityCookie });
      assert.equal(catalog.response.status, 200); assert.deepEqual(catalog.json.catalog, SHARED_ACADEMIC_CATALOG);
    });
  } finally {
    if (child.exitCode === null && child.signalCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; }
    rmSync(directory, { recursive:true, force:true });
  }
});
