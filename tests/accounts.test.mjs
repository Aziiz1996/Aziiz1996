import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { emptyData } from '../src/validation.ts';

test('account isolation, signout, owner files, origin checks, and password hashing', async () => {
 const directory = mkdtempSync(join(tmpdir(), 'leader-account-test-'));
 const fixtureRoot = join(directory, 'static');
 mkdirSync(join(fixtureRoot, 'personal-lessons'), { recursive:true });
 writeFileSync(join(fixtureRoot, 'personal-lessons', 'index.json'), JSON.stringify({ lessons:[{ title:'Synthetic private lesson' }] }));
 const port = 31479; const base = 'http://127.0.0.1:' + port;
 const processHandle = spawn(process.execPath, ['--experimental-strip-types', 'server/index.mjs'], { env: { ...process.env, OPENAI_API_KEY:'', PORT: String(port), LEADER_DATA_DIR: directory, LEADER_STATIC_DIR:fixtureRoot, LEADER_OWNER_SETUP_KEY: 'synthetic-owner-setup-key', NODE_ENV: 'test' }, stdio: ['ignore', 'pipe', 'pipe'] });
 try {
  await Promise.race([once(processHandle.stdout, 'data'), once(processHandle, 'exit').then(() => { throw new Error('Server failed'); }), new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Startup timeout')), 10000); timer.unref(); })]);
  async function request(path, { method='GET', cookie='', value, origin=base, account } = {}) {
   const headers = { Origin: origin };
   if (cookie) headers.Cookie = cookie;
   if (value !== undefined) headers['Content-Type'] = 'application/json';
   if (account) headers['X-Leader-Account'] = account;
   const response = await fetch(base + path, { method, headers, body: value === undefined ? undefined : JSON.stringify(value) });
   const json = (response.headers.get('content-type') || '').includes('application/json') ? await response.json() : null;
   return { response, json, cookie: response.headers.get('set-cookie')?.split(';')[0] || '' };
  }
  assert.equal((await request('/api/auth/session')).response.status, 401);
  const owner = await request('/api/auth/register', { method:'POST', value:{ username:'owner@example.com', password:'synthetic-password-one', ownerKey:'synthetic-owner-setup-key' } });
  assert.equal(owner.response.status,200); assert.equal(owner.json.user.owner,true);
  assert.match(owner.response.headers.get('set-cookie'), /HttpOnly/);
  const member = await request('/api/auth/register', { method:'POST', value:{ username:'member@example.com', password:'synthetic-password-two' } });
  assert.equal(member.response.status,200); assert.equal(member.json.user.owner,false);
  assert.equal(member.json.data.lectures.length, 5);
  assert.equal(member.json.data.notes.length, 5);
  assert.deepEqual(member.json.data.notes.map(n => n.id), owner.json.data.notes.map(n => n.id));
  const personal = member.json.data; personal.notes[0].summary = 'Member private edit';
  personal.notes.push({ id:'private-member-note', courseId:'', title:'Private', content:'Secret', summary:'Secret', updatedAt:new Date().toISOString() });
  assert.equal((await request('/api/data', { method:'PUT', cookie:member.cookie, account:member.json.user.id, value:personal })).response.status,200);
  const refreshed = await request('/api/auth/session', { cookie:member.cookie });
  assert.equal(refreshed.json.data.notes.length, 6);
  assert.equal(refreshed.json.data.notes[0].summary, 'Member private edit');
  assert.equal((await request('/api/auth/session', { cookie:owner.cookie })).json.data.notes.length, 5);
  assert.equal((await request('/api/auth/claim-owner', { method:'POST', cookie:member.cookie })).response.status,409);
  const data = emptyData(); data.settings.name = 'Private owner data';
  const save = await request('/api/data', { method:'PUT', cookie:owner.cookie, value:data, account:owner.json.user.id });
  assert.equal(save.response.status,200);
  const other = await request('/api/auth/session', { cookie:member.cookie });
  assert.notEqual(other.json.data.settings.name, 'Private owner data');
  assert.equal((await request('/api/ai/course-summary', { method:'POST', cookie:owner.cookie, value:{ courseId:'inventory-management' } })).response.status,503);
  assert.equal((await request('/api/data', { method:'PUT', cookie:member.cookie, account:owner.json.user.id, value:data })).response.status,403);
  assert.equal((await request('/api/data', { method:'PUT', cookie:owner.cookie, account:owner.json.user.id, origin:'https://other.example', value:data })).response.status,403);
  assert.equal((await request('/api/data', { method:'PUT', cookie:owner.cookie, account:owner.json.user.id, value:{ version:1 } })).response.status,400);
  assert.equal((await request('/personal-lessons/index.json', { cookie:member.cookie })).response.status,404);
  assert.equal((await request('/personal-lessons/index.json')).response.status,404);
  assert.equal((await request('/personal-lessons/index.json', { cookie:owner.cookie })).response.status,200);
  for (const path of ['/personal-lessons%2findex.json', '/%70ersonal-lessons/index.json', '/PERSONAL-LESSONS/index.json', '/%2fpersonal-lessons/index.json']) {
   assert.equal((await request(path, { cookie:member.cookie })).response.status,404);
   assert.equal((await request(path)).response.status,404);
  }
  const legacy = emptyData(); legacy.notes.push({ id:'legacy-private', courseId:'', title:'Legacy', content:'Personal text', summary:'', updatedAt:new Date().toISOString() });
  assert.equal((await request('/api/data', { method:'PUT', cookie:member.cookie, account:member.json.user.id, value:legacy })).response.status,200);
  const migrated = await request('/api/auth/session', { cookie:member.cookie });
  assert.equal(migrated.json.data.notes.length,6);
  assert.equal(migrated.json.data.notes[0].content,'Personal text');
  assert.equal(migrated.json.data.lectures.length,5);
  assert.equal((await request('/api/auth/login', { method:'POST', value:{ username:'owner@example.com', password:'incorrect-password' } })).response.status,401);
  const logout = await request('/api/auth/logout', { method:'POST', cookie:owner.cookie }); assert.equal(logout.response.status,200);
  assert.equal((await request('/api/auth/session', { cookie:owner.cookie })).response.status,401);
  const login = await request('/api/auth/login', { method:'POST', value:{ username:'owner@example.com', password:'synthetic-password-one' } });
  assert.equal(login.json.data.settings.name, 'Private owner data');
  const changed = await request('/api/auth/password', { method:'POST', cookie:login.cookie, value:{ currentPassword:'synthetic-password-one', newPassword:'123' } });
  assert.equal(changed.response.status, 200); assert.equal(changed.json.user.owner, true);
  assert.equal((await request('/api/auth/login', { method:'POST', value:{ username:'owner@example.com', password:'synthetic-password-one' } })).response.status,401);
  assert.equal((await request('/api/auth/login', { method:'POST', value:{ username:'owner@example.com', password:'123' } })).response.status,200);
  const { DatabaseSync } = await import('node:sqlite');
  const database = new DatabaseSync(join(directory, 'leader.sqlite'));
  const stored = database.prepare('SELECT password_hash FROM users WHERE username=?').get('owner@example.com');
  assert.notEqual(stored.password_hash, 'synthetic-password-one'); assert.equal(stored.password_hash.length,128); database.close();
 } finally { processHandle.kill(); await once(processHandle, 'exit'); rmSync(directory,{ recursive:true, force:true }); }
});

test('an authenticated account can claim the unassigned owner role once and receives the starter lecture', async () => {
 const directory = mkdtempSync(join(tmpdir(), 'leader-owner-claim-test-'));
 const port = 31481; const base = 'http://127.0.0.1:' + port;
 const processHandle = spawn(process.execPath, ['--experimental-strip-types', 'server/index.mjs'], { env: { ...process.env, PORT:String(port), LEADER_DATA_DIR:directory, LEADER_OWNER_SETUP_KEY:'unused-setup-key', NODE_ENV:'test' }, stdio:['ignore','pipe','pipe'] });
 try {
  await Promise.race([once(processHandle.stdout, 'data'), once(processHandle, 'exit').then(() => { throw new Error('Server failed'); }), new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Startup timeout')), 10000); timer.unref(); })]);
  const registration = await fetch(base + '/api/auth/register', { method:'POST', headers:{ Origin:base, 'Content-Type':'application/json' }, body:JSON.stringify({ username:'operator@example.com', password:'123' }) });
  const registered = await registration.json();
  assert.equal(registered.user.owner, false);
  const cookie = registration.headers.get('set-cookie').split(';')[0];
  const claim = await fetch(base + '/api/auth/claim-owner', { method:'POST', headers:{ Origin:base, Cookie:cookie } });
  const claimed = await claim.json();
  assert.equal(claim.status, 200); assert.equal(claimed.user.owner, true);
  assert.equal(claimed.data.courses[0].name, 'إدارة المخزون والمخازن');
  assert.equal(claimed.data.lectures.length, 5);
  assert.equal(claimed.data.notes.length, 5);
  assert.equal(claimed.data.notes[0].id, 'inventory-lecture-1');
 } finally { processHandle.kill(); await once(processHandle, 'exit'); rmSync(directory,{ recursive:true, force:true }); }
});

test('first account becomes owner automatically when no setup key is configured', async () => {
 const directory = mkdtempSync(join(tmpdir(), 'leader-first-owner-test-'));
 const port = 31480; const base = 'http://127.0.0.1:' + port;
 const environment = { ...process.env, PORT: String(port), LEADER_DATA_DIR: directory, NODE_ENV: 'test' };
 delete environment.LEADER_OWNER_SETUP_KEY;
 const processHandle = spawn(process.execPath, ['--experimental-strip-types', 'server/index.mjs'], { env: environment, stdio: ['ignore', 'pipe', 'pipe'] });
 try {
  await Promise.race([once(processHandle.stdout, 'data'), once(processHandle, 'exit').then(() => { throw new Error('Server failed'); }), new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Startup timeout')), 10000); timer.unref(); })]);
  async function register(username) {
   const response = await fetch(base + '/api/auth/register', { method:'POST', headers:{ Origin:base, 'Content-Type':'application/json' }, body:JSON.stringify({ username, password:'synthetic-password-one' }) });
   return { response, json:await response.json() };
  }
  const first = await register('operator@example.com');
  assert.equal(first.response.status, 200); assert.equal(first.json.user.owner, true);
  const second = await register('student@example.com');
  assert.equal(second.response.status, 200); assert.equal(second.json.user.owner, false);
 } finally { processHandle.kill(); await once(processHandle, 'exit'); rmSync(directory,{ recursive:true, force:true }); }
});
