import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { emptyData } from '../src/validation.ts';

test('account isolation, signout, owner files, origin checks, and password hashing', async () => {
 const directory = mkdtempSync(join(tmpdir(), 'leader-account-test-'));
 const port = 31479; const base = 'http://127.0.0.1:' + port;
 const processHandle = spawn(process.execPath, ['--experimental-strip-types', 'server/index.mjs'], { env: { ...process.env, PORT: String(port), LEADER_DATA_DIR: directory, LEADER_OWNER_SETUP_KEY: 'synthetic-owner-setup-key', NODE_ENV: 'test' }, stdio: ['ignore', 'pipe', 'pipe'] });
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
  const data = emptyData(); data.settings.name = 'Private owner data';
  const save = await request('/api/data', { method:'PUT', cookie:owner.cookie, value:data, account:owner.json.user.id });
  assert.equal(save.response.status,200);
  const other = await request('/api/auth/session', { cookie:member.cookie });
  assert.notEqual(other.json.data.settings.name, 'Private owner data');
  assert.equal((await request('/api/data', { method:'PUT', cookie:member.cookie, account:owner.json.user.id, value:data })).response.status,403);
  assert.equal((await request('/api/data', { method:'PUT', cookie:owner.cookie, account:owner.json.user.id, origin:'https://other.example', value:data })).response.status,403);
  assert.equal((await request('/api/data', { method:'PUT', cookie:owner.cookie, account:owner.json.user.id, value:{ version:1 } })).response.status,400);
  assert.equal((await request('/personal-lessons/index.json', { cookie:member.cookie })).response.status,404);
  assert.equal((await request('/personal-lessons/index.json')).response.status,404);
  assert.equal((await request('/personal-lessons/index.json', { cookie:owner.cookie })).response.status,200);
  assert.equal((await request('/api/auth/login', { method:'POST', value:{ username:'owner@example.com', password:'incorrect-password' } })).response.status,401);
  const logout = await request('/api/auth/logout', { method:'POST', cookie:owner.cookie }); assert.equal(logout.response.status,200);
  assert.equal((await request('/api/auth/session', { cookie:owner.cookie })).response.status,401);
  const login = await request('/api/auth/login', { method:'POST', value:{ username:'owner@example.com', password:'synthetic-password-one' } });
  assert.equal(login.json.data.settings.name, 'Private owner data');
  const { DatabaseSync } = await import('node:sqlite');
  const database = new DatabaseSync(join(directory, 'leader.sqlite'));
  const stored = database.prepare('SELECT password_hash FROM users WHERE username=?').get('owner@example.com');
  assert.notEqual(stored.password_hash, 'synthetic-password-one'); assert.equal(stored.password_hash.length,128); database.close();
 } finally { processHandle.kill(); await once(processHandle, 'exit'); rmSync(directory,{ recursive:true, force:true }); }
});
