"""Account-based UI smoke tests with isolated API fixtures; no real account writes.
Run against Vite: python3 tests/az_browser_smoke.py
"""
import copy,json,os,pathlib,re,traceback
from datetime import datetime,timedelta,timezone
from urllib.parse import urlparse
from PIL import Image
from playwright.sync_api import sync_playwright,expect
BASE=os.environ.get('MADAR_BASE_URL','http://127.0.0.1:5173')
OUT=pathlib.Path(os.environ.get('MADAR_TEST_OUTPUT','/workspace/az-qa-final'));OUT.mkdir(parents=True,exist_ok=True)
PAGES=['dashboard','university','courses','plan','tasks','exams','practice','assistant','logistics','updates','notes','finance','groups','profile','opportunities','settings','owner']
TODAY=datetime.now(timezone.utc).date(); DUE=str(TODAY+timedelta(days=3))
DATA={'version':1,'incomeRules':[],'universityEvents':[],'projectGroups':[],'courses':[{'id':'inventory','name':'إدارة المخزون والمخازن','color':'#0B1B3D'}],
 'lectures':[{'id':'lecture','courseId':'inventory','day':4,'start':'15:00','end':'17:00','location':'تعلم عن بعد'}],
 'tasks':[{'id':'exam','title':'مراجعة المخزون التجريبية','courseId':'inventory','kind':'exam','due':DUE,'priority':'high','minutes':90,'completed':False,'time':'20:00','endTime':'21:00'}],
 'notes':[{'id':'note','title':'مفهوم المخزون','courseId':'inventory','content':'نقطة إعادة الطلب ومخزون الأمان من موضوعات إدارة المخزون.','summary':'المخزون ومخزون الأمان','updatedAt':str(TODAY)+'T12:00:00Z'}],
 'transactions':[],'settings':{'name':'طالب اللوجستيات التجريبي ذو الاسم الطويل جداً','currency':'SAR','monthlyBudget':1000,'dailyMinutes':90,'studyStart':'18:00','studyDays':[0,1,2,3,4,5,6]}}
DESIGN={'appName':'عز اللوجستيات','welcomeTitle':'خطوة اليوم تصنع غداً أجمل.','welcomeMessage':'يا هلا بلوجستي المستقبل، نذاكر خطوة بخطوة.','accentColor':'#FF6B00','navigation':PAGES,'hiddenPages':[]}
results=[]
def check(name,fn):
 try:fn();results.append({'name':name,'passed':True});print('PASS '+name,flush=True)
 except Exception as error:results.append({'name':name,'passed':False,'error':str(error),'trace':traceback.format_exc()});print('FAIL '+name+' '+str(error)[:500],flush=True)
