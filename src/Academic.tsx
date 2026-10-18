import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { AlertCircle, BookOpen, CalendarDays, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock3, GraduationCap, ListChecks, MapPin, Pencil, Play, Plus, Settings2, Sparkles, Trash2 } from 'lucide-react';
import NotesPage from './Notes';
import StudyCoach from './StudyCoach';
import SharedSchedule from './SharedSchedule';
import CourseFiles from './CourseFiles';
import CollegeCalendar from './CollegeSchedulePanel';
import { allocateStudySeconds, studyPhases } from './studyMethods';
import { useApp, validUniversityUrl } from './store';
import { CourseBadge, EmptyState, Field, Modal, SectionHeader } from './ui';
import { buildStudyPlan, daysUntil, formatDate, todayISO } from './logic';
import type { Course, Lecture, Priority, StudySession, Task, TaskKind } from './types';

const DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const COLORS = ['#7567dd', '#3a9387', '#d89943', '#d67591', '#588ec5', '#b37e58'];
const KIND_NAMES: Record<TaskKind, string> = { exam: 'اختبار', assignment: 'واجب', project: 'مشروع' };
const PRIORITY_NAMES: Record<Priority, string> = { low: 'منخفضة', medium: 'متوسطة', high: 'عالية' };

function durationText(minutes: number) {
  const rounded = Math.max(0, Math.round(minutes * 10) / 10);
  const hours = Math.floor(rounded / 60);
  const rest = Math.round((rounded % 60) * 10) / 10;
  return hours && rest ? `${hours} س و${rest} د` : hours ? `${hours} س` : `${rest} د`;
}

function overlaps(first: Lecture, second: Lecture) {
  if (!first.start || !first.end || !second.start || !second.end) return false;
  return first.day === second.day && first.start < second.end && first.end > second.start;
}

function lectureTimeText(lecture: Lecture) {
  if (!lecture.start) return lecture.timePending || 'وقت البداية يحتاج تأكيداً';
  return lecture.end ? `${lecture.start} — ${lecture.end}` : `${lecture.start} · ${lecture.timePending || 'النهاية غير محددة'}`;
}

function taskTimeText(task: Task) {
  if (!task.time) return task.timePending || '';
  return task.endTime ? `${task.time} — ${task.endTime}` : task.time;
}

function CourseForm({ course, onClose }: { course?: Course; onClose: () => void }) {
  const { update, notify } = useApp();
  const [name, setName] = useState(course?.name ?? '');
  const [color, setColor] = useState(course?.color ?? COLORS[0]);
  const [error, setError] = useState('');
  function save(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) { setError('أدخل اسم المادة.'); return; }
    update(draft => {
      const value: Course = { ...course, id: course?.id ?? crypto.randomUUID(), name: name.trim(), color };
      const index = draft.courses.findIndex(item => item.id === value.id);
      if (index >= 0) draft.courses[index] = value;
      else draft.courses.push(value);
    });
    notify(course ? 'تم تعديل المادة' : 'تمت إضافة المادة');
    onClose();
  }
  return <Modal title={course ? 'تعديل المادة' : 'إضافة مادة جديدة'} onClose={onClose}>
    <form onSubmit={save} className="stack">
      <Field label="اسم المادة"><input className="input" value={name} onChange={event => setName(event.target.value)} placeholder="مثال: مبادئ الإدارة" maxLength={100} required autoFocus /></Field>
      <fieldset className="color-field"><legend>لون المادة</legend><div className="row color-options">
        {COLORS.map(value => <button key={value} type="button" className={`color-swatch ${color === value ? 'selected' : ''}`} style={{ backgroundColor: value }} aria-label={`اختيار لون ${value}`} aria-pressed={color === value} onClick={() => setColor(value)}>{color === value && <Check size={16} />}</button>)}
      </div></fieldset>
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      <div className="form-actions"><button className="btn btn-primary" type="submit">{course ? 'حفظ التعديلات' : 'إضافة المادة'}</button><button type="button" className="btn btn-secondary" onClick={onClose}>إلغاء</button></div>
    </form>
  </Modal>;
}

