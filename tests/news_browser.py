"""News UI checks with synthetic API fixtures; never presents fixtures as live news."""
import json
import os
import pathlib
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('MADAR_BASE_URL', 'http://127.0.0.1:5173').rstrip('/')
OUT = pathlib.Path(os.environ.get('MADAR_NEWS_TEST_OUTPUT', '/tmp/madar-news-browser'))
OUT.mkdir(parents=True, exist_ok=True)
FIXTURE = {
    'status': 'ready', 'stale': False, 'fetchedAt': '2026-10-17T12:00:00.000Z',
    'retryAfterSeconds': 0, 'sources': [], 'unavailableSources': [],
    'message': 'أخبار اختبار اصطناعية للتحقق من الواجهة فقط.',
    'items': [
        {'id': 'fixture-one', 'title': 'خبر اختبار: توسع المستودعات وإدارة المخزون', 'summary': 'ملخص اصطناعي لا يمثل خبراً حقيقياً.', 'url': 'https://www.supplychaindive.com/news/fixture-only/', 'sourceName': 'مصدر اختبار', 'publisherURL': 'https://www.supplychaindive.com/', 'feedName': 'Supply Chain Dive', 'publishedAt': '2026-10-16T10:00:00.000Z', 'categories': ['warehouse']},
        {'id': 'fixture-two', 'title': 'خبر اختبار: الموانئ السعودية وسلاسل الإمداد', 'summary': 'ملخص اصطناعي آخر للتحقق.', 'url': 'https://news.google.com/rss/articles/fixture-only', 'sourceName': 'جهة سعودية للاختبار', 'publisherURL': 'https://www.mawani.gov.sa/', 'feedName': 'جهات سعودية رسمية عبر أخبار Google', 'publishedAt': '2026-10-15T10:00:00.000Z', 'categories': ['saudi', 'shipping']},
    ],
}
results = []

def record(name):
    results.append({'test': name, 'passed': True})
    print('PASS ' + name, flush=True)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('MADAR_BROWSER', '/usr/bin/chromium'), headless=True, args=['--no-sandbox'])
    for width in [1440, 390]:
        context = browser.new_context(viewport={'width': width, 'height': 1000}, timezone_id='Asia/Riyadh', locale='ar-SA')
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        payload = {'value': FIXTURE}
        requests = []

        def news(route):
            requests.append(route.request.url)
            route.fulfill(status=200, content_type='application/json', body=json.dumps(payload['value'], ensure_ascii=False))

        page.route('**/api/news*', news)
        page.goto(BASE + '/#updates')
        expect(page.get_by_role('heading', name='جديد تخصصك', exact=True)).to_be_visible()
        expect(page.locator('.news-card')).to_have_count(2)
        expect(page.locator('.news-card').first.locator('time')).to_have_attribute('datetime', '2026-10-16T10:00:00.000Z')
        assert '2026' in page.locator('.news-card').first.locator('time').inner_text() or '٢٠٢٦' in page.locator('.news-card').first.locator('time').inner_text()
        first_link = page.locator('.news-card').first.get_by_role('link', name='اقرأ الخبر من المصدر')
        expect(first_link).to_have_attribute('target', '_blank')
        expect(first_link).to_have_attribute('rel', 'noopener noreferrer')
        record(f'{width}px dated fixture news has source links')

        before = len(requests)
        page.get_by_role('group', name='تصنيف أخبار التخصص').get_by_role('button', name='المخزون والمستودعات', exact=True).click()
        expect(page.locator('.news-card')).to_have_count(1)
        page.get_by_role('searchbox', name='ابحث داخل الأخبار المحملة').fill('كلمة غير موجودة للاختبار')
        expect(page.locator('.news-card')).to_have_count(0)
        expect(page.get_by_role('heading', name='لا يوجد خبر مطابق للتصفية')).to_be_visible()
        assert len(requests) == before, 'search/filter must not refetch feeds'
        page.get_by_role('button', name='عرض أخبار التخصص المحملة', exact=True).click()
        expect(page.locator('.news-card')).to_have_count(2)
        record(f'{width}px filters and search operate locally without feed calls')

        payload['value'] = {**FIXTURE, 'status': 'stale', 'stale': True, 'retryAfterSeconds': 0, 'message': 'تعذر التحديث؛ هذه آخر نسخة محفوظة.'}
        page.get_by_role('button', name='تحديث الأخبار', exact=True).click()
        expect(page.locator('.news-status')).to_contain_text('آخر نسخة محفوظة')
        expect(page.locator('.news-card')).to_have_count(2)
        record(f'{width}px stale cache is explicitly marked')

        payload['value'] = {**FIXTURE, 'status': 'unavailable', 'stale': False, 'items': [], 'fetchedAt': None, 'retryAfterSeconds': 60, 'message': 'تعذر جلب أخبار التخصص الآن.'}
        page.get_by_role('button', name='تحديث الأخبار', exact=True).click()
        expect(page.get_by_role('heading', name='الأخبار غير متاحة حالياً', exact=True)).to_be_visible()
        expect(page.locator('.news-card')).to_have_count(0)
        expect(page.locator('.updates-page .page-header button')).to_be_disabled()
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'document overflow'
        assert not errors, errors
        page.screenshot(path=str(OUT / f'news-unavailable-{width}px.png'), full_page=True)
        record(f'{width}px unavailable feed shows no fake items, cooldown, and no page overflow')
        context.close()
    browser.close()

OUT.joinpath('results.json').write_text(json.dumps(results, ensure_ascii=False, indent=2))
