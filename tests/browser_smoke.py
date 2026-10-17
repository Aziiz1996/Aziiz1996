"""Functional browser checks using synthetic data; run against the Vite dev server."""
import json
import os
import re
import pathlib
from datetime import datetime, timedelta
from playwright.sync_api import sync_playwright, expect

OUT = pathlib.Path(os.environ.get('MADAR_TEST_OUTPUT', '/tmp/madar-browser-smoke'))
OUT.mkdir(parents=True, exist_ok=True)
KEY = 'madar.student.v1'
BASE = os.environ.get('MADAR_BASE_URL', 'http://127.0.0.1:5173')
results = []
errors = []

def report(name, ok, details=''):
    results.append({'test': name, 'passed': bool(ok), 'details': details})
    print(('PASS ' if ok else 'FAIL ') + name, flush=True)

def data(page):
    return page.evaluate('(key) => JSON.parse(localStorage.getItem(key))', KEY)

def seed(page, value):
    page.evaluate('([key,value]) => localStorage.setItem(key, JSON.stringify(value))', [KEY, value])
    page.goto(BASE.rstrip('/') + '/#dashboard')
    page.reload()
    expect(page.locator('.welcome-card')).to_be_visible()

def blank():
    return {'version':1,'incomeRules':[],'courses':[],'lectures':[],'tasks':[],'notes':[],'transactions':[],
            'settings':{'name':'اختبار مدار','currency':'SAR','monthlyBudget':0,'dailyMinutes':90,'studyStart':'18:00','studyDays':[0,1,2,3,4,5,6]}}

def nav(page, name):
    page.get_by_role('navigation', name='التنقل الرئيسي').get_by_role('button', name=name, exact=False).click()

def field(scope, label):
    return scope.locator('label.field').filter(has_text=re.compile('^'+re.escape(label))).locator('input,select,textarea').first

def dialog(page):
    d=page.get_by_role('dialog')
    expect(d).to_be_visible()
    return d

def closed(page):
    expect(page.get_by_role('dialog')).to_have_count(0)

