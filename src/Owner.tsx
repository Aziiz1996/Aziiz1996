import { useEffect, useState, type FormEvent } from 'react';
import { ArrowDown, ArrowUp, BookOpen, Check, ClipboardList, Download, Eye, FileText, GraduationCap, LayoutDashboard, Palette, Save, Settings2, ShieldCheck, Upload, UserRound, BriefcaseBusiness } from 'lucide-react';
import { useAuth, type OwnerDesign } from './auth';
import { useApp } from './store';
import { validateData } from './validation';
import { Field, Modal, SectionHeader } from './ui';
import type { Page } from './types';

const PAGE_NAMES: Record<Page, string> = {
  dashboard: 'نظرة عامة', university: 'الجامعة — الكلية التطبيقية', courses: 'المواد والمحاضرات', plan: 'خطة المذاكرة', tasks: 'المهام والاختبارات',
  exams: 'جدول الاختبارات', practice: 'الاختبارات التجريبية', assistant: 'تيتشر لوجستيك', logistics: 'دليل اللوجستيات', updates: 'جديد تخصصك',
  notes: 'الملاحظات والملخصات', finance: 'ميزانيتي', groups: 'مجموعات المشاريع', profile: 'الملف الشخصي', opportunities: 'الوظائف والدورات', settings: 'الإعدادات', owner: 'لوحة المالك',
};
const CONTENT_LINKS = [
  { page: 'courses', title: 'المواد والمحاضرات', detail: 'المواد وأوقات الدراسة', icon: GraduationCap },
  { page: 'tasks', title: 'المهام والاختبارات', detail: 'الواجبات والمواعيد والمشروعات', icon: ClipboardList },
  { page: 'practice', title: 'التدريب والاختبارات', detail: 'تدريبك وسجل نتائجك', icon: BookOpen },
  { page: 'notes', title: 'الملاحظات والملخصات', detail: 'اكتب ملخصاتك وراجعها', icon: FileText },
  { page: 'profile', title: 'الملف والسيرة الذاتية', detail: 'صورتك وبياناتك وملف السيرة', icon: UserRound },
  { page: 'opportunities', title: 'الوظائف والدورات', detail: 'الروابط ومتابعة التقديم', icon: BriefcaseBusiness },
  { page: 'settings', title: 'إعدادات الدراسة', detail: 'وقت المذاكرة والجامعة والميزانية', icon: Settings2 },
] as const;
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'تعذّر إكمال العملية. حاول مرة أخرى.';

