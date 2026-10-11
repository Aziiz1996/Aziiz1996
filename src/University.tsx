import { useState } from 'react';
import { ExternalLink, GraduationCap, BookOpen, CalendarPlus, Upload } from 'lucide-react';
import { SectionHeader } from './ui';
import { downloadFile, useApp } from './store';
import { buildStudyCalendar, parseMoodleCalendar } from './calendarTools';
import { todayISO } from './logic';

export default function UniversityPage() {
  const { data, update, notify } = useApp();
  const [error, setError] = useState('');
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
  return <div className="page-content stack">
    <SectionHeader eyebrow="جامعتك في مكان واحد" title="الجامعة — الكلية التطبيقية" description="روابط الجامعة ومودل وتقويم دبلوم سلاسل الإمداد." />
    <div className="note-grid">
      <section className="card stack"><GraduationCap size={28} /><h2>موقع الجامعة السعودية الإلكترونية</h2><p>راجع أخبار الجامعة وخدماتها ومعلومات القبول والكلية التطبيقية من الموقع.</p><a className="btn btn-primary" href="https://seu.edu.sa/" target="_blank" rel="noopener noreferrer"><ExternalLink size={18} />فتح موقع الجامعة</a></section>
      <section className="card stack"><BookOpen size={28} /><h2>منصة الدراسة — مودل</h2><p>افتح رابط منصة الدراسة الذي أرسلته وسجّل دخولك لدى المنصة لعرض موادك.</p><a className="btn btn-primary" href="https://lms.ac-seu.com/login/index.php?loginredirect=1" target="_blank" rel="noopener noreferrer"><ExternalLink size={18} />فتح منصة الدراسة</a></section>
      <section className="card stack"><ExternalLink size={28} /><h2>Microsoft Teams — حضور المحاضرات والدورات</h2><p>افتح Teams وسجّل دخولك بحساب الجامعة، ثم اختر الفريق أو الاجتماع المتاح لك. يمكن إضافة رابط اجتماع محدد من إعداد موعد المحاضرة.</p><a className="btn btn-primary" href="https://teams.microsoft.com/" target="_blank" rel="noopener noreferrer"><ExternalLink size={18} />فتح Teams</a><p className="muted">هذا رابط Teams العام؛ لا ينضم لاجتماع تلقائياً ولا يثبت حضورك. استخدامه للمحاضرات يعتمد على ما تحدده الجامعة.</p></section>
    </div>
    <section className="card stack"><CalendarPlus size={28} /><h2>استيراد مواعيد مودل وتنبيهات الآيفون</h2><p>من تقويم مودل اختر «تصدير التقويم» ونزّل ملف ICS، ثم ارفعه هنا. يستورد البرنامج المحاضرات والواجبات والاختبارات، ويضيف الواجبات والاختبارات إلى مهامك.</p><label className="btn btn-primary import-button"><Upload size={18} />اختيار ملف تقويم مودل<input type="file" accept="text/calendar,.ics" onChange={event => { void importCalendar(event.target.files?.[0]); event.target.value = ''; }} /></label><button className="btn btn-secondary" onClick={() => downloadFile('az-logistics-calendar.ics', buildStudyCalendar(data), 'text/calendar;charset=utf-8')}><CalendarPlus size={18} />تنزيل تقويم التنبيهات للآيفون</button><p className="muted">بعد التنزيل افتح الملف واختر إضافته إلى التقويم. يحتوي تنبيهاً قبل المحاضرة بساعة، وقبل الواجب أو الاختبار بيوم وساعتين.</p>{error && <p className="notice danger" role="alert">{error}</p>}</section>
    {upcoming.length > 0 && <section className="card stack"><h2>المواعيد المستوردة من مودل</h2>{upcoming.map(event => <article className="deadline-item" key={event.id}><div className="deadline-body"><strong>{event.title}</strong><span className="muted">{event.date}{event.time ? ` · ${event.time}` : ''}</span></div><span className={`badge kind-${event.kind === 'event' ? 'assignment' : event.kind}`}>{event.kind === 'exam' ? 'اختبار' : event.kind === 'assignment' ? 'واجب' : event.kind === 'lecture' ? 'محاضرة' : 'موعد'}</span></article>)}</section>}
    <p className="notice">الاستيراد لا يطلب كلمة مرور الجامعة ولا يرسلها للبرنامج. الملفات والصفحات المقفلة داخل مودل تبقى محمية في حساب الجامعة؛ الربط المباشر الكامل يحتاج أن تفعّل الجامعة خدمة Moodle الرسمية للتطبيقات الخارجية.</p>
  </div>;
}