def field(scope,label):return scope.locator('label.field').filter(has_text=re.compile('^'+re.escape(label))).locator('input,select,textarea').first
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('MADAR_BROWSER','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
 context=browser.new_context(viewport={'width':1440,'height':1000},locale='ar-SA',timezone_id='Asia/Riyadh',accept_downloads=True,reduced_motion='reduce')
 saved=copy.deepcopy(DATA);design=copy.deepcopy(DESIGN);writes=[]
 def api(route):
  global saved,design
  req=route.request;path=urlparse(req.url).path
  if path=='/api/auth/session':value={'user':{'id':'synthetic-qa-owner','username':'student@example.com','owner':True},'data':copy.deepcopy(saved)}
  elif path=='/api/data' and req.method=='PUT':saved=json.loads(req.post_data);writes.append(copy.deepcopy(saved));value={'ok':True}
  elif path=='/api/design':value=design
  elif path=='/api/owner/design' and req.method=='PUT':design=json.loads(req.post_data);value=design
  elif path=='/api/owner/data':value=saved
  elif path=='/api/news':value={'status':'unavailable','items':[],'fetchedAt':None,'stale':False,'retryAfterSeconds':60,'message':'مصادر التخصص غير متاحة في الاختبار المعزول.','sources':[],'unavailableSources':[]}
  elif path=='/api/moodle/status':value={'connected':False}
  elif path=='/api/ai/status':value={'tutorEnabled':False}
  else:route.fulfill(status=404,json={'error':'Synthetic test: endpoint unavailable'});return
  route.fulfill(status=200,json=value)
 context.route('**/api/**',api)
 page=context.new_page();page.set_default_timeout(6000);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(BASE+'/#dashboard');expect(page.locator('.welcome-card')).to_be_visible()
 def goto(route):
  page.goto(BASE+'/#'+route);expect(page.locator('.topbar')).to_be_visible();page.evaluate('window.scrollTo(0,0)');page.wait_for_timeout(120)
 def navigation():
  goto('dashboard');expect(page.locator('.page-navigation').get_by_role('button',name='عودة',exact=True)).to_be_disabled()
  nav=page.get_by_role('navigation',name='التنقل الرئيسي');nav.get_by_role('button',name='الملف الشخصي',exact=True).click();expect(page).to_have_url(re.compile('#profile$'))
  page.locator('.page-navigation').get_by_role('button',name='عودة',exact=True).click();expect(page).to_have_url(re.compile('#dashboard$'))
  expect(page.locator('.page-navigation').get_by_role('button',name=re.compile('^التالي'))).to_contain_text('الملف الشخصي');page.locator('.page-navigation').get_by_role('button',name=re.compile('^التالي')).click();expect(page).to_have_url(re.compile('#profile$'))
  page.go_back();expect(page).to_have_url(re.compile('#dashboard$'));page.go_forward();expect(page).to_have_url(re.compile('#profile$'))
  page.locator('.menu-button').click();d=page.get_by_role('dialog');expect(d.locator('.app-menu-item')).to_have_count(17);d.get_by_role('button',name='دليل اللوجستيات',exact=True).click();expect(page).to_have_url(re.compile('#logistics$'));expect(d).to_have_count(0)
 check('17-page menu and app/browser back-forward history',navigation)
 def profile():
  goto('profile');field(page,'الاسم الكامل').fill('طالب اللوجستيات');field(page,'البريد الإلكتروني').fill('student@example.com');field(page,'المهارات').fill('المخزون، Excel، المخزون')
  image=OUT/'synthetic-profile.png';Image.new('RGB',(96,96),(11,27,61)).save(image)
  cv=OUT/'synthetic-cv.pdf';pdf=context.new_page();pdf.set_content('<h1>Synthetic logistics CV</h1><p>QA data only.</p>');pdf.pdf(path=str(cv));pdf.close()
  page.get_by_label('اختيار صورة شخصية من الجهاز').set_input_files(image);expect(page.get_by_role('button',name='إزالة الصورة',exact=True)).to_be_visible()
  page.get_by_label('رفع السيرة الذاتية PDF').set_input_files(cv);expect(page.get_by_text('synthetic-cv.pdf',exact=True)).to_be_visible()
  page.get_by_role('button',name='حفظ الملف',exact=True).click()
  page.wait_for_function('document.querySelector(".storage-warning")===null');assert saved['studentProfile']['fullName']=='طالب اللوجستيات';assert saved['studentProfile']['skills']==['المخزون','Excel'];assert saved['studentProfile']['photo']['mime']=='image/jpeg';assert saved['studentProfile']['cv']['mime']=='application/pdf'
  page.reload();expect(field(page,'الاسم الكامل')).to_have_value('طالب اللوجستيات');assert page.locator('.avatar img').count()==2
  with page.expect_download() as download:page.get_by_role('button',name='تنزيل السيرة',exact=True).click()
  assert pathlib.Path(download.value.path()).read_bytes()==cv.read_bytes()
 check('photo and genuine PDF uploaded, saved via account API, refreshed and downloaded',profile)
 def practice_teacher():
  goto('practice');expect(page.get_by_role('tab',name='بنك المخزون · ٤٠ سؤالاً',exact=True)).to_have_attribute('aria-selected','true')
  page.get_by_role('tab',name='مكتبتي واختباراتي الأخرى',exact=True).click();expect(page.locator('#practice-panel-library')).to_be_visible();expect(page.locator('#practice-panel-inventory')).to_be_hidden()
  page.get_by_role('tab',name='بنك المخزون · ٤٠ سؤالاً',exact=True).click();expect(page.locator('#practice-panel-inventory')).to_be_visible()
  goto('assistant');page.get_by_role('button',name='اشرح نقطة إعادة الطلب',exact=True).click();expect(page.locator('.teacher-message-assistant').last).to_contain_text('الطلب')
  page.get_by_role('button',name='اختبرني من البنك',exact=True).click();page.locator('.teacher-quiz-option').first.click();expect(page.get_by_role('button',name='السؤال التالي',exact=True)).to_be_visible();page.get_by_role('button',name='السؤال التالي',exact=True).click();page.get_by_role('button',name='إغلاق التدريب',exact=True).click()
  page.get_by_role('tab',name='شرح أوسع من محاضراتي',exact=True).click();expect(page.locator('#assistant-question')).to_be_visible()
 check('preserved practice tabs plus teacher explanation, marked quiz and expanded tab',practice_teacher)
 def career_study():
  goto('opportunities');page.locator('.portal-card').first.get_by_role('button',name='جهّز طلب وظيفة',exact=True).click();wizard=page.locator('#application-assistant');field(wizard,'اسم الوظيفة أو الدورة').fill('تدريب لوجستي تجريبي');field(wizard,'رابط التقديم').fill('https://example.com/apply');wizard.get_by_role('button',name='حفظ الفرصة والمتابعة',exact=True).click();expect(wizard.get_by_text('راجع ملفك قبل البداية',exact=True)).to_be_visible();page.wait_for_timeout(150);assert saved['applications'][0]['status']=='preparing'
  goto('plan');page.get_by_role('button',name=re.compile('^ابدأ معي:')).first.click();d=page.get_by_role('dialog');expect(d.get_by_role('timer')).to_be_visible();d.get_by_role('button',name='إيقاف مؤقت',exact=True).click();d.get_by_role('button',name='حفظ التوقف والعودة للخطة',exact=True).click();expect(d).to_have_count(0);page.wait_for_timeout(150);assert saved['activeStudy'] is not None;assert saved['activeStudy']['runningSince'] is None
 check('career draft saved without submitting and study timer paused with account persistence',career_study)
 def responsive():
  for width in [320,390,430,1440]:
   page.set_viewport_size({'width':width,'height':844 if width<700 else 1000})
   for route in PAGES:
    goto(route);overflow=page.evaluate('({doc:document.documentElement.scrollWidth,body:document.body.scrollWidth,width:innerWidth})');assert max(overflow['doc'],overflow['body'])<=width+1,(width,route,overflow)
    if width<700:
     bars=page.evaluate('''()=>{let a=document.querySelector('.account-bar').getBoundingClientRect(),s=document.querySelector('.sidebar').getBoundingClientRect(),t=document.querySelector('.topbar').getBoundingClientRect();return {ab:a.bottom,st:s.top,sb:s.bottom,tt:t.top}}''');assert bars['st']>=bars['ab']-1 and bars['tt']>=bars['sb']-1,(route,bars)
     assert all(r['height']>=44 for r in page.locator('.page-navigation button').evaluate_all('(els)=>els.map(e=>e.getBoundingClientRect().toJSON())'))
    if width in [390,1440] and route in ['dashboard','profile','assistant','practice','owner']:
     page.screenshot(path=str(OUT/f'{route}-{width}.png'))
 check('all 17 routes at 320/390/430/1440, measured fixed bars, 44px navigation and no horizontal overflow',responsive)
 check('no uncaught browser exceptions',lambda:(_ for _ in ()).throw(AssertionError(errors)) if errors else None)
 (OUT/'results.json').write_text(json.dumps({'results':results,'errors':errors,'accountWrites':len(writes)},ensure_ascii=False,indent=2));browser.close()
print(json.dumps({'passed':sum(r['passed'] for r in results),'failed':sum(not r['passed'] for r in results),'output':str(OUT)}))
raise SystemExit(1 if any(not r['passed'] for r in results) else 0)
