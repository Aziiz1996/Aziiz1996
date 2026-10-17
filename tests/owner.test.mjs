import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, stat, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAppServer } from '../server/index.mjs';
import { DEFAULT_DESIGN, initializeOwner, SESSION_TTL_MS, validateOwnerDesign } from '../server/owner.mjs';

const studentData = () => ({
  version: 1, courses: [{ id: 'inventory', name: 'إدارة المخزون والمخازن', color: '#6b4fe0' }],
  lectures: [], tasks: [], notes: [], transactions: [],
  settings: { name: 'طالب اختبار', currency: 'SAR', monthlyBudget: 1000, dailyMinutes: 90, studyStart: '17:00', studyDays: [0, 1, 2, 3, 4] },
});

async function fixture(options = {}) {
  const root = await mkdtemp(join(tmpdir(), 'madar-owner-test-'));
  await initializeOwner({ root, username: 'TestOwner' });
  const credentialText = await readFile(join(root, '.madar/owner-credentials.txt'), 'utf8');
  // Synthetic credentials stay in memory and never enter TAP output.
  const password = credentialText.match(/^password: (.+)$/m)[1];
  await mkdir(join(root, 'dist'));
  await writeFile(join(root, 'dist/index.html'), '<!doctype html><html>مدار</html>');
  await writeFile(join(root, '.madar/profile.json'), JSON.stringify(studentData()));
  const server = await createAppServer({ root, ...options });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const requestOrigin = options.publicOrigin || origin;
  async function request(path, { method = 'GET', body, cookie, csrf, origin: suppliedOrigin, rawBody, headers = {} } = {}) {
    const response = await fetch(origin + path, {
      method,
      headers: { ...(method !== 'GET' && method !== 'HEAD' ? { Origin: suppliedOrigin ?? requestOrigin } : {}),
        ...(body !== undefined || rawBody !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { Cookie: cookie } : {}), ...(csrf ? { 'X-CSRF-Token': csrf } : {}), ...headers },
      ...(body !== undefined || rawBody !== undefined ? { body: rawBody ?? JSON.stringify(body) } : {}),
    });
    const text = await response.text();
    let value; try { value = JSON.parse(text); } catch { value = text; }
    return { status: response.status, value, headers: response.headers };
  }
  async function login(providedPassword = password) {
    const response = await request('/api/login', { method: 'POST', body: { username: 'TestOwner', password: providedPassword } });
    const cookie = response.headers.get('set-cookie')?.split(';')[0];
    return { ...response, cookie, csrf: response.value.csrfToken };
  }
  return { root, server, request, login, password, close: async () => { await new Promise(resolve => server.close(resolve)); await rm(root, { recursive: true, force: true }); } };
}

test('owner initialization preserves the account and private credential permissions', async () => {
  const f = await fixture();
  try {
    const before = await readFile(join(f.root, '.madar/owner.json'), 'utf8');
    const credentialsBefore = await readFile(join(f.root, '.madar/owner-credentials.txt'), 'utf8');
    const result = await initializeOwner({ root: f.root, username: 'DifferentOwner' });
    assert.equal(result.created, false);
    assert.equal(result.username, 'TestOwner');
    assert.equal((await readFile(join(f.root, '.madar/owner.json'), 'utf8')) === before, true);
    assert.equal((await readFile(join(f.root, '.madar/owner-credentials.txt'), 'utf8')) === credentialsBefore, true);
    assert.equal(before.includes(f.password), false);
    assert.equal(f.password.length >= 24, true);
    assert.equal((await stat(join(f.root, '.madar/owner.json'))).mode & 0o777, 0o600);
    assert.equal((await stat(join(f.root, '.madar/owner-credentials.txt'))).mode & 0o777, 0o600);
    assert.equal((await stat(join(f.root, '.madar'))).mode & 0o777, 0o700);
  } finally { await f.close(); }
});

