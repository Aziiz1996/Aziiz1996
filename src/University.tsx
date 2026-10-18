import { useEffect, useState, type FormEvent } from 'react';
import { ExternalLink, GraduationCap, BookOpen, CalendarPlus, Upload, Link2, RefreshCw, LogOut, Smartphone } from 'lucide-react';
import { SectionHeader } from './ui';
import { downloadFile, useApp } from './store';
import { buildStudyCalendar, parseMoodleCalendar } from './calendarTools';
import { todayISO } from './logic';
import { enableAcademicReminders } from './reminders';
import { syncNativeCalendar } from './nativeCalendar';
import CollegeCalendar from './CollegeSchedulePanel';

export default function UniversityPage() {
  const { data, update, notify, replace, accountId } = useApp();
  const [error, setError] = useState('');
  const [moodleUsername, setMoodleUsername] = useState('');
  const [moodlePassword, setMoodlePassword] = useState('');
  const [moodleConnected, setMoodleConnected] = useState(false);
  const [moodleBusy, setMoodleBusy] = useState(false);
  const [moodleMessage, setMoodleMessage] = useState('');
  const [calendarBusy, setCalendarBusy] = useState(false);
  useEffect(() => { const controller = new AbortController(); fetch('/api/moodle/status', { signal:controller.signal, cache:'no-store' }).then(response => response.ok ? response.json() : null).then(value => setMoodleConnected(!!value?.connected)).catch(() => {}); return () => controller.abort(); }, []);
  const upcoming = (data.universityEvents ?? []).filter(event => event.date >= todayISO()).sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)).slice(0, 12);
  async function importCalendar(file: File | undefined) {
    if (!file) return;
    setError('');
    try {
      const events = parseMoodleCalendar(await file.text());
      if (!events.length) throw new Error('لم أجد مواعيد داخل الملف. صدّر التقويم من مودل بصيغة ICS ثم حاول مرة أخرى.');
      update(draft => {
        const merged = new Map((draft.universityEvents ?? []).map(event => [event.id, event]));
        events.forEach(event => merged.set(event.id, event));
        draft.universityEvents = [...merged.values()];
        for (const event of events.filter(item => item.kind === 'exam' || item.kind === 'assignment')) {
          const id = `${event.id}-task`;
          const kind = event.kind === 'exam' ? 'exam' : 'assignment';
          if (!draft.tasks.some(task => task.id === id)) draft.tasks.push({ id, title: event.title, courseId: '', kind, due: event.date, priority: kind === 'exam' ? 'high' : 'medium', minutes: kind === 'exam' ? 180 : 90, completed: false, time: event.time || undefined, endTime: event.endTime || undefined, timePending: event.time ? undefined : 'الوقت غير محدد في تقويم مودل' });
        }
      });
      notify(`تم استيراد ${events.length} موعداً من تقويم مودل`);
    } catch (exception) { setError(exception instanceof Error ? exception.message : 'تعذّر استيراد التقويم.'); }
  }
  async function moodleRequest(path: 'connect' | 'sync' | 'disconnect', body?: object) {
    setMoodleBusy(true); setMoodleMessage('');
    try {
      const response = await fetch(`/api/moodle/${path}`, { method:'POST', headers:body ? { 'Content-Type':'application/json' } : undefined, body:body ? JSON.stringify(body) : undefined });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || 'تعذّر الاتصال بمودل.');
      if (value.data && !replace(value.data)) throw new Error('وصلت بيانات غير صالحة من مودل.');
      const connected = path !== 'disconnect' && !!value.connected;
      setMoodleConnected(connected); setMoodlePassword('');
      setMoodleMessage(path === 'disconnect' ? 'تم فصل مودل من هذه الجلسة.' : `تمت المزامنة: ${value.moodle?.courseCount ?? 0} مواد و${value.moodle?.eventCount ?? 0} مواعيد. ${(value.moodle?.warnings ?? []).join(" ")}`);
    } catch (exception) { setMoodleMessage(exception instanceof Error ? exception.message : 'تعذّر الاتصال بمودل.'); }
    finally { setMoodleBusy(false); }
  }
  function connect(event: FormEvent) { event.preventDefault(); void moodleRequest('connect', { username:moodleUsername, password:moodlePassword }); }
  async function syncPhoneCalendar() {
    setCalendarBusy(true); setError('');
    try {
      const result = await syncNativeCalendar(data, accountId);
      notify(`تمت مزامنة التقويم: ${result.created} جديد و${result.updated} محدّث`);
    } catch (exception) {
      if (exception instanceof Error && exception.message === 'WEB_CALENDAR') {
        downloadFile('az-logistics-calendar.ics', buildStudyCalendar(data), 'text/calendar;charset=utf-8');
        notify('تم تنزيل ملف التقويم؛ افتحه لإضافة المواعيد على جهازك');
      } else if (exception instanceof Error && exception.message === 'CALENDAR_DENIED') setError('لم يُسمح بالوصول إلى التقويم. فعّل إذن التقويم لعز اللوجستيات من إعدادات الجهاز ثم حاول مرة أخرى.');
      else setError('تعذّرت مزامنة تقويم الهاتف. حاول مرة أخرى أو نزّل ملف التقويم.');
    } finally { setCalendarBusy(false); }
  }
  return <div className="page-content stack">
    <SectionHeader eyebrow="جامعتك في مكان واحد" title="الجامعة — الكلية التطبيقية" description="روابط الجامعة ومودل وتقويم دبلوم سلاسل الإمداد." />
    <CollegeCalendar />
    <div className="note-grid">
      <section className="card stack"><GraduationCap size={28} /><h2>موقع الجامعة السعودية الإلكترونية</h2><p>راجع أخبار الجامعة وخدماتها ومعلومات القبول والكلية التطبيقية من الموقع.</p><a className="btn btn-primary" href="https://seu.edu.sa/" target="_blank" rel="noopener noreferrer"><ExternalLink size={18} />فتح موقع الجامعة</a></section>
      <section className="card stack"><BookOpen size={28} /><h2>منصة الدراسة — مودل</h2><p>افتح رابط منصة الدراسة الذي أرسلته وسجّل دخولك لدى المنصة لعرض موادك.</p><a className="btn btn-primary" href="https://lms.ac-seu.com/login/index.php?loginredirect=1" target="_blank" rel="noopener noreferrer"><ExternalLink size={18} />فتح منصة الدراسة</a></section>
      <section className="card stack"><ExternalLink size={28} /><h2>Microsoft Teams — حضور المحاضرات والدورات</h2><p>افتح Teams وسجّل دخولك بحساب الجامعة، ثم اختر الفريق أو الاجتماع المتاح لك. يمكن إضافة رابط اجتماع محدد من إعداد موعد المحاضرة.</p><a className="btn btn-primary" href="https://teams.microsoft.com/" target="_blank" rel="noopener noreferrer"><ExternalLink size={18} />فتح Teams</a><p className="muted">هذا رابط Teams العام؛ لا ينضم لاجتماع تلقائياً ولا يثبت حضورك. استخدامه للمحاضرات يعتمد على ما تحدده الجامعة.</p></section>
    </div>
    <section className="card stack moodle-connect-card"><div className="card-heading"><div><span className="eyebrow">حسابك لدى الكلية</span><h2><Link2 size={20} /> ربط حسابك بالكلية والمحاضرات والجداول</h2></div><span className={`badge ${moodleConnected ? 'success' : 'gray'}`}>{moodleConnected ? 'متصل في هذه الجلسة' : 'غير متصل'}</span></div>{moodleConnected ? <div className="row moodle-actions"><button className="btn btn-primary" disabled={moodleBusy} onClick={() => void moodleRequest('sync')}><RefreshCw size={18} />تحديث المحاضرات والجداول</button><button className="btn btn-secondary" disabled={moodleBusy} onClick={() => void moodleRequest('disconnect')}><LogOut size={18} />فصل مودل</button></div> : <form className="form-grid" onSubmit={connect}><label className="field"><span>اسم مستخدم مودل</span><input required autoComplete="username" value={moodleUsername} onChange={event => setMoodleUsername(event.target.value)} /></label><label className="field"><span>كلمة مرور مودل</span><input required type="password" autoComplete="current-password" value={moodlePassword} onChange={event => setMoodlePassword(event.target.value)} /></label><button className="btn btn-primary" disabled={moodleBusy}><Link2 size={18} />ربط وسحب البيانات</button></form>}<p className="muted">تُرسل البيانات مباشرة من خادم عز اللوجستيات إلى مودل عبر الخدمة الرسمية. لا تُحفظ كلمة المرور، ويبقى مفتاح الربط داخل الخادم، وينتهي الاتصال المؤقت عند خروجك أو إعادة تشغيل الخادم.</p>{moodleMessage && <p className={`notice ${moodleMessage.startsWith('تعذ') ? 'danger' : ''}`} role="status">{moodleMessage}</p>}</section>
    <section className="card stack"><CalendarPlus size={28} /><h2>تقويم المحاضرات والاختبارات</h2><p>من تقويم مودل اختر «تصدير التقويم» ونزّل ملف ICS، ثم ارفعه هنا. يستورد البرنامج المحاضرات والواجبات والاختبارات، ويضيف الواجبات والاختبارات إلى مهامك.</p><label className="btn btn-primary import-button"><Upload size={18} />اختيار ملف تقويم مودل<input type="file" accept="text/calendar,.ics" onChange={event => { void importCalendar(event.target.files?.[0]); event.target.value = ''; }} /></label><button className="btn btn-primary" disabled={calendarBusy} onClick={() => void syncPhoneCalendar()}><Smartphone size={18} />{calendarBusy ? 'جارٍ مزامنة التقويم…' : 'مزامنة تقويم الهاتف'}</button><button className="btn btn-secondary" disabled={calendarBusy} onClick={() => { setCalendarBusy(true); void enableAcademicReminders(data).then(notify).catch(() => setError('تعذر تفعيل التنبيهات.')).finally(() => setCalendarBusy(false)); }}>تفعيل تنبيهات المحاضرات والواجبات والاختبارات</button><button className="btn btn-secondary" onClick={() => downloadFile('az-logistics-calendar.ics', buildStudyCalendar(data), 'text/calendar;charset=utf-8')}><CalendarPlus size={18} />تنزيل ملف التقويم</button><p className="muted">في تطبيق iOS أو Android سيطلب النظام إذن الكتابة في التقويم مرة واحدة ثم يضيف المواعيد والتنبيهات مباشرة. في نسخة المتصفح يُنزّل ملف ICS لفتحه يدوياً. التنبيه قبل المحاضرة بساعة، وقبل الواجب أو الاختبار بيوم وساعتين.</p>{error && <p className="notice danger" role="alert">{error}</p>}</section>
    {upcoming.length > 0 && <section className="card stack"><h2>المواعيد المستوردة من مودل</h2>{upcoming.map(event => <article className="deadline-item" key={event.id}><div className="deadline-body"><strong>{event.title}</strong><span className="muted">{event.date}{event.time ? ` · ${event.time}` : ''}</span></div><span className={`badge kind-${event.kind === 'event' ? 'assignment' : event.kind}`}>{event.kind === 'exam' ? 'اختبار' : event.kind === 'assignment' ? 'واجب' : event.kind === 'lecture' ? 'محاضرة' : 'موعد'}</span></article>)}</section>}
    <p className="notice">استيراد ملف التقويم لا يحتاج كلمة مرور. أما الربط المباشر فيستخدم بيانات مودل عبر الخادم ولا يحفظ كلمة المرور. الملفات والصفحات المقفلة داخل مودل تبقى محمية في حساب الجامعة؛ الربط المباشر الكامل يحتاج أن تفعّل الجامعة خدمة Moodle الرسمية للتطبيقات الخارجية.</p>
  </div>;
}
