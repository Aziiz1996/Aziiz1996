"""Owner UI checks on the existing SQLite/leader_session account flow.

Default: isolated synthetic account and existing dist build.
Live check (never changes the real password or student data):
MADAR_OWNER_LIVE=1 MADAR_BASE_URL=http://127.0.0.1:5173 python3 tests/owner_browser.py
"""
import json
import os
import pathlib
import re
import socket
import subprocess
import tempfile
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = pathlib.Path(os.environ.get('MADAR_OWNER_TEST_OUTPUT', '/tmp/az-owner-browser'))
OUT.mkdir(parents=True, exist_ok=True)
LIVE = os.environ.get('MADAR_OWNER_LIVE') == '1'
results = []
temporary = None
process = None

def record(name):
    results.append({'test': name, 'passed': True})
    print('PASS ' + name, flush=True)

try:
    if LIVE:
        base = os.environ.get('MADAR_BASE_URL', 'http://127.0.0.1:5173').rstrip('/')
        credential_root = ROOT
    else:
        if not (ROOT / 'dist/index.html').is_file():
            raise RuntimeError('Build the app before the fixture browser test.')
        temporary = tempfile.TemporaryDirectory(prefix='az-owner-browser-')
        credential_root = pathlib.Path(temporary.name)
        with socket.socket() as allocator:
            allocator.bind(('127.0.0.1', 0))
            port = allocator.getsockname()[1]
        base = f'http://127.0.0.1:{port}'
        script = ('import {initializeOwner} from ' + json.dumps((ROOT / 'server/initialize-owner.mjs').as_uri()) + ';'
                  'await initializeOwner({root:process.env.AZ_TEST_ROOT,dataDir:process.env.LEADER_DATA_DIR,ownerEmail:"",setupKey:""});'
                  'await import(' + json.dumps((ROOT / 'server/index.mjs').as_uri()) + ');')
        process = subprocess.Popen(['node', '--experimental-strip-types', '--input-type=module', '-e', script], cwd=ROOT,
                                   env={**os.environ, 'AZ_TEST_ROOT': str(credential_root), 'PORT': str(port), 'NODE_ENV': 'test',
                                        'OPENAI_API_KEY': '', 'LEADER_DATA_DIR': str(credential_root / 'accounts'), 'LEADER_STATIC_DIR': str(ROOT / 'dist')},
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if 'ready' not in process.stdout.readline().lower():
            raise RuntimeError('Fixture server did not start.')
    credentials = (credential_root / '.madar/owner-credentials.txt').read_text(encoding='utf-8')
    username = re.search(r'^username: (.+)$', credentials, re.M).group(1)
    password = re.search(r'^password: (.+)$', credentials, re.M).group(1)

    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=os.environ.get('MADAR_BROWSER', '/usr/bin/chromium'), headless=True, args=['--no-sandbox'])
        context = browser.new_context(viewport={'width': 1440, 'height': 1000}, locale='ar-SA', timezone_id='Asia/Riyadh')
        page = context.new_page()
        page.set_default_timeout(10000)
        runtime_errors = []
        page.on('pageerror', lambda error: runtime_errors.append(type(error).__name__))
        original = None
        authenticated = False
        account_id = None
        try:
            page.goto(base + '/#owner')
            expect(page.locator('#account-username')).to_be_visible()
            for path in ['/api/design', '/api/owner/data']:
                assert context.request.get(base + path).status == 401
            for path in ['/.madar/owner-credentials.txt', '/.madar/profile.json', '/.leader-data/leader.sqlite']:
                assert context.request.get(base + path).status in [403, 404]
            record('SQLite app requires login and protects private setup files')

            page.locator('#account-username').fill(username)
            page.locator('#account-password').fill(password)
            page.get_by_role('button', name='الدخول إلى حسابي', exact=True).click()
            expect(page.locator('.account-bar')).to_be_visible()
            page.goto(base + '/#owner')
            expect(page.locator('.owner-status')).to_be_visible()
            authenticated = True
            session = context.request.get(base + '/api/auth/session').json()
            account_data_before = json.dumps(session['data'], sort_keys=True)
            account_id = session['user']['id']
            assert session['user']['owner'] is True
            assert any(cookie['name'] == 'leader_session' and cookie['httpOnly'] for cookie in context.cookies(base))
            assert not any(cookie['name'] == 'madar_owner' for cookie in context.cookies(base))
            original = context.request.get(base + '/api/design').json()
            record('owner alias signs in through AuthGate using only leader_session')

            assert context.request.put(base + '/api/owner/design', data=original, headers={'Origin': base}).status == 403
            assert context.request.put(base + '/api/owner/design', data=original, headers={'Origin': 'https://outside.example', 'X-Leader-Account': account_id}).status == 403
            record('owner design writes enforce same origin and account binding')

            page.get_by_label('اسم التطبيق', exact=True).fill('فحص عز اللوجستيات')
            page.get_by_label('عنوان الترحيب', exact=True).fill('عنوان فحص مؤقت')
            page.get_by_label('لون التطبيق', exact=True).fill('#ffff00')
            page.get_by_role('button', name='حفظ المظهر والقائمة', exact=True).click()
            expect(page.locator('.brand strong')).to_have_text('فحص عز اللوجستيات')
            expect(page).to_have_title(re.compile('^فحص عز اللوجستيات'))
            assert context.request.get(base + '/api/design').json()['accentColor'] == '#ffff00'
            assert page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()") == '#ffff00'
            assert page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--primary-contrast').trim()") == '#000000'
            record('shared branding and title update with readable text on a light accent')

            restored = context.request.put(base + '/api/owner/design', data=original, headers={'Origin': base, 'X-Leader-Account': account_id})
            assert restored.status == 200
            page.reload()
            expect(page.locator('.brand strong')).to_have_text(original['appName'])
            assert context.request.get(base + '/api/design').json() == original
            assert json.dumps(context.request.get(base + '/api/auth/session').json()['data'], sort_keys=True) == account_data_before
            record('original design restored without changing student account data')

            for width in [390, 412]:
                page.set_viewport_size({'width': width, 'height': 844})
                expect(page.locator('.owner-status')).to_be_visible()
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
                record(f'owner panel fits {width}px mobile width')

            if not LIVE:
                member = browser.new_context()
                registration = member.request.post(base + '/api/auth/register', data={'username': 'synthetic-student@example.com', 'password': 'synthetic-student-password'}, headers={'Origin': base})
                assert registration.status == 200 and registration.json()['user']['owner'] is False
                assert member.request.get(base + '/api/owner/data').status == 403
                student_page = member.new_page()
                student_page.goto(base + '/#dashboard')
                expect(student_page.locator('.welcome-card')).to_be_visible()
                assert student_page.get_by_role('navigation', name='التنقل الرئيسي').get_by_role('button', name='لوحة المالك', exact=True).count() == 0
                student_page.goto(base + '/#owner')
                expect(student_page.get_by_text('هذه اللوحة متاحة لمدير التطبيق فقط.', exact=True)).to_be_visible()
                member.close()
                record('ordinary student keeps existing account flow and cannot open owner tools')

            page.get_by_role('button', name='تسجيل الخروج', exact=True).click()
            expect(page.locator('#account-username')).to_be_visible()
            authenticated = False
            assert context.request.get(base + '/api/owner/data').status == 401
            assert not runtime_errors
            record('existing AuthGate logout revokes the owner session without client errors')
        finally:
            if authenticated and original is not None and account_id:
                context.request.put(base + '/api/owner/design', data=original, headers={'Origin': base, 'X-Leader-Account': account_id})
                context.request.post(base + '/api/auth/logout', headers={'Origin': base})
            context.close()
            browser.close()
except Exception as error:
    stage = results[-1]['test'] if results else 'initialization'
    message = type(error).__name__ + ' after: ' + stage
    results.append({'test': 'owner browser check', 'passed': False, 'details': message})
    print('FAIL ' + message, flush=True)
    raise SystemExit(1)
finally:
    if process is not None:
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)
    if temporary is not None:
        temporary.cleanup()
    OUT.joinpath('results.json').write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')