function LectureForm({ lecture, initialCourse, onClose }: { lecture?: Lecture; initialCourse?: string; onClose: () => void }) {
  const { data, update, notify } = useApp();
  const [courseId, setCourseId] = useState(lecture?.courseId ?? (initialCourse || data.courses[0]?.id || ''));
  const [day, setDay] = useState(lecture?.day ?? 0);
  const [start, setStart] = useState(lecture?.start ?? '');
  const [end, setEnd] = useState(lecture?.end ?? '');
  const [location, setLocation] = useState(lecture?.location ?? '');
  const [attendanceUrl, setAttendanceUrl] = useState(lecture?.attendanceUrl ?? '');
  const [fileUrl, setFileUrl] = useState(lecture?.fileUrl ?? '');
  const [error, setError] = useState('');
  const conflicting = data.lectures.filter(item => item.id !== lecture?.id && overlaps({ id: '', courseId, day, start, end, location }, item));
  function save(event: FormEvent) {
    event.preventDefault();
    if (!courseId || !data.courses.some(item => item.id === courseId)) { setError('اختر مادة للمحاضرة.'); return; }
    if (!validUniversityUrl(attendanceUrl) || !validUniversityUrl(fileUrl)) { setError('استخدم روابط صحيحة تبدأ بـ https:// دون بيانات دخول داخل الرابط.'); return; }
    if (end && !start) { setError('أدخل وقت البداية قبل تحديد وقت النهاية.'); return; }
    if (start && end && end <= start) { setError('يجب أن يكون وقت نهاية المحاضرة بعد بدايتها.'); return; }
    update(draft => {
      const value: Lecture = { id: lecture?.id ?? crypto.randomUUID(), courseId, day, start, end, location: location.trim(), attendanceUrl: attendanceUrl.trim(), fileUrl: fileUrl.trim(), timePending: start && end ? undefined : start && !lecture?.start ? undefined : lecture?.timePending };
      const index = draft.lectures.findIndex(item => item.id === value.id);
      if (index >= 0) draft.lectures[index] = value;
      else draft.lectures.push(value);
    });
    notify(lecture ? 'تم تعديل المحاضرة' : 'تمت إضافة المحاضرة');
    onClose();
  }
  return <Modal title={lecture ? 'تعديل المحاضرة' : 'إضافة موعد محاضرة'} onClose={onClose}>
    <form className="stack" onSubmit={save}>
      <div className="form-grid">
        <Field label="المادة"><select className="input" value={courseId} onChange={event => setCourseId(event.target.value)} required>{data.courses.map(course => <option key={course.id} value={course.id}>{course.name}</option>)}</select></Field>
        <Field label="اليوم"><select className="input" value={day} onChange={event => setDay(Number(event.target.value))}>{DAYS.map((name, index) => <option key={name} value={index}>{name}</option>)}</select></Field>
        <Field label="وقت البداية (اختياري)"><input className="input" type="time" value={start} onChange={event => setStart(event.target.value)} /></Field>
        <Field label="وقت النهاية (اختياري)"><input className="input" type="time" value={end} onChange={event => setEnd(event.target.value)} /></Field>
      </div>
      {lecture?.timePending && (!start || !end) && <p className="notice notice-warning">{lecture.timePending}. أدخل الموعد الكامل بعد تأكيده.</p>}
      {(!start || !end) && <p className="field-hint">إذا لم تعرف البداية، لن تُجدول مذاكرة في هذا اليوم من الأسبوع. وإذا غابت النهاية، نترك بقية اليوم بعد البداية خالية حتى تؤكد الموعد.</p>}
      <Field label="المكان (اختياري)"><input className="input" value={location} onChange={event => setLocation(event.target.value)} placeholder="مثال: مبنى ٣، قاعة ٢٠١" maxLength={120} /></Field>
      <Field label="رابط حضور المحاضرة (اختياري)"><input type="url" className="input" dir="ltr" value={attendanceUrl} onChange={e => setAttendanceUrl(e.target.value.trim())} placeholder="https://…" /></Field>
      <Field label="رابط ملف المحاضرة (اختياري)"><input type="url" className="input" dir="ltr" value={fileUrl} onChange={e => setFileUrl(e.target.value.trim())} placeholder="https://…" /></Field>
      <p className="field-hint">أضف الروابط من مودل يدوياً. قد تتطلب تسجيل الدخول عند فتحها؛ الجلب التلقائي غير متصل.</p>
      {end > start && conflicting.length > 0 && <div className="notice notice-warning" role="status"><AlertCircle size={18} /><span>يتعارض هذا الموعد مع {conflicting.map(item => data.courses.find(course => course.id === item.courseId)?.name ?? 'محاضرة أخرى').join('، ')}. يمكنك حفظه إذا كان التعارض مقصوداً.</span></div>}
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      <div className="form-actions"><button type="submit" className="btn btn-primary">حفظ المحاضرة</button><button type="button" className="btn btn-secondary" onClick={onClose}>إلغاء</button></div>
    </form>
  </Modal>;
}

