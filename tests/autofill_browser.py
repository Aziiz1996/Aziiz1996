"""Local-only functional checks for the optional MV3 extension; no external sites."""
import base64
import http.server
import json
import os
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
EXTENSION = ROOT / 'application-autofill'
FILL_SOURCE = (EXTENSION / 'fill.js').read_text().replace('export async function', 'async function', 1)
PDF = b'%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n'
PROFILE = {
    'fullName': 'طالب اختبار', 'email': 'student@example.test', 'phone': '0500000000',
    'city': 'الرياض', 'headline': 'متدرب سلاسل الإمداد', 'summary': 'نبذة اختبارية',
    'university': 'جامعة الاختبار', 'major': 'سلاسل الإمداد', 'graduationYear': '2027',
    'education': 'دبلوم تجريبي', 'experience': 'مشروع جامعي', 'skills': ['التخطيط', 'التحليل'],
    'linkedin': 'https://www.linkedin.com/in/student-example', 'website': 'https://example.test',
    'cv': {'name': 'test-cv.pdf', 'mime': 'application/pdf', 'size': len(PDF),
           'dataUrl': 'data:application/pdf;base64,' + base64.b64encode(PDF).decode(), 'updatedAt': '2026-10-17'}
}
PACKAGE = {'format': 'madar-application-profile', 'version': 1, 'profile': PROFILE}
FIXTURE = '''<!doctype html><html lang="ar"><meta charset="utf-8"><body>
<form id="application">
<label for="full-name">الاسم الكامل</label><input id="full-name" name="full_name" autocomplete="name">
<label for="email">البريد الإلكتروني</label><input id="email" type="email">
<label for="phone">رقم الجوال</label><input id="phone" type="tel">
<label for="city">المدينة</label><select id="city"><option value="">اختر</option><option value="riyadh">الرياض</option></select>
<label for="major">التخصص</label><input id="major">
<label for="headline">المسمى الوظيفي</label><input id="headline">
<label for="summary">نبذة شخصية</label><textarea id="summary"></textarea>
<label for="university">اسم الجامعة</label><input id="university">
<label for="graduation-year">سنة التخرج</label><input id="graduation-year" type="number">
<label for="education">المؤهلات العلمية</label><textarea id="education"></textarea>
<label for="experience">الخبرات العملية</label><textarea id="experience"></textarea>
<label for="skills">المهارات</label><textarea id="skills"></textarea>
<label for="linkedin">LinkedIn URL</label><input id="linkedin" type="url" autocomplete="url">
<label for="website">الموقع الشخصي</label><input id="website" type="url">
<label for="resume">السيرة الذاتية PDF</label><input id="resume" type="file" accept=".pdf,application/pdf">
<label for="existing">البريد الإلكتروني</label><input id="existing" value="keep@example.test">
<label for="password">Password</label><input id="password" type="password" autocomplete="new-password">
<label for="login">الاسم الكامل</label><input id="login" autocomplete="username">
<input id="hidden-name" name="full_name" type="hidden"><input id="css-hidden" name="email" style="display:none">
<label for="captcha">Captcha</label><input id="captcha" name="email">
<label for="agreement">أوافق على الشروط</label><input id="agreement" type="checkbox">
<label for="unknown">رمز المجال الداخلي</label><input id="unknown">
<label for="company-name">Company name</label><input id="company-name" name="name">
<div style="opacity:0"><label for="opacity-hidden">البريد الإلكتروني</label><input id="opacity-hidden" name="email"></div>
<label for="readonly">البريد الإلكتروني</label><input id="readonly" readonly>
<fieldset disabled><label for="fieldset-email">Email</label><input id="fieldset-email"></fieldset>
<label for="mismatch">المدينة</label><select id="mismatch"><option value="">Choose</option><option value="jeddah">جدة</option></select>
<label for="photo">Photo صورة شخصية</label><input id="photo" type="file" accept="image/*">
<button type="submit" id="submit">إرسال الطلب</button></form>
<script>
window.events = []; window.submits = 0; window.controlled = ''; window.trackedValue = '';
const controlled = document.getElementById('full-name');
const nativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
Object.defineProperty(controlled, 'value', {get() {return nativeValue.get.call(this)}, set(value) {window.trackedValue = value; nativeValue.set.call(this, value)}});
document.querySelector('form').addEventListener('submit', e => { e.preventDefault(); window.submits++; });
for (const name of ['input', 'change']) document.addEventListener(name, event => {
 window.events.push([event.target.id,name]);
 if (event.target === controlled && event.target.value !== window.trackedValue) {window.controlled = event.target.value; window.trackedValue = event.target.value;}
});
</script></body></html>'''


