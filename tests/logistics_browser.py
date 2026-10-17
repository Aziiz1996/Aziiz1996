"""Image dictionary and retrieval practice, using a synthetic account session."""
import hashlib, json, os, pathlib, subprocess, traceback
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
BASE = os.environ.get('MADAR_BASE_URL', 'http://127.0.0.1:5173').rstrip('/')
OUT = pathlib.Path(os.environ.get('MADAR_TEST_OUTPUT', '/tmp/az-logistics-browser'))
OUT.mkdir(parents=True, exist_ok=True)
TERMS = json.loads(subprocess.check_output(['node', '--experimental-strip-types', '-e', "import {LOGISTICS_TERMS} from './src/logisticsTerms.ts'; console.log(JSON.stringify(LOGISTICS_TERMS));"], cwd=ROOT, text=True))
FIXTURE = {'version': 1, 'courses': [], 'lectures': [], 'tasks': [], 'notes': [], 'transactions': [], 'settings': {'name': 'طالب اختبار', 'currency': 'SAR', 'monthlyBudget': 0, 'dailyMinutes': 90, 'studyStart': '18:00', 'studyDays': [0, 1, 2, 3, 4, 5, 6]}}
results = []

def account(ctx):
    def handle(route):
        path = urlsplit(route.request.url).path
        if path == '/api/auth/session':
            route.fulfill(status=200, json={'user': {'id': 'qa-student', 'username': 'qa@example.com', 'owner': False}, 'data': FIXTURE})
        else:
            route.continue_()
    ctx.route('**/api/**', handle)

def check(name, action):
    try:
        action()
        results.append({'name': name, 'passed': True})
        print('PASS ' + name, flush=True)
    except Exception as error:
        results.append({'name': name, 'passed': False, 'error': str(error), 'trace': traceback.format_exc()})
        print('FAIL ' + name + ' ' + str(error)[:600], flush=True)