export function CoursesPage() {
  const { data, update, notify } = useApp();
  const [summaryCourse, setSummaryCourse] = useState<string | null>(null);
  const [courseForm, setCourseForm] = useState<Course | 'new' | null>(null);
  const [lectureForm, setLectureForm] = useState<Lecture | 'new' | null>(null);
  const [initialCourse, setInitialCourse] = useState('');
  const [deletingCourse, setDeletingCourse] = useState<Course | null>(null);
  const [deletingLecture, setDeletingLecture] = useState<Lecture | null>(null);
  const [activeDay, setActiveDay] = useState(new Date(`${todayISO()}T12:00:00`).getDay());
  const lectures = data.lectures.filter(item => item.day === activeDay).sort((a, b) => (a.start || '99:99').localeCompare(b.start || '99:99'));
  const conflictIds = new Set(data.lectures.filter(item => data.lectures.some(other => other.id !== item.id && overlaps(item, other))).map(item => item.id));
  function addLecture(courseId = '') { setInitialCourse(courseId); setLectureForm('new'); }
  function removeCourse() {
    if (!deletingCourse) return;
    const id = deletingCourse.id;
    update(draft => {
      draft.courses = draft.courses.filter(item => item.id !== id);
      draft.lectures = draft.lectures.filter(item => item.courseId !== id);
      draft.tasks.forEach(item => { if (item.courseId === id) item.courseId = ''; });
      draft.notes.forEach(item => { if (item.courseId === id) item.courseId = ''; });
    });
    setDeletingCourse(null);
    notify('حُذفت المادة ومواعيدها، وحُفظت المهام والملخصات');
  }
  function removeLecture() {
    if (!deletingLecture) return;
    update(draft => { draft.lectures = draft.lectures.filter(item => item.id !== deletingLecture.id); });
    setDeletingLecture(null);
    notify('تم حذف موعد المحاضرة');
  }
  return <div className="page-content">
    {summaryCourse && <Modal title="محاضرات وملخصات المادة" onClose={() => setSummaryCourse(null)}><NotesPage key={summaryCourse} initialCourseId={summaryCourse} /></Modal>}
    <SectionHeader eyebrow="كل مادة لها مكان" title="المواد والمحاضرات" description="اجمع موادك ومواعيدك، واستعد لأسبوع واضح." action={<button className="btn btn-primary" onClick={() => setCourseForm('new')}><Plus size={18} />إضافة مادة</button>} />
    <SharedSchedule />
    <CollegeCalendar />
    <CourseFiles />
    {data.courses.length === 0 ? <EmptyState icon={GraduationCap} title="ابدأ بمادتك الأولى" description="أضف المواد التي تدرسها هذا الفصل، ثم سجّل مواعيد المحاضرات." action={<button className="btn btn-primary" onClick={() => setCourseForm('new')}><Plus size={18} />إضافة مادة</button>} /> : <>
      <div className="course-grid">{data.courses.map(course => {
        const courseLectures = data.lectures.filter(item => item.courseId === course.id);
        const openTasks = data.tasks.filter(item => item.courseId === course.id && !item.completed).length;
        return <article key={course.id} className="card course-card" style={{ borderTopColor: course.color }}>
          <div className="card-heading"><span className="course-icon" style={{ color: course.color, backgroundColor: `${course.color}18` }}><BookOpen size={23} /></span><div className="row"><button className="icon-button" aria-label={`تعديل مادة ${course.name}`} onClick={() => setCourseForm(course)}><Pencil size={16} /></button><button className="icon-button danger" aria-label={`حذف مادة ${course.name}`} onClick={() => setDeletingCourse(course)}><Trash2 size={16} /></button></div></div>
          <h2>{course.name}</h2><p className="muted">{courseLectures.length} محاضرات أسبوعياً · {openTasks} مهام متبقية</p>
          <div className="course-lecture-list">{courseLectures.slice().sort((a, b) => a.day - b.day || (a.start || '99:99').localeCompare(b.start || '99:99')).map(lecture => <div key={lecture.id} className="course-lecture"><span>{DAYS[lecture.day]}</span><span dir="auto">{lectureTimeText(lecture)}</span></div>)}{courseLectures.length === 0 && <p className="muted">لم تضف مواعيد المحاضرات بعد.</p>}</div>
          <button className="btn btn-secondary" onClick={() => setSummaryCourse(course.id)}><BookOpen size={16} />محاضرات وملخصات المادة</button>
          {(course.resources?.length ?? 0) > 0 && <details className="stack"><summary>محاضرات وروابط الكلية ({course.resources!.length})</summary>{course.resources!.map(resource => <p key={resource.id}><a href={resource.url} target="_blank" rel="noopener noreferrer">{resource.title}</a><span className="muted"> · {resource.section}</span></p>)}</details>}
          <button className="btn btn-ghost" onClick={() => addLecture(course.id)}><Plus size={16} />إضافة محاضرة</button>
        </article>;
      })}</div>
      <section className="card lecture-calendar">
        <div className="card-heading"><div><h2>جدول المحاضرات</h2><p className="muted">مواعيدك الأسبوعية في مكان واحد.</p></div><button className="btn btn-secondary" onClick={() => addLecture()}><Plus size={16} />إضافة موعد</button></div>
        {conflictIds.size > 0 && <div className="notice notice-warning"><AlertCircle size={18} /><span>يوجد تعارض بين بعض المحاضرات. راجع المواعيد التي تحمل علامة «تعارض».</span></div>}
        {data.lectures.some(lecture => !lecture.start || !lecture.end) && <div className="notice notice-warning"><Clock3 size={18} /><span>بعض مواعيد المحاضرات أو نهاياتها تحتاج تأكيداً. عدّلها لنبني خطة مذاكرة أدق.</span></div>}
        <div className="segmented day-tabs" role="group" aria-label="أيام الأسبوع">{DAYS.map((name, index) => <button key={name} className={index === activeDay ? 'active' : ''} aria-pressed={index === activeDay} onClick={() => setActiveDay(index)}>{name}<span className="day-tab-count">{data.lectures.filter(item => item.day === index).length}</span></button>)}</div>
        {lectures.length ? <div className="lecture-list">{lectures.map(lecture => <article className="lecture-row" key={lecture.id}>
          <div className="lecture-time"><strong dir="ltr">{lecture.start || 'غير مؤكّد'}</strong><span dir="auto">{lecture.start ? lecture.end || 'النهاية غير محددة' : lecture.timePending || 'حدّد وقت البداية'}</span></div><div className="lecture-info"><CourseBadge id={lecture.courseId} />{lecture.attendanceUrl && <a href={lecture.attendanceUrl} target="_blank" rel="noopener noreferrer">حضور المحاضرة</a>}{lecture.fileUrl && <a href={lecture.fileUrl} target="_blank" rel="noopener noreferrer">فتح ملف المحاضرة</a>}{lecture.location && <span className="muted lecture-location"><MapPin size={14} />{lecture.location}</span>}{(!lecture.start || !lecture.end) && <span className="badge badge-warning">يحتاج تأكيداً</span>}{conflictIds.has(lecture.id) && <span className="badge badge-warning">تعارض</span>}</div>
          <div className="row"><button className="icon-button" aria-label={`تعديل محاضرة ${data.courses.find(item => item.id === lecture.courseId)?.name ?? ''} يوم ${DAYS[lecture.day]}`} onClick={() => setLectureForm(lecture)}><Pencil size={17} /></button><button className="icon-button danger" aria-label="حذف موعد المحاضرة" onClick={() => setDeletingLecture(lecture)}><Trash2 size={17} /></button></div>
        </article>)}</div> : <div className="day-empty"><CalendarDays size={25} /><p>لا توجد محاضرات يوم {DAYS[activeDay]}.</p></div>}
      </section>
    </>}
    {courseForm && <CourseForm course={courseForm === 'new' ? undefined : courseForm} onClose={() => setCourseForm(null)} />}
    {lectureForm && <LectureForm lecture={lectureForm === 'new' ? undefined : lectureForm} initialCourse={initialCourse} onClose={() => setLectureForm(null)} />}
    {deletingCourse && <Modal title={`حذف مادة ${deletingCourse.name}`} onClose={() => setDeletingCourse(null)}><div className="stack"><p>ستُحذف المادة ومواعيد محاضراتها. ستبقى المهام والملخصات محفوظة دون ربط بمادة، ويمكنك إعادة ربطها لاحقاً.</p><div className="form-actions"><button className="btn btn-danger" onClick={removeCourse}>حذف المادة</button><button className="btn btn-secondary" onClick={() => setDeletingCourse(null)}>إلغاء</button></div></div></Modal>}
    {deletingLecture && <Modal title="حذف موعد المحاضرة" onClose={() => setDeletingLecture(null)}><div className="stack"><p>هل تريد حذف موعد يوم {DAYS[deletingLecture.day]} ({lectureTimeText(deletingLecture)})؟</p><div className="form-actions"><button className="btn btn-danger" onClick={removeLecture}>حذف الموعد</button><button className="btn btn-secondary" onClick={() => setDeletingLecture(null)}>إلغاء</button></div></div></Modal>}
  </div>;
}

