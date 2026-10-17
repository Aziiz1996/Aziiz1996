import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Check, CircleHelp, Download, Eye, Layers3, Plane, RotateCcw, Search, Ship, Shuffle, Truck, X, ZoomIn, ZoomOut } from 'lucide-react';
import { EmptyState, Field, Modal, SectionHeader } from './ui';
import { LOGISTICS_CATEGORIES, LOGISTICS_TERMS, createTermQuiz, gradeQuiz, searchTerms, shuffleTerms, type LogisticsCategory, type LogisticsTerm, type TermQuizQuestion } from './logisticsTerms';

const numeral = (value: number) => new Intl.NumberFormat('ar-SA').format(value);
const categoryLabel = (category: LogisticsCategory) => LOGISTICS_CATEGORIES.find(item => item.id === category)?.label ?? '';
const imageUrl = '/logistics-terminology.jpg';
type LearningMode = 'dictionary' | 'cards' | 'quiz';

export default function LogisticsPage() {
  const [mode, setMode] = useState<LearningMode>('dictionary');
  const [query, setQuery] = useState(''); const [category, setCategory] = useState<LogisticsCategory | 'all'>('all');
  const [selectedTerm, setSelectedTerm] = useState<LogisticsTerm | null>(null);
  const [imageOpen, setImageOpen] = useState(false); const [imageZoom, setImageZoom] = useState(false);
  const [cardIndex, setCardIndex] = useState(0); const [revealed, setRevealed] = useState(false); const [shuffleSeed, setShuffleSeed] = useState(0);
  const [reviewIds, setReviewIds] = useState<string[]>([]);
  const [quizSeed, setQuizSeed] = useState(1); const [questions, setQuestions] = useState<TermQuizQuestion[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0); const [answers, setAnswers] = useState<Record<string, string>>({});
  const [checkedAnswers, setCheckedAnswers] = useState<Record<string, boolean>>({}); const [finished, setFinished] = useState(false);
  const filtered = useMemo(() => searchTerms(query, category), [query, category]);
  const deck = useMemo(() => {
    const source = reviewIds.length ? LOGISTICS_TERMS.filter(term => reviewIds.includes(term.id)) : filtered;
    return shuffleSeed ? shuffleTerms(source, shuffleSeed) : source;
  }, [filtered, reviewIds, shuffleSeed]);
  const card = deck[cardIndex] ?? deck[0]; const currentIndex = deck[cardIndex] ? cardIndex : 0;
  const question = questions[questionIndex]; const checked = question ? !!checkedAnswers[question.id] : false;
  const grade = useMemo(() => gradeQuiz(questions, answers), [questions, answers]);
  function resetCard() { setCardIndex(0); setRevealed(false); }
  function changeMode(next: LearningMode) { setMode(next); setReviewIds([]); resetCard(); }
  function startQuiz() {
    const nextSeed = quizSeed + 1; setQuizSeed(nextSeed); setQuestions(createTermQuiz(LOGISTICS_TERMS, 10, nextSeed));
    setQuestionIndex(0); setAnswers({}); setCheckedAnswers({}); setFinished(false);
  }
  function moveCard(step: number) { setCardIndex(Math.max(0, Math.min(deck.length - 1, currentIndex + step))); setRevealed(false); }
  return <div className="logistics-page stack">
    <SectionHeader eyebrow="لغتك في عالم الإمداد" title="دليل اللوجستيات" description="خمسون مصطلحاً من صورتك، في دليل عربي وإنجليزي يساعدك على الفهم والمراجعة." />
    <section className="logistics-hero">
      <div className="logistics-hero-copy">
        <div className="logistics-hero-icons" aria-hidden="true"><Ship size={31} /><Truck size={27} /><Plane size={27} /></div>
        <span className="eyebrow">من المصطلح إلى الفهم</span><h2>افهم لغة تخصصك، خطوة بخطوة.</h2>
        <p>ابحث عن المعنى، غطِّ الإجابة واسترجعها، ثم اختبر نفسك في عشر أسئلة. مصطلحات تدعم دراستك للمخزون والمشتريات والنقل وإدارة الأعمال وسلاسل الإمداد.</p>
        <div className="logistics-card-actions"><button className="btn btn-primary" onClick={() => changeMode('cards')}><Layers3 size={18} /> ابدأ ببطاقات التذكر</button><button className="btn btn-secondary" onClick={() => { setMode('quiz'); if (!questions.length) startQuiz(); }}><CircleHelp size={18} /> اختبر فهمك</button></div>
      </div>
      <figure className="logistics-source-preview"><img src={imageUrl} alt="صورة المصطلحات اللوجستية الأصلية، خمسون اختصاراً ومعناها بالعربية والإنجليزية" width={932} height={1280} loading="lazy" /><figcaption>مرجعك الأصلي · ٥٠ مصطلحاً</figcaption><button className="btn btn-secondary" onClick={() => { setImageOpen(true); setImageZoom(false); }}><ZoomIn size={17} /> عرض الصورة وتكبيرها</button></figure>
    </section>
    <div className="logistics-mode-tabs" role="group" aria-label="طريقة تعلم المصطلحات">
      <button className={mode === 'dictionary' ? 'active' : ''} aria-pressed={mode === 'dictionary'} onClick={() => changeMode('dictionary')}><BookOpen size={16} /> قاموس المصطلحات</button>
      <button className={mode === 'cards' ? 'active' : ''} aria-pressed={mode === 'cards'} onClick={() => changeMode('cards')}><Layers3 size={16} /> بطاقات التذكر</button>
      <button className={mode === 'quiz' ? 'active' : ''} aria-pressed={mode === 'quiz'} onClick={() => changeMode('quiz')}><CircleHelp size={16} /> اختبر نفسك</button>
    </div>
    {mode !== 'quiz' && !reviewIds.length && <section className="card stack" aria-label="البحث وتصنيف المصطلحات">
      <div className="logistics-tools"><div className="logistics-search"><Field label="ابحث بالاختصار أو بالعربية أو الإنجليزية"><input type="search" value={query} placeholder="مثال: WMS، المستودعات، Shipping" onChange={event => { setQuery(event.target.value); resetCard(); }} /></Field></div><span className="logistics-progress" role="status"><Search size={15} /> {numeral(filtered.length)} من {numeral(LOGISTICS_TERMS.length)} مصطلحاً</span>{(query || category !== 'all') && <button className="btn btn-ghost" onClick={() => { setQuery(''); setCategory('all'); resetCard(); }}>مسح التصفية</button>}</div>
      <div className="logistics-categories" role="group" aria-label="تصنيف المصطلحات"><button aria-pressed={category === 'all'} onClick={() => { setCategory('all'); resetCard(); }}>الكل</button>{LOGISTICS_CATEGORIES.map(item => <button key={item.id} aria-pressed={category === item.id} onClick={() => { setCategory(item.id); resetCard(); }}>{item.label}</button>)}</div>
    </section>}
    {mode === 'dictionary' && (filtered.length ? <div className="logistics-term-grid">{filtered.map(term => <button className="logistics-term-card" key={term.id} onClick={() => setSelectedTerm(term)} aria-label={`${term.abbreviation}: ${term.arabic}، عرض التفاصيل`}><span className="logistics-term-abbr" lang="en" dir="ltr">{term.abbreviation}</span><span className="logistics-term-english" lang="en" dir="ltr">{term.english}</span><span className="logistics-term-arabic">{term.arabic}</span><span className="chip">{categoryLabel(term.category)}</span></button>)}</div> : <EmptyState icon={Search} title="لم نجد مصطلحاً مطابقاً" description="جرّب الاختصار أو كلمة من المعنى، أو أزل تصفية التصنيف." action={<button className="btn btn-secondary" onClick={() => { setQuery(''); setCategory('all'); }}>عرض كل المصطلحات</button>} />)}
    {mode === 'cards' && <section className="stack" aria-label="بطاقات التذكر">
      {reviewIds.length > 0 && <div className="notice"><span>هذه المصطلحات تحتاج مراجعة بعد تدريبك. حاول تذكر معناها قبل كشف الإجابة.</span><button className="btn btn-secondary" onClick={() => { setReviewIds([]); resetCard(); }}>كل البطاقات</button></div>}
      {card ? <><div className="card-heading"><h2>استرجع المعنى قبل أن تقرأه</h2><span className="logistics-progress" role="status">البطاقة {numeral(currentIndex + 1)} من {numeral(deck.length)}</span></div><div className="logistics-flashcard">
        <div className="logistics-flashcard-front"><span className="chip">{categoryLabel(card.category)}</span><strong className="logistics-term-abbr" lang="en" dir="ltr">{card.abbreviation}</strong><span className="logistics-term-english" lang="en" dir="ltr">{card.english}</span><p>ما معنى هذا المصطلح بالعربية؟ قل الإجابة لنفسك، ثم تحقق.</p></div>
        {revealed && <div className="logistics-flashcard-answer" role="status"><strong>{card.arabic}</strong>{card.note && <p>{card.note}</p>}</div>}
        <div className="logistics-card-actions"><button className="btn btn-primary" onClick={() => setRevealed(current => !current)} aria-expanded={revealed}><Eye size={17} />{revealed ? 'إخفاء المعنى' : 'إظهار المعنى'}</button></div>
      </div><div className="logistics-card-actions"><button className="btn btn-secondary" onClick={() => moveCard(-1)} disabled={currentIndex === 0}><ArrowRight size={17} /> البطاقة السابقة</button><button className="btn btn-secondary" onClick={() => { setShuffleSeed(seed => seed + 1); resetCard(); }} disabled={deck.length < 2}><Shuffle size={17} /> خلط البطاقات</button><button className="btn btn-primary" onClick={() => moveCard(1)} disabled={currentIndex >= deck.length - 1}>البطاقة التالية <ArrowLeft size={17} /></button></div></> : <EmptyState icon={Layers3} title="لا توجد بطاقات بهذه التصفية" description="أزل التصفية للعودة إلى مصطلحاتك الخمسين." action={<button className="btn btn-secondary" onClick={() => { setQuery(''); setCategory('all'); resetCard(); }}>عرض كل البطاقات</button>} />}
    </section>}
    {mode === 'quiz' && <section className="logistics-quiz">
      {!questions.length ? <><span className="eyebrow">تدرّب ثم ثبّت المعلومة</span><h2>عشر أسئلة من مرجعك</h2><p className="muted">اختر المعنى العربي الصحيح لكل مصطلح. بعد كل إجابة ستعرف المعنى، وفي النهاية تحصل على نتيجتك ومراجعة أخطائك. التدريب من القائمة الكاملة ولا يتأثر بتصفية القاموس.</p><div className="logistics-card-actions"><button className="btn btn-primary" onClick={startQuiz}><CircleHelp size={18} /> ابدأ تدريب ١٠ أسئلة</button></div></> : finished ? <>
        <span className="eyebrow">كل مراجعة تقرّبك</span><h2>نتيجتك {numeral(grade.score)} من {numeral(grade.total)}</h2><p className="muted">{grade.score === grade.total ? 'أحسنت استرجاع هذه المجموعة. جرّب مجموعة أخرى لتوسيع مراجعتك.' : 'راجع المعاني التي التبست عليك، ثم حاول استرجاعها مرة أخرى.'}</p>
        <div className="logistics-card-actions"><button className="btn btn-primary" onClick={startQuiz}><RotateCcw size={17} /> تدريب جديد</button>{grade.review.some(row => !row.correct) && <button className="btn btn-secondary" onClick={() => { setReviewIds(grade.review.filter(row => !row.correct).map(row => row.question.termId)); setMode('cards'); resetCard(); }}><Layers3 size={17} /> راجع أخطائي بالبطاقات</button>}</div>
        <h3>مراجعة الإجابات</h3><ol className="logistics-review-list">{grade.review.map(row => <li key={row.question.id}><strong><bdi>{row.question.abbreviation}</bdi> · <bdi lang="en">{row.question.english}</bdi></strong><p>{row.correct ? <><Check size={15} /> إجابة صحيحة: {row.question.correctAnswer}</> : <><X size={15} /> إجابتك: {row.answer ?? 'لم تُجب'}<br />المعنى الصحيح: {row.question.correctAnswer}</>}</p></li>)}</ol>
      </> : question && <>
        <div className="card-heading"><h2>ما المعنى العربي الصحيح؟</h2><span className="logistics-progress" role="status">السؤال {numeral(questionIndex + 1)} من {numeral(questions.length)}</span></div><progress className="logistics-progress" value={Object.keys(checkedAnswers).length} max={questions.length} aria-label="عدد الأسئلة التي تحققت من إجاباتها" />
        <strong className="logistics-term-abbr" lang="en" dir="ltr">{question.abbreviation}</strong><p className="logistics-term-english" lang="en" dir="ltr">{question.english}</p>
        <fieldset className="logistics-quiz-options"><legend className="sr-only">اختر معنى {question.abbreviation}</legend>{question.options.map(option => { const selected = answers[question.id] === option; const stateClass = checked && option === question.correctAnswer ? ' correct' : checked && selected ? ' incorrect' : selected ? ' selected' : ''; return <label key={option} className={`logistics-quiz-option${stateClass}`}><input type="radio" name={question.id} value={option} checked={selected} disabled={checked} onChange={() => setAnswers(current => ({ ...current, [question.id]: option }))} /><span>{option}</span></label>; })}</fieldset>
        {checked && <div className="notice" role="status">{answers[question.id] === question.correctAnswer ? <><Check size={18} /> صحيح! {question.correctAnswer}</> : <><CircleHelp size={18} /> المعنى الصحيح: {question.correctAnswer}. جرّب تذكره بعد قليل.</>}</div>}
        <div className="logistics-card-actions"><button className="btn btn-secondary" onClick={() => setQuestionIndex(index => index - 1)} disabled={questionIndex === 0}><ArrowRight size={17} /> السؤال السابق</button>{checked ? <button className="btn btn-primary" onClick={() => { if (questionIndex === questions.length - 1) setFinished(true); else setQuestionIndex(index => index + 1); }}>{questionIndex === questions.length - 1 ? 'اعرض النتيجة' : 'السؤال التالي'} <ArrowLeft size={17} /></button> : <button className="btn btn-primary" disabled={!answers[question.id]} onClick={() => setCheckedAnswers(current => ({ ...current, [question.id]: true }))}><Check size={17} /> تحقق من الإجابة</button>}<button className="btn btn-ghost" onClick={startQuiz}><RotateCcw size={17} /> ابدأ من جديد</button></div>
      </>}
    </section>}
    <p className="muted">المعاني من الصورة التي أضفتها. استُبقيت الاختصارات كما وردت، ومنها BOL وBL. راجع مرجع المقرر عند تطبيق المصطلحات في عقد أو مسألة تخصصية.</p>
    {selectedTerm && <Modal title={`المصطلح ${selectedTerm.abbreviation}`} onClose={() => setSelectedTerm(null)}><div className="stack"><span className="chip">{categoryLabel(selectedTerm.category)}</span><strong className="logistics-term-abbr" lang="en" dir="ltr">{selectedTerm.abbreviation}</strong><p className="logistics-term-english" lang="en" dir="ltr">{selectedTerm.english}</p><h3>{selectedTerm.arabic}</h3>{selectedTerm.note && <p className="notice">{selectedTerm.note}</p>}<p className="muted">لتثبيت المعنى: اقرأه، أغلق التفاصيل، ثم اشرحه لنفسك من الذاكرة.</p><button className="btn btn-primary" onClick={() => { const index = deck.findIndex(term => term.id === selectedTerm.id); setCardIndex(index >= 0 ? index : 0); setRevealed(false); setMode('cards'); setSelectedTerm(null); }}><Layers3 size={17} /> راجع هذا المصطلح ببطاقة</button></div></Modal>}
    {imageOpen && <Modal title="صورة المصطلحات الأصلية" onClose={() => setImageOpen(false)}><div className="stack"><p className="muted">كبّر الصورة ثم مرّر داخلها لقراءة التفاصيل، أو نزّل الأصل على جهازك.</p><div className="logistics-card-actions"><button className="btn btn-secondary" aria-pressed={imageZoom} onClick={() => setImageZoom(current => !current)}>{imageZoom ? <ZoomOut size={17} /> : <ZoomIn size={17} />}{imageZoom ? 'ملاءمة العرض' : 'تكبير للقراءة'}</button><a className="btn btn-primary" href={imageUrl} download="logistics-terminology.jpg"><Download size={17} /> تنزيل الصورة الأصلية</a></div><div className="logistics-image-view" tabIndex={0} role="region" aria-label="صورة المصطلحات، قابلة للتمرير عند التكبير"><img src={imageUrl} alt="الأصل: خمسون مصطلحاً لوجستياً مع اختصاراتها ومعانيها باللغتين" width={932} height={1280} style={{ width: imageZoom ? '932px' : '100%', maxWidth: imageZoom ? 'none' : '100%' }} /></div></div></Modal>}
  </div>;
}
