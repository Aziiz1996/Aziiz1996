import { useState, type FormEvent } from 'react';
import { BookOpenText, Check, Clipboard, Download, FileText, Pencil, Plus, Search, Sparkles, Trash2 } from 'lucide-react';
import { useApp } from './store';
import { CourseBadge, EmptyState, Field, Modal, SectionHeader } from './ui';
import { formatDate, summarizeText, todayISO } from './logic';
import type { Note } from './types';

function exportNote(note: Note) {
  const content = `${note.title}\n\n${note.summary ? `الملخص الأولي\n${note.summary}\n\n` : ''}نص المحاضرة\n${note.content}`;
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${note.title.replace(/[<>:"/\\|?*\x00-\x1F]/g, '').trim().slice(0, 80) || 'ملخص-محاضرة'}.txt`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copyText(text: string) {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* A local fallback also works when clipboard permission is unavailable. */ }
  const element = document.createElement('textarea');
  element.value = text;
  element.style.position = 'fixed';
  element.style.opacity = '0';
  element.setAttribute('aria-hidden', 'true');
  document.body.appendChild(element);
  element.select();
  let copied = false;
  try { copied = document.execCommand('copy'); } catch { copied = false; }
  element.remove();
  return copied;
}

function NoteForm({ note, onClose }: { note?: Note; onClose: () => void }) {
  const { data, update, notify } = useApp();
  const [title, setTitle] = useState(note?.title ?? '');
  const [courseId, setCourseId] = useState(note?.courseId ?? '');
  const [content, setContent] = useState(note?.content ?? '');
  const [summary, setSummary] = useState(note?.summary ?? '');
  const [error, setError] = useState('');
  const [generated, setGenerated] = useState(false);
  const [summaryOutdated, setSummaryOutdated] = useState(false);
  function generate() {
    if (!content.trim()) { setError('أضف نص المحاضرة أولاً لإنشاء ملخص.'); return; }
    setSummary(summarizeText(content));
    setError('');
    setGenerated(true);
    setSummaryOutdated(false);
    notify('تم إنشاء ملخص أولي، راجعه وأكمله بأسلوبك');
  }
  function save(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || !content.trim()) { setError('أدخل عنوان الملاحظة ونص المحاضرة.'); return; }
    update(draft => {
      const value: Note = { id: note?.id ?? crypto.randomUUID(), title: title.trim(), courseId, content: content.trim(), summary: summary.trim(), updatedAt: todayISO() };
      const index = draft.notes.findIndex(item => item.id === value.id);
      if (index >= 0) draft.notes[index] = value;
      else draft.notes.push(value);
    });
    notify(note ? 'تم حفظ تعديلات الملاحظة' : 'تمت إضافة الملاحظة');
    onClose();
  }
  return <Modal title={note ? 'تعديل الملاحظة' : 'إضافة ملاحظة محاضرة'} onClose={onClose}>
    <form className="stack note-form" onSubmit={save}>
      <div className="form-grid"><Field label="عنوان الملاحظة"><input className="input" value={title} onChange={event => setTitle(event.target.value)} placeholder="مثال: المحاضرة الثالثة — إدارة الوقت" maxLength={160} required autoFocus /></Field><Field label="المادة"><select className="input" value={courseId} onChange={event => setCourseId(event.target.value)}><option value="">بدون مادة</option>{data.courses.map(course => <option key={course.id} value={course.id}>{course.name}</option>)}</select></Field></div>
      <Field label="نص المحاضرة أو ملاحظاتك"><textarea className="input textarea lecture-textarea" rows={8} value={content} onChange={event => { setContent(event.target.value); if (summary) setSummaryOutdated(true); }} placeholder="اكتب ملاحظاتك أو الصق النص الذي تريد تلخيصه هنا…" required /><span className="field-hint">استخدم النص مباشرة. لا يتطلب التلخيص رفع ملفات أو الاتصال بخدمة خارجية.</span></Field>
      <div className="summary-toolbar"><button type="button" className="btn btn-secondary" onClick={generate} disabled={!content.trim()}><Sparkles size={17} />إنشاء ملخص أولي</button><span className="muted">استخراج جمل من النص، قابل للمراجعة</span></div>
      {summaryOutdated && <p className="notice notice-warning">تغيّر نص المحاضرة. أعد إنشاء الملخص أو راجعه قبل الحفظ.</p>}
      <Field label="الملخص الأولي (اختياري)"><textarea className="input textarea" rows={5} value={summary} onChange={event => setSummary(event.target.value)} placeholder="أنشئ ملخصاً من النص، أو اكتب ملخصك بنفسك." /><span className="field-hint">{generated ? 'الملخص جاهز للمراجعة. ' : ''}قد تُحذف تفاصيل مهمة؛ قارنه بالمحاضرة وأضف التعريفات والأمثلة المطلوبة.</span></Field>
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      <div className="form-actions"><button type="submit" className="btn btn-primary">حفظ الملاحظة</button><button className="btn btn-secondary" type="button" onClick={onClose}>إلغاء</button></div>
    </form>
  </Modal>;
}

export default function NotesPage() {
  const { data, update, notify } = useApp();
  const [query, setQuery] = useState('');
  const [courseId, setCourseId] = useState('all');
  const [editing, setEditing] = useState<Note | 'new' | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Note | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const viewing = data.notes.find(item => item.id === viewingId);
  const search = query.trim().toLocaleLowerCase();
  const notes = data.notes.filter(note => (courseId === 'all' || note.courseId === courseId) && `${note.title} ${note.content} ${note.summary}`.toLocaleLowerCase().includes(search)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  function remove() {
    if (!deleting) return;
    update(draft => { draft.notes = draft.notes.filter(item => item.id !== deleting.id); });
    if (viewingId === deleting.id) setViewingId(null);
    setDeleting(null);
    notify('تم حذف الملاحظة');
  }
  async function copy(note: Note) {
    const text = `${note.title}\n\n${note.summary || note.content}`;
    if (await copyText(text)) { setCopiedId(note.id); notify('تم النسخ'); setTimeout(() => setCopiedId(null), 2500); }
    else notify('تعذّر النسخ من المتصفح. يمكنك تصدير الملاحظة كملف نصي.');
  }
  function generateFor(note: Note) {
    update(draft => { const item = draft.notes.find(value => value.id === note.id); if (item) { item.summary = summarizeText(item.content); item.updatedAt = todayISO(); } });
    notify('تم إنشاء ملخص أولي، راجعه مع النص الأصلي');
  }
  return <div className="page-content">
    <SectionHeader eyebrow="معرفتك، مرتّبة" title="الملاحظات والملخصات" description="احتفظ بنصوص المحاضرات، واستخرج منها ملخصات أولية تراجعها بأسلوبك." action={<button className="btn btn-primary" onClick={() => setEditing('new')}><Plus size={18} />إضافة ملاحظة</button>} />
    {data.notes.length === 0 ? <EmptyState icon={BookOpenText} title="مساحة لأفكارك وملاحظاتك" description="أضف نص المحاضرة، ثم أنشئ ملخصاً أولياً من الجمل المهمة وراجعه قبل المذاكرة." action={<button className="btn btn-primary" onClick={() => setEditing('new')}><Plus size={18} />إضافة أول ملاحظة</button>} /> : <>
      <div className="filters notes-filters"><div className="search-field"><Search size={18} /><input className="input" value={query} onChange={event => setQuery(event.target.value)} placeholder="ابحث في الملاحظات والملخصات…" aria-label="البحث في الملاحظات" /></div><select className="input" value={courseId} onChange={event => setCourseId(event.target.value)} aria-label="تصفية الملاحظات حسب المادة"><option value="all">كل المواد</option><option value="">بدون مادة</option>{data.courses.map(course => <option key={course.id} value={course.id}>{course.name}</option>)}</select><span className="muted note-count">{notes.length} ملاحظات</span></div>
      {notes.length > 0 ? <div className="note-grid">{notes.map(note => <article className="card note-card" key={note.id}>
        <div className="card-heading"><span className="note-icon"><FileText size={22} /></span><CourseBadge id={note.courseId} /></div>
        <button className="note-title-button" onClick={() => setViewingId(note.id)}><h2>{note.title}</h2></button>
        {note.summary && <span className="badge summary-badge"><Sparkles size={12} />ملخص أولي</span>}
        <p className="note-preview">{(note.summary || note.content).slice(0, 210)}{(note.summary || note.content).length > 210 ? '…' : ''}</p>
        <div className="note-footer"><span className="muted">{formatDate(note.updatedAt.slice(0, 10), true)}</span><div className="row"><button className="icon-button" onClick={() => { setViewingId(null); setEditing(note); }} aria-label={`تعديل ${note.title}`}><Pencil size={16} /></button><button className="icon-button" onClick={() => exportNote(note)} aria-label={`تصدير ${note.title}`}><Download size={16} /></button><button className="icon-button danger" onClick={() => setDeleting(note)} aria-label={`حذف ${note.title}`}><Trash2 size={16} /></button></div></div>
        <button className="btn btn-ghost note-read-button" onClick={() => setViewingId(note.id)}>قراءة الملاحظة</button>
      </article>)}</div> : <EmptyState icon={Search} title="لا توجد ملاحظات مطابقة" description="جرّب كلمة بحث أخرى أو اختر كل المواد." action={<button className="btn btn-secondary" onClick={() => { setQuery(''); setCourseId('all'); }}>مسح التصفية</button>} />}
      <div className="summary-note"><Sparkles size={18} /><p>الملخصات الأولية تُستخرج محلياً من نصك. راجعها وأكملها بالمفاهيم والتفاصيل المهمة؛ لا تستبدل المحاضرة الأصلية.</p></div>
    </>}
    {editing && <NoteForm note={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    {viewing && <Modal title={viewing.title} onClose={() => setViewingId(null)}><div className="stack note-view">
      <div className="row"><CourseBadge id={viewing.courseId} /><span className="muted">آخر تعديل {formatDate(viewing.updatedAt.slice(0, 10), true)}</span></div>
      <div className="note-view-actions row"><button className="btn btn-secondary" onClick={() => { setViewingId(null); setEditing(viewing); }}><Pencil size={16} />تعديل</button><button className="btn btn-secondary" onClick={() => void copy(viewing)}>{copiedId === viewing.id ? <Check size={16} /> : <Clipboard size={16} />}نسخ {viewing.summary ? 'الملخص' : 'النص'}</button><button className="btn btn-secondary" onClick={() => exportNote(viewing)}><Download size={16} />تصدير نصي</button></div>
      {viewing.summary ? <section className="note-summary-section"><h3><Sparkles size={17} />الملخص الأولي</h3><p className="preserve-lines">{viewing.summary}</p><p className="field-hint">راجعه مع النص الأصلي قبل الاعتماد عليه.</p></section> : <div className="notice"><p>لم تضف ملخصاً لهذه الملاحظة بعد.</p><button className="btn btn-secondary" onClick={() => generateFor(viewing)}><Sparkles size={16} />إنشاء ملخص أولي</button></div>}
      <section className="note-original-section"><h3>النص الأصلي</h3><p className="preserve-lines">{viewing.content}</p></section>
    </div></Modal>}
    {deleting && <Modal title="حذف الملاحظة" onClose={() => setDeleting(null)}><div className="stack"><p>هل تريد حذف «{deleting.title}» ونصها وملخصها؟</p><div className="form-actions"><button className="btn btn-danger" onClick={remove}>حذف الملاحظة</button><button className="btn btn-secondary" onClick={() => setDeleting(null)}>إلغاء</button></div></div></Modal>}
  </div>;
}
