import { useEffect, useRef, useState, type FormEvent } from 'react';
import { BriefcaseBusiness, Camera, Check, Download, FileText, GraduationCap, ImagePlus, Printer, Save, Share2, Trash2, UserRound } from 'lucide-react';
import { useApp, downloadFile } from './store';
import { Field, Modal, SectionHeader } from './ui';
import { getStudentProfile, validHttpsUrl } from './dataExtensions';
import { dataURLToFile, downloadAttachment, prepareCvAttachment, prepareProfilePhoto, profileAsText } from './profileFiles';
import type { Attachment, StudentProfile } from './types';

const sizeLabel = (bytes: number) => `${new Intl.NumberFormat('ar-SA', { maximumFractionDigits: 0 }).format(Math.ceil(bytes / 1024))} كيلوبايت`;
const cleanSkills = (text: string) => [...new Set(text.split(/[,،\n]/).map(skill => skill.trim()).filter(Boolean))];

function CvPreview({ profile }: { profile: StudentProfile }) {
  const education = [profile.university, profile.major, profile.graduationYear, profile.education].filter(value => value.trim());
  const contact = [profile.email, profile.phone, profile.city].filter(value => value.trim());
  return <article className="cv-print-sheet" dir="rtl" aria-label="معاينة السيرة الذاتية">
    <header className="cv-heading">
      {profile.photo && <img className="cv-photo" src={profile.photo.dataUrl} alt="صورتك الشخصية" width="80" height="80" />}
      <h1>{profile.fullName.trim() || 'السيرة الذاتية'}</h1>
      {profile.headline.trim() && <p>{profile.headline}</p>}
      {contact.length > 0 && <div className="cv-contact">{contact.map((value, index) => <span key={index}><bdi>{value}</bdi></span>)}</div>}
      <div className="cv-contact">{[profile.linkedin, profile.website].filter(value => value && validHttpsUrl(value)).map(url => <a key={url} href={url} target="_blank" rel="noopener noreferrer"><bdi>{url}</bdi></a>)}</div>
    </header>
    {profile.summary.trim() && <section className="cv-section"><h2>نبذة</h2><p>{profile.summary}</p></section>}
    {education.length > 0 && <section className="cv-section"><h2>التعليم</h2>{education.map((value, index) => <p key={index}>{value}</p>)}</section>}
    {profile.experience.trim() && <section className="cv-section"><h2>الخبرات والمشروعات</h2><p>{profile.experience}</p></section>}
    {profile.skills.length > 0 && <section className="cv-section"><h2>المهارات</h2><p>{profile.skills.join('، ')}</p></section>}
  </article>;
}

