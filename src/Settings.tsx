import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Download, Upload, Settings2, Sparkles, Trash2, ShieldCheck, Save } from 'lucide-react';
import { useApp, downloadFile, emptyData, validUniversityUrl } from './store';
import { Field, Modal, SectionHeader } from './ui';
import { demoData } from './demo';
import { todayISO } from './logic';
import type { Settings } from './types';

const days = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const currencies = { SAR: 'ريال سعودي', AED: 'درهم إماراتي', KWD: 'دينار كويتي', USD: 'دولار أمريكي', EUR: 'يورو', EGP: 'جنيه مصري', QAR: 'ريال قطري', BHD: 'دينار بحريني', OMR: 'ريال عماني' };

export default function SettingsPage() {
  const { data, update, replace, notify, navigate, recoveryRaw } = useApp();
  const [form, setForm] = useState<Settings>(structuredClone(data.settings));
  const previousSettings = useRef(data.settings);
  useEffect(() => {
    const previous = previousSettings.current;
    previousSettings.current = data.settings;
    setForm(current => JSON.stringify(current) === JSON.stringify(previous) ? structuredClone(data.settings) : current);
  }, [data.settings]);
  const [confirmation, setConfirmation] = useState<'demo' | 'reset' | null>(null);
  const [importError, setImportError] = useState('');
  const [formError, setFormError] = useState('');
  function save(event: FormEvent) {
    event.preventDefault();
    if (!validUniversityUrl(form.universityUrl ?? '')) { setFormError('أدخل رابطاً صحيحاً يبدأ بـ https:// لبوابة الجامعة.'); return; }
    setFormError(''); update(d => { d.settings = form; if (d.studentProfile) { d.studentProfile.fullName = form.name; d.studentProfile.university = form.universityName ?? ''; } }); notify('حُفظت تفضيلاتك وتحدّثت خطة المذاكرة');
  }
  async function importBackup(file: File | undefined) {
    if (!file) return;
    setImportError('');
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('الملف كبير جداً. الحد الأقصى ١٠ ميجابايت.');
      const parsed: unknown = JSON.parse(await file.text());
      if (!replace(parsed as never)) throw new Error('صيغة النسخة غير صحيحة أو البيانات غير مكتملة. لم نغيّر بياناتك.');
      notify('استُعيدت بياناتك بنجاح'); navigate('dashboard');
    } catch (error) { setImportError(error instanceof Error ? error.message : 'تعذّر استيراد النسخة الاحتياطية.'); }
  }
  const hasData = data.courses.length + data.tasks.length + data.notes.length + data.transactions.length + (data.incomeRules?.length ?? 0) + (data.opportunityLinks?.length ?? 0) + (data.applications?.length ?? 0) + (data.studyLog?.length ?? 0) + (data.practiceAttempts?.length ?? 0) > 0 || !!data.studentProfile || !!data.activeStudy || !!data.activePractice || JSON.stringify(data.settings) !== JSON.stringify(emptyData().settings) || recoveryRaw !== null;
  return <>
    <SectionHeader eyebrow="على طريقتك" title="إعدادات مساحتك" description="حدد وقتك وميزانيتك، واحتفظ بنسخة من تفاصيلك." />
    {recoveryRaw !== null && <div className="notice notice-warning"><div><strong>نسختك الأصلية تحتاج استعادة</strong><p>احتفظ بها أولاً. لم نستبدلها بالتغييرات المؤقتة؛ استورد نسخة صالحة أو أكد حذف البيانات لبدء نسخة جديدة.</p></div><button className="btn btn-secondary" onClick={() => downloadFile(`madar-recovery-${todayISO()}.json`, recoveryRaw, 'application/json')}><Download size={18} /> تصدير النسخة الأصلية</button></div>}
    <div className="settings-grid">
      <form className="card settings-card" onSubmit={save}>
        <div className="card-heading"><h2><Settings2 size={20} /> تفضيلاتك اليومية</h2></div>
        <div className="form-grid">
          <Field label="اسمك"><input value={form.name} maxLength={80} placeholder="كيف تحب أن نناديك؟" onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="العملة"><select value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })}>{Object.entries(currencies).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></Field>
          <Field label="ميزانية المصروفات الشهرية"><input type="number" min="0" max="1000000000" step="0.01" required value={form.monthlyBudget} onChange={e => setForm({ ...form, monthlyBudget: Number(e.target.value) })} /></Field>
          <Field label="وقت المذاكرة اليومي بالدقائق"><input type="number" min="0" max="720" step="1" required value={form.dailyMinutes} onChange={e => setForm({ ...form, dailyMinutes: Number(e.target.value) })} /></Field>
          <Field label="بداية المذاكرة"><input type="time" required value={form.studyStart} onChange={e => setForm({ ...form, studyStart: e.target.value })} /></Field>
          <Field label="اسم الجامعة (اختياري)"><input value={form.universityName ?? ''} maxLength={150} onChange={e => setForm({ ...form, universityName: e.target.value })} /></Field>
          <Field label="رابط بوابة الجامعة (اختياري)"><input type="url" dir="ltr" placeholder="https://…" value={form.universityUrl ?? ''} onChange={e => setForm({ ...form, universityUrl: e.target.value.trim() })} /></Field>
        </div>
        <fieldset className="study-weekdays"><legend>أيام المذاكرة</legend><div className="weekday-picker">{days.map((day, i) => <label className={form.studyDays.includes(i) ? 'chip selected' : 'chip'} key={day}><input type="checkbox" checked={form.studyDays.includes(i)} onChange={e => setForm({ ...form, studyDays: e.target.checked ? [...form.studyDays, i].sort() : form.studyDays.filter(d => d !== i) })} />{day}</label>)}</div></fieldset>
        <p className="muted">الجدول يراعي المحاضرات والمواعيد النهائية. تغيير العملة يغيّر طريقة العرض؛ لا يحوّل مبالغ العمليات المسجلة.</p>
        {formError && <p className="notice danger" role="alert">{formError}</p>}
        <button className="btn btn-primary" type="submit"><Save size={18} /> حفظ التفضيلات</button>
      </form>
      <div className="stack">
        <section className="card settings-card"><div className="card-heading"><h2><ShieldCheck size={20} /> بياناتك معك</h2></div><p className="muted">تُحفظ بياناتك في هذا المتصفح. استخدم التصدير للاحتفاظ بنسخة أو نقلها إلى جهاز آخر. مسح بيانات المتصفح يحذف النسخة المحفوظة.</p><div className="stack"><button className="btn btn-secondary" onClick={() => downloadFile(`madar-${todayISO()}.json`, JSON.stringify(data, null, 2), 'application/json')}><Download size={18} /> تصدير نسخة احتياطية</button><label className="btn btn-secondary import-button"><Upload size={18} /> استيراد نسخة احتياطية<input aria-label="استيراد ملف نسخة احتياطية" type="file" accept="application/json,.json" onChange={e => { const file = e.target.files?.[0]; if (file && (!hasData || window.confirm('استيراد النسخة يستبدل البيانات الحالية. هل تريد المتابعة؟'))) void importBackup(file); e.target.value = ''; }} /></label>{importError && <div role="alert" className="notice danger">{importError}</div>}</div></section>
        <section className="card settings-card"><h2><Sparkles size={20} /> استكشف مدار</h2><p className="muted">جرّب مثالاً بمواد ومهام ومصروفات توضيحية. {hasData ? 'سيستبدل المثال البيانات الحالية؛ صدّرها أولاً.' : 'يمكنك مسحه عندما تبدأ بإدخال بياناتك.'}</p><button className="btn btn-secondary" onClick={() => setConfirmation('demo')}><Sparkles size={18} /> تحميل بيانات تجريبية</button></section>
        <section className="card settings-card"><h2>بداية جديدة</h2><p className="muted">احذف بيانات التطبيق من هذا المتصفح. احتفظ بنسخة احتياطية أولاً إذا كنت تحتاجها.</p><button className="btn btn-ghost danger" onClick={() => setConfirmation('reset')}><Trash2 size={18} /> حذف جميع البيانات</button></section>
      </div>
    </div>
    {confirmation && <Modal title={confirmation === 'demo' ? 'تحميل المثال التجريبي؟' : 'حذف جميع البيانات؟'} onClose={() => setConfirmation(null)}><p>{confirmation === 'demo' ? 'المواد والمواعيد والمبالغ في المثال توضيحية. سيستبدل بياناتك الحالية، ويمكنك مسحه لاحقاً.' : 'سيُحذف كل ما سجلته في هذا المتصفح. لا يمكن التراجع إلا باستيراد نسخة احتياطية.'}</p><div className="modal-actions"><button className="btn btn-secondary" onClick={() => setConfirmation(null)}>إلغاء</button><button className={confirmation === 'demo' ? 'btn btn-primary' : 'btn btn-danger'} onClick={() => { replace(confirmation === 'demo' ? demoData() : emptyData()); setConfirmation(null); notify(confirmation === 'demo' ? 'أنت تستعرض بيانات تجريبية' : 'حُذفت البيانات'); navigate('dashboard'); }}>{confirmation === 'demo' ? 'تحميل المثال' : 'حذف البيانات نهائياً'}</button></div></Modal>}
  </>;
}
