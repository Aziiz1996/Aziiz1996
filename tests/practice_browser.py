"""Practice UI regression with synthetic AuthGate session and queued account-save fixtures."""
import json,re,pathlib,traceback,copy,os
from urllib.parse import urlsplit
from datetime import datetime,timezone
from playwright.sync_api import sync_playwright,expect
OUT=pathlib.Path(os.environ.get('MADAR_TEST_OUTPUT','/tmp/az-practice-browser'));OUT.mkdir(parents=True,exist_ok=True);BASE=os.environ.get('MADAR_BASE_URL','http://127.0.0.1:5173').rstrip('/');KEY='madar.student.v1';bank=json.loads((pathlib.Path(__file__).parents[1]/'src/practiceBank.ts').read_text().split('export const PRACTICE_QUESTIONS: PracticeQuestion[] = ',1)[1].split(';',1)[0]);results=[]
stores={}
def blank():return {'version':1,'courses':[],'lectures':[],'tasks':[{'id':'exam','title':'اختبار جامعة','courseId':'','kind':'exam','due':'2026-10-20','priority':'high','minutes':90,'completed':False,'time':'20:00','endTime':'21:00'}],'notes':[],'transactions':[],'incomeRules':[],'settings':{'name':'طالب اختبار','currency':'SAR','monthlyBudget':0,'dailyMinutes':90,'studyStart':'18:00','studyDays':[0,1,2,3,4,5,6]}}
def state(p):
 expect(p.locator('.storage-warning')).to_have_count(0)
 return copy.deepcopy(stores[id(p.context)]['data'])
def mock_account(ctx,fixture):
 holder={'data':copy.deepcopy(fixture),'saves':0};stores[id(ctx)]=holder
 def handle(route):
  path=urlsplit(route.request.url).path
  if path=='/api/auth/session':route.fulfill(status=200,json={'user':{'id':'qa-student','username':'qa@example.com','owner':False},'data':copy.deepcopy(holder['data'])})
  elif path=='/api/data' and route.request.method=='PUT':
   assert route.request.headers.get('x-leader-account')=='qa-student';holder['data']=route.request.post_data_json;holder['saves']+=1;route.fulfill(status=200,json={'ok':True})
  else:route.continue_()
 ctx.route('**/api/**',handle)
def seed(p,x,route='practice'):
 stores[id(p.context)]['data']=copy.deepcopy(x);p.goto(BASE+'/#'+route);p.reload();expect(p.locator('.storage-warning')).to_have_count(0);expect(p.locator('.topbar')).to_be_visible()
