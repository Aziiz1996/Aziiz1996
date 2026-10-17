import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Clock3, Pause, Play, Sparkles } from 'lucide-react';
import { useApp } from './store';
import { Field, Modal } from './ui';
import { actualStudyLimit, finishStudySession, measuredStudyMinutes, moveStudyStep, pauseStudyRun, studyKind, studyPhases, studyTimer } from './studyMethods';

function clock(seconds: number) {
  const whole = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(whole / 60).toString().padStart(2, '0')}:${(whole % 60).toString().padStart(2, '0')}`;
}

const CONFIDENCE = ['أحتاج البدء من الأساس', 'أفهم قليلاً وأحتاج شرحاً', 'أفهم بمساعدة الملاحظات', 'أشرح الأساس وأخطئ في التطبيق', 'أشرح وأحل غالباً وحدي', 'أشرح وأحل مثالاً جديداً وحدي'];

export default function StudyCoach({ onClose }: { onClose: () => void }) {
  const { data, update, notify } = useApp();
  const run = data.activeStudy;
  const initialId = useRef(run?.id);
  const [now, setNow] = useState(Date.now);
  const [score, setScore] = useState('');
  const [actualMinutes, setActualMinutes] = useState('');
  const [minutesTouched, setMinutesTouched] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const submitLock = useRef(false);
  const kind = run ? studyKind(data, run) : 'exam';
  const phases = studyPhases(run?.plannedMinutes ?? 0, kind);
  const timer = run ? studyTimer(run, now) : { elapsedSeconds: 0, remainingSeconds: 0 };

  useEffect(() => {
    if (!run?.runningSince) return;
    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [run?.id, run?.runningSince, run?.step]);

  // A backgrounded browser may wake after a phase ended: cap elapsed at that phase's end.
  useEffect(() => {
    if (!run || run.runningSince === null || timer.remainingSeconds > 0) return;
    const { id, step, runningSince } = run;
    update(draft => {
      const current = draft.activeStudy;
      if (current?.id === id && current.step === step && current.runningSince === runningSince) draft.activeStudy = pauseStudyRun(current, Date.now(), kind);
    });
  }, [run?.id, run?.step, run?.runningSince, timer.remainingSeconds === 0, kind, update]);

  useEffect(() => {
    if (!submitted) return;
    if (data.studyLog?.some(log => log.id === initialId.current)) {
      notify('حُفظ وقتك الفعلي ومواعيد مراجعتك. خطوة اليوم تصنع غداً أجمل');
      onClose();
    } else {
      submitLock.current = false;
      setSubmitted(false);
      setError('تغيّرت بيانات المهمة. راجع الوقت المتبقي ثم احفظ من جديد.');
    }
  }, [data, submitted, notify, onClose]);

  if (!run || run.id !== initialId.current) return null;
  const phase = phases[run.step];
  const limit = actualStudyLimit(data, run);
  const measured = Math.min(limit, measuredStudyMinutes(run, now));
  const minutesValue = minutesTouched ? actualMinutes : String(measured);
  const progress = Math.min(100, timer.elapsedSeconds / Math.max(1, run.plannedMinutes * 60) * 100);

  function close() {
    const timestamp = Date.now();
    update(draft => { const current = draft.activeStudy; if (current && current.id === initialId.current) draft.activeStudy = pauseStudyRun(current, timestamp, kind); });
    onClose();
  }

  function setRunning(running: boolean) {
    const timestamp = Date.now();
    setNow(timestamp);
    update(draft => {
      const current = draft.activeStudy;
      if (!current || current.id !== initialId.current || (current.runningSince !== null) === running) return;
      const paused = pauseStudyRun(current, timestamp, kind);
      draft.activeStudy = running && paused.remainingSeconds > 0 ? { ...paused, runningSince: timestamp } : paused;
    });
  }

  function goToStep(step: number) {
    const timestamp = Date.now();
    setNow(timestamp);
    update(draft => { const current = draft.activeStudy; if (current && current.id === initialId.current) draft.activeStudy = moveStudyStep(current, step, timestamp, kind); });
    setError('');
  }

  function finish() {
    if (!run || submitLock.current) return;
    const minutes = Number(minutesValue);
    if (!minutesValue.trim() || !Number.isFinite(minutes) || minutes < 0 || minutes > limit) { setError(`أدخل وقتك الفعلي بين ٠ و${limit} دقيقة.`); return; }
    if (score === '') { setError('اختر تقييم فهمك قبل حفظ الجلسة.'); return; }
    submitLock.current = true;
    const timestamp = Date.now();
    const id = run.id;
    const reflection = run.reflection;
    update(draft => { finishStudySession(draft, id, minutes, Number(score), reflection, timestamp); });
    setSubmitted(true);
  }

  return <Modal title="مرشد المذاكرة · خطوة بخطوة" onClose={close}>
    <div className="study-coach stack">
      <div className="coach-hero"><span className="coach-badge"><Sparkles size={17} /> خطوة اليوم تصنع غداً أجمل</span><h3>{run.title}</h3><p className="muted">جلسة {run.plannedMinutes} دقيقة · هدف صغير، محاولة حقيقية، ثم مراجعة.</p></div>
      <ol className="coach-steps" aria-label="خطوات الجلسة">{phases.map((item, index) => <li className={`coach-step ${index === run.step ? 'active' : ''} ${(run.stepRemaining?.[index] ?? item.seconds) === 0 ? 'done' : ''}`} key={item.id} aria-current={index === run.step ? 'step' : undefined}><span>{index + 1}</span><span>{item.title}</span><small>{clock(item.seconds)}</small></li>)}</ol>
      <section className="coach-phase" aria-labelledby="coach-phase-title">
        <span className="eyebrow">الخطوة {run.step + 1} من ٥</span><h3 id="coach-phase-title">{phase.title}</h3><p className="coach-goal">{phase.goal}</p>
        <ol className="coach-action-list">{phase.actions.map(action => <li key={action}>{action}</li>)}</ol>
      </section>
      <div className="coach-timer" role="timer" aria-label={`الوقت المتبقي في الخطوة ${clock(timer.remainingSeconds)}`}><strong dir="ltr">{clock(timer.remainingSeconds)}</strong><span className="muted">متبقٍ لهذه الخطوة</span></div>
      <div className="coach-controls"><button type="button" className="btn btn-primary" disabled={timer.remainingSeconds === 0} onClick={() => setRunning(run.runningSince === null)}>{run.runningSince !== null ? <Pause size={17} /> : <Play size={17} />}{run.runningSince !== null ? 'إيقاف مؤقت' : 'ابدأ هذه الخطوة'}</button><span role="status" className="muted">{timer.remainingSeconds === 0 ? 'انتهى وقت الخطوة؛ انتقل عندما تكون مستعداً.' : run.runningSince !== null ? 'المؤقت يعمل. ركّز على الإجراء أمامك.' : 'المؤقت متوقف. ابدأه عندما تكون جاهزاً.'}</span></div>
      <div className="coach-progress"><progress max={100} value={progress} aria-label="نسبة الوقت المستخدم من الجلسة" /><p className="muted"><Clock3 size={14} /> وقت التركيز المقاس: <b dir="ltr">{clock(timer.elapsedSeconds)}</b> · الانتقال بين الخطوات لا يسجّل وقتاً لم تدرسه.</p></div>
      {run.step === 4 && <div className="coach-reflection stack">
        <div className="form-grid"><Field label="دقائق المذاكرة الفعلية"><input className="input" type="number" min={0} max={limit} step="0.1" inputMode="decimal" value={minutesValue} onChange={event => { setActualMinutes(event.target.value); setMinutesTouched(true); setError(''); }} /></Field>
          <Field label="كيف تقيم فهمك؟"><select className="input" value={score} onChange={event => { setScore(event.target.value); setError(''); }}><option value="">اختر بناءً على محاولتك</option>{CONFIDENCE.map((label, index) => <option key={index} value={index}>{index} / ٥ · {label}</option>)}</select></Field></div>
        <p className="field-hint">الافتراضي هو الوقت الذي قاسه المؤقت، ويمكنك تصحيحه إن ذاكرت بعيداً عنه. الحد الأعلى {limit} دقيقة حسب وقت الجلسة والمتبقي للمهمة. تسجيل صفر يحفظ تجربتك دون خصم وقت أو إنشاء مراجعات.</p>
        <Field label="ما الذي تعلمته؟ وما خطوتك التالية؟"><textarea className="input" rows={3} maxLength={3000} value={run.reflection} placeholder="مثال: أشرح الفرق بين نوعين من المخزون، وأحتاج مراجعة مثال حسابي واحد." onChange={event => { const reflection = event.target.value; update(draft => { const current = draft.activeStudy; if (current && current.id === initialId.current) current.reflection = reflection; }); }} /></Field>
        <p className="field-hint">بعد الحفظ ستظهر مراجعة بعد يوم و٣ و٧ أيام؛ عند فهم ٤ أو ٥ تبدأ بعد ٣ أيام. تبقى حالة الاختبار أو الواجب كما هي حتى تُنجزه فعلاً.</p>
      </div>}
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      <div className="coach-footer"><button type="button" className="btn btn-secondary" disabled={run.step === 0} onClick={() => goToStep(run.step - 1)}><ArrowRight size={16} />السابق</button>{run.step < 4 ? <button type="button" className="btn btn-primary" onClick={() => goToStep(run.step + 1)}>التالي: {phases[run.step + 1].title}<ArrowLeft size={16} /></button> : <button type="button" className="btn btn-primary" disabled={submitted} onClick={finish}><CheckCircle2 size={17} />حفظ الجلسة والوقت الفعلي</button>}</div>
      <div className="row"><button type="button" className="btn btn-ghost" onClick={close}>حفظ التوقف والعودة للخطة</button>{run.step < 4 && <button type="button" className="btn btn-ghost" onClick={() => goToStep(4)}>إنهاء مبكر وتسجيل الوقت</button>}</div>
    </div>
  </Modal>;
}
