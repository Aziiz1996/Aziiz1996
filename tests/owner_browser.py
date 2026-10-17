"""Owner UI/API checks. Defaults to an isolated synthetic account and the built app.

Run after npm run build: python3 tests/owner_browser.py
Explicit live check: MADAR_OWNER_LIVE=1 MADAR_BASE_URL=http://127.0.0.1:5173 python3 tests/owner_browser.py
The live check temporarily changes design text and restores it even after a failure.
It never changes passwords, uploads student data, or prints credentials or tokens.
"""
import json
import os
import pathlib
import re
import subprocess
import tempfile
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = pathlib.Path(os.environ.get('MADAR_OWNER_TEST_OUTPUT', '/tmp/madar-owner-browser'))
OUT.mkdir(parents=True, exist_ok=True)
LIVE = os.environ.get('MADAR_OWNER_LIVE') == '1'
RESULTS = []
process = None
temporary = None
password = ''

def record(name):
    RESULTS.append({'test': name, 'passed': True})
    print('PASS ' + name, flush=True)

def blank():
    return {'version': 1, 'courses': [], 'lectures': [], 'tasks': [], 'notes': [], 'transactions': [],
            'settings': {'name': 'طالب اختبار', 'currency': 'SAR', 'monthlyBudget': 0, 'dailyMinutes': 90, 'studyStart': '17:00', 'studyDays': [0, 1, 2, 3, 4]}}