def field(p,label):return p.locator('label.field').filter(has_text=re.compile('^'+re.escape(label))).locator('input,select,textarea').first
def check(name,fn):
 try:fn();results.append({'name':name,'passed':True});print('PASS '+name,flush=True)
 except Exception as e:results.append({'name':name,'passed':False,'error':str(e),'trace':traceback.format_exc()});print('FAIL '+name+' '+str(e)[:500],flush=True)
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);c=b.new_context(viewport={'width':1440,'height':1000},locale='ar-SA',timezone_id='Asia/Riyadh',reduced_motion='reduce');mock_account(c,blank());p=c.new_page();p.set_default_timeout(5000);p.on('dialog',lambda d:d.accept());errors=[];p.on('pageerror',lambda e:errors.append(str(e)));p.clock.install(time=datetime(2026,10,17,12,tzinfo=timezone.utc));p.goto(BASE);seed(p,blank())
 full_state=None
 def full_exam():
  global full_state
  field(p,'طريقة التدريب').select_option('exam');p.get_by_role('button',name='ابدأ التدريب',exact=True).click();assert state(p)['activePractice']['questionIds']==[str(i) for i in range(1,41)]
  for i,q in enumerate(bank):
   p.locator('.practice-options input[value="'+q['answer']+'"]').check();expect(p.locator('.practice-feedback')).to_have_count(0);assert p.locator('.practice-option.correct').count()==0
   if i<39:p.locator('.practice-navigation').get_by_role('button',name='التالي',exact=True).click()
  expect(p.locator('.practice-navigation').get_by_role('button',name='التالي',exact=True)).to_be_disabled();p.get_by_role('button',name='إنهاء التدريب والتصحيح',exact=True).dblclick();expect(p.get_by_role('dialog')).to_have_count(0);expect(p.locator('#practice-results')).to_be_visible();s=state(p);assert s['activePractice'] is None;assert len(s['practiceAttempts'])==1;saved=s['practiceAttempts'][0];assert saved['score']==saved['total']==40;assert saved['answers']=={q['id']:q['answer'] for q in bank};assert s['tasks'][0]['completed'] is False;assert s['tasks'][0]['minutes']==90;p.reload();expect(p.locator('.storage-warning')).to_have_count(0);assert state(p)['practiceAttempts'][0]==saved;p.get_by_role('button',name='النتيجة والمراجعة',exact=True).click();expect(p.get_by_role('button',name=re.compile('^تدريب على أخطائي وغير المجاب'))).to_be_disabled();p.get_by_role('button',name='عرض جميع الإجابات',exact=True).click();expect(p.locator('.practice-review-item')).to_have_count(40);full_state=state(p);p.screenshot(path=str(OUT/'practice-results-desktop.png'),full_page=True)
 check('all40 source-key answers score40 once, exam hides feedback, university task unchanged, refresh',full_exam)
 def random_replacement():
  p.get_by_role('button',name='اختبار جديد',exact=True).click();field(p,'عدد الأسئلة').select_option('10');field(p,'طريقة التدريب').select_option('practice');p.get_by_role('button',name='ابدأ التدريب',exact=True).click();first=state(p)['activePractice'];assert len(first['questionIds'])==len(set(first['questionIds']))==10
  letter=next(q['answer'] for q in bank if q['id']==first['questionIds'][0]);p.locator('.practice-options input[value="'+letter+'"]').check();expect(p.locator('.practice-feedback')).to_be_visible();p.get_by_role('button',name='حفظ والخروج',exact=True).click();field(p,'عدد الأسئلة').select_option('20');p.get_by_role('button',name='ابدأ التدريب',exact=True).click();d=p.get_by_role('dialog');d.get_by_role('button',name='إبقاء محاولتي',exact=True).click();assert state(p)['activePractice']['id']==first['id'];assert len(state(p)['activePractice']['answers'])==1
  p.get_by_role('button',name='ابدأ التدريب',exact=True).click();p.get_by_role('dialog').get_by_role('button',name='بدء محاولة جديدة',exact=True).click();new=state(p)['activePractice'];assert new['id']!=first['id'];assert len(new['questionIds'])==len(set(new['questionIds']))==20;assert new['answers']=={};assert len(state(p)['practiceAttempts'])==1
  p.get_by_role('tab',name='مكتبتي واختباراتي الأخرى',exact=True).click();expect(p.get_by_role('heading',name='إضافة ملخصاتك واختباراتك',exact=True)).to_be_visible();expect(p.get_by_role('heading',name='الاختبارات المشتركة والمضافة',exact=True)).to_be_visible();assert p.get_by_role('radio').count()>0;expect(p.get_by_text('اختبار التطبيق العام',exact=True)).to_be_visible();p.get_by_role('tab',name='بنك المخزون · ٤٠ سؤالاً',exact=True).click();assert state(p)['activePractice']==new;expect(p.locator('#practice-current')).to_be_visible()
 check('random10/20 + replace cancel + legacy import/library retained across tabs + account run preserved',random_replacement)
 def backup():
  snapshot=state(p);p.get_by_role('navigation',name='التنقل الرئيسي').get_by_role('button',name='الإعدادات',exact=True).click()
  with p.expect_download() as dl:p.get_by_role('button',name='تصدير نسخة احتياطية',exact=True).click()
  exported=json.loads(pathlib.Path(dl.value.path()).read_text());assert exported==snapshot
  for mode in ['score','question','letter','duplicate','activefinished']:
   bad=json.loads(json.dumps(snapshot))
   if mode=='score':bad['practiceAttempts'][0]['score']=39
   if mode=='question':bad['activePractice']['questionIds'][0]='999'
   if mode=='letter':bad['activePractice']['answers'][bad['activePractice']['questionIds'][0]]='Z'
   if mode=='duplicate':bad['activePractice']['questionIds'][1]=bad['activePractice']['questionIds'][0]
   if mode=='activefinished':bad['activePractice']['id']=bad['practiceAttempts'][0]['id']
   p.get_by_label('استيراد ملف نسخة احتياطية').set_input_files({'name':mode+'.json','mimeType':'application/json','buffer':json.dumps(bad).encode()});expect(p.get_by_role('alert')).to_contain_text('لم نغيّر');assert state(p)==snapshot
  p.get_by_label('استيراد ملف نسخة احتياطية').set_input_files({'name':'good.json','mimeType':'application/json','buffer':json.dumps(exported).encode()});expect(p).to_have_url(re.compile('#dashboard$'));assert state(p)==snapshot;p.reload();expect(p.locator('.storage-warning')).to_have_count(0);p.get_by_role('navigation',name='التنقل الرئيسي').get_by_role('button',name='اختبارات تجريبية',exact=True).click();expect(p.locator('#practice-current')).to_be_visible()
 check('active+completed practice backup roundtrip; forged scores/questions/letters/duplicates rejected intact',backup)
 def clear_history():
  old=state(p)['activePractice'];p.get_by_role('button',name='مسح السجل',exact=True).click();p.get_by_role('dialog').get_by_role('button',name='إلغاء',exact=True).click();assert len(state(p)['practiceAttempts'])==1;p.get_by_role('button',name='مسح السجل',exact=True).click();p.get_by_role('dialog').get_by_role('button',name='مسح السجل',exact=True).click();assert state(p)['practiceAttempts']==[];assert state(p)['activePractice']==old
 check('history clear cancel+confirm preserves current answers and run',clear_history)
 def mobiles():
  for device,width in [('iPhone SE',320),('iPhone 13',390),('Pixel 7',430)]:
   cfg=dict(pw.devices[device]);cfg.update({'viewport':{'width':width,'height':844},'locale':'ar-SA','timezone_id':'Asia/Riyadh','reduced_motion':'reduce'});mc=b.new_context(**cfg);mock_account(mc,blank());m=mc.new_page();m.clock.install(time=datetime(2026,10,17,12,tzinfo=timezone.utc));m.goto(BASE);seed(m,blank());m.get_by_role('button',name='ابدأ التدريب',exact=True).tap();m.locator('.practice-options input').first.tap();expect(m.locator('.practice-feedback')).to_be_visible();m.locator('.practice-palette button').last.tap();expect(m.locator('.practice-navigation').get_by_role('button',name='التالي',exact=True)).to_be_disabled();assert state(m)['activePractice']['currentIndex']==39;assert m.evaluate('()=>document.documentElement.scrollWidth<=innerWidth+1');m.get_by_role('button',name='إنهاء التدريب والتصحيح',exact=True).tap();expect(m.get_by_role('dialog')).to_be_visible();m.get_by_role('dialog').get_by_role('button',name='العودة للحل',exact=True).tap();assert state(m)['activePractice'] is not None
   m.locator('.practice-palette button').first.tap();m.screenshot(path=str(OUT/f'practice-mobile-{width}.png'),full_page=True,animations='disabled');mc.close()
 check('iPhone/Android touch quiz options+40palette+lastquestion+cancelunanswered; widths320/390/430 nooverflow',mobiles)
 check('practice browser has no uncaught JavaScript errors',lambda:(_ for _ in ()).throw(AssertionError(errors)) if errors else None)
 b.close()
(OUT/'practice-results.json').write_text(json.dumps({'results':results,'errors':errors},ensure_ascii=False,indent=2));print(json.dumps({'passed':sum(x['passed'] for x in results),'failed':sum(not x['passed'] for x in results)},ensure_ascii=False));raise SystemExit(1 if any(not x['passed'] for x in results) else 0)
