"""Shared schedule regression on the actual Courses page with a synthetic API account.
Run with Vite running; requires Python Playwright and Chromium. Never reaches a real account API.
"""
import json,pathlib,re,os
from playwright.sync_api import sync_playwright,expect
OUT=pathlib.Path(os.environ.get('MADAR_TEST_OUTPUT','/tmp/shared-schedule-browser'));OUT.mkdir(parents=True,exist_ok=True);BASE=os.environ.get('MADAR_BASE_URL','http://127.0.0.1:5173').rstrip('/');KEY='madar.student.v1'
def blank():return {'version':1,'courses':[],'lectures':[],'tasks':[],'notes':[],'transactions':[],'incomeRules':[],'settings':{'name':'طالب اختبار','currency':'SAR','monthlyBudget':900,'dailyMinutes':90,'studyStart':'18:00','studyDays':[0,1,2,3,4,5,6]}}
ACCOUNT=blank()
DESIGN={'appName':'عز اللوجستيات','welcomeTitle':'خطوة اليوم تصنع غداً أجمل.','welcomeMessage':'بيانات اختبار فقط','accentColor':'#FF6B00','navigation':[],'hiddenPages':[]}
def api(route):
 global ACCOUNT
 path=route.request.url.split('/api/',1)[1]
 if path=='auth/session':route.fulfill(json={'user':{'id':'qa-shared-account','username':'qa-shared@example.test','owner':False},'data':ACCOUNT})
 elif path=='design':route.fulfill(json=DESIGN)
 elif path=='data' and route.request.method=='PUT':ACCOUNT=route.request.post_data_json;route.fulfill(json={'ok':True})
 else:route.fulfill(status=404,json={'error':'QA route not configured'})
def state(p):
 expect(p.locator('.storage-warning')).to_have_count(0)
 return json.loads(json.dumps(ACCOUNT))
def mount(p,data):
 global ACCOUNT
 ACCOUNT=json.loads(json.dumps(data));p.goto(BASE+'/#courses');p.reload();expect(p.locator('.shared-schedule')).to_be_visible();assert not p.locator('.shared-schedule details').evaluate('(e)=>e.open');p.locator('.shared-schedule summary').click()
results=[]
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path=os.environ.get('MADAR_BROWSER','/usr/bin/chromium'),headless=True,args=['--no-sandbox']);c=b.new_context(viewport={'width':1280,'height':1000},locale='ar-SA',timezone_id='Asia/Riyadh',reduced_motion='reduce');c.route('**/api/**',api);p=c.new_page();p.set_default_timeout(5000);errors=[];p.on('pageerror',lambda e:errors.append(str(e)));p.goto(BASE);mount(p,blank());s=p.locator('.shared-schedule')
 expect(s.locator('li')).to_have_count(10);expect(s.get_by_text('بتوقيت السعودية',exact=True)).to_be_visible();expect(s).to_contain_text('لم يُتحقق منه من الجامعة');expect(s).to_contain_text('النهاية غير محددة');expect(s).to_contain_text('البداية غير محددة');expect(s).to_contain_text('١٨٠ دقيقة تحضير تقديرية');assert '٢٠٢٦' in s.inner_text();results.append('5weekly +5exams,Saudi timezone,provenance,unknown times andestimated preparation visible')
 s.get_by_role('button',name='إضافة المواعيد الناقصة',exact=True).click();expect(s.get_by_role('status')).to_contain_text('أُضيف');data=state(p);assert len(data['courses'])==len(data['lectures'])==len(data['tasks'])==5;assert data['settings']['monthlyBudget']==900;s.get_by_role('button',name='إضافة المواعيد الناقصة',exact=True).click();expect(s.get_by_role('status')).to_contain_text('موجودة');assert state(p)==data;results.append('schedule append correct andidempotent withpersonalbudget untouched')
 data['lectures'][0]['end']='21:00';data['tasks'][0]['minutes']=42;data['tasks'][0]['completed']=True;data['courses'][0]['name']='إدارة المخزون والمخازن (تعديل خاص)';mount(p,data);s=p.locator('.shared-schedule');s.get_by_role('button',name='إضافة المواعيد الناقصة',exact=True).click();expect(s.get_by_role('status')).to_contain_text('موجودة');assert state(p)==data;results.append('existing course/lecture/exam edits andcompletion preserved')
 s.get_by_role('button',name='إضافة الملخصات والاختبارات لحسابي',exact=True).click();expect(s.get_by_role('status')).to_contain_text('ملخصات');materials=state(p);assert len(materials['notes'])>0 and len(materials['quizzes'])>0;assert materials['tasks']==data['tasks'];s.get_by_role('button',name='إضافة الملخصات والاختبارات لحسابي',exact=True).click();expect(s.get_by_role('status')).to_contain_text('موجودة');assert state(p)==materials
 with p.expect_download() as dl:s.get_by_role('button',name='تنزيل حزمة المواد JSON',exact=True).click()
 exported=json.loads(pathlib.Path(dl.value.path()).read_text());assert exported['format']=='az-logistics-materials-v1';assert len(exported['summaries'])==len(materials['notes']);assert len(exported['quizzes'])==len(materials['quizzes']);assert set(exported)=={'format','summaries','quizzes'};results.append('materials append+dedup+genuineJSONdownload noaccountdataexport')
 p.screenshot(path=str(OUT/'shared-schedule-integrated-desktop.png'),full_page=True,animations='disabled')
 for width in [320,390,430,1440]:
  p.set_viewport_size({'width':width,'height':844});p.wait_for_function('()=>document.documentElement.scrollWidth<=innerWidth+1');assert p.evaluate('()=>document.documentElement.scrollWidth<=innerWidth+1'),width;assert s.locator('li').count()==10
  for btn in s.get_by_role('button').all():assert btn.bounding_box()['height']>=39
  if width==390:p.screenshot(path=str(OUT/'shared-schedule-integrated-mobile.png'),full_page=True,animations='disabled')
 results.append('320/390/430/1440px integratedcoursespage nohorizontaloverflow,allrowsvisible');p.set_viewport_size({'width':1440,'height':1000});p.get_by_role('navigation',name='التنقل الرئيسي').get_by_role('button',name='نظرة عامة',exact=True).click();p.get_by_role('navigation',name='التنقل الرئيسي').get_by_role('button',name='المواد والمحاضرات',exact=True).click();p.locator('.page-navigation').get_by_role('button',name='عودة',exact=True).click();expect(p).to_have_url(re.compile('#dashboard$'));results.append('integratednavigationbackreturnspriorpage');assert not errors,errors;b.close()
(OUT/'shared-schedule-integrated-results.json').write_text(json.dumps({'passed':len(results),'checks':results,'errors':errors},ensure_ascii=False,indent=2));print(json.dumps({'passed':len(results),'checks':results,'errors':errors},ensure_ascii=False))