with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=os.environ.get('MADAR_BROWSER', '/usr/bin/chromium'), headless=True, args=['--no-sandbox'])
    ctx = browser.new_context(viewport={'width': 1440, 'height': 1000}, locale='ar-SA', timezone_id='Asia/Riyadh', reduced_motion='reduce')
    account(ctx)
    page = ctx.new_page()
    page.set_default_timeout(5000)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(BASE + '/#logistics')
    expect(page.get_by_role('heading', name='دليل اللوجستيات', exact=True)).to_be_visible()

    def dictionary():
        expect(page.locator('.logistics-term-card')).to_have_count(50)
        page.get_by_role('searchbox').fill('wms')
        expect(page.locator('.logistics-term-card')).to_have_count(1)
        page.locator('.logistics-term-card').click()
        dialog = page.get_by_role('dialog')
        expect(dialog).to_contain_text('Warehouse Management System')
        expect(dialog).to_contain_text('نظام إدارة المستودعات')
        dialog.get_by_role('button', name='راجع هذا المصطلح ببطاقة', exact=True).click()
        expect(page.locator('.logistics-flashcard-front')).to_contain_text('WMS')
        page.get_by_role('button', name='إظهار المعنى', exact=True).click()
        expect(page.locator('.logistics-flashcard-answer')).to_contain_text('نظام إدارة المستودعات')
        page.get_by_role('button', name='إخفاء المعنى', exact=True).click()
        expect(page.locator('.logistics-flashcard-answer')).to_have_count(0)
    check('50 authentic terms + English search + details + targeted recall and reveal/hide', dictionary)

    def card_navigation():
        page.get_by_role('button', name='مسح التصفية', exact=True).click()
        expect(page.get_by_role('button', name='البطاقة السابقة', exact=True)).to_be_disabled()
        first = page.locator('.logistics-flashcard-front .logistics-term-abbr').inner_text()
        page.get_by_role('button', name='البطاقة التالية', exact=True).click()
        assert page.locator('.logistics-flashcard-front .logistics-term-abbr').inner_text() != first
        page.get_by_role('button', name='البطاقة السابقة', exact=True).click()
        assert page.locator('.logistics-flashcard-front .logistics-term-abbr').inner_text() == first
        page.get_by_role('button', name='خلط البطاقات', exact=True).click()
        expect(page.locator('.logistics-progress').filter(has_text='البطاقة')).to_contain_text('٥٠')
        page.get_by_role('button', name='قاموس المصطلحات', exact=True).click()
        page.get_by_role('searchbox').fill('عبارة غير موجودة')
        expect(page.get_by_role('heading', name='لم نجد مصطلحاً مطابقاً', exact=True)).to_be_visible()
        page.get_by_role('button', name='عرض كل المصطلحات', exact=True).click()
        expect(page.locator('.logistics-term-card')).to_have_count(50)
    check('Card previous/next/shuffle and empty search recovery', card_navigation)

    def quiz():
        page.get_by_role('button', name='اختبر نفسك', exact=True).click()
        page.get_by_role('button', name='ابدأ تدريب ١٠ أسئلة', exact=True).click()
        for index in range(10):
            question = page.locator('.logistics-quiz')
            abbreviation = question.locator('.logistics-term-abbr').inner_text()
            correct = next(term['arabic'] for term in TERMS if term['abbreviation'] == abbreviation)
            if index == 0:
                wrong = question.get_by_role('radio').all()
                choice = next(radio for radio in wrong if radio.get_attribute('value') != correct)
                choice.check()
            else:
                question.get_by_role('radio', name=correct, exact=True).check()
            question.get_by_role('button', name='تحقق من الإجابة', exact=True).click()
            expect(question.locator('.logistics-quiz-option.correct')).to_have_count(1)
            question.get_by_role('button', name='اعرض النتيجة' if index == 9 else 'السؤال التالي', exact=True).click()
        expect(page.get_by_role('heading', name='نتيجتك ٩ من ١٠', exact=True)).to_be_visible()
        expect(page.locator('.logistics-review-list li')).to_have_count(10)
        page.get_by_role('button', name='راجع أخطائي بالبطاقات', exact=True).click()
        expect(page.locator('.logistics-progress').filter(has_text='البطاقة')).to_contain_text('١ من ١')
        page.get_by_role('button', name='كل البطاقات', exact=True).click()
        expect(page.locator('.logistics-progress').filter(has_text='البطاقة')).to_contain_text('٥٠')
    check('10-question matching quiz, truthful 9/10 result, mistakes-only recall and return', quiz)

    def image():
        page.get_by_role('button', name='عرض الصورة وتكبيرها', exact=True).click()
        dialog = page.get_by_role('dialog')
        dialog.get_by_role('button', name='تكبير للقراءة', exact=True).click()
        expect(dialog.get_by_role('button', name='ملاءمة العرض', exact=True)).to_be_visible()
        with page.expect_download() as download:
            dialog.get_by_role('link', name='تنزيل الصورة الأصلية', exact=True).click()
        digest = hashlib.sha256(pathlib.Path(download.value.path()).read_bytes()).hexdigest()
        assert digest == 'd58bfdf90e20ec94e1ba184f60f5fe8bdd44f2a8f1fd7e8c7de050f4a6f18dec'
        dialog.get_by_role('button', name='إغلاق النافذة', exact=True).click()
        page.screenshot(path=str(OUT / 'dictionary-desktop.png'), full_page=True)
    check('Image zoom/fit and original byte-preserving download', image)

    def mobile():
        for name, width in [('iPhone', 390), ('Android', 412)]:
            mobile_ctx = browser.new_context(viewport={'width': width, 'height': 844}, is_mobile=True, has_touch=True, locale='ar-SA', reduced_motion='reduce')
            account(mobile_ctx)
            mobile_page = mobile_ctx.new_page()
            mobile_page.goto(BASE + '/#logistics')
            expect(mobile_page.locator('.logistics-term-card')).to_have_count(50)
            assert mobile_page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
            mobile_page.get_by_role('button', name='بطاقات التذكر', exact=True).tap()
            mobile_page.get_by_role('button', name='إظهار المعنى', exact=True).tap()
            expect(mobile_page.locator('.logistics-flashcard-answer')).to_be_visible()
            mobile_page.get_by_role('button', name='البطاقة التالية', exact=True).tap()
            expect(mobile_page.locator('.logistics-flashcard-answer')).to_have_count(0)
            mobile_page.screenshot(path=str(OUT / (name + '-cards.png')), full_page=True)
            mobile_ctx.close()
    check('iPhone and Android touch: card reveal/next and no horizontal page overflow', mobile)
    check('No unhandled JavaScript errors', lambda: (_ for _ in ()).throw(AssertionError(errors)) if errors else None)
    ctx.close()
    browser.close()

(OUT / 'results.json').write_text(json.dumps(results, ensure_ascii=False, indent=2))
print(json.dumps({'passed': sum(item['passed'] for item in results), 'failed': sum(not item['passed'] for item in results)}, ensure_ascii=False))
raise SystemExit(1 if any(not item['passed'] for item in results) else 0)