class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        name = self.path.removeprefix('/extension/')
        if self.path.startswith('/extension/') and name in {'popup.html', 'popup.js', 'fill.js', 'style.css'}:
            source = (EXTENSION / name).read_bytes()
            mime = 'text/html; charset=utf-8' if name.endswith('.html') else 'text/javascript' if name.endswith('.js') else 'text/css'
        else:
            source, mime = FIXTURE.encode(), 'text/html; charset=utf-8'
        self.send_response(200)
        self.send_header('Content-Type', mime)
        self.end_headers()
        self.wfile.write(source)

    def log_message(self, *_):
        pass


server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
URL = f'http://127.0.0.1:{server.server_port}'
passed = 0


def report(name):
    global passed
    passed += 1
    print('PASS ' + name, flush=True)


def fill(page, profile=PROFILE):
    return page.evaluate('async profile => {' + FILL_SOURCE + '; return await fillApplicationProfile(profile);}', profile)


try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=os.environ.get('MADAR_BROWSER', '/usr/bin/chromium'), headless=True, args=['--no-sandbox'])
        context = browser.new_context()
        context.route('**/*', lambda route: route.continue_() if route.request.url.startswith(URL + '/') else route.abort())
        page = context.new_page()
        page.goto(URL)
        output = fill(page)
        assert output['filled'] == 15, output
        assert output['cv'] == 'attached', output
        for field, key in [('full-name', 'fullName'), ('email', 'email'), ('phone', 'phone'), ('major', 'major'), ('headline', 'headline'),
                           ('summary', 'summary'), ('university', 'university'), ('graduation-year', 'graduationYear'), ('education', 'education'),
                           ('experience', 'experience'), ('linkedin', 'linkedin'), ('website', 'website')]:
            expect(page.locator('#' + field)).to_have_value(PROFILE[key])
        expect(page.locator('#city')).to_have_value('riyadh')
        expect(page.locator('#skills')).to_have_value('التخطيط، التحليل')
        report('Arabic/English contact and career fields, exact select options, LinkedIn semantics')

        expect(page.locator('#existing')).to_have_value('keep@example.test')
        for field in ['password', 'login', 'hidden-name', 'css-hidden', 'opacity-hidden', 'captcha', 'unknown', 'company-name', 'readonly', 'fieldset-email', 'mismatch']:
            expect(page.locator('#' + field)).to_have_value('')
        expect(page.locator('#agreement')).not_to_be_checked()
        assert page.locator('#photo').evaluate('(el) => el.files.length') == 0
        assert page.evaluate('window.submits') == 0
        report('Existing values, credentials, hidden/disabled/unknown fields and consent left intact; no submit')

        assert page.evaluate('window.controlled') == PROFILE['fullName']
        events = page.evaluate('window.events')
        for field in ['full-name', 'email', 'city', 'summary', 'resume']:
            assert [field, 'input'] in events and [field, 'change'] in events, (field, events)
        report('Native setters bypass controlled-field trackers and dispatch bubbling input/change events')

        uploaded = page.locator('#resume').evaluate('async el => ({name:el.files[0].name,type:el.files[0].type,bytes:Array.from(new Uint8Array(await el.files[0].arrayBuffer()))})')
        assert uploaded == {'name': 'test-cv.pdf', 'type': 'application/pdf', 'bytes': list(PDF)}, uploaded
        second = fill(page)
        assert second['filled'] == 0 and second['cv'] == 'existing', second
        assert page.evaluate('window.submits') == 0
        report('Real PDF bytes attached; second fill preserves existing files and values')

        page.reload()
        page.locator('#resume').set_input_files({'name': 'original.pdf', 'mimeType': 'application/pdf', 'buffer': PDF})
        output = fill(page)
        assert output['cv'] == 'existing' and page.locator('#resume').evaluate('el => el.files[0].name') == 'original.pdf'
        page.reload()
        page.locator('#resume').evaluate('el => el.accept = "image/*"')
        output = fill(page)
        assert output['cv'] == 'unsupported' and page.locator('#resume').evaluate('el => el.files.length') == 0
        page.reload()
        invalid = {**PROFILE, 'cv': {**PROFILE['cv'], 'dataUrl': 'data:application/pdf;base64,' + base64.b64encode(b'not a pdf').decode(), 'size': 9}}
        output = fill(page, invalid)
        assert output['cv'] == 'invalid' and page.locator('#resume').evaluate('el => el.files.length') == 0
        invalid = {**PROFILE, 'cv': {**PROFILE['cv'], 'size': 2 * 1024 * 1024 + 1}}
        assert fill(page, invalid)['cv'] == 'invalid'
        report('Preexisting files, incompatible accept, malformed PDF and excessive CV size handled')

        # The managed environment blocks all unpacked extensions by browser policy.
        # Exercise the real popup modules with a minimal local Chrome API fixture;
        # the actual serialized fill function was exercised on real DOM fields above.
        context.add_init_script('''() => {
          if (!location.pathname.startsWith('/extension/')) return;
          const key = 'madar-extension-test-storage';
          const read = () => JSON.parse(localStorage.getItem(key) || '{}');
          window.chrome = {...window.chrome, storage: {local: {
            async get(query) { const data = read(); return query ? {[query]: data[query]} : data; },
            async set(values) {localStorage.setItem(key, JSON.stringify({...read(),...values}));},
            async remove(name) {const data = read(); delete data[name]; localStorage.setItem(key, JSON.stringify(data));}
          }}, tabs: {async query() {return [{id:42,url:location.origin + '/application'}];}},
          scripting: {async executeScript(request) {
            window.lastExecution = {target:request.target,args:request.args,source:String(request.func)};
            return [{result:{filled:3,skipped:4,cv:'no-field',fields:['fullName','email','phone']}}];
          }}};
        }'''.replace('() => {', '(function() {', 1).removesuffix('}') + '})();')
        popup = context.new_page()
        popup.goto(URL + '/extension/popup.html')
        expect(popup.get_by_role('heading', name='التقديم مع مدار')).to_be_visible()
        expect(popup.locator('#fill')).to_be_disabled()
        popup.locator('#profile-file').set_input_files({'name': 'profile.json', 'mimeType': 'application/json', 'buffer': json.dumps(PACKAGE).encode()})
        expect(popup.locator('#fill')).to_be_enabled()
        expect(popup.locator('#profile-name')).to_have_text(PROFILE['fullName'])
        expect(popup.locator('#profile-cv')).to_contain_text('test-cv.pdf')
        popup.reload()
        expect(popup.locator('#fill')).to_be_enabled()
        expect(popup.locator('#profile-name')).to_have_text(PROFILE['fullName'])
        report('Real popup modules import and persist a valid profile/CV through local Chrome API fixture')

        minimal = {'format': 'madar-application-profile', 'version': 1, 'profile': {'fullName': '<img src=x onerror=alert(1)>', 'photo': {'dataUrl': 'not imported'}}}
        popup.locator('#profile-file').set_input_files({'name': 'minimal.json', 'mimeType': 'application/json', 'buffer': json.dumps(minimal).encode()})
        expect(popup.locator('#profile-name')).to_have_text(minimal['profile']['fullName'])
        assert popup.locator('#profile-info img').count() == 0
        saved = popup.evaluate('async () => Object.values(await chrome.storage.local.get(null))[0]')
        assert 'photo' not in saved and 'cv' not in saved
        report('Minimal packages accepted; profile text rendered safely; photo excluded')

        popup.locator('#fill').click()
        expect(popup.locator('#status')).to_contain_text('عُبّئ 3')
        request = popup.evaluate('window.lastExecution')
        assert request['target'] == {'tabId': 42} and 'fillApplicationProfile' in request['source']
        assert request['args'][0]['fullName'] == minimal['profile']['fullName']
        assert 'photo' not in request['args'][0]
        report('Popup sends serialized self-contained function and profile to current tab; reports actual returned counts')

        popup.locator('#profile-file').set_input_files({'name': 'wrong.json', 'mimeType': 'application/json', 'buffer': b'{"format":"wrong","profile":{}}'})
        expect(popup.locator('#status')).to_contain_text('اختر ملف بيانات التقديم')
        expect(popup.locator('#profile-name')).to_have_text(minimal['profile']['fullName'])
        bad_package = {**PACKAGE, 'profile': invalid}
        popup.locator('#profile-file').set_input_files({'name': 'bad-cv.json', 'mimeType': 'application/json', 'buffer': json.dumps(bad_package).encode()})
        expect(popup.locator('#status')).to_contain_text('٢ ميغابايت')
        popup.locator('#clear').click()
        expect(popup.locator('#fill')).to_be_disabled()
        assert popup.evaluate('async () => Object.keys(await chrome.storage.local.get(null)).length') == 0
        popup.reload()
        expect(popup.locator('#fill')).to_be_disabled()
        report('Invalid packages rejected without replacing saved data; clear deletes persistent profile')
        manifest = json.loads((EXTENSION / 'manifest.json').read_text())
        assert set(manifest['permissions']) == {'activeTab', 'scripting', 'storage'}
        assert not manifest.get('host_permissions') and not manifest.get('externally_connectable')
        assert page.evaluate('window.submits') == 0
        report('Manifest limited to activeTab/scripting/storage and no permanent host access')
        context.close()
        browser.close()
finally:
    server.shutdown()

print(f'{passed} autofill browser checks passed.', flush=True)
