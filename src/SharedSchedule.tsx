import { useState } from 'react';
import { AlertCircle, BookOpen, CalendarDays, Check, Clock3, Download, GraduationCap, Plus } from 'lucide-react';
import { SHARED_ACADEMIC_CATALOG, mergeSharedAcademics } from './sharedAcademics';
import { PROVIDED_MATERIALS } from './providedMaterials';
import { mergeStudyMaterials } from './studyMaterials';
import { downloadFile, useApp } from './store';

const days = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const number = (value: number) => new Intl.NumberFormat('ar-SA').format(value);
const dateFormat = new Intl.DateTimeFormat('ar-SA-u-ca-gregory', {
  day: 'numeric', month: 'long', year: 'numeric', weekday: 'long', timeZone: 'Asia/Riyadh',
});
const timeFormat = new Intl.DateTimeFormat('ar-SA', {
  hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Riyadh',
});
const time = (value: string) => timeFormat.format(new Date(`2026-10-01T${value}:00+03:00`));
const catalog = SHARED_ACADEMIC_CATALOG;
const courses = new Map(catalog.courses.map(course => [course.id, course]));
const lectures = [...catalog.lectures].sort((first, second) => first.day - second.day || first.start.localeCompare(second.start));
const exams = [...catalog.exams].sort((first, second) => first.due.localeCompare(second.due));