export default function ProfilePage() {
  const { data, update, notify, navigate, storageError } = useApp();
  const source = JSON.stringify(getStudentProfile(data));
  const [form, setForm] = useState<StudentProfile>(() => getStudentProfile(data));
  const [skillsText, setSkillsText] = useState(() => getStudentProfile(data).skills.join('، '));
  const [dirty, setDirty] = useState(false); const dirtyRef = useRef(false);
  const [uploading, setUploading] = useState<'photo' | 'cv' | null>(null);
  const [formError, setFormError] = useState(''); const [uploadError, setUploadError] = useState('');
  const [preview, setPreview] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null); const cameraInput = useRef<HTMLInputElement>(null); const cvInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // The personal bootstrap may arrive after the page opens. Never discard edits.
    if (!dirtyRef.current) { const next = JSON.parse(source) as StudentProfile; setForm(next); setSkillsText(next.skills.join('، ')); }
  }, [source]);
  useEffect(() => {
    const afterPrint = () => document.body.classList.remove('printing-cv');
    window.addEventListener('afterprint', afterPrint);
    return () => { window.removeEventListener('afterprint', afterPrint); afterPrint(); };
  }, []);
  function markDirty() { dirtyRef.current = true; setDirty(true); }
  function change<K extends keyof StudentProfile>(key: K, value: StudentProfile[K]) { markDirty(); setForm(current => ({ ...current, [key]: value })); setFormError(''); }
  function restore() {
    const next = getStudentProfile(data); setForm(next); setSkillsText(next.skills.join('، '));
    dirtyRef.current = false; setDirty(false); setFormError(''); setUploadError('');
  }
  function save(event: FormEvent) {
    event.preventDefault(); if (uploading) return;
    if (!validHttpsUrl(form.linkedin) || !validHttpsUrl(form.website)) { setFormError('أدخل روابط صحيحة تبدأ بـ https:// للينكدإن والموقع الشخصي، أو اتركها فارغة.'); return; }
    const skills = cleanSkills(skillsText);
    if (skills.length > 30 || skills.some(skill => skill.length > 80)) { setFormError('اكتب حتى ٣٠ مهارة، وبحد أقصى ٨٠ حرفاً لكل مهارة.'); return; }
    const next: StudentProfile = {
      ...form, fullName: form.fullName.trim(), email: form.email.trim(), phone: form.phone.trim(), city: form.city.trim(),
      headline: form.headline.trim(), summary: form.summary.trim(), university: form.university.trim(), major: form.major.trim(),
      graduationYear: form.graduationYear.trim(), education: form.education.trim(), experience: form.experience.trim(),
      linkedin: form.linkedin.trim(), website: form.website.trim(), skills,
    };
    if (next.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.email)) { setFormError('راجع البريد الإلكتروني، أو اتركه فارغاً.'); return; }
    if (next.graduationYear && !/^\d{4}$/.test(next.graduationYear)) { setFormError('اكتب سنة التخرج بأربعة أرقام مثل 2027، أو اتركها فارغة.'); return; }
    setForm(next); setSkillsText(skills.join('، ')); dirtyRef.current = false; setDirty(false); setFormError('');
    update(draft => { draft.studentProfile = next; draft.settings = { ...draft.settings, name: next.fullName, universityName: next.university }; });
    notify('تم تحديث ملفك في التطبيق');
  }
  async function upload(file: File | undefined, kind: 'photo' | 'cv') {
    if (!file || uploading) return;
    setUploadError(''); setUploading(kind);
    try {
      const attachment = kind === 'photo' ? await prepareProfilePhoto(file) : await prepareCvAttachment(file);
      change(kind, attachment);
      notify(kind === 'photo' ? 'الصورة جاهزة. اضغط حفظ الملف للاحتفاظ بها.' : 'السيرة جاهزة. اضغط حفظ الملف لاستخدامها في التقديم.');
    } catch (error) { setUploadError(error instanceof Error ? error.message : 'تعذّر تجهيز الملف. اختره من جهازك مرة أخرى.'); }
    finally { setUploading(null); }
  }
  function downloadCv(attachment: Attachment) {
    try { downloadAttachment(attachment); } catch (error) { setUploadError(error instanceof Error ? error.message : 'تعذّر تنزيل السيرة. أعد رفع الملف الأصلي.'); }
  }
  async function shareCv(attachment: Attachment) {
    setUploadError('');
    try {
      const file = dataURLToFile(attachment);
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: 'سيرتي الذاتية', files: [file] });
      } else { downloadAttachment(attachment); notify('نزّلنا السيرة لتختارها عند إرفاق ملف في الموقع المطلوب.'); }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setUploadError('تعذّرت المشاركة من هذا المتصفح. استخدم زر تنزيل السيرة ثم أرفق الملف في الموقع.');
    }
  }
  const previewProfile = { ...form, skills: cleanSkills(skillsText) };
  const cvText = profileAsText(previewProfile); const hasContent = !!cvText.trim();
  function printCv() { document.body.classList.add('printing-cv'); requestAnimationFrame(() => window.print()); }
  return <div className="profile-page">
    <SectionHeader eyebrow="كل خطوة تبدأ بك" title="ملفي وسيرتي" description="صورتك، دراستك ومهاراتك في مكان واحد. جهّز ملفك ثم استخدمه للتقديم على فرصك القادمة." action={<button className="btn btn-secondary" onClick={() => setPreview(true)} disabled={!hasContent}><FileText size={18} /> معاينة السيرة</button>} />
    <div className="profile-grid">
      <form className="card profile-form" onSubmit={save}>
        <div className="card-heading"><h2><UserRound size={20} /> معلوماتك الأساسية</h2></div>
        <div className="form-grid">
          <Field label="الاسم الكامل"><input autoComplete="name" value={form.fullName} maxLength={80} placeholder="اسمك كما تحب أن يظهر في السيرة" onChange={e => change('fullName', e.target.value)} /></Field>
          <Field label="المسمى أو التخصص المهني"><input value={form.headline} maxLength={160} placeholder="مثال: طالب إدارة سلاسل الإمداد" onChange={e => change('headline', e.target.value)} /></Field>
          <Field label="البريد الإلكتروني"><input type="email" dir="ltr" autoComplete="email" inputMode="email" value={form.email} maxLength={254} placeholder="name@example.com" onChange={e => change('email', e.target.value)} /></Field>
          <Field label="رقم الجوال"><input type="tel" dir="ltr" autoComplete="tel" value={form.phone} maxLength={40} placeholder="+966…" onChange={e => change('phone', e.target.value)} /></Field>
          <Field label="المدينة"><input autoComplete="address-level2" value={form.city} maxLength={100} onChange={e => change('city', e.target.value)} /></Field>
          <Field label="رابط لينكدإن"><input type="url" dir="ltr" value={form.linkedin} maxLength={2000} placeholder="https://www.linkedin.com/in/…" onChange={e => change('linkedin', e.target.value)} /></Field>
          <div className="full-width"><Field label="موقعك أو معرض أعمالك"><input type="url" dir="ltr" value={form.website} maxLength={2000} placeholder="https://…" onChange={e => change('website', e.target.value)} /></Field></div>
          <div className="full-width"><Field label="نبذة عنك"><textarea value={form.summary} maxLength={4000} rows={4} placeholder="عرّف بنفسك، اهتماماتك وما تطمح لتعلّمه أو العمل فيه." onChange={e => change('summary', e.target.value)} /></Field></div>
        </div>
        <div className="card-heading"><h2><GraduationCap size={20} /> التعليم</h2></div>
        <div className="form-grid">
          <Field label="الجامعة أو جهة الدراسة"><input value={form.university} maxLength={150} onChange={e => change('university', e.target.value)} /></Field>
          <Field label="التخصص"><input value={form.major} maxLength={150} onChange={e => change('major', e.target.value)} /></Field>
          <Field label="سنة التخرج أو التخرج المتوقع"><input dir="ltr" inputMode="numeric" pattern="[0-9]{4}" title="سنة من أربعة أرقام، مثال 2027" value={form.graduationYear} maxLength={4} placeholder="2027" onChange={e => change('graduationYear', e.target.value)} /></Field>
          <div className="full-width"><Field label="تفاصيل التعليم والدورات"><textarea value={form.education} maxLength={6000} rows={4} placeholder="اذكر الدرجة أو الدبلوم والدورات التي درستها فعلاً." onChange={e => change('education', e.target.value)} /></Field></div>
        </div>
        <div className="card-heading"><h2><BriefcaseBusiness size={20} /> ما الذي تتقنه؟</h2></div>
        <div className="form-grid">
          <div className="full-width"><Field label="الخبرات والمشروعات والتطوع"><textarea value={form.experience} maxLength={6000} rows={5} placeholder="يمكنك ذكر مشروع جامعي، تدريب أو عمل تطوعي، ودورك وما أنجزته فيه." onChange={e => change('experience', e.target.value)} /></Field></div>
          <div className="full-width"><Field label="المهارات"><textarea aria-label="المهارات" value={skillsText} maxLength={2500} rows={3} placeholder="افصل بين المهارات بفاصلة، مثل: تنظيم الوقت، Excel، العمل الجماعي" onChange={e => { markDirty(); setSkillsText(e.target.value); setFormError(''); }} /><small>حتى ٣٠ مهارة. أضف ما تجيده الآن، ويمكنك تطوير القائمة مع تقدمك.</small></Field></div>
        </div>
        {formError && <p className="notice danger" role="alert">{formError}</p>}
        {storageError && <div className="notice danger" role="alert">{storageError}<br />نزّل سيرتك وصدّر نسخة احتياطية من الإعدادات قبل إغلاق التطبيق.</div>}
        <p className="profile-status" role="status">{dirty ? 'لديك تعديلات غير محفوظة، بما فيها الملفات التي اخترتها. اضغط حفظ الملف لتطبيقها.' : 'يمكنك تعديل بياناتك في أي وقت. لا يظهر في سيرتك إلا ما تضيفه بنفسك.'}</p>
        <div className="form-actions"><button className="btn btn-primary" type="submit" disabled={!!uploading}><Save size={18} /> حفظ الملف</button><button className="btn btn-secondary" type="button" disabled={!dirty || !!uploading} onClick={restore}>تجاهل التعديلات</button></div>
      </form>
      <aside className="stack">
        <section className="card profile-summary">
          <div className="profile-photo">{form.photo ? <img src={form.photo.dataUrl} alt="صورتك الشخصية" width="112" height="112" /> : <span className="profile-photo-placeholder"><UserRound size={44} aria-label="لم تُضف صورة بعد" /></span>}</div>
          <h2>{form.fullName || 'مساحتك الشخصية'}</h2>{form.headline && <p>{form.headline}</p>}
          <p className="profile-note">أضف صورة واضحة. نجهز نسخة مربعة ونزيل البيانات الوصفية من الصورة.</p>
          <input hidden ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" aria-label="اختيار صورة شخصية من الجهاز" onChange={e => { void upload(e.target.files?.[0], 'photo'); e.target.value = ''; }} />
          <input hidden ref={cameraInput} type="file" accept="image/jpeg,image/png,image/webp" capture="user" aria-label="التقاط صورة شخصية بالكاميرا" onChange={e => { void upload(e.target.files?.[0], 'photo'); e.target.value = ''; }} />
          <div className="profile-upload-actions"><button className="btn btn-secondary" type="button" disabled={!!uploading} onClick={() => photoInput.current?.click()}><ImagePlus size={17} /> اختيار صورة</button><button className="btn btn-secondary" type="button" disabled={!!uploading} onClick={() => cameraInput.current?.click()}><Camera size={17} /> الكاميرا</button>{form.photo && <button className="btn btn-ghost danger" type="button" disabled={!!uploading} onClick={() => change('photo', undefined)}><Trash2 size={17} /> إزالة الصورة</button>}</div>
          <p className="profile-note">JPEG أو PNG أو WebP حتى ٨ ميجابايت. في آيفون اختر «الأكثر توافقاً» أو صدّر الصورة JPEG إذا كانت HEIC.</p>
        </section>
        <section className="card profile-upload-card">
          <div className="card-heading"><h2><FileText size={20} /> ملف السيرة الأصلي</h2></div>
          <p className="muted">ارفع سيرتك بصيغة PDF لاستخدامها عند التقديم. هذا الملف مستقل عن السيرة التي ننشئها من حقولك.</p>
          <input hidden ref={cvInput} type="file" accept="application/pdf,.pdf" aria-label="رفع السيرة الذاتية PDF" onChange={e => { void upload(e.target.files?.[0], 'cv'); e.target.value = ''; }} />
          {form.cv ? <><div className="profile-attachment-meta"><FileText size={26} /><div><strong>{form.cv.name}</strong><span>PDF · {sizeLabel(form.cv.size)}</span></div><Check size={18} /></div><div className="profile-upload-actions"><button className="btn btn-secondary" type="button" onClick={() => downloadCv(form.cv!)}><Download size={17} /> تنزيل السيرة</button><button className="btn btn-secondary" type="button" onClick={() => void shareCv(form.cv!)}><Share2 size={17} /> مشاركة السيرة</button><button className="btn btn-ghost danger" type="button" disabled={!!uploading} onClick={() => change('cv', undefined)}><Trash2 size={17} /> إزالة الملف</button></div></> : <p className="profile-note">لم ترفع ملف سيرة بعد. يمكنك البدء بتعبئة حقولك ومعاينتها ثم حفظها PDF من الطباعة.</p>}
          <button className="btn btn-secondary" type="button" disabled={!!uploading} onClick={() => cvInput.current?.click()}><FileText size={17} />{form.cv ? ' استبدال ملف PDF' : ' رفع السيرة PDF'}</button><p className="profile-note">الحد الأقصى ٢ ميجابايت. لا يُفتح محتوى الملف داخل التطبيق.</p>
          {uploading && <p role="status">{uploading === 'photo' ? 'جارٍ تجهيز الصورة…' : 'جارٍ التحقق من السيرة…'}</p>}
          {uploadError && <p className="notice danger" role="alert">{uploadError}</p>}
        </section>
        <section className="card profile-upload-card"><h2>ملفك معك، خطوة بخطوة</h2><p className="muted">تُحفظ معلوماتك وملفاتك في هذا المتصفح. صدّر نسخة احتياطية لنقلها إلى آيفون أو أندرويد آخر، أو لحمايتها من مسح بيانات المتصفح.</p><div className="profile-upload-actions"><button className="btn btn-ghost" onClick={() => navigate('opportunities')}><BriefcaseBusiness size={17} /> الوظائف والدورات</button><button className="btn btn-secondary" onClick={() => navigate('settings')}><Download size={17} /> النسخ الاحتياطي</button></div></section>
      </aside>
    </div>
    {preview && <Modal title="معاينة سيرتك الذاتية" onClose={() => { setPreview(false); document.body.classList.remove('printing-cv'); }}>
      <div className="cv-preview-actions"><p className="muted">هذه المعاينة من بياناتك الحالية، وقد تتضمن تعديلات لم تحفظها بعد. اختر «حفظ PDF» من نافذة الطباعة.</p><div className="profile-upload-actions"><button className="btn btn-primary" onClick={printCv}><Printer size={17} /> طباعة / حفظ PDF</button><button className="btn btn-secondary" onClick={() => downloadFile('madar-cv.txt', '\ufeff' + cvText, 'text/plain;charset=utf-8')}><Download size={17} /> تنزيل نص السيرة</button></div></div>
      <CvPreview profile={previewProfile} />
    </Modal>}
  </div>;
}
