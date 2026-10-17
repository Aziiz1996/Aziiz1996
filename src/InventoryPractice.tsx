import { useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Check, CheckCircle2, ClipboardCheck, History, Play, RotateCcw, Save, Trash2, XCircle } from 'lucide-react';
import { useApp } from './store';
import { EmptyState, Field, Modal, SectionHeader } from './ui';
import { PRACTICE_BANK, PRACTICE_QUESTIONS, PRACTICE_QUESTION_BY_ID } from './practiceBank';
import { createPracticeRun, finishPracticeRun, gradePractice } from './practiceLogic';
import type { PracticeAttempt, PracticeRun } from './types';

type StartOptions = { count?: number; questionIds?: string[]; mode: PracticeRun['mode'] };
const countText = (value: number) => new Intl.NumberFormat('ar-SA').format(value);
const modeText = (mode: PracticeRun['mode']) => mode === 'practice' ? 'تعلّم مع تصحيح فوري' : 'اختبار ذاتي دون تصحيح حتى التسليم';
const dateText = (value: string) => new Intl.DateTimeFormat('ar-SA-u-ca-gregory', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Riyadh' }).format(new Date(value));

export default function PracticePage() {
  const { data, update, notify } = useApp();
  const run = data.activePractice;
  const attempts = data.practiceAttempts ?? [];
  const [count, setCount] = useState(40);
  const [mode, setMode] = useState<PracticeRun['mode']>('practice');
  const [showRun, setShowRun] = useState(Boolean(run));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [replaceRun, setReplaceRun] = useState<StartOptions | null>(null);
  const [clearHistory, setClearHistory] = useState(false);
  const [reviewAll, setReviewAll] = useState(false);
  const [historyLimit, setHistoryLimit] = useState(10);
  const finishLock = useRef<string | null>(null);
  const selected = attempts.find(attempt => attempt.id === selectedId);
  const current = run ? PRACTICE_QUESTION_BY_ID.get(run.questionIds[run.currentIndex]) : undefined;
  const grade = run ? gradePractice(run.questionIds, run.answers) : null;

  function start(options: StartOptions) {
    const next = createPracticeRun(options);
    update(draft => { draft.activePractice = next; });
    finishLock.current = null; setShowRun(true); setSelectedId(null); setReviewAll(false); setReplaceRun(null);
    requestAnimationFrame(() => document.getElementById('practice-current')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
  function requestStart(options: StartOptions) {
    if (run) setReplaceRun(options); else start(options);
  }
  function answer(letter: string | null) {
    if (!run || !current) return;
    const runId = run.id; const questionId = current.id;
    update(draft => {
      const active = draft.activePractice;
      if (!active || active.id !== runId) return;
      if (letter === null) delete active.answers[questionId];
      else if (current.options.some(option => option.letter === letter)) active.answers[questionId] = letter;
    });
  }
  function jump(index: number) {
    if (!run) return;
    const id = run.id;
    update(draft => { const active = draft.activePractice; if (active?.id === id && index >= 0 && index < active.questionIds.length) active.currentIndex = index; });
    requestAnimationFrame(() => document.getElementById('practice-question-title')?.focus({ preventScroll: true }));
  }
  function finish() {
    if (!run || finishLock.current === run.id) return;
    if (attempts.length >= 1000) { setConfirmFinish(false); notify('سجل المحاولات ممتلئ. صدّر نسخة احتياطية ثم امسح السجل لإضافة محاولة.'); return; }
    const id = run.id; const timestamp = Date.now(); finishLock.current = id;
    update(draft => {
      const active = draft.activePractice;
      if (!active || active.id !== id) return;
      const history = draft.practiceAttempts ?? [];
      if (!history.some(attempt => attempt.id === id)) draft.practiceAttempts = [finishPracticeRun(active, timestamp), ...history];
      draft.activePractice = null;
    });
    setSelectedId(id); setConfirmFinish(false); setShowRun(false); setReviewAll(false);
    notify('حُفظت المحاولة وصُحّحت حسب مفتاح الملف الأصلي');
  }
  function requestFinish() {
    if (!run || !grade) return;
    if (grade.skippedIds.length) setConfirmFinish(true); else finish();
  }
  function review(attempt: PracticeAttempt) {
    setSelectedId(attempt.id); setShowRun(false); setReviewAll(false);
    requestAnimationFrame(() => document.getElementById('practice-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  return <div className="practice-page stack">
    <SectionHeader eyebrow="خطوة حل، وخطوة فهم" title="الاختبارات التدريبية" description="تدرّب من ملفك المرفق، وراجع ما يحتاج إلى محاولة أخرى." />
    <section className="card practice-hero"><span className="portal-logo"><ClipboardCheck size={28} /></span><div><span className="eyebrow">حزمة أسئلتك المرفقة</span><h2>{PRACTICE_BANK.title}</h2><p className="muted">{PRACTICE_BANK.description}</p><p className="muted">{PRACTICE_BANK.source.disclaimer}</p></div><div className="practice-bank-info"><strong>{countText(PRACTICE_QUESTIONS.length)}</strong><span>سؤال اختيار من متعدد</span><span className="badge green">بنك الأسئلة جاهز</span></div></section>

    {(!showRun || !run) && <section className="card stack"><div className="card-heading"><div><h2 className="card-title"><Play size={19} />ابدأ بطريقتك</h2><p className="card-subtitle">اختَر جلسة قصيرة أو الحزمة كاملة. يحفظ هذا المتصفح إجاباتك حتى تعود.</p></div></div>
      {run && <div className="notice practice-resume"><Save size={20} /><div><strong>لديك محاولة محفوظة</strong><p>أجبت عن {countText(Object.keys(run.answers).length)} من {countText(run.questionIds.length)} · {modeText(run.mode)}</p></div><button className="btn btn-primary" onClick={() => { setShowRun(true); setSelectedId(null); }}>استئناف المحاولة<ArrowLeft size={17} /></button></div>}
      <div className="form-grid practice-setup"><Field label="عدد الأسئلة"><select value={count} onChange={event => setCount(Number(event.target.value))}><option value={10}>١٠ أسئلة عشوائية · خطوة صغيرة</option><option value={20}>٢٠ سؤالاً عشوائياً · مراجعة أوسع</option><option value={40}>٤٠ سؤالاً · الحزمة كاملة بترتيب الملف</option></select></Field><Field label="طريقة التدريب"><select value={mode} onChange={event => setMode(event.target.value as PracticeRun['mode'])}><option value="practice">تعلّم: أرى التصحيح بعد كل إجابة</option><option value="exam">اختبار ذاتي: أرى التصحيح بعد التسليم</option></select></Field></div>
      <p className="muted">في وضع التعلّم يمكنك تعديل الإجابة بعد مراجعتها. في الاختبار الذاتي تبقى الإجابات قابلة للمراجعة، ويظهر التصحيح بعد التسليم فقط. لا يوجد مؤقّت إلزامي.</p><div><button className="btn btn-primary" onClick={() => requestStart({ count, mode })}><Play size={18} />ابدأ التدريب</button></div>
    </section>}

    {showRun && run && current && grade && <section id="practice-current" className="stack" aria-label="المحاولة التدريبية الحالية">
      <div className="notice"><Save size={18} /><span>إجاباتك والتنقل محفوظان تلقائياً في هذا المتصفح. {modeText(run.mode)}.</span><button className="btn btn-ghost" onClick={() => { setShowRun(false); notify('المحاولة محفوظة؛ يمكنك استئنافها لاحقاً'); }}>حفظ والخروج</button></div>
      <div className="practice-stats"><div><span>عدد الأسئلة</span><strong>{countText(run.questionIds.length)}</strong></div><div><span>أجبت عنها</span><strong>{countText(Object.keys(run.answers).length)}</strong></div><div><span>دون إجابة</span><strong>{countText(grade.skippedIds.length)}</strong></div><div><span>الخطوة الحالية</span><strong>{countText(run.currentIndex + 1)} / {countText(run.questionIds.length)}</strong></div></div>
      <div className="practice-workspace"><div className="card practice-question stack"><div className="practice-question-head"><span className="badge">السؤال {countText(run.currentIndex + 1)} من {countText(run.questionIds.length)}</span><span className="muted">رقم {countText(Number(current.id))} في ملفك</span></div><progress value={Object.keys(run.answers).length} max={run.questionIds.length} aria-label="نسبة الأسئلة المجاب عنها" />
        <fieldset className="practice-question-fieldset"><legend id="practice-question-title" tabIndex={-1}>{current.q}</legend><div className="practice-options">{current.options.map(option => {
          const chosen = run.answers[current.id] === option.letter;
          const feedback = run.mode === 'practice' && Object.hasOwn(run.answers, current.id);
          const correct = feedback && option.letter === current.answer;
          const incorrect = feedback && chosen && option.letter !== current.answer;
          return <label className={`practice-option ${chosen ? 'selected' : ''} ${correct ? 'correct' : ''} ${incorrect ? 'incorrect' : ''}`} key={option.letter}><input type="radio" name={`practice-${run.id}-${current.id}`} value={option.letter} checked={chosen} onChange={() => answer(option.letter)} /><span className="practice-option-letter">{option.letter}</span><span className="practice-option-text">{option.text}</span>{correct && <CheckCircle2 size={18} aria-label="مفتاح الملف الأصلي" />}{incorrect && <XCircle size={18} aria-label="تختلف عن مفتاح الملف" />}</label>;
        })}</div></fieldset>
        {run.mode === 'practice' && Object.hasOwn(run.answers, current.id) && <div className={`practice-feedback ${run.answers[current.id] === current.answer ? 'success' : 'danger'}`} role="status">{run.answers[current.id] === current.answer ? <CheckCircle2 size={20} /> : <BookOpen size={20} />}<div><strong>{run.answers[current.id] === current.answer ? 'إجابتك تطابق مفتاح الملف' : 'راجع هذا المفهوم ثم حاول من جديد'}</strong><p>المفتاح الأصلي: {current.answer} · {current.options.find(option => option.letter === current.answer)?.text}</p></div></div>}
        <div><button className="btn btn-ghost" disabled={!Object.hasOwn(run.answers, current.id)} onClick={() => answer(null)}>مسح إجابتي عن هذا السؤال</button></div><div className="practice-navigation"><button className="btn btn-secondary" disabled={run.currentIndex === 0} onClick={() => jump(run.currentIndex - 1)}><ArrowRight size={18} />السابق</button><button className="btn btn-primary" disabled={run.currentIndex === run.questionIds.length - 1} onClick={() => jump(run.currentIndex + 1)}>التالي<ArrowLeft size={18} /></button></div>
      </div><aside className="card stack"><div><h3>خريطة الأسئلة</h3><p className="muted">اضغط رقماً للعودة إليه. اللون يبيّن وجود إجابة، وليس صحتها.</p></div><div className="practice-palette" aria-label="التنقل بين أسئلة التدريب">{run.questionIds.map((id, index) => <button key={id} className={`${Object.hasOwn(run.answers, id) ? 'answered' : ''} ${index === run.currentIndex ? 'current' : ''}`} aria-label={`الانتقال إلى السؤال ${index + 1}${Object.hasOwn(run.answers, id) ? '، مجاب عنه' : '، دون إجابة'}`} aria-current={index === run.currentIndex ? 'step' : undefined} onClick={() => jump(index)}>{countText(index + 1)}{Object.hasOwn(run.answers, id) && <Check size={11} />}</button>)}</div><button className="btn btn-primary" onClick={requestFinish}><ClipboardCheck size={18} />إنهاء التدريب والتصحيح</button><p className="muted">التسليم يحفظ النتيجة في سجل المحاولات. الأسئلة غير المجابة تُحسب دون درجة.</p></aside></div>
    </section>}

    {selected && <PracticeResults attempt={selected} reviewAll={reviewAll} setReviewAll={setReviewAll} onRetry={questionIds => requestStart({ questionIds, mode: 'practice' })} onNew={() => { setSelectedId(null); setShowRun(false); }} />}
    <section className="card practice-history"><div className="card-heading"><div><h2 className="card-title"><History size={19} />سجل محاولاتك</h2><p className="card-subtitle">{countText(attempts.length)} محاولة مكتملة · لا يغيّر التدريب درجاتك أو حالة اختبار الجامعة.</p></div>{attempts.length > 0 && <button className="btn btn-ghost danger" onClick={() => setClearHistory(true)}><Trash2 size={16} />مسح السجل</button>}</div>
      {attempts.length ? <div className="stack">{attempts.slice(0, historyLimit).map(attempt => <article className="practice-history-item" key={attempt.id}><div><strong>{countText(attempt.score)} / {countText(attempt.total)}</strong><p className="muted">{dateText(attempt.finishedAt)} · {attempt.mode === 'practice' ? 'تعلّم' : 'اختبار ذاتي'}</p></div><button className="btn btn-secondary" onClick={() => review(attempt)}>النتيجة والمراجعة<ArrowLeft size={16} /></button></article>)}{attempts.length > historyLimit && <button className="btn btn-ghost" onClick={() => setHistoryLimit(value => value + 10)}>عرض محاولات أقدم</button>}</div> : <EmptyState icon={History} title="كل محاولة تعلّمك شيئاً" description="بعد إنهاء أول تدريب، ستجد النتيجة وإجاباتك هنا للمراجعة." />}
    </section>
    <details className="practice-source muted"><summary>مصدر الأسئلة ومفتاح التصحيح</summary><p>الحزمة المرفقة: <bdi>{PRACTICE_BANK.source.archive}</bdi> · ملف <bdi>{PRACTICE_BANK.source.path}</bdi>. نُقلت نصوص الأسئلة والخيارات ومفاتيحها كما وردت في الملف. لا توجد شروح مرفقة؛ ارجع إلى محاضراتك عند الشك في إجابة.</p><p>بصمة ملف الأسئلة SHA-256: <bdi>{PRACTICE_BANK.source.sha256}</bdi></p></details>
    {confirmFinish && <Modal title="تسليم المحاولة مع أسئلة غير مجابة؟" onClose={() => setConfirmFinish(false)}><p>بقي {countText(grade?.skippedIds.length ?? 0)} سؤالاً دون إجابة. يمكنك الرجوع لإكمالها، أو تسليمها الآن وحسابها دون درجة.</p><div className="modal-actions"><button className="btn btn-secondary" onClick={() => setConfirmFinish(false)}>العودة للحل</button><button className="btn btn-primary" onClick={finish}>تسليم المحاولة الآن</button></div></Modal>}
    {replaceRun && <Modal title="بدء محاولة جديدة؟" onClose={() => setReplaceRun(null)}><p>لديك محاولة قيد الحل. بدء محاولة جديدة يحذف إجابات المحاولة غير المكتملة فقط. يبقى سجل المحاولات المكتملة.</p><div className="modal-actions"><button className="btn btn-secondary" onClick={() => setReplaceRun(null)}>إبقاء محاولتي</button><button className="btn btn-primary" onClick={() => start(replaceRun)}>بدء محاولة جديدة</button></div></Modal>}
    {clearHistory && <Modal title="مسح سجل المحاولات؟" onClose={() => setClearHistory(false)}><p>سيُحذف سجل نتائج التدريب وإجاباته من هذا المتصفح. صدّر نسخة احتياطية من الإعدادات أولاً إذا أردت الاحتفاظ به. تبقى المحاولة غير المكتملة.</p><div className="modal-actions"><button className="btn btn-secondary" onClick={() => setClearHistory(false)}>إلغاء</button><button className="btn btn-danger" onClick={() => { update(draft => { draft.practiceAttempts = []; }); setSelectedId(null); setClearHistory(false); notify('مُسح سجل التدريب'); }}>مسح السجل</button></div></Modal>}
  </div>;
}

function PracticeResults({ attempt, reviewAll, setReviewAll, onRetry, onNew }: {
  attempt: PracticeAttempt; reviewAll: boolean; setReviewAll: (value: boolean) => void; onRetry: (questionIds: string[]) => void; onNew: () => void;
}) {
  const grade = gradePractice(attempt.questionIds, attempt.answers);
  const missed = attempt.questionIds.filter(id => !grade.correctIds.includes(id));
  const reviewIds = reviewAll ? attempt.questionIds : missed;
  return <section id="practice-results" className="card stack" aria-label="نتيجة التدريب ومراجعة الإجابات"><div className="card-heading"><div><span className="eyebrow">كل محاولة تبني الخطوة التالية</span><h2>نتيجة التدريب</h2><p className="muted">{dateText(attempt.finishedAt)} · التصحيح حسب مفتاح الملف الأصلي</p></div><span className="practice-result-score"><strong>{countText(grade.score)} / {countText(grade.total)}</strong><span>{countText(grade.percent)}٪</span></span></div>
    <div className="practice-stats"><div><span>إجابات مطابقة</span><strong>{countText(grade.score)}</strong></div><div><span>تحتاج مراجعة</span><strong>{countText(grade.wrongIds.length)}</strong></div><div><span>دون إجابة</span><strong>{countText(grade.skippedIds.length)}</strong></div><div><span>عدد الأسئلة</span><strong>{countText(grade.total)}</strong></div></div><p className="notice"><BookOpen size={20} /><span>{missed.length ? 'ابدأ بمراجعة سؤال واحد أخطأت فيه، ارجع لمصدره في المحاضرة، ثم أعد محاولة الأسئلة التي تحتاجها.' : 'أنهيت هذه المجموعة بإجابات تطابق مفتاح الملف. جرّب شرح المفاهيم من ذاكرتك ثم طبّقها على مثال جديد.'} النتيجة تخص التدريب ولا تثبت تغطية المنهج كاملاً.</span></p><div className="practice-actions"><button className="btn btn-primary" disabled={!missed.length} onClick={() => onRetry(missed)}><RotateCcw size={17} />تدريب على أخطائي وغير المجاب ({countText(missed.length)})</button><button className="btn btn-secondary" onClick={onNew}><Play size={17} />اختبار جديد</button></div><div className="card-heading"><h3>مراجعة الإجابات</h3><button className="btn btn-ghost" onClick={() => setReviewAll(!reviewAll)}>{reviewAll ? 'عرض الأخطاء وغير المجاب فقط' : 'عرض جميع الإجابات'}</button></div>
    {reviewIds.length ? <div className="practice-review-list">{reviewIds.map(id => {
      const question = PRACTICE_QUESTION_BY_ID.get(id)!;
      const answer = attempt.answers[id]; const correct = answer === question.answer;
      return <article className={`practice-review-item ${correct ? 'correct' : answer ? 'incorrect' : 'skipped'}`} key={id}><div className="row-between"><span className={`badge ${correct ? 'green' : answer ? 'red' : 'orange'}`}>{correct ? 'مطابقة للمفتاح' : answer ? 'تحتاج مراجعة' : 'لم تُجب'}</span><span className="muted">رقم {countText(Number(id))} في الملف</span></div><h4>{question.q}</h4><p className="muted">إجابتك: {answer ? `${answer} · ${question.options.find(option => option.letter === answer)?.text}` : 'دون إجابة'}</p><p><strong>المفتاح الأصلي:</strong> {question.answer} · {question.options.find(option => option.letter === question.answer)?.text}</p></article>;
    })}</div> : <EmptyState icon={CheckCircle2} title="كل الإجابات تطابق المفتاح" description="اختر عرض جميع الإجابات لمراجعة المجموعة كاملة." />}
  </section>;
}