function TaskForm({ task, initialKind, initialDate, onClose }: { task?: Task; initialKind?: TaskKind; initialDate?: string; onClose: () => void }) {
  const { data, update, notify } = useApp();
  const [title, setTitle] = useState(task?.title ?? '');
  const [kind, setKind] = useState<TaskKind>(task?.kind ?? initialKind ?? 'assignment');
  const [courseId, setCourseId] = useState(task?.courseId ?? '');
  const [due, setDue] = useState(task?.due ?? initialDate ?? todayISO());
  const [time, setTime] = useState(task?.time ?? '');
  const [endTime, setEndTime] = useState(task?.endTime ?? '');
  const [priority, setPriority] = useState<Priority>(task?.priority ?? 'medium');
  const [minutes, setMinutes] = useState(task?.minutes ?? 60);
  const [error, setError] = useState('');
  function save(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) { setError('أدخل عنوان المهمة.'); return; }
    if (!due) { setError('اختر موعد المهمة.'); return; }
    if (endTime && !time) { setError('أدخل وقت البداية قبل تحديد وقت النهاية.'); return; }
    if (time && endTime && endTime <= time) { setError('يجب أن يكون وقت النهاية بعد وقت البداية.'); return; }
    if (!Number.isFinite(minutes) || minutes < 0 || minutes > 100000) { setError('أدخل مدة متوقعة بين صفر و١٠٠٬٠٠٠ دقيقة.'); return; }
    update(draft => {
      const value: Task = { id: task?.id ?? crypto.randomUUID(), title: title.trim(), kind, courseId, due, priority, minutes, completed: task?.completed ?? false, time: time || undefined, endTime: endTime || undefined, timePending: time ? undefined : task?.timePending };
      const index = draft.tasks.findIndex(item => item.id === value.id);
      if (index >= 0) draft.tasks[index] = value;
      else draft.tasks.push(value);
    });
    notify(task ? 'تم تعديل المهمة وتحديث خطة المذاكرة' : 'تمت إضافة المهمة إلى خطة المذاكرة');
    onClose();
  }
  return <Modal title={task ? 'تعديل المهمة' : 'إضافة مهمة دراسية'} onClose={onClose}>
    <form className="stack" onSubmit={save}>
      <Field label="العنوان"><input className="input" value={title} onChange={event => setTitle(event.target.value)} required maxLength={160} placeholder="مثال: مراجعة الفصل الثالث" autoFocus /></Field>
      <div className="form-grid">
        <Field label="النوع"><select className="input" value={kind} onChange={event => setKind(event.target.value as TaskKind)}><option value="assignment">واجب</option><option value="project">مشروع</option><option value="exam">اختبار</option></select></Field>
        <Field label="المادة"><select className="input" value={courseId} onChange={event => setCourseId(event.target.value)}><option value="">بدون مادة</option>{data.courses.map(course => <option key={course.id} value={course.id}>{course.name}</option>)}</select></Field>
        <Field label={kind === 'exam' ? 'تاريخ الاختبار' : 'موعد التسليم'}><input className="input" type="date" value={due} onChange={event => setDue(event.target.value)} required /></Field>
        <Field label="الأولوية"><select className="input" value={priority} onChange={event => setPriority(event.target.value as Priority)}><option value="low">منخفضة</option><option value="medium">متوسطة</option><option value="high">عالية</option></select></Field>
        <Field label={kind === 'exam' ? 'وقت بداية الاختبار (اختياري)' : 'وقت التسليم (اختياري)'}><input className="input" type="time" value={time} onChange={event => setTime(event.target.value)} /></Field>
        <Field label="وقت النهاية (اختياري)"><input className="input" type="time" value={endTime} onChange={event => setEndTime(event.target.value)} /></Field>
      </div>
      {task?.timePending && !time && <p className="notice notice-warning">الوقت الوارد: {task.timePending}. حدّد الوقت بعد تأكيد الفترة صباحاً أو مساءً.</p>}
      {kind === 'exam' && (!time || !endTime) && <p className="field-hint">لن نفترض وقتاً للاختبار: دون بداية مؤكدة تُخطط المذاكرة قبل يومه، ودون نهاية نترك بقية يومه بعد البداية خالية.</p>}
      <Field label="الوقت المتبقي للمذاكرة أو الإنجاز (بالدقائق)"><input className="input" type="number" min="0" max="100000" step="1" value={minutes} onChange={event => setMinutes(Number(event.target.value))} required /><span className="field-hint">توزّع الخطة هذا الوقت على أيامك المتاحة. عدّله كلما تقدمت.</span></Field>
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      <div className="form-actions"><button type="submit" className="btn btn-primary">{task ? 'حفظ التعديلات' : 'إضافة المهمة'}</button><button type="button" className="btn btn-secondary" onClick={onClose}>إلغاء</button></div>
    </form>
  </Modal>;
}