test('anonymous student app is public while owner API and profile are private', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.request('/')).status, 200);
    assert.deepEqual((await f.request('/api/session')).value, { authenticated: false });
    assert.equal((await f.request('/api/design')).status, 200);
    for (const path of ['/api/owner/data', '/__madar_profile', '/api/owner/design', '/api/owner/password']) assert.equal((await f.request(path)).status, 401);
    const forged = 'madar_owner=' + 'A'.repeat(43);
    assert.equal((await f.request('/api/owner/data', { cookie: forged })).status, 401);
    assert.equal((await f.request('/api/login', { method: 'POST', origin: 'https://outside.example', body: { username: 'TestOwner', password: f.password } })).status, 403);
    assert.equal((await f.login('wrong-password')).status, 401);
  } finally { await f.close(); }
});

test('owner session uses protected cookie and mutations require CSRF plus matching Origin', async () => {
  const f = await fixture();
  try {
    const login = await f.login();
    assert.equal(login.status, 200);
    assert.equal(login.value.role, 'owner');
    const cookie = login.headers.get('set-cookie');
    for (const flag of ['HttpOnly', 'SameSite=Strict', 'Path=/', 'Max-Age=28800']) assert.equal(cookie.includes(flag), true);
    assert.equal(cookie.includes('Secure'), false);
    const session = await f.request('/api/session', login);
    assert.equal(session.value.authenticated, true);
    assert.equal(session.value.csrfToken === login.csrf, true);
    assert.equal((await f.request('/__madar_profile', login)).status, 200);
    const design = { ...DEFAULT_DESIGN, appName: 'مداري', hiddenPages: ['finance'], navigation: ['owner', 'teacher', 'dashboard'] };
    assert.equal((await f.request('/api/owner/design', { method: 'PUT', cookie: login.cookie, body: design })).status, 403);
    assert.equal((await f.request('/api/owner/design', { ...login, method: 'PUT', body: design, csrf: 'forged-token' })).status, 403);
    assert.equal((await f.request('/api/owner/design', { ...login, method: 'PUT', body: design, origin: 'https://outside.example' })).status, 403);
    const saved = await f.request('/api/owner/design', { ...login, method: 'PUT', body: design });
    assert.equal(saved.status, 200);
    assert.equal(saved.value.appName, 'مداري');
    assert.equal(saved.value.navigation.includes('teacher'), true);
    assert.equal((await f.request('/api/design')).value.appName, 'مداري');
    assert.equal((await stat(join(f.root, '.madar/design.json'))).mode & 0o777, 0o600);
    assert.equal((await f.request('/api/logout', { ...login, method: 'POST' })).status, 200);
    assert.equal((await f.request('/api/owner/data', login)).status, 401);
  } finally { await f.close(); }
});

test('owner design rejects invalid styles, unknown pages, duplicates and hiding essential pages', () => {
  assert.equal(validateOwnerDesign({ ...DEFAULT_DESIGN, accentColor: 'red;background:url(javascript:alert(1))' }), null);
  assert.equal(validateOwnerDesign({ ...DEFAULT_DESIGN, navigation: ['dashboard', 'bad-page'] }), null);
  assert.equal(validateOwnerDesign({ ...DEFAULT_DESIGN, navigation: ['dashboard', 'dashboard'] }), null);
  assert.equal(validateOwnerDesign({ ...DEFAULT_DESIGN, hiddenPages: ['owner'] }), null);
  assert.equal(validateOwnerDesign({ ...DEFAULT_DESIGN, hiddenPages: ['dashboard'] }), null);
});