def step(page,name,fn):
    try:
        fn()
        report(name,True)
    except Exception as e:
        report(name,False,type(e).__name__+' '+str(e)[:1500])
        errors.append(name)
        if page.get_by_role('dialog').count():
            page.keyboard.press('Escape')

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('MADAR_BROWSER', '/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':1440,'height':1000},timezone_id='Asia/Riyadh',locale='ar-SA',accept_downloads=True)
    page=context.new_page()
    page.set_default_timeout(8000)
    console_errors=[]
    page.on('pageerror',lambda error:console_errors.append(str(error)))
    confirmations=[]
    def accept_dialog(d):
        confirmations.append(d.type)
        d.accept()
    page.on('dialog',accept_dialog)
    page.goto(BASE)
    expect(page.locator('.welcome-card')).to_be_visible()
    seed(page,blank())
    today=page.evaluate('()=>{let d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`}')
    due=(datetime.strptime(today,'%Y-%m-%d')+timedelta(days=3)).strftime('%Y-%m-%d')

    def course_create_edit():
        nav(page,'المواد والمحاضرات')
        page.get_by_role('button',name='إضافة مادة',exact=True).first.click()
        d=dialog(page)
        field(d,'اسم المادة').fill('مادة اختبار')
        d.get_by_role('button',name='إضافة المادة',exact=True).click()
        closed(page)
        assert len(data(page)['courses'])==1
        page.get_by_role('button',name='تعديل مادة مادة اختبار',exact=True).click()
        d=dialog(page)
        field(d,'اسم المادة').fill('مادة اختبار معدلة')
        d.get_by_role('button',name='حفظ التعديلات',exact=True).click()
        assert data(page)['courses'][0]['name']=='مادة اختبار معدلة'
    step(page,'course create and edit',course_create_edit)

    def generic_lecture_defaults():
        nav(page,'المواد والمحاضرات')
        page.get_by_role('button',name='إضافة موعد',exact=True).click()
        d=dialog(page)
        d.get_by_role('button',name='حفظ المحاضرة',exact=True).click()
        closed(page)
        assert len(data(page)['lectures'])==1
        page.get_by_role('group',name='أيام الأسبوع').get_by_role('button',name=re.compile('^الأحد')).click()
        page.get_by_role('button',name='حذف موعد المحاضرة',exact=True).click()
        dialog(page).get_by_role('button',name='حذف الموعد',exact=True).click()
    step(page,'generic add lecture defaults to displayed course',generic_lecture_defaults)

    def lecture_validation_crud():
        nav(page,'المواد والمحاضرات')
        page.get_by_role('button',name='إضافة موعد',exact=True).click()
        d=dialog(page)
        field(d,'المادة').select_option(label='مادة اختبار معدلة')
        field(d,'اليوم').select_option('0')
        field(d,'وقت النهاية (اختياري)').fill('11:00')
        d.get_by_role('button',name='حفظ المحاضرة',exact=True).click()
        expect(d.get_by_role('alert')).to_contain_text('وقت البداية')
        assert not data(page)['lectures']
        field(d,'وقت البداية (اختياري)').fill('12:00')
        d.get_by_role('button',name='حفظ المحاضرة',exact=True).click()
        expect(d.get_by_role('alert')).to_contain_text('بعد بدايتها')
        field(d,'وقت البداية (اختياري)').fill('')
        field(d,'وقت النهاية (اختياري)').fill('')
        d.get_by_role('button',name='حفظ المحاضرة',exact=True).click()
        closed(page)
        assert len(data(page)['lectures'])==1 and not data(page)['lectures'][0]['start']
        page.get_by_role('group',name='أيام الأسبوع').get_by_role('button',name=re.compile('^الأحد')).click()
        page.get_by_role('button',name='تعديل محاضرة مادة اختبار معدلة يوم الأحد',exact=True).click()
        d=dialog(page)
        field(d,'وقت البداية (اختياري)').fill('10:00')
        field(d,'وقت النهاية (اختياري)').fill('11:00')
        field(d,'المكان (اختياري)').fill('قاعة اختبار')
        d.get_by_role('button',name='حفظ المحاضرة',exact=True).click()
        assert data(page)['lectures'][0]['end']=='11:00'
        page.get_by_role('button',name='حذف موعد المحاضرة',exact=True).click()
        dialog(page).get_by_role('button',name='حذف الموعد',exact=True).click()
        assert not data(page)['lectures']
    step(page,'lecture optional-time validation and CRUD',lecture_validation_crud)

    def task_crud():
        nav(page,'المهام والاختبارات')
        page.get_by_role('button',name='إضافة مهمة',exact=True).click()
        d=dialog(page)
        field(d,'العنوان').fill('اختبار جودة')
        field(d,'النوع').select_option('exam')
        field(d,'المادة').select_option(label='مادة اختبار معدلة')
        field(d,'تاريخ الاختبار').fill(due)
        field(d,'وقت النهاية (اختياري)').fill('11:00')
        d.get_by_role('button',name='إضافة المهمة',exact=True).click()
        expect(d.get_by_role('alert')).to_contain_text('وقت البداية')
        field(d,'وقت بداية الاختبار (اختياري)').fill('12:00')
        d.get_by_role('button',name='إضافة المهمة',exact=True).click()
        expect(d.get_by_role('alert')).to_contain_text('بعد وقت البداية')
        field(d,'وقت بداية الاختبار (اختياري)').fill('')
        field(d,'وقت النهاية (اختياري)').fill('')
        d.get_by_role('button',name='إضافة المهمة',exact=True).click()
        closed(page)
        assert len(data(page)['tasks'])==1 and not data(page)['tasks'][0].get('time')
        page.get_by_role('button',name='تعديل اختبار جودة',exact=True).click()
        d=dialog(page)
        field(d,'وقت بداية الاختبار (اختياري)').fill('10:00')
        field(d,'وقت النهاية (اختياري)').fill('11:00')
        field(d,'الوقت المتبقي للمذاكرة أو الإنجاز (بالدقائق)').fill('120')
        d.get_by_role('button',name='حفظ التعديلات',exact=True).click()
        assert data(page)['tasks'][0]['minutes']==120
        page.get_by_role('button',name='إكمال اختبار جودة',exact=True).click()
        assert data(page)['tasks'][0]['completed']
        page.get_by_label('حالة المهام',exact=True).select_option('completed')
        page.get_by_role('button',name='إعادة فتح اختبار جودة',exact=True).click()
        assert not data(page)['tasks'][0]['completed']
        page.get_by_label('حالة المهام',exact=True).select_option('active')
    step(page,'task/exam CRUD, optional times, complete and reopen',task_crud)

    def planner():
        nav(page,'خطة المذاكرة')
        expect(page.locator('.session').first).to_be_visible()
        for times in page.locator('.session-time').all_text_contents():
            assert 'undefined' not in times
        page.get_by_role('button',name='الخطة حتى ٢٨ يوماً',exact=True).click()
        expect(page.locator('.session').first).to_be_visible()
    step(page,'study planner has functional sessions and full horizon',planner)

    def notes():
        nav(page,'الملاحظات والملخصات')
        page.get_by_role('button',name='إضافة ملاحظة',exact=True).click()
        d=dialog(page)
        field(d,'عنوان الملاحظة').fill('ملاحظة اختبار')
        field(d,'المادة').select_option(label='مادة اختبار معدلة')
        source='التعلم هو اكتساب المعرفة والمهارات. تساعد المراجعة المنتظمة على تثبيت المعرفة. يمكن استخدام الأسئلة للتحقق من الفهم. تساعد فترات الراحة على التركيز.'
        field(d,'نص المحاضرة أو ملاحظاتك').fill(source)
        d.get_by_role('button',name='إنشاء ملخص أولي',exact=True).click()
        summary=field(d,'الملخص الأولي (اختياري)').input_value()
        assert summary and all(s.lstrip('• ').strip() in source for s in summary.splitlines())
        field(d,'الملخص الأولي (اختياري)').fill(summary+'\nملاحظة شخصية للاختبار')
        d.get_by_role('button',name='حفظ الملاحظة',exact=True).click()
        closed(page)
        assert data(page)['notes'][0]['summary'].endswith('ملاحظة شخصية للاختبار')
        page.get_by_role('button',name='تعديل ملاحظة اختبار',exact=True).click()
        d=dialog(page)
        field(d,'نص المحاضرة أو ملاحظاتك').fill(source+' هذه إضافة للاختبار.')
        expect(d.get_by_text('تغيّر نص المحاضرة.',exact=False)).to_be_visible()
        field(d,'عنوان الملاحظة').fill('ملاحظة اختبار معدلة')
        d.get_by_role('button',name='حفظ الملاحظة',exact=True).click()
        page.get_by_role('button',name='ملاحظة اختبار معدلة',exact=True).click()
        d=dialog(page)
        expect(d.get_by_text('ملاحظة شخصية للاختبار',exact=False)).to_be_visible()
        d.get_by_role('button',name='إغلاق النافذة',exact=True).click()
        page.get_by_label('البحث في الملاحظات',exact=True).fill('شيء غير موجود')
        expect(page.get_by_role('heading',name='لا توجد ملاحظات مطابقة')).to_be_visible()
        page.get_by_role('button',name='مسح التصفية',exact=True).click()
    step(page,'notes extractive summary, edits, persistence and filtering',notes)

    def finance():
        nav(page,'ميزانيتي')
        page.get_by_role('button',name='إضافة مصدر دخل',exact=True).first.click()
        d=dialog(page)
        field(d,'اسم مصدر الدخل').fill('دخل اختبار')
        field(d,'المبلغ الشهري المتوقع (SAR)').fill('1000')
        field(d,'يوم الصرف المتوقع').select_option('31')
        d.get_by_role('button',name='حفظ المصدر',exact=True).click()
        closed(page)
        assert len(data(page)['incomeRules'])==1 and not data(page)['transactions']
        card=page.locator('.income-rule').filter(has_text='دخل اختبار')
        card.get_by_role('button',name='تأكيد الاستلام',exact=True).click()
        d=dialog(page)
        field(d,'تاريخ الاستلام الفعلي').fill(today)
        field(d,'المبلغ المستلم (SAR)').fill('1000')
        d.get_by_role('button',name='نعم، استلمت المبلغ',exact=True).click()
        closed(page)
        assert len(data(page)['transactions'])==1
        expect(card.get_by_role('button',name='عرض العملية',exact=True)).to_be_visible()
        assert card.get_by_role('button',name='تأكيد الاستلام',exact=True).count()==0
        card.get_by_role('button',name='تعديل مصدر الدخل دخل اختبار',exact=True).click()
        d=dialog(page)
        field(d,'المبلغ الشهري المتوقع (SAR)').fill('1200')
        d.get_by_role('button',name='حفظ المصدر',exact=True).click()
        assert data(page)['transactions'][0]['amount']==1000
        page.get_by_role('button',name='إضافة عملية',exact=True).first.click()
        d=dialog(page)
        field(d,'عنوان العملية').fill('مصروف اختبار')
        field(d,'المبلغ (SAR)').fill('125.50')
        field(d,'التصنيف').fill('دراسة')
        field(d,'التاريخ').fill(today)
        d.get_by_role('button',name='إضافة العملية',exact=True).click()
        closed(page)
        assert len(data(page)['transactions'])==2
        page.get_by_role('button',name='تعديل مصروف اختبار',exact=True).click()
        d=dialog(page)
        field(d,'المبلغ (SAR)').fill('150.50')
        d.get_by_role('button',name='حفظ التعديلات',exact=True).click()
        assert any(t['amount']==150.5 for t in data(page)['transactions'])
        page.get_by_role('button',name='تحديد الميزانية',exact=True).click()
        field(page,'حد المصروفات الشهري (SAR)').fill('100')
        page.get_by_role('button',name='حفظ الميزانية',exact=True).click()
        expect(page.get_by_role('progressbar',name='المصروفات من الميزانية الشهرية')).to_have_attribute('aria-valuenow','100')
        expect(page.get_by_text('تجاوزت الميزانية بـ',exact=False)).to_be_visible()
        assert data(page)['settings']['monthlyBudget']==100
        page.get_by_role('button',name='حذف مصروف اختبار',exact=True).click()
        dialog(page).get_by_role('button',name='حذف العملية',exact=True).click()
        assert len(data(page)['transactions'])==1
    step(page,'finance income rules, receipt duplicate guard, transactions and budget',finance)

    def receipt_duplicate_edit():
        nav(page,'ميزانيتي')
        page.get_by_label('شهر الميزانية',exact=True).fill('2028-02')
        card=page.locator('.income-rule').filter(has_text='دخل اختبار')
        card.get_by_role('button',name='تأكيد الاستلام',exact=True).click()
        d=dialog(page)
        assert field(d,'تاريخ الاستلام الفعلي').input_value()=='2028-02-29'
        d.get_by_role('button',name='نعم، استلمت المبلغ',exact=True).click()
        assert len(data(page)['transactions'])==2
        card.get_by_role('button',name='عرض العملية',exact=True).click()
        d=dialog(page)
        field(d,'التاريخ').fill(today)
        d.get_by_role('button',name='حفظ التعديلات',exact=True).click()
        expect(d.get_by_role('alert')).to_contain_text('تم تسجيل استلام هذا المصدر')
        assert len(data(page)['transactions'])==2
        d.get_by_role('button',name='إلغاء',exact=True).click()
        page.get_by_role('button',name='حذف دخل اختبار',exact=True).click()
        dialog(page).get_by_role('button',name='حذف العملية',exact=True).click()
        assert len(data(page)['transactions'])==1
        page.get_by_label('شهر الميزانية',exact=True).fill(today[:7])
    step(page,'monthly income duplicate guard on date edit and leap-February clamp',receipt_duplicate_edit)

    def university_settings():
        nav(page,'الإعدادات')
        url=field(page,'رابط بوابة الجامعة (اختياري)')
        url.fill('http://example.org/student')
        page.get_by_role('button',name='حفظ التفضيلات',exact=True).click()
        expect(page.get_by_role('alert')).to_contain_text('https://')
        assert not data(page)['settings'].get('universityUrl')
        url.fill('https://user:password@example.org/student')
        page.get_by_role('button',name='حفظ التفضيلات',exact=True).click()
        expect(page.get_by_role('alert')).to_be_visible()
        assert not data(page)['settings'].get('universityUrl')
        url.fill('https://example.org/student')
        field(page,'اسم الجامعة (اختياري)').fill('جامعة اختبار')
        page.get_by_role('button',name='حفظ التفضيلات',exact=True).click()
        link=page.get_by_role('link',name='فتح موقع الجامعة في نافذة جديدة')
        expect(link).to_have_attribute('href','https://example.org/student')
        expect(link).to_have_attribute('target','_blank')
        expect(link).to_have_attribute('rel','noopener noreferrer')
        url.fill('')
        page.get_by_role('button',name='حفظ التفضيلات',exact=True).click()
        expect(link).to_have_count(0)
    step(page,'university link settings validate HTTPS and credentials, and save optional link',university_settings)

    def backup():
        nav(page,'الإعدادات')
        before=data(page)
        with page.expect_download() as waiting:
            page.get_by_role('button',name='تصدير نسخة احتياطية',exact=True).click()
        download=waiting.value
        payload=pathlib.Path(download.path()).read_bytes()
        assert json.loads(payload)==before
        inp=page.get_by_label('استيراد ملف نسخة احتياطية',exact=True)
        inp.set_input_files({'name':'invalid.json','mimeType':'application/json','buffer':b'{invalid'})
        expect(page.get_by_role('alert')).to_be_visible()
        assert data(page)==before
        inp.set_input_files({'name':'invalid-schema.json','mimeType':'application/json','buffer':json.dumps({'version':1}).encode()})
        expect(page.get_by_role('alert')).to_contain_text('لم نغيّر بياناتك')
        assert data(page)==before
        damaged=json.loads(payload)
        damaged['tasks'][0]['endTime']='09:00'
        inp.set_input_files({'name':'invalid-time.json','mimeType':'application/json','buffer':json.dumps(damaged).encode()})
        expect(page.get_by_role('alert')).to_be_visible()
        assert data(page)==before
        damaged=json.loads(payload)
        damaged['settings']['universityUrl']='javascript:alert(1)'
        inp.set_input_files({'name':'invalid-url.json','mimeType':'application/json','buffer':json.dumps(damaged).encode()})
        expect(page.get_by_role('alert')).to_be_visible()
        assert data(page)==before
        field(page,'اسمك').fill('اختبار تغيير')
        page.get_by_role('button',name='حفظ التفضيلات',exact=True).click()
        assert data(page)['settings']['name']=='اختبار تغيير'
        inp.set_input_files({'name':'valid-backup.json','mimeType':'application/json','buffer':payload})
        expect(page.locator('.welcome-card')).to_be_visible()
        assert data(page)==before
        page.reload()
        expect(page.locator('.welcome-card')).to_be_visible()
        assert data(page)==before
    step(page,'backup export/import roundtrip and malformed/schema/time rejection',backup)

    def deletions():
        nav(page,'المواد والمحاضرات')
        page.get_by_role('button',name='حذف مادة مادة اختبار معدلة',exact=True).click()
        dialog(page).get_by_role('button',name='حذف المادة',exact=True).click()
        state=data(page)
        assert not state['courses'] and len(state['tasks'])==1 and len(state['notes'])==1
        assert state['tasks'][0]['courseId']=='' and state['notes'][0]['courseId']==''
        nav(page,'المهام والاختبارات')
        page.get_by_role('button',name='حذف اختبار جودة',exact=True).click()
        dialog(page).get_by_role('button',name='حذف المهمة',exact=True).click()
        assert not data(page)['tasks']
        nav(page,'الملاحظات والملخصات')
        page.get_by_role('button',name='حذف ملاحظة اختبار معدلة',exact=True).click()
        dialog(page).get_by_role('button',name='حذف الملاحظة',exact=True).click()
        assert not data(page)['notes']
        nav(page,'ميزانيتي')
        page.get_by_role('button',name='حذف مصدر الدخل دخل اختبار',exact=True).click()
        dialog(page).get_by_role('button',name='حذف المصدر',exact=True).click()
        assert not data(page)['incomeRules'] and len(data(page)['transactions'])==1
        page.get_by_role('button',name='حذف دخل اختبار',exact=True).click()
        dialog(page).get_by_role('button',name='حذف العملية',exact=True).click()
        assert not data(page)['transactions']
    step(page,'delete courses/tasks/notes and keep income history on rule deletion',deletions)

    def raw_value(target=page):
        return target.evaluate('(key)=>localStorage.getItem(key)',KEY)

    def temporary_course():
        nav(page,'المواد والمحاضرات')
        page.get_by_role('button',name='إضافة مادة',exact=True).first.click()
        d=dialog(page)
        field(d,'اسم المادة').fill('دورة مؤقتة للاختبار')
        d.get_by_role('button',name='إضافة المادة',exact=True).click()
        closed(page)

    def corrupt_raw_recovery():
        raw='  {invalid synthetic backup\n'
        page.evaluate('([key,value])=>localStorage.setItem(key,value)',[KEY,raw])
        page.reload()
        expect(page.locator('.storage-warning')).to_be_visible()
        temporary_course()
        assert raw_value()==raw
        nav(page,'الإعدادات')
        field(page,'اسمك').fill('تعديل مؤقت للاختبار')
        page.get_by_role('button',name='حفظ التفضيلات',exact=True).click()
        assert raw_value()==raw
        with page.expect_download() as waiting:
            page.get_by_role('button',name='تصدير النسخة الأصلية',exact=True).click()
        assert pathlib.Path(waiting.value.path()).read_bytes()==raw.encode()
        page.get_by_role('button',name='حذف جميع البيانات',exact=True).click()
        dialog(page).get_by_role('button',name='حذف البيانات نهائياً',exact=True).click()
        expect(page.locator('.welcome-card')).to_be_visible()
        assert data(page)['courses']==[]
        assert page.locator('.storage-warning').count()==0
        temporary_course()
        assert len(data(page)['courses'])==1
        page.reload()
        assert len(data(page)['courses'])==1
    step(page,'malformed localStorage remains exact after temporary edits and recovery export; reset unlocks persistence',corrupt_raw_recovery)

    def invalid_schema_recovery():
        raw=' {"version":1,"synthetic":"invalid schema"} \n'
        page.evaluate('([key,value])=>localStorage.setItem(key,value)',[KEY,raw])
        page.reload()
        expect(page.locator('.storage-warning')).to_be_visible()
        temporary_course()
        assert raw_value()==raw
        nav(page,'الإعدادات')
        with page.expect_download() as waiting:
            page.get_by_role('button',name='تصدير النسخة الأصلية',exact=True).click()
        assert pathlib.Path(waiting.value.path()).read_bytes()==raw.encode()
        before=len(confirmations)
        page.get_by_label('استيراد ملف نسخة احتياطية',exact=True).set_input_files({'name':'valid.json','mimeType':'application/json','buffer':json.dumps(blank()).encode()})
        expect(page.locator('.welcome-card')).to_be_visible()
        assert len(confirmations)==before+1
        assert page.locator('.storage-warning').count()==0
        temporary_course()
        assert len(data(page)['courses'])==1
        nav(page,'الإعدادات')
        assert page.get_by_role('button',name='تصدير النسخة الأصلية',exact=True).count()==0
    step(page,'schema-invalid raw preservation/export and explicit import unlocks persistence',invalid_schema_recovery)

    def app_defaults():
        state=blank()
        state['settings'].update({'name':'','studyDays':[0,1,2,3,4,6]})
        return state

    def import_confirmations():
        for mode in ['income-only','settings-only','recovery-only']:
            state=app_defaults()
            if mode=='income-only':
                state['incomeRules']=[{'id':'confirm-rule','title':'مصدر تأكيد تجريبي','category':'دخل','amount':100,'day':None}]
                seed(page,state)
            elif mode=='settings-only':
                state['settings']['name']='تفضيل اختبار'
                seed(page,state)
            else:
                page.evaluate('([key,value])=>localStorage.setItem(key,value)',[KEY,'invalid-recovery-synthetic'])
                page.reload()
            nav(page,'الإعدادات')
            before=len(confirmations)
            page.get_by_label('استيراد ملف نسخة احتياطية',exact=True).set_input_files({'name':'replacement.json','mimeType':'application/json','buffer':json.dumps(app_defaults()).encode()})
            expect(page.locator('.welcome-card')).to_be_visible()
            assert len(confirmations)==before+1, mode
            assert data(page)==app_defaults()
    step(page,'import overwrite confirmation for income-only, settings-only and recovery-only data',import_confirmations)

    def hydration(dirty):
        fixture=blank()
        fixture['settings'].update({'name':'اسم مزامنة تجريبي','dailyMinutes':150,'studyStart':'21:00'})
        fixture['courses']=[{'id':'hydrate-course','name':'مادة مزامنة تجريبية','color':'#7567dd'}]
        ctx=browser.new_context(viewport={'width':1440,'height':1000},timezone_id='Asia/Riyadh')
        fp=ctx.new_page()
        fp.set_default_timeout(8000)
        fp.on('pageerror',lambda error:console_errors.append(str(error)))
        pending=[]
        ready={'response':False}
        # Private profile hydration now requires a verified owner session.
        fp.route('**/api/session', lambda route: route.fulfill(status=200, content_type='application/json', body=json.dumps({'authenticated':True,'username':'qa-owner','role':'owner','csrfToken':'synthetic-test-token'})))
        def intercept_profile(route):
            if ready['response']:
                route.fulfill(status=200,content_type='application/json',body=json.dumps(fixture))
            else:
                pending.append(route)
        fp.route('**/__madar_profile',intercept_profile)
        fp.goto(BASE,wait_until='domcontentloaded')
        expect(fp.locator('.welcome-card')).to_be_visible()
        nav(fp,'الإعدادات')
        expect(field(fp,'اسمك')).to_have_value('')
        if dirty:
            field(fp,'اسمك').fill('اسم المستخدم غير المحفوظ')
        assert pending
        ready['response']=True
        for route in list(pending):
            route.fulfill(status=200,content_type='application/json',body=json.dumps(fixture))
        fp.wait_for_function('(key)=>JSON.parse(localStorage.getItem(key)||"null")?.settings.name==="اسم مزامنة تجريبي"',arg=KEY)
        if dirty:
            expect(field(fp,'اسمك')).to_have_value('اسم المستخدم غير المحفوظ')
            fp.get_by_role('button',name='حفظ التفضيلات',exact=True).click()
            assert data(fp)['settings']['name']=='اسم المستخدم غير المحفوظ'
            assert len(data(fp)['courses'])==1
        else:
            expect(field(fp,'اسمك')).to_have_value('اسم مزامنة تجريبي')
            expect(field(fp,'وقت المذاكرة اليومي بالدقائق')).to_have_value('150')
            expect(field(fp,'بداية المذاكرة')).to_have_value('21:00')
            fp.get_by_role('button',name='حفظ التفضيلات',exact=True).click()
            assert data(fp)['settings']==fixture['settings']
        ctx.close()
    step(page,'untouched Settings form syncs after delayed synthetic profile hydration',lambda:hydration(False))
    step(page,'dirty Settings form survives delayed synthetic profile hydration',lambda:hydration(True))

    def next_income():
        state=blank()
        dates=page.evaluate('()=>{const d=new Date(), day=new Date(d.getFullYear(),d.getMonth()+1,0).getDate(); const iso=x=>`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}-${String(x.getDate()).padStart(2,"0")}`; const current=new Date(d.getFullYear(),d.getMonth(),day,12), next=new Date(d.getFullYear(),d.getMonth()+1,1,12);next.setDate(Math.min(day,new Date(next.getFullYear(),next.getMonth()+1,0).getDate()));return {day,current:iso(current),next:iso(next)};}')
        state['incomeRules']=[{'id':'next-rule','title':'دفعة التجربة القادمة','category':'دخل','amount':100,'day':dates['day']}]
        seed(page,state)
        date_format='(value)=>new Intl.DateTimeFormat("ar-SA-u-ca-gregory",{day:"numeric",month:"short"}).format(new Date(value+"T12:00:00"))'
        # Match the application's visible date, never infer readiness from a data-only assertion.
        current_label=page.evaluate(date_format,dates['current'])
        next_label=page.evaluate(date_format,dates['next'])
        expect(page.locator('.next-income')).to_contain_text(current_label)
        state['transactions']=[{'id':'received-next','ruleId':'next-rule','title':'دفعة التجربة القادمة','kind':'income','amount':100,'category':'دخل','date':today}]
        seed(page,state)
        expect(page.locator('.next-income')).to_contain_text(next_label)
        assert current_label not in page.locator('.next-income').inner_text()
    step(page,'dashboard next expected income skips rule already received for selected month',next_income)

    mobile_state=blank()
    mobile_state['courses']=[{'id':f'mc{i}','name':f'مادة الجوال {i} — تطبيقات دراسية ومفاهيم أساسية','color':'#7567dd'} for i in range(1,6)]
    mobile_state['lectures']=[{'id':'ml1','courseId':'mc1','day':0,'start':'10:00','end':'11:00','location':'مبنى الكلية — قاعة تجريبية'}, {'id':'ml2','courseId':'mc2','day':1,'start':'','end':'','location':''}]
    mobile_state['tasks']=[{'id':f'mt{i}','title':f'اختبار مادة الجوال {i} ومراجعة المفاهيم المهمة','courseId':f'mc{i}','kind':'exam','due':due,'priority':'high','minutes':120,'completed':False,'time':'10:00','endTime':'11:00'} for i in range(1,6)]
    mobile_state['tasks'].append({'id':'ma','title':'واجب تجريبي منجز','courseId':'mc1','kind':'assignment','due':today,'priority':'low','minutes':0,'completed':True})
    mobile_state['notes']=[{'id':'mn','title':'ملاحظة محاضرة على الجوال','courseId':'mc1','content':'المراجعة المستمرة تساعد على التعلم. يمكن استخدام الأسئلة للتحقق من فهم المادة.','summary':'• المراجعة المستمرة تساعد على التعلم.','updatedAt':today}]
    mobile_state['incomeRules']=[{'id':f'mr{i}','title':f'مصدر دخل تجريبي {i}','category':'دخل شهري','amount':1000*i,'day':27 if i<3 else None} for i in range(1,4)]
    mobile_state['transactions']=[{'id':'mtr','title':'مصروف كتب تجريبي بعنوان طويل للاختبار','kind':'expense','amount':150.5,'category':'دراسة','date':today}]
    seed(page,mobile_state)
    mobile=context.new_page()
    mobile.set_viewport_size({'width':390,'height':844})
    mobile.goto(BASE)
    expect(mobile.locator('.welcome-card')).to_be_visible()
    def mobile_nav():
        pages=['نظرة عامة','المواد والمحاضرات','خطة المذاكرة','المهام والاختبارات','الملاحظات والملخصات','ميزانيتي','الإعدادات']
        for name in pages:
            nav(mobile,name)
            assert mobile.locator('main').is_visible()
            metrics=mobile.evaluate('()=>({width:innerWidth,scroll:document.documentElement.scrollWidth})')
            assert metrics['scroll']<=metrics['width']+1, name+' page overflow'
        nav(mobile,'المواد والمحاضرات')
        mobile.get_by_role('button',name='إضافة مادة',exact=True).first.click()
        d=dialog(mobile)
        field(d,'اسم المادة').fill('مادة الجوال')
        d.get_by_role('button',name='إضافة المادة',exact=True).click()
        closed(mobile)
        assert len(data(mobile)['courses'])==6
        mobile.screenshot(path=str(OUT/'mobile-courses.png'),full_page=True)
        nav(mobile,'المهام والاختبارات')
        mobile.screenshot(path=str(OUT/'mobile-calendar.png'),full_page=True)
    step(mobile,'390px mobile navigation, no document overflow, and course create',mobile_nav)
    report('browser runtime has no uncaught page errors',not console_errors,'; '.join(console_errors)[:1500])
    OUT.joinpath('results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
    browser.close()
    failures = [result['test'] for result in results if not result['passed']]
    assert not failures, 'QA failures: ' + ', '.join(failures)