export function TasksPage({ initialKind = 'all' }: { initialKind?: TaskKind | 'all' }) {
  const { data, update, notify, navigate } = useApp();
  const [kind, setKind] = useState<TaskKind | 'all'>(initialKind);
  const [status, setStatus] = useState('active');
  const [courseId, setCourseId] = useState('all');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Task | 'new' | null>(null);
  const [initialDate, setInitialDate] = useState('');
  const [calendarMonth, setCalendarMonth] = useState(() => todayISO().slice(0, 7));
  const [deleting, setDeleting] = useState<Task | null>(null);
  const rank = { high: 0, medium: 1, low: 2 };
  const tasks = data.tasks.filter(task => (kind === 'all' || task.kind === kind) && (status === 'all' || (status === 'completed' ? task.completed : !task.completed)) && (courseId === 'all' || task.courseId === courseId) && task.title.toLocaleLowerCase().includes(query.toLocaleLowerCase().trim())).sort((a, b) => Number(a.completed) - Number(b.completed) || a.due.localeCompare(b.due) || rank[a.priority] - rank[b.priority]);
  const open = data.tasks.filter(task => !task.completed);
  const [year, month] = calendarMonth.split('-').map(Number);
  const firstDay = new Date(year, month - 1, 1, 12);
  const monthTitle = new Intl.DateTimeFormat('ar-SA-u-ca-gregory', { month: 'long', year: 'numeric' }).format(firstDay);
  const dayCount = new Date(year, month, 0).getDate();
  const firstWeekday = firstDay.getDay();
  const calendarCells = Math.ceil((firstWeekday + dayCount) / 7) * 7;
  const today = todayISO();
  function moveMonth(direction: number) {
    const date = new Date(year, month - 1 + direction, 1, 12);
    setCalendarMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
  }
  function addTask(date = '') { setInitialDate(date); setEditing('new'); }
  function toggle(task: Task) {
    update(draft => { const found = draft.tasks.find(item => item.id === task.id); if (found) found.completed = !found.completed; });
    notify(task.completed ? 'أُعيدت المهمة إلى قائمة المهام' : 'تم إنجاز المهمة، أحسنت!');
  }
  function remove() {
    if (!deleting) return;
    update(draft => { draft.tasks = draft.tasks.filter(task => task.id !== deleting.id); });
    setDeleting(null);
    notify('تم حذف المهمة');
  }
  return <div className="page-content">
    <SectionHeader eyebrow="خطوة صغيرة، إنجاز كبير" title="المهام والاختبارات" description="مواعيد التسليم والاختبارات والمشروعات، دون أن يفوتك شيء." action={<button className="btn btn-primary" onClick={() => addTask()}><Plus size={18} />إضافة مهمة</button>} />
    <div className="task-stats"><div className="mini-stat"><span className="mini-stat-icon"><ListChecks size={20} /></span><div><strong>{open.length}</strong><span>مهام متبقية</span></div></div><div className="mini-stat"><span className="mini-stat-icon amber"><GraduationCap size={20} /></span><div><strong>{open.filter(task => task.kind === 'exam').length}</strong><span>اختبارات قادمة</span></div></div><div className="mini-stat"><span className="mini-stat-icon green"><CheckCircle2 size={20} /></span><div><strong>{data.tasks.filter(task => task.completed).length}</strong><span>مهام منجزة</span></div></div></div>
    <section className="card tasks-card">
      <div className="filters task-filters"><div className="segmented" role="group" aria-label="نوع المهمة">{(['all', 'assignment', 'exam', 'project'] as const).map(value => <button key={value} className={kind === value ? 'active' : ''} aria-pressed={kind === value} onClick={() => setKind(value)}>{value === 'all' ? 'الكل' : KIND_NAMES[value]}</button>)}</div><button className="btn btn-ghost" onClick={() => navigate('plan')}><CalendarDays size={17} />خطة المذاكرة</button></div>
      <div className="filters filter-fields"><input className="input search-input" aria-label="البحث في المهام" value={query} onChange={event => setQuery(event.target.value)} placeholder="ابحث عن مهمة…" /><select className="input" aria-label="حالة المهام" value={status} onChange={event => setStatus(event.target.value)}><option value="active">غير المنجزة</option><option value="completed">المنجزة</option><option value="all">كل الحالات</option></select><select className="input" aria-label="تصفية حسب المادة" value={courseId} onChange={event => setCourseId(event.target.value)}><option value="all">كل المواد</option><option value="">بدون مادة</option>{data.courses.map(course => <option value={course.id} key={course.id}>{course.name}</option>)}</select></div>
      <section className="month-calendar" aria-labelledby="calendar-month-title">
        <div className="calendar-toolbar"><div><h2 id="calendar-month-title">{monthTitle}</h2><p className="muted">مواعيدك على التقويم الميلادي. التصفية أعلاه تطبّق على التقويم والقائمة.</p></div><div className="calendar-navigation row"><button className="icon-button" aria-label="عرض الشهر السابق" onClick={() => moveMonth(-1)}><ChevronRight size={19} /></button><button className="btn btn-ghost" onClick={() => setCalendarMonth(today.slice(0, 7))}>هذا الشهر</button><button className="icon-button" aria-label="عرض الشهر التالي" onClick={() => moveMonth(1)}><ChevronLeft size={19} /></button></div></div>
        <div className="calendar-scroll"><div className="calendar-grid">
          {DAYS.map(day => <div key={day} className="calendar-weekday">{day}</div>)}
          {Array.from({ length: calendarCells }, (_, index) => {
            const day = index - firstWeekday + 1;
            if (day < 1 || day > dayCount) return <div className="calendar-cell calendar-blank" key={`blank-${index}`} aria-hidden="true" />;
            const date = `${calendarMonth}-${String(day).padStart(2, '0')}`;
            const dayTasks = tasks.filter(task => task.due === date);
            return <div key={date} className={`calendar-cell ${date === today ? 'calendar-today' : ''} ${dayTasks.length ? 'calendar-has-events' : ''}`}><button className="calendar-day-number" aria-label={`إضافة مهمة يوم ${formatDate(date)}`} onClick={() => addTask(date)}>{new Intl.NumberFormat('ar-SA').format(day)}{date === today && <span className="sr-only">، اليوم</span>}</button><div className="calendar-events">{dayTasks.map(task => <button key={task.id} className={`calendar-event kind-${task.kind} ${task.completed ? 'completed' : ''}`} onClick={() => setEditing(task)} aria-label={`${KIND_NAMES[task.kind]}: ${task.title}، ${formatDate(task.due)}${taskTimeText(task) ? `، ${taskTimeText(task)}` : ''}`}><span className="calendar-event-kind">{KIND_NAMES[task.kind]}{task.completed ? ' ✓' : ''}</span><strong>{task.title}</strong>{task.courseId && <span className="calendar-event-course">{data.courses.find(course => course.id === task.courseId)?.name}</span>}{taskTimeText(task) && <span className="calendar-event-time" dir="auto">{taskTimeText(task)}</span>}</button>)}</div></div>;
          })}
        </div></div>
        <p className="field-hint calendar-hint">اضغط على رقم اليوم لإضافة موعد، أو على المهمة لتعديلها.</p>
      </section>
      <div className="card-heading task-list-heading"><h2>قائمة المهام</h2><span className="muted">{tasks.length} مهام مطابقة</span></div>
      {data.tasks.length === 0 ? <EmptyState icon={ListChecks} title="كل إنجاز يبدأ بخطوة" description="أضف أول واجب أو اختبار مع موعده ومدة الاستعداد له. نبني لك خطة مذاكرة تلقائياً." action={<button className="btn btn-primary" onClick={() => addTask()}><Plus size={18} />إضافة أول مهمة</button>} /> : <>
      {tasks.length ? <div className="task-list">{tasks.map(task => {
        const remaining = daysUntil(task.due);
        return <article className={`task-item ${task.completed ? 'completed' : ''}`} key={task.id}>
          <button className={`task-check ${task.completed ? 'checked' : ''}`} aria-label={task.completed ? `إعادة فتح ${task.title}` : `إكمال ${task.title}`} aria-pressed={task.completed} onClick={() => toggle(task)}>{task.completed && <Check size={17} />}</button>
          <div className="task-body"><div className="task-title-row"><h3>{task.title}</h3><span className={`badge kind-${task.kind}`}>{KIND_NAMES[task.kind]}</span></div><div className="task-meta"><CourseBadge id={task.courseId} /><span><CalendarDays size={14} />{formatDate(task.due, true)}</span>{taskTimeText(task) && <span className={task.timePending && !task.time ? 'pending-time' : ''}><Clock3 size={14} /><span dir="auto">{taskTimeText(task)}</span></span>}<span><Clock3 size={14} />{durationText(task.minutes)} للمذاكرة</span><span className={`priority priority-${task.priority}`}>أولوية {PRIORITY_NAMES[task.priority]}</span>{!task.completed && remaining < 0 && <span className="badge badge-danger">متأخرة</span>}{!task.completed && remaining === 0 && <span className="badge badge-warning">اليوم</span>}{!task.completed && remaining === 1 && <span className="badge badge-warning">غداً</span>}</div></div>
          <div className="task-actions row"><button className="icon-button" aria-label={`تعديل ${task.title}`} onClick={() => setEditing(task)}><Pencil size={17} /></button><button className="icon-button danger" aria-label={`حذف ${task.title}`} onClick={() => setDeleting(task)}><Trash2 size={17} /></button></div>
        </article>;
      })}</div> : <div className="day-empty"><ListChecks size={28} /><p>لا توجد مهام تطابق هذه التصفية.</p><button className="btn btn-ghost" onClick={() => { setKind('all'); setStatus('all'); setCourseId('all'); setQuery(''); }}>عرض كل المهام</button></div>}
      </>}
    </section>
    {editing && <TaskForm task={editing === 'new' ? undefined : editing} initialKind={kind === 'all' ? undefined : kind} initialDate={initialDate} onClose={() => setEditing(null)} />}
    {deleting && <Modal title="حذف المهمة" onClose={() => setDeleting(null)}><div className="stack"><p>سيُحذف «{deleting.title}» وتُحدّث خطة المذاكرة تلقائياً.</p><div className="form-actions"><button className="btn btn-danger" onClick={remove}>حذف المهمة</button><button className="btn btn-secondary" onClick={() => setDeleting(null)}>إلغاء</button></div></div></Modal>}
  </div>;
}