/** A shared reference; adding it only fills gaps in the current student's account. */
export default function SharedSchedule() {
  const { data, replace } = useApp();
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);

  function showMessage(value: string, error = false) { setMessage(value); setFailed(error); }

  function addSchedule() {
    try {
      const result = mergeSharedAcademics(data);
      if (!result.addedCourses && !result.addedLectures && !result.addedExams) {
        showMessage('المواد والمواعيد المشتركة موجودة في حسابك بالفعل، وتبقى تعديلاتك كما هي.');
        return;
      }
      if (!replace(result.data)) throw new Error();
      showMessage(`أُضيف ${number(result.addedCourses)} مواد و${number(result.addedLectures)} مواعيد محاضرات و${number(result.addedExams)} اختبارات ناقصة. بقيت مواعيدك وتعديلاتك الحالية محفوظة؛ تحقق من مؤشر الحفظ قبل الخروج.`);
    } catch {
      showMessage('تعذرت إضافة الجدول إلى حسابك. لم نستبدل مواعيدك؛ يمكنك الرجوع إلى الجدول المعروض وتصدير نسخة من بياناتك من الإعدادات.', true);
    }
  }

  function addMaterials() {
    try {
      const result = mergeStudyMaterials(data, PROVIDED_MATERIALS);
      if (!result.summaries && !result.quizzes) {
        showMessage('الملخصات والاختبارات المتاحة موجودة في حسابك بالفعل، وتبقى تعديلاتك عليها كما هي.');
        return;
      }
      if (!replace(result.data)) throw new Error();
      showMessage(`أُضيف ${number(result.summaries)} ملخصات و${number(result.quizzes)} اختبارات تدريبية إلى حسابك، دون استبدال النسخ الموجودة. تحقق من مؤشر الحفظ قبل الخروج.`);
    } catch {
      showMessage('تعذرت إضافة الحزمة إلى حسابك. نزّل حزمة JSON للاحتفاظ بها، ويمكنك إعادة استيرادها من صفحة الملخصات.', true);
    }
  }

  function downloadMaterials() {
    try {
      downloadFile('az-logistics-study-materials.json', JSON.stringify(PROVIDED_MATERIALS, null, 2), 'application/json');
      showMessage('جُهزت حزمة المواد JSON للتنزيل. تضم نصوص الملخصات وأسئلة التدريب المتاحة فقط.');
    } catch {
      showMessage('تعذر تجهيز التنزيل في هذا المتصفح. حاول مرة أخرى من متصفح أحدث.', true);
    }
  }

  return <section className="card stack shared-schedule" dir="rtl" aria-labelledby="shared-schedule-title">
    <div className="card-heading" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div>
        <span className="eyebrow">مرجع مشترك للدفعة</span>
        <h2 id="shared-schedule-title"><GraduationCap size={21} aria-hidden="true" /> جدول الدفعة المشترك</h2>
        <p className="muted">خريف ٢٠٢٦ · {number(catalog.courses.length)} مواد · {number(catalog.lectures.length)} محاضرات أسبوعية · {number(catalog.exams.length)} اختبارات</p>
      </div>
      <span className="chip"><Clock3 size={14} aria-hidden="true" /> بتوقيت السعودية</span>
    </div>

    <div className="notice notice-warning"><AlertCircle size={20} aria-hidden="true" /><span>{catalog.provenance.notice} الجدول المعروض هو المرجع المشترك؛ مواعيدك المعدلة تظهر في جدولك الشخصي.</span></div>

    <details>
      <summary style={{ cursor: 'pointer', fontWeight: 600, color: '#634a86', padding: '8px 0' }}>عرض المحاضرات والاختبارات · خريف ٢٠٢٦</summary>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 290px), 1fr))', gap: 24, marginTop: 12 }}>
      <section aria-labelledby="shared-lectures-title" style={{ minWidth: 0 }}>
        <h3 id="shared-lectures-title" className="row"><BookOpen size={18} aria-hidden="true" /> المحاضرات الأسبوعية</h3>
        <ul className="schedule-list" style={{ listStyle: 'none', padding: 0, margin: '12px 0 0' }}>
          {lectures.map(lecture => <li key={lecture.id} className="schedule-item" style={{ alignItems: 'flex-start' }}>
            <span className="schedule-marker lecture" style={{ flexShrink: 0, background: courses.get(lecture.courseId)?.color }} aria-hidden="true" />
            <div className="schedule-content" style={{ minWidth: 0 }}>
              <strong>{courses.get(lecture.courseId)?.name}</strong>
              <p className="muted">{days[lecture.day]} · {lecture.start ? time(lecture.start) : 'البداية غير محددة'}{lecture.end ? ` إلى ${time(lecture.end)}` : ' · النهاية غير محددة'}</p>
              {lecture.timePending && <small className="muted">{lecture.timePending}</small>}
            </div>
          </li>)}
        </ul>
      </section>

      <section aria-labelledby="shared-exams-title" style={{ minWidth: 0 }}>
        <h3 id="shared-exams-title" className="row"><CalendarDays size={18} aria-hidden="true" /> اختبارات أكتوبر ٢٠٢٦</h3>
        <ul className="schedule-list" style={{ listStyle: 'none', padding: 0, margin: '12px 0 0' }}>
          {exams.map(exam => <li key={exam.id} className="schedule-item" style={{ alignItems: 'flex-start' }}>
            <span className="schedule-marker exam" style={{ flexShrink: 0, background: courses.get(exam.courseId)?.color }} aria-hidden="true" />
            <div className="schedule-content" style={{ minWidth: 0 }}>
              <strong>{courses.get(exam.courseId)?.name}</strong>
              <p className="muted">{dateFormat.format(new Date(`${exam.due}T12:00:00+03:00`))}</p>
              <p className="muted">{exam.time ? time(exam.time) : 'مسائي · البداية غير محددة'}{exam.endTime ? ` إلى ${time(exam.endTime)}` : ' · النهاية غير محددة'}</p>
              {exam.timePending && <small className="muted">{exam.timePending}</small>}
            </div>
          </li>)}
        </ul>
      </section>
      </div>
    </details>

    <div className="stack" style={{ borderTop: '1px solid #eee8f4', paddingTop: 16 }}>
      <p className="muted">أضف ما ينقص حسابك لتظهر المواعيد في خطة المذاكرة والتقويم. {catalog.preparationMinutes.notice}</p>
      <div className="row" style={{ flexWrap: 'wrap', gap: 10 }}>
        <button className="btn btn-primary" onClick={addSchedule}><Plus size={17} aria-hidden="true" /> إضافة المواعيد الناقصة</button>
        <button className="btn btn-secondary" onClick={addMaterials}><BookOpen size={17} aria-hidden="true" /> إضافة الملخصات والاختبارات لحسابي</button>
        <button className="btn btn-secondary" onClick={downloadMaterials}><Download size={17} aria-hidden="true" /> تنزيل حزمة المواد JSON</button>
      </div>
      <p className="muted">الحزمة المتاحة: {number(PROVIDED_MATERIALS.summaries.length)} ملخصات نصية و{number(PROVIDED_MATERIALS.quizzes.length)} اختبارات تدريبية بصيغة JSON؛ لا تتضمن ملفات PDF الأصلية. راجع المحتوى ومفاتيح الإجابة مع محاضراتك.</p>
      {message && <p className={failed ? 'notice danger' : 'notice'} role={failed ? 'alert' : 'status'}>{!failed && <Check size={18} aria-hidden="true" />}{message}</p>}
    </div>
  </section>;
}