try:
    if LIVE:
        base = os.environ.get('MADAR_BASE_URL', 'http://127.0.0.1:5173').rstrip('/')
        credential_root = ROOT
    else:
        if not (ROOT / 'dist/index.html').is_file():
            raise RuntimeError('Build the app with npm run build before the fixture browser test.')
        temporary = tempfile.TemporaryDirectory(prefix='madar-owner-browser-')
        credential_root = pathlib.Path(temporary.name)
        (credential_root / 'dist').symlink_to(ROOT / 'dist', target_is_directory=True)
        (credential_root / '.madar').mkdir(mode=0o700)
        (credential_root / '.madar/profile.json').write_text(json.dumps(blank()), encoding='utf-8')
        script = (
            'import {createAppServer} from ' + json.dumps((ROOT / 'server/index.mjs').as_uri()) + ';'
            'const server=await createAppServer({root:process.env.MADAR_TEST_ROOT});'
            'server.listen(0,"127.0.0.1",()=>console.log("http://127.0.0.1:"+server.address().port));'
        )
        process = subprocess.Popen(['node', '--input-type=module', '-e', script], cwd=ROOT,
                                   env={**os.environ, 'MADAR_TEST_ROOT': str(credential_root)},
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        base = process.stdout.readline().strip()
        if not re.fullmatch(r'http://127\.0\.0\.1:\d+', base):
            raise RuntimeError('The isolated owner fixture server did not start.')

    credentials = (credential_root / '.madar/owner-credentials.txt').read_text(encoding='utf-8')
    username = re.search(r'^username: (.+)$', credentials, re.M).group(1)
    password = re.search(r'^password: (.+)$', credentials, re.M).group(1)

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=os.environ.get('MADAR_BROWSER', '/usr/bin/chromium'), headless=True, args=['--no-sandbox'])
        context = browser.new_context(viewport={'width': 1440, 'height': 1000}, locale='ar-SA', timezone_id='Asia/Riyadh')
        page = context.new_page()
        page.set_default_timeout(10000)
        page_errors = []
        page.on('pageerror', lambda error: page_errors.append(str(error)))
        original_design = None
        authenticated = False
        try:
            page.goto(base + '/#owner')
            expect(page.get_by_role('heading', name='دخول المالك', exact=True)).to_be_visible()
            for path in ['/api/owner/data', '/__madar_profile']:
                assert context.request.get(base + path).status == 401
            for path in ['/.madar/owner.json', '/.madar/owner-credentials.txt', '/.madar/profile.json', '/@fs' + str(ROOT / '.madar/owner-credentials.txt')]:
                assert context.request.get(base + path).status in [403, 404]
            assert context.request.get(base + '/api/session').json() == {'authenticated': False}
            record('public student app, protected owner API and private files before login')

            original_design = context.request.get(base + '/api/design').json()
            page.get_by_label('اسم مستخدم المالك', exact=True).fill(username)
            page.get_by_label('كلمة المرور', exact=True).fill(password)
            page.get_by_role('button', name='دخول لوحة المالك', exact=True).click()
            expect(page.locator('.owner-status')).to_be_visible()
            expect(page.locator('.owner-status')).to_contain_text(username)
            authenticated = True
            session = context.request.get(base + '/api/session').json()
            assert session['authenticated'] is True and session['role'] == 'owner'
            csrf = session['csrfToken']
            cookies = context.cookies(base)
            owner_cookie = next(cookie for cookie in cookies if cookie['name'] == 'madar_owner')
            assert owner_cookie['httpOnly'] and owner_cookie['sameSite'] == 'Strict'
            assert context.request.get(base + '/api/owner/data').status in [200, 404]
            assert context.request.get(base + '/__madar_profile').status == 200
            record('owner UI login creates a real protected server session')

            missing_csrf = context.request.put(base + '/api/owner/design', data=original_design, headers={'Origin': base})
            assert missing_csrf.status == 403
            wrong_origin = context.request.put(base + '/api/owner/design', data=original_design, headers={'Origin': 'https://outside.example', 'X-CSRF-Token': csrf})
            assert wrong_origin.status == 403
            record('owner mutations require both CSRF token and matching origin')

            page.get_by_label('اسم التطبيق', exact=True).fill('مدار فحص المالك')
            page.get_by_label('عنوان الترحيب', exact=True).fill('يا هلا بلوجستي المستقبل — فحص مؤقت')
            page.get_by_role('button', name='حفظ المظهر والقائمة', exact=True).click()
            expect(page.locator('.brand strong')).to_have_text('مدار فحص المالك')
            saved = context.request.get(base + '/api/design').json()
            assert saved['appName'] == 'مدار فحص المالك'
            assert saved['welcomeTitle'] == 'يا هلا بلوجستي المستقبل — فحص مؤقت'
            record('owner design form saves on server and updates shared branding')

            page.get_by_label('اسم التطبيق', exact=True).fill(original_design['appName'])
            page.get_by_label('عنوان الترحيب', exact=True).fill(original_design['welcomeTitle'])
            page.get_by_role('button', name='حفظ المظهر والقائمة', exact=True).click()
            expect(page.locator('.brand strong')).to_have_text(original_design['appName'])
            assert context.request.get(base + '/api/design').json() == original_design
            record('original design restored through the owner UI')

            for width in [390, 412]:
                page.set_viewport_size({'width': width, 'height': 844})
                expect(page.locator('.owner-status')).to_be_visible()
                expect(page.get_by_label('اسم التطبيق', exact=True)).to_be_visible()
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
                record(f'owner panel fits {width}px mobile viewport without horizontal overflow')

            page.get_by_role('button', name='تسجيل الخروج', exact=True).click()
            expect(page.get_by_role('heading', name='دخول المالك', exact=True)).to_be_visible()
            authenticated = False
            assert context.request.get(base + '/api/owner/data').status == 401
            assert context.request.get(base + '/api/session').json() == {'authenticated': False}
            assert len(page_errors) == 0
            record('owner UI logout revokes session and no client runtime errors')
        finally:
            # Recover design independently of UI state if any assertion interrupts the live check.
            if authenticated and original_design is not None:
                current = context.request.get(base + '/api/session').json()
                if current.get('authenticated'):
                    restored = context.request.put(base + '/api/owner/design', data=original_design,
                                                   headers={'Origin': base, 'X-CSRF-Token': current['csrfToken']})
                    assert restored.status == 200
                    context.request.post(base + '/api/logout', headers={'Origin': base, 'X-CSRF-Token': current['csrfToken']})
            context.close()
            browser.close()
except Exception as error:
    # Request exception logs may contain session headers; report only a safe stage and type.
    stage = RESULTS[-1]['test'] if RESULTS else 'initialization'
    message = type(error).__name__ + ' after: ' + stage
    RESULTS.append({'test': 'owner browser check', 'passed': False, 'details': message})
    print('FAIL owner browser check: ' + message, flush=True)
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
    OUT.joinpath('results.json').write_text(json.dumps(RESULTS, ensure_ascii=False, indent=2), encoding='utf-8')
