import { useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, BriefcaseBusiness, Check, CheckCircle2, Copy, Download, ExternalLink, FileText, GraduationCap, Link2, Monitor, Pencil, Plus, Save, Search, Share2, Trash2, UserRound } from 'lucide-react';
import { downloadFile, useApp } from './store';
import { EmptyState, Field, Modal, SectionHeader } from './ui';
import { getStudentProfile, validHttpsUrl } from './dataExtensions';
import { attachmentFile, downloadAttachment } from './profileFiles';
import { formatDate, todayISO } from './logic';
import { APPLICATION_STATUS, DEFAULT_OPPORTUNITY_LINKS, OPPORTUNITY_CATEGORIES, opportunityCategory, opportunityResource, applicationLetter, applicationProfileExport, applicationProfileFields, applicationProfileText, filterApplications, opportunityUrlError } from './career';
import type { CareerApplication, OpportunityLink } from './types';
import type { OpportunityCategory } from './career';

const KIND = { job: 'وظيفة', course: 'دورة' };
const STEPS = ['حدد الفرصة', 'جهّز بياناتك', 'قدّم في الموقع', 'تابع طلبك'];

function LinkForm({ item, onClose }: { item?: OpportunityLink; onClose: () => void }) {
  const { update, notify } = useApp();
  const [name, setName] = useState(item?.name ?? '');
  const [url, setUrl] = useState(item?.url ?? '');
  const [kind, setKind] = useState<OpportunityLink['kind']>(item?.kind ?? 'job');
  const [error, setError] = useState('');
  function save(event: FormEvent) {
    event.preventDefault();
    const invalid = opportunityUrlError(url);
    if (!name.trim() || invalid) { setError(invalid || 'أدخل اسم الموقع.'); return; }
    update(draft => {
      const links = draft.opportunityLinks ?? structuredClone(DEFAULT_OPPORTUNITY_LINKS);
      const value = { id: item?.id ?? crypto.randomUUID(), name: name.trim(), url: url.trim(), kind };
      draft.opportunityLinks = links.some(link => link.id === value.id) ? links.map(link => link.id === value.id ? value : link) : [...links, value];
    });
    notify(item ? 'حُدّث رابط الموقع' : 'أُضيف الموقع إلى روابطك'); onClose();
  }
  return <Modal title={item ? 'تعديل موقع' : 'إضافة موقع للوظائف أو الدورات'} onClose={onClose}><form className="stack" onSubmit={save}>
    <Field label="اسم الموقع"><input value={name} maxLength={100} required onChange={e => setName(e.target.value)} /></Field>
    <Field label="نوع الموقع"><select value={kind} onChange={e => setKind(e.target.value as OpportunityLink['kind'])}><option value="job">وظائف</option><option value="course">دورات</option></select></Field>
    <Field label="رابط الموقع"><input type="url" dir="ltr" value={url} maxLength={2000} placeholder="https://" required onChange={e => setUrl(e.target.value)} /></Field>
    {error && <p className="notice danger" role="alert">{error}</p>}
    <div className="form-actions"><button className="btn btn-primary" type="submit"><Save size={16} />حفظ الموقع</button><button className="btn btn-secondary" type="button" onClick={onClose}>إلغاء</button></div>
    <p className="muted">تُحفظ روابطك ضمن بيانات حسابك في التطبيق. الربط يساعدك على تجهيز بياناتك ونقلها عند التقديم.</p>
  </form></Modal>;
}