function StudyReviewPanel() {
  const { data, update, notify } = useApp();
  const today = todayISO();
  const logs = data.studyLog ?? [];
  const reviews = logs.flatMap(log => log.reviewDates.filter(date => !log.reviewedDates.includes(date)).map(date => ({ log, date }))).sort((a, b) => a.date.localeCompare(b.date));
  const due = reviews.filter(review => review.date <= today).length;
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? reviews : reviews.slice(0, 6);
  function markReviewed(id: string, date: string) {
    update(draft => {
      const log = draft.studyLog?.find(item => item.id === id);
      if (log && date <= today && log.reviewDates.includes(date) && !log.reviewedDates.includes(date)) log.reviewedDates.push(date);
    });
    notify('سُجّلت مراجعتك. جرّب سؤالاً جديداً لتتأكد من فهمك');
  }
  return <section className="card study-reviews">
    <div className="card-heading"><div><span className="eyebrow">حتى تبقى المعلومة</span><h2>مراجعاتك وسجل تعلمك</h2><p className="muted">المراجعة تبدأ باسترجاع الفكرة دون النظر، ثم تصحيح ما فاتك.</p></div>{due > 0 && <span className="badge badge-warning">{due} مراجعات مستحقة</span>}</div>
    {reviews.length ? <><div className="study-review-list">{visible.map(({ log, date }) => <article className="study-review-row" key={`${log.id}-${date}`}><div><strong>{log.title}</strong><p className="muted">{formatDate(date, true)} · {date < today ? 'فات موعدها؛ راجعها اليوم' : date === today ? 'موعدها اليوم' : 'مراجعة قادمة'}</p>{log.reflection && <p className="muted">نقطة الجلسة: {log.reflection}</p>}<p className="field-hint">اشرح أهم فكرة من الذاكرة، ثم أجب عن سؤال وصحح إجابتك.</p></div><button type="button" className="btn btn-secondary" disabled={date > today} onClick={() => markReviewed(log.id, date)} aria-label={`راجعت ${log.title} · ${date}`}><Check size={16} />{date > today ? 'في موعدها' : 'راجعت الآن'}</button></article>)}</div>{reviews.length > 6 && <button className="btn btn-ghost" onClick={() => setShowAll(!showAll)}>{showAll ? 'عرض أقل' : `عرض كل المراجعات (${reviews.length})`}</button>}</> : <p className="muted">{logs.length ? 'لا توجد مراجعات معلقة. تظهر مواعيد جديدة بعد حفظ جلسة ذات وقت فعلي.' : 'ابدأ جلسة من جدولك واحفظ وقتك الفعلي؛ سنرتب مراجعاتك حسب تقييم فهمك.'}</p>}
    <details className="study-history"><summary>سجل الجلسات · {logs.length} جلسات · {Math.round(logs.reduce((sum, log) => sum + log.minutes, 0) * 10) / 10} دقيقة فعلية</summary>{logs.length ? <div className="study-review-list">{logs.slice(0, 20).map(log => <article className="study-review-row" key={log.id}><div><strong>{log.title}</strong><p className="muted">{formatDate(log.date, true)} · {log.minutes} دقيقة فعلية · فهم {log.score} / ٥</p>{log.reflection && <p className="muted">{log.reflection}</p>}<span className="field-hint">مراجعات منجزة: {log.reviewedDates.length} من {log.reviewDates.length}</span></div><CheckCircle2 size={18} /></article>)}</div> : <p className="muted">سجلك فارغ الآن؛ كل خطوة فعلية ستظهر هنا.</p>}{logs.length > 20 && <p className="field-hint">تظهر أحدث ٢٠ جلسة. جميع الجلسات محفوظة ضمن النسخة الاحتياطية.</p>}</details>
  </section>;
}