test('owner backup validates before saving and never replaces a valid backup on bad input', async () => {
  const f = await fixture();
  try {
    const login = await f.login();
    const fallback = await f.request('/api/owner/data', login);
    assert.equal(fallback.status, 200);
    const data = studentData(); data.settings.name = 'نسخة محفوظة';
    assert.equal((await f.request('/api/owner/data', { ...login, method: 'PUT', body: data })).status, 200);
    const bad = { ...data, courses: [{ id: 'bad', name: 'Bad', color: 'javascript:1' }] };
    assert.equal((await f.request('/api/owner/data', { ...login, method: 'PUT', body: bad })).status, 400);
    assert.equal((await f.request('/api/owner/data', login)).value.settings.name, 'نسخة محفوظة');
    assert.equal((await stat(join(f.root, '.madar/owner-data.json'))).mode & 0o777, 0o600);
    assert.equal((await f.request('/api/owner/data', { ...login, method: 'PUT', rawBody: '{bad' })).status, 400);
    assert.equal((await f.request('/api/owner/data', { ...login, method: 'PUT', rawBody: 'x'.repeat(10 * 1024 * 1024 + 1) })).status, 413);
    assert.equal((await f.request('/api/owner/data', login)).value.settings.name, 'نسخة محفوظة');
  } finally { await f.close(); }
});

test('login attempts are limited and expire after the retry window', async t => {
  const f = await fixture();
  try {
    for (let index = 0; index < 5; index++) assert.equal((await f.login('bad-password')).status, 401);
    const limited = await f.login();
    assert.equal(limited.status, 429);
    assert.equal(Number(limited.headers.get('retry-after')) > 0, true);
    const future = Date.now() + 15 * 60 * 1000 + 1;
    t.mock.method(Date, 'now', () => future);
    assert.equal((await f.login()).status, 200);
  } finally { t.mock.restoreAll(); await f.close(); }
});

test('password change verifies current password, removes initial credential and revokes all sessions', async () => {
  const f = await fixture();
  try {
    const first = await f.login();
    const second = await f.login();
    const update = body => f.request('/api/owner/password', { ...first, method: 'POST', body });
    assert.equal((await update({ currentPassword: 'incorrect', newPassword: 'New-Password-For-Test' })).status, 401);
    assert.equal((await update({ currentPassword: f.password, newPassword: 'short' })).status, 400);
    assert.equal((await update({ currentPassword: f.password, newPassword: 'New-Password-For-Test' })).status, 200);
    assert.equal((await f.request('/api/owner/data', first)).status, 401);
    assert.equal((await f.request('/api/owner/data', second)).status, 401);
    assert.equal((await f.login()).status, 401);
    assert.equal((await f.login('New-Password-For-Test')).status, 200);
    let missing = false; try { await stat(join(f.root, '.madar/owner-credentials.txt')); } catch (error) { missing = error.code === 'ENOENT'; }
    assert.equal(missing, true);
  } finally { await f.close(); }
});

test('session expires after eight hours and configured HTTPS uses Secure cookies', async t => {
  const f = await fixture({ publicOrigin: 'https://madar.example' });
  try {
    const login = await f.login();
    assert.equal(login.status, 200);
    assert.equal(login.headers.get('set-cookie').includes('; Secure'), true);
    const future = Date.now() + SESSION_TTL_MS + 1;
    t.mock.method(Date, 'now', () => future);
    assert.equal((await f.request('/api/owner/data', login)).status, 401);
    assert.equal((await f.request('/api/session', login)).value.authenticated, false);
  } finally { t.mock.restoreAll(); await f.close(); }
});

test('production static serving rejects traversal, dotfiles, symlinks and unknown APIs', async () => {
  const f = await fixture();
  try {
    await symlink(join(f.root, '.madar/owner.json'), join(f.root, 'dist/leak.json'));
    for (const path of ['/.madar/owner.json', '/%2e%2e/.madar/owner.json', '/%2e%2e%2f.madar%2fowner-credentials.txt', '/src/auth.tsx', '/server/owner.mjs', '/leak.json', '/__private', '/%00']) {
      assert.equal((await f.request(path)).status, 404);
    }
    assert.equal((await f.request('/api/unknown')).status, 401);
    assert.equal((await f.request('/nested-route', { headers: { Accept: 'text/html' } })).status, 200);
    assert.equal((await f.request('/', { method: 'HEAD' })).status, 200);
  } finally { await f.close(); }
});