function ApplicationForm({ item, onClose }: { item?: CareerApplication; onClose: () => void }) {
  const { update, notify } = useApp();
  const [form, setForm] = useState<CareerApplication>(item ?? { id: crypto.randomUUID(), title: '', organization: '', kind: 'job', url: '', status: 'saved', createdAt: todayISO(), notes: '' });
  const [error, setError] = useState('');
  const field = <K extends keyof CareerApplication>(key: K, value: CareerApplication[K]) => setForm(previous => ({ ...previous, [key]: value }));
  function save(event: FormEvent) {
    event.preventDefault();
    const invalid = form.url ? opportunityUrlError(form.url) : '';
    if (!form.title.trim() || invalid) { setError(invalid || 'أدخل اسم الفرصة.'); return; }
    update(draft => { const applications = draft.applications ?? []; const value = { ...form, title: form.title.trim(), organization: form.organization.trim(), url: form.url.trim() }; draft.applications = applications.some(a => a.id === value.id) ? applications.map(a => a.id === value.id ? value : a) : [...applications, value]; });
    notify('حُفظت الفرصة في متابعتك'); onClose();
  }
  return <Modal title={item ? 'تعديل متابعة الفرصة' : 'حفظ فرصة للمتابعة'} onClose={onClose}><form className="stack" onSubmit={save}>
    <Field label="اسم الوظيفة أو الدورة"><input required maxLength={160} value={form.title} onChange={e => field('title', e.target.value)} /></Field>
    <div className="form-grid"><Field label="الجهة (اختياري)"><input maxLength={160} value={form.organization} onChange={e => field('organization', e.target.value)} /></Field><Field label="النوع"><select value={form.kind} onChange={e => field('kind', e.target.value as CareerApplication['kind'])}><option value="job">وظيفة</option><option value="course">دورة</option></select></Field></div>
    <Field label="رابط الفرصة (اختياري)"><input type="url" dir="ltr" value={form.url} maxLength={2000} onChange={e => field('url', e.target.value)} /></Field>
    <div className="form-grid"><Field label="الحالة الفعلية"><select value={form.status} onChange={e => field('status', e.target.value as CareerApplication['status'])}>{Object.entries(APPLICATION_STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="تاريخ حفظ الفرصة"><input type="date" required value={form.createdAt.slice(0, 10)} onChange={e => field('createdAt', e.target.value)} /></Field></div>
    <Field label="ملاحظات ومواعيد المتابعة"><textarea rows={4} maxLength={6000} value={form.notes} onChange={e => field('notes', e.target.value)} /></Field>
    <p className="muted">اختر «أرسلت الطلب» بعد إرساله فعلياً في موقع الجهة. الحالات هنا تسجل تحديثك اليدوي.</p>
    {error && <p className="notice danger" role="alert">{error}</p>}
    <div className="form-actions"><button className="btn btn-primary" type="submit"><Save size={16} />حفظ المتابعة</button><button className="btn btn-secondary" type="button" onClick={onClose}>إلغاء</button></div>
  </form></Modal>;
}

export default function OpportunitiesPage() {
  const { data, update, navigate, notify } = useApp();
  const profile = getStudentProfile(data);
  const links = data.opportunityLinks ?? DEFAULT_OPPORTUNITY_LINKS;
  const applications = data.applications ?? [];
  const profileFields = applicationProfileFields(profile);
  const [linkForm, setLinkForm] = useState<OpportunityLink | 'new' | null>(null);
  const [applicationForm, setApplicationForm] = useState<CareerApplication | 'new' | null>(null);
  const [deletingLink, setDeletingLink] = useState<OpportunityLink | null>(null);
  const [deletingApplication, setDeletingApplication] = useState<CareerApplication | null>(null);
  const [draft, setDraft] = useState<CareerApplication | null>(null);
  const [step, setStep] = useState(0);
  const [wizardError, setWizardError] = useState('');
  const [letter, setLetter] = useState('');
  const [submissionConfirmed, setSubmissionConfirmed] = useState(false);
  const [manualCopy, setManualCopy] = useState<string | null>(null);
  const [filters, setFilters] = useState<{ status: CareerApplication['status'] | ''; kind: OpportunityLink['kind'] | ''; from: string; to: string; search: string }>({ status: '', kind: '', from: '', to: '', search: '' });
  const [category, setCategory] = useState<OpportunityCategory>('الكل');
  const [query, setQuery] = useState('');
  const visibleLinks = links.filter(link => {
    const resource = opportunityResource(link);
    return (category === 'الكل' || opportunityCategory(link) === category) &&
      `${link.name} ${resource?.description ?? ''} ${opportunityCategory(link)}`.toLocaleLowerCase('ar').includes(query.trim().toLocaleLowerCase('ar'));
  });
  const visible = filterApplications(applications, filters);
  const missing = [!profile.fullName.trim() && 'الاسم الكامل', !profile.email.trim() && 'البريد الإلكتروني', !profile.phone.trim() && 'الجوال'].filter(Boolean);

  function begin(link: OpportunityLink) {
    setDraft({ id: crypto.randomUUID(), title: '', organization: '', kind: link.kind, url: link.url, status: 'preparing', createdAt: todayISO(), notes: '' });
    setStep(0); setWizardError(''); setSubmissionConfirmed(false); setLetter('');
    requestAnimationFrame(() => document.getElementById('application-assistant')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
  function resume(item: CareerApplication) {
    setDraft({ ...item }); setStep(item.url ? 1 : 0); setWizardError(''); setSubmissionConfirmed(false); setLetter(applicationLetter(profile, item.title, item.kind));
    requestAnimationFrame(() => document.getElementById('application-assistant')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
  function persistApplication(value: CareerApplication) {
    update(current => { const all = current.applications ?? []; current.applications = all.some(a => a.id === value.id) ? all.map(a => a.id === value.id ? value : a) : [...all, value]; });
  }
  function next() {
    if (!draft) return;
    if (step === 0) {
      const invalid = opportunityUrlError(draft.url);
      if (!draft.title.trim() || invalid) { setWizardError(invalid || 'أدخل اسم الوظيفة أو الدورة التي ستقدّم عليها.'); return; }
      const value = { ...draft, title: draft.title.trim(), organization: draft.organization.trim(), url: draft.url.trim() };
      setDraft(value); persistApplication(value); setLetter(applicationLetter(profile, value.title, value.kind));
    }
    setWizardError(''); setStep(value => Math.min(3, value + 1));
  }
  async function copy(text: string) {
    if (!text.trim()) { notify('أضف بياناتك في الملف الشخصي أولاً'); return; }
    try { if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable'); await navigator.clipboard.writeText(text); notify('نُسخ النص؛ الصقه في الحقل المناسب بالموقع'); }
    catch { setManualCopy(text); }
  }
  function downloadCv() {
    if (!profile.cv) { notify('ارفع سيرتك الذاتية من الملف الشخصي أولاً'); return; }
    try { downloadAttachment(profile.cv); notify('جُهّز ملف سيرتك للتنزيل؛ ارفعه في موقع التقديم'); } catch { notify('تعذّر تجهيز الملف. أعد رفع نسخة PDF من الملف الشخصي.'); }
  }
  async function shareCv() {
    if (!profile.cv) { notify('ارفع سيرتك الذاتية من الملف الشخصي أولاً'); return; }
    try {
      const file = attachmentFile(profile.cv);
      if (navigator.share && navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: 'السيرة الذاتية' }); return; }
      downloadCv();
    } catch (error) { if (error instanceof Error && error.name === 'AbortError') return; downloadCv(); }
  }
  function exportAutofill() {
    downloadFile('az-logistics-application-profile.json', JSON.stringify(applicationProfileExport(profile), null, 2), 'application/json');
    notify('جُهّز ملف بيانات التقديم لاستيراده في إضافة الكمبيوتر');
  }
  const cvActions = <div className="row career-wrap"><button className="btn btn-secondary" onClick={downloadCv} disabled={!profile.cv}><Download size={16} />تنزيل سيرتي PDF</button><button className="btn btn-secondary" onClick={() => void shareCv()} disabled={!profile.cv}><Share2 size={16} />مشاركة ملف السيرة</button></div>;

  return <div className="opportunities-page">
    <SectionHeader eyebrow="خطوتك من الجامعة إلى الفرصة" title="الوظائف والدورات" description="ملف واحد، تجهيز واضح، ومتابعة لكل فرصة تختارها." action={<button className="btn btn-secondary" onClick={() => navigate('profile')}><UserRound size={17} />ملفي وسيرتي</button>} />
    <section className="card career-hero"><div><span className="eyebrow">جهّز اليوم، وتقدّم بثقة</span><h2>من بياناتك إلى طلب جاهز</h2><p className="muted">اختر موقعاً، جهّز بياناتك وسيرتك، ثم أكمل التسجيل والتقديم في موقع الجهة. سنمشي معك خطوة بخطوة.</p></div><div className="career-stats"><div><strong>{applications.length}</strong><span>فرص محفوظة</span></div><div><strong>{applications.filter(a => a.status === 'submitted').length}</strong><span>طلبات أرسلتها</span></div><div><strong>{profile.cv ? 'جاهزة' : 'أضفها'}</strong><span>سيرتك الذاتية</span></div></div></section>

    <section className="stack">
      <div className="card-heading"><div><h2 className="card-title"><Link2 size={20} />مواقعك وفرص تخصصك</h2><p className="card-subtitle">دليل التوظيف والدورات والشهادات وإكمال الدراسة، مع الاحتفاظ بروابطك الخاصة.</p></div><button className="btn btn-secondary" onClick={() => setLinkForm('new')}><Plus size={16} />إضافة موقع</button></div>
      <p className="notice">هذه روابط لجهات ومنصات، وليست إعلانات محدثة تلقائياً. راجع المواعيد والأهلية والاعتماد داخل موقع الجهة قبل التسجيل أو دفع الرسوم.</p>
      <div className="row opportunity-filters"><div className="search-field"><Search size={18} /><input aria-label="البحث في مواقع الفرص" value={query} onChange={e => setQuery(e.target.value)} placeholder="وظائف، مخزون، مشتريات، شهادات…" /></div><select className="input" aria-label="نوع الفرصة" value={category} onChange={e => setCategory(e.target.value as OpportunityCategory)}>{OPPORTUNITY_CATEGORIES.map(value => <option key={value}>{value}</option>)}</select></div>
      <div className="portal-grid">{visibleLinks.map(link => {
        const resource = opportunityResource(link);
        const group = opportunityCategory(link);
        const canPrepare = group === 'توظيف' || group === 'دورات';
        return <article className="card portal-card" key={link.id}>
          <div className="row-between"><span className={`portal-logo ${link.kind === 'course' ? 'green' : ''}`}>{link.kind === 'job' ? <BriefcaseBusiness size={23} /> : <GraduationCap size={23} />}</span><div className="row"><button className="icon-button" aria-label={`تعديل موقع ${link.name}`} onClick={() => setLinkForm(link)}><Pencil size={16} /></button><button className="icon-button danger" aria-label={`حذف موقع ${link.name}`} onClick={() => setDeletingLink(link)}><Trash2 size={16} /></button></div></div>
          <div><span className="badge">{group}</span><h3>{link.name}</h3><p className="muted">{resource?.description ?? (link.kind === 'job' ? 'ابحث عن فرصتك المهنية' : 'طوّر مهارة في تخصصك')}</p>{resource?.terms && <p className="muted">{resource.terms}</p>}</div>
          {canPrepare && <button className="btn btn-primary" disabled={!validHttpsUrl(link.url, false)} onClick={() => begin(link)}>جهّز {link.kind === 'job' ? 'طلب وظيفة' : 'تسجيل دورة'}<ArrowLeft size={16} /></button>}
          {validHttpsUrl(link.url, false) && <a className={canPrepare ? 'section-link' : 'btn btn-primary'} href={link.url} target="_blank" rel="noopener noreferrer" aria-label={`فتح ${link.name}`}>{canPrepare ? 'استعرض الموقع' : 'فتح الموقع'}<ExternalLink size={canPrepare ? 13 : 17} /></a>}
        </article>;
      })}</div>
      {!visibleLinks.length && <EmptyState icon={Link2} title={links.length ? 'لا توجد روابط مطابقة' : 'أضف مواقعك المفضلة'} description={links.length ? 'غيّر كلمة البحث أو اختر كل الأنواع.' : 'أضف موقعاً للوظائف أو الدورات لتبدأ تجهيز طلبك.'} />}
      <details className="card career-toolbox"><summary><BriefcaseBusiness size={18} />كلمات تساعدك في البحث</summary><div className="stack"><p>مساعد مشتريات، منسق لوجستي، مراقب مخزون، أمين مستودع، منسق سلاسل الإمداد، مساعد تخطيط.</p><p dir="ltr">Supply Chain Assistant · Logistics Coordinator · Inventory Controller · Warehouse · Procurement Assistant</p><p className="muted">هذه كلمات بحث، وليست وظائف مضمونة أو تأكيداً لمناسبة كل إعلان لدبلومك.</p></div></details>
      <details className="card career-toolbox"><summary><GraduationCap size={18} />قبل التقديم للتجسير</summary><p>اسأل جهة القبول عن قبول تخصص دبلومك والجهة المانحة، والمعدل المطلوب، ومعادلة الساعات، ونمط الدراسة والرسوم وموعد التقديم. قبول الدبلوم لا يعني بالضرورة وجود برنامج تجسير.</p></details>
    </section>

    {draft && <section id="application-assistant" className="card career-panel" aria-label="مساعد التقديم خطوة بخطوة">
      <div className="card-heading"><div><div className="eyebrow">معك في كل خطوة</div><h2 className="card-title">مساعد التقديم · {KIND[draft.kind]}</h2></div><button className="btn btn-ghost" onClick={() => { setDraft(null); setWizardError(''); }}>إغلاق المساعد</button></div>
      <ol className="career-stepper" aria-label="خطوات التقديم">{STEPS.map((name, index) => <li className={step === index ? 'current' : step > index ? 'done' : ''} aria-current={step === index ? 'step' : undefined} key={name}><span>{step > index ? <Check size={15} /> : index + 1}</span><strong>{name}</strong></li>)}</ol>
      <div className="career-step" role="group" aria-label={`الخطوة ${step + 1}: ${STEPS[step]}`}>
        {step === 0 && <><h3>ما الفرصة التي تريدها؟</h3><p className="muted">انسخ رابط الوظيفة أو الدورة نفسها إذا وجدتها. احفظ الاسم لتعود وتكمل التجهيز في أي وقت.</p><div className="form-grid"><Field label="اسم الوظيفة أو الدورة"><input required maxLength={160} value={draft.title} placeholder="مثال: تدريب تعاوني في سلاسل الإمداد" onChange={e => setDraft({ ...draft, title: e.target.value })} /></Field><Field label="اسم الجهة (اختياري)"><input maxLength={160} value={draft.organization} onChange={e => setDraft({ ...draft, organization: e.target.value })} /></Field></div><Field label="رابط التقديم"><input type="url" dir="ltr" maxLength={2000} value={draft.url} onChange={e => setDraft({ ...draft, url: e.target.value })} /></Field><p className="muted">ستُحفظ الفرصة بحالة «{APPLICATION_STATUS[draft.status]}» عند الانتقال للخطوة التالية.</p></>}
        {step === 1 && <><h3>راجع ملفك قبل البداية</h3><p className="muted">كل موقع له متطلبات مختلفة. جهّز الاسم والبريد والجوال، ثم راجع التعليم والمهارات. للوظائف أرفق نسخة PDF من سيرتك.</p><ul className="career-checklist"><li><CheckCircle2 size={18} />{profile.fullName ? `الاسم: ${profile.fullName}` : 'الاسم الكامل يحتاج إضافة'}</li><li><CheckCircle2 size={18} />{profile.email ? `البريد: ${profile.email}` : 'البريد الإلكتروني يحتاج إضافة'}</li><li><CheckCircle2 size={18} />{profile.phone ? `الجوال: ${profile.phone}` : 'الجوال يحتاج إضافة'}</li><li><FileText size={18} />{profile.cv ? `السيرة المرفوعة: ${profile.cv.name}` : 'لم ترفع سيرة ذاتية بعد'}</li></ul>{missing.length > 0 && <p className="notice career-missing">بيانات أساسية تحتاج استكمالاً: {missing.join('، ')}. يمكنك تجهيز بقية الطلب الآن.</p>}<button className="btn btn-secondary" onClick={() => navigate('profile')}><UserRound size={16} />استكمال الملف الشخصي والسيرة</button><p className="muted">فرصتك محفوظة. بعد تعديل الملف، ارجع لهذه الصفحة واضغط «أكمل التجهيز» من متابعتك.</p>{cvActions}</>}
        {step === 2 && <><h3>افتح الموقع، وانقل بياناتك بنفسك أو بمساعدة الإضافة</h3><p className="muted">افتح رابط الجهة، ثم سجّل الدخول أو أنشئ حسابك هناك. انسخ كل حقل إلى مكانه وارفع السيرة عند طلبها. راجع المتطلبات والموافقة قبل الإرسال.</p>{validHttpsUrl(draft.url, false) && <a className="btn btn-primary" href={draft.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={17} />فتح موقع التقديم</a>}<p className="notice">فتح الموقع وتجهيز الملف لا يرسلان الطلب. تُحدّث حالة التقديم بنفسك بعد إتمامه في الموقع.</p><div className="card-heading"><h4>بياناتك الجاهزة للنسخ</h4><button className="btn btn-secondary" disabled={!profileFields.length} onClick={() => void copy(applicationProfileText(profile))}><Copy size={16} />نسخ البيانات كلها</button></div><div className="career-field-list">{profileFields.map(field => <div className="career-field-row" key={field.key}><span className="muted">{field.label}</span><span dir="auto">{field.value}</span><button className="icon-button" aria-label={`نسخ ${field.label}`} onClick={() => void copy(field.value)}><Copy size={16} /></button></div>)}</div>{!profileFields.length && <p className="muted">أضف بياناتك من الملف الشخصي لتظهر هنا.</p>}{cvActions}<p className="muted">على الآيفون وأندرويد: نزّل ملف السيرة ثم اختره من «الملفات» عند إرفاقه. زر المشاركة يظهر خيارات جهازك إذا دعم المتصفح مشاركة الملفات.</p><Field label="مسودة رسالة تقديم قابلة للتعديل"><textarea className="career-cover-letter" rows={9} value={letter} maxLength={20000} onChange={e => setLetter(e.target.value)} /></Field><div className="row career-wrap"><button className="btn btn-secondary" onClick={() => void copy(letter)}><Copy size={16} />نسخ رسالة التقديم</button><button className="btn btn-ghost" onClick={() => setLetter(applicationLetter(profile, draft.title, draft.kind))}>إعادة إعداد المسودة من ملفي</button></div><p className="muted">المسودة تستخدم بياناتك المسجلة فقط. عدّلها بما يناسب متطلبات الفرصة قبل إرسالها.</p><details className="career-toolbox"><summary><Monitor size={18} />تعبئة الحقول تلقائياً على الكمبيوتر</summary><div className="stack"><p className="muted">لـ Chrome وEdge على الكمبيوتر: نزّل الإضافة وفك ضغطها، افتح صفحة الإضافات وفعّل وضع المطوّر، ثم اختر «تحميل إضافة غير محزّمة» وحدّد مجلد application-autofill. استورد ملف بيانات التقديم في الإضافة، وافتح صفحة الطلب واضغط «تعبئة هذه الصفحة». راجع الحقول والمرفق، ثم أرسل الطلب من الموقع بنفسك. تعمل الإضافة على الحقول الظاهرة المدعومة، وقد تحتاج بعض الحقول والملفات إلى إدخال يدوي.</p><div className="row career-wrap"><a className="btn btn-secondary" href={`${import.meta.env.BASE_URL}application-autofill.zip`} download><Download size={16} />تنزيل إضافة Chrome / Edge</a><button className="btn btn-primary" onClick={exportAutofill}><Download size={16} />تجهيز التعبئة التلقائية للكمبيوتر</button></div><p className="muted">الملف يحتوي بيانات التقديم والسيرة المرفوعة؛ احتفظ به في مكان خاص. الصور والبيانات المالية والدراسية الأخرى لا تُصدّر معه. على الجوال استخدم النسخ والتنزيل والمشاركة أعلاه.</p></div></details></>}
        {step === 3 && <><h3>وين وصلت في طلبك؟</h3><p className="muted">يمكنك العودة للموقع والاحتفاظ بالطلب قيد التجهيز. سجّل الإرسال هنا بعد إتمامه فعلياً.</p><div className="notice"><FileText size={18} /><span>الحالة المسجلة: <strong>{APPLICATION_STATUS[applications.find(a => a.id === draft.id)?.status ?? draft.status]}</strong></span></div><Field label="ملاحظاتك أو موعد المتابعة"><textarea rows={4} maxLength={6000} value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} /></Field><button className="btn btn-secondary" onClick={() => { persistApplication(draft); notify('حُفظت ملاحظات الفرصة'); }}><Save size={16} />حفظ الملاحظات</button><label className="career-confirm"><input type="checkbox" checked={submissionConfirmed} onChange={e => setSubmissionConfirmed(e.target.checked)} />راجعت الطلب وأرسلته فعلياً في موقع الجهة</label><button className="btn btn-primary" disabled={!submissionConfirmed} onClick={() => { const value = { ...draft, status: 'submitted' as const }; persistApplication(value); setDraft(value); setSubmissionConfirmed(false); notify('سُجّل تأكيدك بأن الطلب أُرسل'); }}><CheckCircle2 size={18} />تسجيل الطلب كمرسَل</button></>}
      </div>
      {wizardError && <p className="notice danger" role="alert">{wizardError}</p>}
      <div className="career-step-actions"><button className="btn btn-secondary" disabled={step === 0} onClick={() => { setStep(value => Math.max(0, value - 1)); setWizardError(''); }}><ArrowRight size={18} />السابق</button>{step < 3 ? <button className="btn btn-primary" onClick={next}>{step === 0 ? 'حفظ الفرصة والمتابعة' : step === 2 ? 'انتهيت، إلى المتابعة' : 'التالي'}<ArrowLeft size={18} /></button> : <button className="btn btn-secondary" onClick={() => { persistApplication(draft); setDraft(null); notify('حُفظت متابعة الفرصة'); }}>حفظ وإغلاق المساعد<Check size={18} /></button>}</div>
    </section>}

    <section className="card career-tracker"><div className="card-heading"><div><h2 className="card-title"><BriefcaseBusiness size={20} />متابعتي للفرص</h2><p className="card-subtitle">طلباتك التي حفظتها أو جهّزتها؛ الحالات تُحدّث حسب ما تسجله أنت.</p></div><button className="btn btn-secondary" onClick={() => setApplicationForm('new')}><Plus size={16} />حفظ فرصة</button></div><div className="application-filters"><Field label="البحث"><input value={filters.search} placeholder="اسم الفرصة أو الجهة" onChange={e => setFilters({ ...filters, search: e.target.value })} /></Field><Field label="الحالة"><select value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value as typeof filters.status })}><option value="">كل الحالات</option>{Object.entries(APPLICATION_STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="النوع"><select value={filters.kind} onChange={e => setFilters({ ...filters, kind: e.target.value as typeof filters.kind })}><option value="">الكل</option><option value="job">وظائف</option><option value="course">دورات</option></select></Field><Field label="محفوظة من"><input type="date" value={filters.from} onChange={e => setFilters({ ...filters, from: e.target.value })} /></Field><Field label="إلى تاريخ"><input type="date" value={filters.to} min={filters.from || undefined} onChange={e => setFilters({ ...filters, to: e.target.value })} /></Field></div>
      {visible.length ? <div className="application-list">{visible.map(item => <article className="application-card" key={item.id}><div className="application-heading"><div><span className={`badge ${item.status === 'accepted' ? 'green' : item.status === 'submitted' ? 'blue' : ''}`}>{APPLICATION_STATUS[item.status]}</span><h3>{item.title}</h3><p className="muted">{KIND[item.kind]}{item.organization ? ` · ${item.organization}` : ''} · حُفظت {formatDate(item.createdAt.slice(0, 10), true)}</p></div><div className="row"><button className="icon-button" aria-label={`تعديل فرصة ${item.title}`} onClick={() => setApplicationForm(item)}><Pencil size={16} /></button><button className="icon-button danger" aria-label={`حذف فرصة ${item.title}`} onClick={() => setDeletingApplication(item)}><Trash2 size={16} /></button></div></div>{item.notes && <p className="application-notes muted">{item.notes}</p>}<div className="row career-wrap"><button className="btn btn-ghost" onClick={() => resume(item)}>أكمل التجهيز<ArrowLeft size={16} /></button>{validHttpsUrl(item.url, false) && <a className="btn btn-secondary" href={item.url} target="_blank" rel="noopener noreferrer">موقع الفرصة<ExternalLink size={16} /></a>}</div></article>)}</div> : <EmptyState icon={BriefcaseBusiness} title={applications.length ? 'لا توجد نتائج بهذه الخيارات' : 'أول فرصة تبدأ بخطوة'} description={applications.length ? 'عدّل البحث أو الحالة أو الفترة لعرض بقية الفرص.' : 'اختر موقعاً بالأعلى وجهّز طلبك، أو احفظ فرصة وجدتها للمتابعة.'} />}
    </section>

    {linkForm && <LinkForm item={linkForm === 'new' ? undefined : linkForm} onClose={() => setLinkForm(null)} />}
    {applicationForm && <ApplicationForm item={applicationForm === 'new' ? undefined : applicationForm} onClose={() => setApplicationForm(null)} />}
    {deletingLink && <Modal title="حذف رابط الموقع؟" onClose={() => setDeletingLink(null)}><p>سيُحذف «{deletingLink.name}» من مواقعك. تبقى الفرص المحفوظة في متابعتك.</p><div className="modal-actions"><button className="btn btn-secondary" onClick={() => setDeletingLink(null)}>إلغاء</button><button className="btn btn-danger" onClick={() => { update(d => { d.opportunityLinks = (d.opportunityLinks ?? structuredClone(DEFAULT_OPPORTUNITY_LINKS)).filter(link => link.id !== deletingLink.id); }); setDeletingLink(null); notify('حُذف رابط الموقع'); }}>حذف الرابط</button></div></Modal>}
    {deletingApplication && <Modal title="حذف متابعة الفرصة؟" onClose={() => setDeletingApplication(null)}><p>سيُحذف سجل «{deletingApplication.title}» من متابعة حسابك.</p><div className="modal-actions"><button className="btn btn-secondary" onClick={() => setDeletingApplication(null)}>إلغاء</button><button className="btn btn-danger" onClick={() => { const id = deletingApplication.id; update(d => { d.applications = (d.applications ?? []).filter(item => item.id !== id); }); if (draft?.id === id) setDraft(null); setDeletingApplication(null); notify('حُذفت متابعة الفرصة'); }}>حذف المتابعة</button></div></Modal>}
    {manualCopy !== null && <Modal title="انسخ النص يدوياً" onClose={() => setManualCopy(null)}><p className="muted">المتصفح لم يسمح بالنسخ المباشر. اضغط داخل النص وحدّده ثم اختر «نسخ».</p><textarea rows={10} readOnly aria-label="النص الجاهز للنسخ اليدوي" value={manualCopy} onFocus={e => e.target.select()} /><div className="modal-actions"><button className="btn btn-secondary" onClick={() => setManualCopy(null)}>تم</button></div></Modal>}
  </div>;
}