export function PlanPage() {
  const { data, update, navigate } = useApp();
  const [coachOpen, setCoachOpen] = useState(false);
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => { const timer = setInterval(() => setClock(new Date()), 60000); return () => clearInterval(timer); }, []);
  const plan = useMemo(() => buildStudyPlan(data), [data, clock]);
  const [range, setRange] = useState<'week' | 'all'>('week');
  const today = todayISO();
  const available = data.settings.studyDays.length > 0 && data.settings.dailyMinutes > 0;
  const openTasks = data.tasks.filter(task => !task.completed);
  const sessions = plan.sessions.filter(session => range === 'all' || daysUntil(session.date, today) < 7);
  const groups = new Map<string, typeof sessions>();
  sessions.forEach(session => { groups.set(session.date, [...(groups.get(session.date) ?? []), session]); });
  const plannedMinutes = sessions.reduce((sum, session) => sum + session.minutes, 0);
  const upcoming = openTasks.slice().sort((a, b) => a.due.localeCompare(b.due)).slice(0, 5);
  const uncertainLectures = data.lectures.some(lecture => !lecture.start || !lecture.end);
  const uncertainExams = data.tasks.some(task => !task.completed && task.kind === 'exam' && (!task.time || !task.endTime));
  function startSession(session: StudySession) {
    const id = crypto.randomUUID();
    const timestamp = Date.now();
    update(draft => {
      if (draft.activeStudy) return;
      const task = draft.tasks.find(item => item.id === session.taskId);
      if (!task || task.completed || task.minutes <= 0) return;
      const plannedMinutes = Math.min(session.minutes, task.minutes);
      const stepRemaining = allocateStudySeconds(plannedMinutes, task.kind);
      draft.activeStudy = { id, taskId: task.id, title: task.title, date: todayISO(), plannedMinutes, kind: task.kind, step: 0, remainingSeconds: stepRemaining[0], stepRemaining, runningSince: timestamp, elapsedSeconds: 0, reflection: '' };
    });
    setCoachOpen(true);
  }
  return <div className="page-content">
    <SectionHeader eyebrow="خطوة اليوم تصنع غداً أجمل" title="الخطة الدراسية" description="خطة تتجدد تلقائياً للـ٢٨ يوماً القادمة، حسب مهامك ومواعيدك ووقتك المتاح. افتح أي جلسة لتجد وقت كل خطوة وطريقة تنفيذها." action={<button className="btn btn-secondary" onClick={() => navigate('settings')}><Settings2 size={17} />تخصيص وقتي</button>} />
    {data.activeStudy && <section className="card study-resume"><div><span className="eyebrow">نكمل من حيث توقفت</span><h2>{data.activeStudy.title}</h2><p className="muted">الخطوة {data.activeStudy.step + 1} من ٥ · تقدمك محفوظ؛ نكمل من آخر خطوة.</p></div><button className="btn btn-primary" onClick={() => setCoachOpen(true)}><Play size={17} />استكمال جلستي</button></section>}
    <section className="card study-methods"><div className="card-heading"><div><span className="eyebrow"><Sparkles size={15} /> مرشدك خطوة بخطوة</span><h2>تعلّم كيف تتعلم، ثم كرّر ما ينفعك.</h2><p className="muted">نقدّم الأقرب موعداً، ونحترم محاضراتك واستراحاتك. داخل كل جلسة يتوزع الوقت حسب مدتها ونوع المهمة.</p></div></div><ol className="coach-steps">{studyPhases(45).map((phase, index) => <li className="coach-step" key={phase.id}><span>{index + 1}</span><strong>{phase.title}</strong><small>{['هدف صغير قابل للقياس', 'شرح بكلماتك مع مثال', 'أسئلة والمصدر مغلق', 'محاولة ثم تصحيح', 'وقت فعلي ومراجعة قادمة'][index]}</small></li>)}</ol><p className="field-hint">ابدأ بزر «ابدأ معي» بجانب جلستك. يمكنك التوقف والعودة، والوقت المحفوظ هو ما درسته فعلاً. خذ ٥–١٠ دقائق استراحة بين جلسات التركيز.</p></section>
    {!available && <div className="notice notice-warning"><AlertCircle size={21} /><div><strong>حدّد وقت المذاكرة أولاً</strong><p>اختر أيامك المتاحة وعدد الدقائق اليومي لنبني خطة تناسب أسبوعك.</p></div><button className="btn btn-secondary" onClick={() => navigate('settings')}>تحديد الوقت</button></div>}
    {(uncertainLectures || uncertainExams) && <div className="notice notice-warning"><Clock3 size={21} /><div><strong>نحتاج تأكيد بعض المواعيد لتوزيع وقتك بدقة</strong>{uncertainLectures && <p>المحاضرة دون بداية مؤكدة تمنع جلسات المذاكرة في يومها الأسبوعي، ودون نهاية مؤكدة تمنع الجلسات بعد بدايتها حتى نهاية اليوم.</p>}{uncertainExams && <p>الاختبار دون بداية مؤكدة يُحضّر له قبل يومه. وإذا تأكدت البداية دون النهاية، نترك بقية يوم الاختبار بعد البداية خالية.</p>}</div><button className="btn btn-secondary" onClick={() => navigate(uncertainLectures ? 'courses' : 'tasks')}>تأكيد المواعيد</button></div>}
    {available && plan.unscheduledMinutes > 0 && <div className="notice notice-warning"><AlertCircle size={21} /><div><strong>لديك وقت لم يُجدول بعد</strong><p>تبقّى {durationText(plan.unscheduledMinutes)} خارج الخطة الحالية. قد تكون المهام متأخرة، أو وقتك غير كافٍ، أو المواعيد أبعد من ٢٨ يوماً. راجع المواعيد والمدة المتبقية ووقتك المتاح.</p></div><button className="btn btn-secondary" onClick={() => navigate('settings')}>تعديل وقتي</button></div>}
    {openTasks.length === 0 ? <EmptyState icon={CalendarDays} title="أسبوعك ينتظر خطته" description="أضف واجباتك ومشروعاتك واختباراتك والوقت الذي تحتاجه لكل منها، وسنوزعها على أيام المذاكرة." action={<button className="btn btn-primary" onClick={() => navigate('tasks')}><Plus size={18} />إضافة مهامي</button>} /> : <>
      <div className="plan-toolbar"><div className="segmented" role="group" aria-label="فترة خطة المذاكرة"><button className={range === 'week' ? 'active' : ''} onClick={() => setRange('week')} aria-pressed={range === 'week'}>الأيام السبعة القادمة</button><button className={range === 'all' ? 'active' : ''} onClick={() => setRange('all')} aria-pressed={range === 'all'}>الخطة حتى ٢٨ يوماً</button></div><p className="muted">{sessions.length} جلسات · {durationText(plannedMinutes)} مذاكرة</p></div>
      <div className="plan-layout"><section className="study-days" aria-label="جلسات المذاكرة">
        {groups.size > 0 ? Array.from(groups.entries()).sort(([first], [second]) => first.localeCompare(second)).map(([date, daySessions]) => <article className="study-day card" key={date}>
          <div className="card-heading study-day-heading"><div><h2>{date === today ? 'اليوم' : DAYS[new Date(`${date}T12:00:00`).getDay()]}</h2><span className="muted">{formatDate(date, true)}</span></div><span className="chip"><Clock3 size={14} />{durationText(daySessions.reduce((sum, session) => sum + session.minutes, 0))}</span></div>
          <div className="sessions">{daySessions.map(session => <div className="session" key={session.id}>
            <div className="session-time" dir="ltr"><strong>{session.start}</strong><span>{session.end}</span></div><div className="session-body"><span className={`badge kind-${session.kind}`}>{KIND_NAMES[session.kind]}</span><h3>{session.title}</h3><div className="row"><CourseBadge id={session.courseId} /><span className="muted">{durationText(session.minutes)}</span></div></div>
            <button className="btn btn-secondary session-start" onClick={() => startSession(session)} disabled={Boolean(data.activeStudy)} aria-label={`ابدأ معي: ${session.title} · ${session.date} ${session.start}`}><Play size={15} />ابدأ معي</button>
          </div>)}</div>
        </article>) : <div className="card"><EmptyState icon={Clock3} title={available ? 'لا توجد جلسات في هذه الفترة' : 'لنجهّز وقتك المتاح'} description={available ? 'قد تكون المهام خارج الأيام السبعة أو لا يتوفر وقت قبل مواعيدها. اعرض كامل الخطة وراجع وقتك المتاح.' : 'أضف أيام المذاكرة والمدة اليومية من الإعدادات.'} action={<button className="btn btn-secondary" onClick={() => available ? setRange('all') : navigate('settings')}>{available ? 'عرض كامل الخطة' : 'فتح الإعدادات'}</button>} /></div>}
      </section><aside className="plan-sidebar stack">
        <section className="card"><h2>المواعيد الأقرب</h2><div className="deadline-list">{upcoming.map(task => <button key={task.id} className="deadline-item" onClick={() => navigate('tasks')}><span className={`deadline-dot kind-${task.kind}`} /><div><strong>{task.title}</strong><span className="muted">{KIND_NAMES[task.kind]} · {formatDate(task.due, true)}</span>{plan.remaining[task.id] > 0 && <span className="unscheduled-label">{durationText(plan.remaining[task.id])} لم تُجدول</span>}</div></button>)}</div></section>
        <section className="card study-tip"><span className="eyebrow">مذاكرة أذكى</span><h2>افهم، جرّب، ثم صحّح.</h2><p className="muted">حدد فكرة واحدة عندما يكون وقتك قصيراً. اشرحها دون النظر ثم حل سؤالاً. بعد الجلسة يُخصم الوقت الفعلي الذي تؤكده من وقت التحضير المتبقي؛ إنجاز المذاكرة لا يغيّر حالة الاختبار أو تسليم الواجب.</p><button className="btn btn-ghost" onClick={() => navigate('notes')}>افتح ملخصاتي</button></section>
        <p className="plan-disclaimer muted">هذه خطة تقديرية. راجعها مع جدولك الفعلي ووقت التنقل والاستراحات؛ المواعيد وحدها لا تضمن نتيجة الاختبار.</p>
      </aside></div>
    </>}
    <StudyReviewPanel />
    {coachOpen && <StudyCoach onClose={() => setCoachOpen(false)} />}
  </div>;
}