function OwnerPanel() {
  const { username, design, saveDesign, saveOwnerData, getOwnerData } = useAuth();
  const { data, navigate, notify, replace, recoveryRaw } = useApp();
  const [form, setForm] = useState<OwnerDesign>(() => structuredClone(design));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<'design' | 'backup' | 'restore' | null>(null);
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState<'backup' | 'restore' | null>(null);
  useEffect(() => { if (!dirty) setForm(structuredClone(design)); }, [design, dirty]);

  function editDesign(change: (draft: OwnerDesign) => void) {
    setForm(previous => { const next = structuredClone(previous); change(next); return next; });
    setDirty(true);
  }
  function reorder(index: number, direction: -1 | 1) {
    editDesign(draft => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= draft.navigation.length) return;
      [draft.navigation[index], draft.navigation[nextIndex]] = [draft.navigation[nextIndex], draft.navigation[index]];
    });
  }
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy('design'); setError('');
    try { await saveDesign(form); setDirty(false); notify('حُفظ مظهر التطبيق وترتيب القائمة على الخادم'); }
    catch (issue) { setError(errorMessage(issue)); }
    finally { setBusy(null); }
  }
  async function transferData() {
    const operation = confirmation;
    if (!operation) return;
    setBusy(operation); setError('');
    try {
      if (operation === 'backup') {
        if (recoveryRaw !== null) throw new Error('راجع النسخة الأصلية من الإعدادات قبل حفظ بيانات حسابك على الخادم.');
        await saveOwnerData(data); notify('حُفظت نسخة بيانات حسابك في مساحة المالك على الخادم');
      } else {
        const saved: unknown = await getOwnerData();
        if (!validateData(saved)) throw new Error('صيغة النسخة المحفوظة غير صالحة. لم تتغير بياناتك.');
        if (!replace(saved)) throw new Error('تعذّرت استعادة النسخة. لم تتغير بياناتك.');
        notify('استُعيدت نسخة المالك إلى حسابك');
      }
      setConfirmation(null);
    } catch (issue) { setError(errorMessage(issue)); setConfirmation(null); }
    finally { setBusy(null); }
  }

  return <div className="stack owner-panel">
    <div className="notice owner-status"><ShieldCheck size={21} /><span>أنت مسجّل بصلاحية المالك: <strong>{username}</strong></span><button className="btn btn-secondary" onClick={() => document.querySelector('.account-bar')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>إدارة الدخول وحماية الحساب</button></div>
    {error && <div className="notice danger" role="alert">{error}</div>}
    <div className="owner-grid">
      <form className="card stack owner-design-form" onSubmit={save}>
        <div className="card-heading"><div><span className="eyebrow">هوية مساحتك</span><h2><Palette size={19} /> المظهر والقائمة</h2><p className="muted">تظهر هذه التغييرات لجميع الحسابات المسجّلة في هذا التطبيق.</p></div></div>
        <div className="form-grid">
          <Field label="اسم التطبيق"><input value={form.appName} required maxLength={80} disabled={busy !== null} onChange={event => editDesign(draft => { draft.appName = event.target.value; })} /></Field>
          <Field label="لون التطبيق"><input type="color" aria-label="لون التطبيق" value={form.accentColor} disabled={busy !== null} onChange={event => editDesign(draft => { draft.accentColor = event.target.value; })} /></Field>
        </div>
        <Field label="عنوان الترحيب"><input value={form.welcomeTitle} maxLength={200} disabled={busy !== null} onChange={event => editDesign(draft => { draft.welcomeTitle = event.target.value; })} /></Field>
        <Field label="رسالة الترحيب"><textarea value={form.welcomeMessage} maxLength={1000} rows={3} disabled={busy !== null} onChange={event => editDesign(draft => { draft.welcomeMessage = event.target.value; })} /></Field>
        <div className="owner-design-preview" style={{ borderInlineStartColor: form.accentColor }}><span className="eyebrow" style={{ color: form.accentColor }}>معاينة · {form.appName || 'اسم التطبيق'}</span><h3>{form.welcomeTitle || 'عنوان الترحيب'}</h3><p className="muted">{form.welcomeMessage || 'رسالة الترحيب'}</p></div>
        <div><h3>ترتيب صفحات القائمة</h3><p className="muted">حرّك الصفحة أو أخفها من القائمة. تظل الصفحة الرئيسية ولوحة المالك ظاهرتين.</p></div>
        <div className="owner-nav-list">{form.navigation.map((page, index) => <div className="owner-nav-row" key={page}>
          <span className="owner-nav-name">{PAGE_NAMES[page]}</span>
          <div className="owner-nav-actions">
            <label className="owner-visibility"><input type="checkbox" checked={!form.hiddenPages.includes(page)} disabled={busy !== null || page === 'dashboard' || page === 'owner'} onChange={event => editDesign(draft => { draft.hiddenPages = event.target.checked ? draft.hiddenPages.filter(id => id !== page) : [...draft.hiddenPages, page]; })} /><span>إظهار</span></label>
            <button className="icon-button" type="button" aria-label={`رفع ${PAGE_NAMES[page]}`} disabled={index === 0 || busy !== null} onClick={() => reorder(index, -1)}><ArrowUp size={17} /></button>
            <button className="icon-button" type="button" aria-label={`خفض ${PAGE_NAMES[page]}`} disabled={index === form.navigation.length - 1 || busy !== null} onClick={() => reorder(index, 1)}><ArrowDown size={17} /></button>
          </div>
        </div>)}</div>
        <div className="form-actions"><button className="btn btn-primary" type="submit" disabled={!dirty || busy !== null}><Save size={17} />{busy === 'design' ? 'جارٍ الحفظ…' : 'حفظ المظهر والقائمة'}</button><button className="btn btn-secondary" type="button" disabled={!dirty || busy !== null} onClick={() => { setForm(structuredClone(design)); setDirty(false); }}>إلغاء التعديلات</button></div>
      </form>
      <div className="stack">
        <section className="card stack">
          <div className="card-heading"><div><span className="eyebrow">إدارة يومك</span><h2><LayoutDashboard size={19} /> المحتوى والبيانات</h2><p className="muted">افتح الصفحة لتعديل بياناتك بأدواتها المعتادة.</p></div></div>
          <div className="owner-content-grid">{CONTENT_LINKS.map(({ page, title, detail, icon: Icon }) => <button type="button" key={page} className="owner-content-link" onClick={() => navigate(page)}><Icon size={21} /><span><strong>{title}</strong><small>{detail}</small></span></button>)}</div>
        </section>
        <section className="card stack">
          <div className="card-heading"><div><span className="eyebrow">نسختك الخاصة</span><h2><ShieldCheck size={19} /> حفظ البيانات على الخادم</h2></div></div>
          <p className="muted">بيانات حسابك تُحفظ تلقائياً على الخادم. هذه نسخة احتياطية يدوية مستقلة تخص حساب المالك، وتشمل الدراسة والملف الشخصي والسيرة والمعلومات المالية. حفظها لا يغيّر بيانات حسابك الحالية أو بيانات الطلاب الآخرين.</p>
          <div className="owner-data-summary"><span>{data.courses.length} مواد</span><span>{data.tasks.length} مهام</span><span>{data.notes.length} ملاحظات</span></div>
          {recoveryRaw !== null && <p className="danger" role="status">نسخة حسابك تحتاج مراجعة من الإعدادات قبل رفعها إلى الخادم.</p>}
          <div className="form-actions owner-backup-actions"><button className="btn btn-primary" type="button" disabled={busy !== null || recoveryRaw !== null} onClick={() => setConfirmation('backup')}><Upload size={17} />حفظ نسخة على الخادم</button><button className="btn btn-secondary" type="button" disabled={busy !== null} onClick={() => setConfirmation('restore')}><Download size={17} />استعادة نسخة الخادم</button></div>
          <button className="section-link" type="button" onClick={() => navigate('settings')}><Eye size={16} />تصدير نسخة إلى جهازك من الإعدادات</button>
        </section>
        <section className="card stack"><h2><ShieldCheck size={19} /> حساب واحد بصلاحية المالك</h2><p className="muted">تغيير كلمة المرور والاسترداد وتسجيل الخروج من شريط الحساب أعلى الصفحة. تستخدم هذه اللوحة حسابك نفسه وصلاحياته.</p></section>
      </div>
    </div>
    {confirmation && <Modal title={confirmation === 'backup' ? 'حفظ نسخة بياناتك على الخادم؟' : 'استعادة نسخة الخادم إلى حسابك؟'} onClose={() => { if (!busy) setConfirmation(null); }}><div className="stack">
      <p>{confirmation === 'backup' ? 'ستُرسل بيانات حسابك الحالية، بما فيها معلوماتك الشخصية وملف السيرة والبيانات المالية، إلى مساحة المالك الخاصة على الخادم. ستحل محل النسخة السابقة هناك.' : 'ستستبدل النسخة اليدوية بيانات حسابك الحالية بالكامل، ثم تُحفظ التغييرات في حسابك. احتفظ بنسخة محلية من الإعدادات إذا أردت الرجوع إلى بياناتك الحالية.'}</p>
      <div className="modal-actions"><button className="btn btn-secondary" disabled={busy !== null} onClick={() => setConfirmation(null)}>إلغاء</button><button className="btn btn-primary" disabled={busy !== null} onClick={transferData}><Check size={17} />{busy ? 'جارٍ التنفيذ…' : confirmation === 'backup' ? 'تأكيد حفظ النسخة' : 'تأكيد الاستعادة'}</button></div>
    </div></Modal>}
  </div>;
}

export default function OwnerPage() {
  const { authenticated, role } = useAuth();
  const { navigate } = useApp();
  return <>
    <SectionHeader eyebrow="مساحتك تحت إدارتك" title="لوحة المالك" description="خصص واجهة التطبيق وأدر بياناتك وحسابك من مكان واحد." />
    {authenticated && role === 'owner' ? <OwnerPanel /> : <div className="notice"><p>هذه اللوحة متاحة لمدير التطبيق فقط.</p><button className="btn btn-secondary" onClick={() => navigate('dashboard')}>العودة للرئيسية</button></div>}
  </>;
}
