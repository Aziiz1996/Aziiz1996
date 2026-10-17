import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AudioLines, BookOpen, CheckCircle2, CircleHelp, GraduationCap, Mic, MicOff, Pause, Play, Send, ShieldCheck, Sparkles, Square, Volume2, X } from 'lucide-react';
import { useApp } from './store';
import { Field, SectionHeader } from './ui';
import { LOGISTICS_TERMS } from './logisticsTerms';
import { PRACTICE_BANK, PRACTICE_QUESTIONS } from './practiceBank';
import { TEACHER_NAME, answerTeacher, createTeacherQuiz, gradeTeacherAnswer, type TeacherQuizQuestion, type TeacherReply } from './teacherEngine';

interface VoiceResult { isFinal: boolean; 0: { transcript: string }; }
interface RecognitionResultEvent { resultIndex: number; results: { length: number; [index: number]: VoiceResult }; }
interface RecognitionErrorEvent { error: string; }
interface Recognition {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void; stop: () => void; abort: () => void;
}
type RecognitionConstructor = new () => Recognition;
type VoiceWindow = Window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
interface Message { id: string; role: 'user' | 'assistant'; text: string; reply?: TeacherReply; }
interface QuizState { questions: TeacherQuizQuestion[]; index: number; answers: Record<string, string>; checked: boolean; finished: boolean; mode: 'bank' | 'terms'; }
const number = (value: number) => new Intl.NumberFormat('ar-SA').format(value);
const labels: Record<TeacherReply['kind'], string> = { source: 'من مرجعك', educational: 'شرح تعليمي / استنتاج', refusal: 'حدود التخصص', missing: 'المرجع غير متوفر', schedule: 'من جدولك المحفوظ', news: 'مصادر المستجدات', guide: 'نذاكر خطوة بخطوة' };
const greeting = 'يا هلا بطالب اللوجستيات! معك تيتشر لوجستيك. نراجع ونشرح ونختبر فهمك بهدوء. اختر فكرة من تخصصك أو اسأل عن جدولك؛ خطوة اليوم تصنع غداً أجمل.';

export default function TeacherPage() {
  const { data, navigate } = useApp();
  const [messages, setMessages] = useState<Message[]>([{ id: 'hello', role: 'assistant', text: greeting }]);
  const [query, setQuery] = useState(''); const [voiceStatus, setVoiceStatus] = useState('');
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]); const [voiceId, setVoiceId] = useState('');
  const [rate, setRate] = useState(0.95); const [autoRead, setAutoRead] = useState(false);
  const [speechState, setSpeechState] = useState<'idle' | 'speaking' | 'paused'>('idle');
  const [listening, setListening] = useState(false); const [quiz, setQuiz] = useState<QuizState | null>(null);
  const [quizFeedback, setQuizFeedback] = useState('');
  const recognitionRef = useRef<Recognition | null>(null); const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null); const messagesRef = useRef<HTMLDivElement>(null); const quizRef = useRef<HTMLElement>(null); const mounted = useRef(true);
  const submitRef = useRef<(text: string) => void>(() => undefined);
  const hasSpeech = typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  const VoiceRecognition = typeof window !== 'undefined' ? ((window as VoiceWindow).SpeechRecognition ?? (window as VoiceWindow).webkitSpeechRecognition) : undefined;
  const arabicVoices = voices.filter(voice => /^ar(?:[-_]|$)/i.test(voice.lang));
  const chosenVoice = voices.find(voice => voice.voiceURI === voiceId);
  const courseIds = new Set(data.courses.filter(course => /مخزون|مخازن|مشتريات|عقود|نقل|شحن|أعمال|اعمال|إمداد|امداد|لوجست/.test(course.name)).map(course => course.id));
  const noteCount = data.notes.filter(note => courseIds.has(note.courseId) && note.content.trim()).length;
  const currentQuestion = quiz && !quiz.finished ? quiz.questions[quiz.index] : null;
  const lastAssistant = [...messages].reverse().find(message => message.role === 'assistant');

  useEffect(() => { if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight; }, [messages]);
  useEffect(() => { if (quiz?.questions) { quizRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); quizRef.current?.focus({ preventScroll: true }); } }, [quiz?.questions]);

  useEffect(() => {
    mounted.current = true;
    if (hasSpeech) {
      const refresh = () => {
        const available = window.speechSynthesis.getVoices(); setVoices(available);
        const preferred = available.find(voice => /^ar[-_]SA$/i.test(voice.lang)) ?? available.find(voice => /^ar(?:[-_]|$)/i.test(voice.lang));
        setVoiceId(previous => available.some(voice => voice.voiceURI === previous) ? previous : preferred?.voiceURI ?? '');
      };
      refresh(); window.speechSynthesis.addEventListener('voiceschanged', refresh);
      return () => {
        mounted.current = false; window.speechSynthesis.removeEventListener('voiceschanged', refresh);
        if (utteranceRef.current) { utteranceRef.current.onend = null; utteranceRef.current.onerror = null; }
        window.speechSynthesis.cancel();
        if (recognitionRef.current) { recognitionRef.current.onresult = null; recognitionRef.current.onerror = null; recognitionRef.current.onend = null; recognitionRef.current.abort(); }
      };
    }
    return () => {
      mounted.current = false;
      if (recognitionRef.current) { recognitionRef.current.onresult = null; recognitionRef.current.onerror = null; recognitionRef.current.onend = null; recognitionRef.current.abort(); }
    };
  }, [hasSpeech]);

  function stopSpeech() {
    if (hasSpeech) { if (utteranceRef.current) { utteranceRef.current.onend = null; utteranceRef.current.onerror = null; } window.speechSynthesis.cancel(); }
    utteranceRef.current = null; setSpeechState('idle');
  }
  function stopRecognition() {
    const recognition = recognitionRef.current;
    if (recognition) { recognition.onresult = null; recognition.onerror = null; recognition.onend = null; recognition.abort(); }
    recognitionRef.current = null; setListening(false);
  }
  function speak(text: string) {
    if (!hasSpeech) { setVoiceStatus('القراءة الصوتية غير مدعومة في هذا المتصفح. كل الشرح متاح مكتوباً.'); return; }
    if (recognitionRef.current) stopRecognition();
    stopSpeech();
    const utterance = new SpeechSynthesisUtterance(text.slice(0, 5500));
    utterance.lang = chosenVoice?.lang ?? 'ar-SA'; utterance.rate = rate;
    if (chosenVoice) utterance.voice = chosenVoice;
    utterance.onend = () => { if (mounted.current && utteranceRef.current === utterance) { setSpeechState('idle'); utteranceRef.current = null; } };
    utterance.onerror = event => { if (mounted.current && utteranceRef.current === utterance) { setSpeechState('idle'); setVoiceStatus(event.error === 'not-allowed' ? 'المتصفح منع التشغيل. اضغط زر «استمع» لتبدأ القراءة بنفسك.' : 'تعذّر تشغيل الصوت. جرّب صوتاً عربياً آخر أو تابع الشرح المكتوب.'); } };
    utteranceRef.current = utterance; setSpeechState('speaking');
    setVoiceStatus(chosenVoice ? `القراءة بصوت ${chosenVoice.name} (${chosenVoice.lang})` : 'طلبنا القراءة بالعربية السعودية؛ الصوت الفعلي حسب الأصوات المتاحة على جهازك.');
    window.speechSynthesis.speak(utterance);
  }
  function togglePause() {
    if (!hasSpeech || speechState === 'idle') return;
    if (speechState === 'paused') { window.speechSynthesis.resume(); setSpeechState('speaking'); }
    else { window.speechSynthesis.pause(); setSpeechState('paused'); }
  }
  function append(next: Message[]) { setMessages(previous => [...previous, ...next].slice(-100)); }
  function respond(text: string) {
    const answer = answerTeacher(data, text);
    append([{ id: crypto.randomUUID(), role: 'user', text }, { id: crypto.randomUUID(), role: 'assistant', text: answer.text, reply: answer }]);
    if (autoRead) speak(answer.text);
  }
  function checkQuiz(answer: string) {
    if (!quiz || !currentQuestion || quiz.checked) return;
    const result = gradeTeacherAnswer(currentQuestion, answer); setQuizFeedback(result.feedback);
    if (!result.accepted) return;
    setQuiz({ ...quiz, answers: { ...quiz.answers, [currentQuestion.id]: result.selectedKey! }, checked: true });
    if (autoRead) speak(result.feedback);
  }
  function submit(text: string) {
    const value = text.trim().slice(0, 2000); if (!value) return;
    setQuery('');
    if (currentQuestion && quiz && !quiz.checked) {
      const result = gradeTeacherAnswer(currentQuestion, value);
      if (result.accepted) { checkQuiz(value); return; }
    }
    respond(value);
  }
  submitRef.current = submit;
  function send(event: FormEvent) { event.preventDefault(); submit(query); }
  function startMic() {
    if (listening) { recognitionRef.current?.stop(); setListening(false); return; }
    if (!VoiceRecognition) { setVoiceStatus('الإملاء الصوتي غير مدعوم في هذا المتصفح. اكتب سؤالك؛ ويمكنك استخدام زر الميكروفون في لوحة مفاتيح جوالك.'); return; }
    if (!window.isSecureContext) { setVoiceStatus('الميكروفون يحتاج اتصال HTTPS أو localhost. تقدر تكتب سؤالك الآن.'); return; }
    stopSpeech(); stopRecognition(); if (hasSpeech) setAutoRead(true);
    const recognition = new VoiceRecognition(); recognition.lang = 'ar-SA'; recognition.continuous = false; recognition.interimResults = false;
    recognition.onresult = event => {
      let transcript = '';
      for (let index = event.resultIndex; index < event.results.length; index++) if (event.results[index].isFinal) transcript += ` ${event.results[index][0].transcript}`;
      if (transcript.trim()) { setVoiceStatus(`سمعت: ${transcript.trim().slice(0, 180)}`); submitRef.current(transcript); }
    };
    recognition.onerror = event => {
      if (!mounted.current) return;
      const errors: Record<string, string> = { 'not-allowed': 'إذن الميكروفون مرفوض. فعّله من إعدادات الموقع أو اكتب سؤالك.', 'service-not-allowed': 'خدمة الإملاء محجوبة في المتصفح. الكتابة متاحة.', 'audio-capture': 'ما قدرت أوصل للميكروفون. تأكد أنه متصل وغير مستخدم.', 'no-speech': 'ما التقطت كلاماً. اضغط الميكروفون وجرّب مرة ثانية.', network: 'تعذّر اتصال خدمة الإملاء الخاصة بالمتصفح. تابع بالكتابة.' };
      setListening(false); if (event.error !== 'aborted') setVoiceStatus(errors[event.error] ?? 'تعذّر الإملاء الصوتي. جرّب مرة ثانية أو اكتب سؤالك.');
    };
    recognition.onend = () => { if (mounted.current) setListening(false); };
    recognitionRef.current = recognition;
    try { recognition.start(); setListening(true); setVoiceStatus('أسمعك… اسأل عن المحاضرات أو تخصص اللوجستيات.'); }
    catch { recognitionRef.current = null; setListening(false); setVoiceStatus('تعذّر بدء الميكروفون. اكتب سؤالك أو جرّب بعد منح الإذن.'); }
  }
  function startQuiz(mode: 'bank' | 'terms') {
    const questions = createTeacherQuiz(mode, Date.now(), 5); setQuiz({ questions, index: 0, answers: {}, checked: false, finished: false, mode }); setQuizFeedback('');
    if (autoRead && questions[0]) speak(`${questions[0].question}. ${questions[0].options.map(option => `${option.key}: ${option.text}`).join('. ')}`);
  }
  function nextQuestion() {
    if (!quiz || !quiz.checked) return;
    setQuizFeedback('');
    if (quiz.index + 1 === quiz.questions.length) { setQuiz({ ...quiz, finished: true }); if (autoRead) speak('خلصت التدريب، كفو عليك. راجع نتيجتك والأفكار اللي تحتاج تثبيت.'); }
    else { const next = quiz.questions[quiz.index + 1]; setQuiz({ ...quiz, index: quiz.index + 1, checked: false }); if (autoRead) speak(`${next.question}. ${next.options.map(option => `${option.key}: ${option.text}`).join('. ')}`); }
  }
  const quizScore = quiz?.questions.filter(question => quiz.answers[question.id] === question.answer).length ?? 0;

  return <div className="teacher-page stack">
    <SectionHeader eyebrow="رفيقك في دبلوم اللوجستيات" title={TEACHER_NAME} description="شرح سعودي مبسّط، مراجعة من ملاحظاتك، وتدريب يصحح لك خطوة بخطوة." />
    <section className="teacher-hero"><div><div className="teacher-avatar" aria-hidden="true"><GraduationCap size={32} /></div><span className="eyebrow">أبشر، نبدأ من اللي عندك</span><h2>افهمها بطريقتك، ثم اختبر فهمك.</h2><p>المخزون والمخازن، المشتريات والعقود، النقل والشحن الدولي، مبادئ الأعمال وسلاسل الإمداد. الشرح بأمثلة بسيطة، مع توضيح المرجع والاستنتاج.</p><p className="teacher-scope-note"><ShieldCheck size={17} /> ألتزم بتخصصك. المواعيد من بياناتك، والشرح التعليمي مميز عن نص المحاضرة.</p></div><aside className="teacher-knowledge-grid" aria-label="المعرفة المتاحة للمساعد"><div><strong>{number(noteCount)}</strong><span>ملاحظات محاضرات مرتبطة بموادك</span></div><div><strong>{number(PRACTICE_QUESTIONS.length)}</strong><span>سؤالاً من بنكك المرفق</span></div><div><strong>{number(LOGISTICS_TERMS.length)}</strong><span>مصطلحاً من صورتك</span></div></aside></section>
    {!noteCount && <div className="notice"><BookOpen size={20} /><p>أقدر أشرح أساسيات التخصص الآن. عشان أراجع نفس كلام محاضرك، أضف نصوص محاضراتك واربطها بالمادة في الملاحظات.</p><button className="btn btn-secondary" onClick={() => navigate('notes')}>إضافة محاضرتي</button></div>}
    <div className="teacher-layout">
      <section className="teacher-conversation card stack" aria-label="محادثة تيتشر لوجستيك"><div className="card-heading"><h2><AudioLines size={21} /> خلّنا نذاكر سوا</h2><button className="btn btn-ghost" onClick={() => { stopSpeech(); setMessages([{ id: crypto.randomUUID(), role: 'assistant', text: greeting }]); setQuiz(null); setQuizFeedback(''); }}>محادثة جديدة</button></div>
        <div ref={messagesRef} className="teacher-messages" role="log" aria-label="سجل الشرح المكتوب" aria-live="polite" aria-relevant="additions">{messages.map(message => <article key={message.id} className={`teacher-message teacher-message-${message.role}`}><div className="teacher-message-label"><strong>{message.role === 'user' ? 'أنت' : TEACHER_NAME}</strong>{message.reply && <span className="chip">{labels[message.reply.kind]}</span>}</div><p className="teacher-message-text preserve-lines">{message.text}</p>{message.reply?.sources.length ? <div className="teacher-provenance">{message.reply.sources.map(source => <div className="teacher-source" key={source.id}><BookOpen size={13} /><span>{source.label}</span></div>)}</div> : null}<div className="teacher-message-actions row">{message.role === 'assistant' && <button className="btn btn-ghost" onClick={() => speak(message.text)} disabled={!hasSpeech}><Volume2 size={15} />استمع</button>}{message.reply?.actions.map(action => <button className="btn btn-ghost" key={`${action.page}-${action.label}`} onClick={() => navigate(action.page)}>{action.label}</button>)}</div></article>)}</div>
        <div className="teacher-suggestions" role="group" aria-label="أسئلة مقترحة">{['اشرح نقطة إعادة الطلب', 'وش الفرق بين المخزون والمخازن؟', 'متى اختباراتي القادمة؟', 'كيف أذاكر خطوة بخطوة؟'].map(suggestion => <button className="btn btn-secondary" key={suggestion} onClick={() => submit(suggestion)}>{suggestion}</button>)}</div>
        <form className="teacher-composer stack" onSubmit={send}><Field label={currentQuestion && !quiz?.checked ? 'جاوب على التدريب، أو اسأل عن مفهوم آخر' : 'وش نراجع اليوم؟'}><textarea ref={inputRef} className="input" value={query} maxLength={2000} rows={3} placeholder="مثال: اشرح لي FIFO، أو متى محاضراتي اليوم؟" onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(query); } }} /></Field><div className="row"><button type="submit" className="btn btn-primary" disabled={!query.trim()}><Send size={17} />أرسل</button><button type="button" className={`btn ${listening ? 'btn-danger' : 'btn-secondary'}`} aria-pressed={listening} onClick={startMic}>{listening ? <MicOff size={17} /> : <Mic size={17} />}{listening ? 'أوقف الاستماع' : 'اسأل بصوتك'}</button><span className="field-hint">Enter للإرسال · Shift + Enter لسطر جديد</span></div></form>
        <p className="field-hint">المحادثة مؤقتة وتبقى في هذه الصفحة فقط. البرنامج لا يحفظ تسجيلات صوتية؛ خدمة الإملاء والصوت قد تُعالج لدى مزوّد المتصفح حسب إعدادات جهازك.</p>
      </section>
      <aside className="stack teacher-tools"><section className="card stack teacher-tool-card"><h2><Volume2 size={20} /> اسمع الشرح</h2><p className="muted">اللهجة في الشرح سعودية؛ نبرة الصوت تعتمد على أصوات جهازك.</p><Field label="الصوت العربي"><select className="input" value={voiceId} disabled={!hasSpeech || !arabicVoices.length} onChange={event => { stopSpeech(); setVoiceId(event.target.value); }}><option value="">العربية حسب صوت الجهاز</option>{arabicVoices.map(voice => <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name} · {voice.lang}{/^ar[-_]SA$/i.test(voice.lang) ? ' · سعودي' : ''}</option>)}</select></Field>{hasSpeech && !arabicVoices.length && <p className="field-hint">لم يعرض الجهاز صوتاً عربياً مثبتاً. نجرب لغة ar-SA عند القراءة؛ تقدر تثبّت صوتاً عربياً من إعدادات جهازك.</p>}<Field label={`سرعة القراءة · ${rate.toFixed(2)}`}><input aria-label="سرعة القراءة" type="range" min="0.7" max="1.3" step="0.05" value={rate} onChange={event => setRate(Number(event.target.value))} /></Field><label className="checkbox-label"><input type="checkbox" checked={autoRead} disabled={!hasSpeech} onChange={event => { setAutoRead(event.target.checked); if (event.target.checked) speak('أبشر، من الآن أقرأ لك الردود. تقدر توقف الصوت في أي وقت.'); else stopSpeech(); }} />اقرأ الردود والتدريب تلقائياً</label><div className="teacher-voice-controls row"><button className="btn btn-secondary" disabled={!hasSpeech || !lastAssistant} onClick={() => lastAssistant && speak(lastAssistant.text)}><Play size={16} />آخر رد</button><button className="btn btn-secondary" disabled={speechState === 'idle'} onClick={togglePause}>{speechState === 'paused' ? <Play size={16} /> : <Pause size={16} />}{speechState === 'paused' ? 'استكمال' : 'إيقاف مؤقت'}</button><button className="btn btn-ghost" disabled={speechState === 'idle'} onClick={stopSpeech}><Square size={15} />إيقاف</button></div><p className="teacher-status field-hint" role="status">{voiceStatus || (!hasSpeech ? 'هذا المتصفح لا يدعم القراءة الصوتية؛ الشرح المكتوب يعمل بالكامل.' : !VoiceRecognition ? 'الإملاء غير متاح هنا؛ استخدم الكتابة أو إملاء لوحة المفاتيح على جوالك.' : 'الميكروفون يبدأ بعد ضغطك وإذن المتصفح فقط.')}</p></section>
        <section className="card stack teacher-tool-card"><h2><CircleHelp size={21} /> ثبّت فهمك بالتدريب</h2><p className="muted">٥ أسئلة، سؤال كل مرة. ما نكشف الإجابة إلا بعد محاولتك.</p><button className="btn btn-primary" onClick={() => startQuiz('bank')}><Sparkles size={17} />اختبرني من البنك</button><button className="btn btn-secondary" onClick={() => startQuiz('terms')}><BookOpen size={17} />اختبرني بالمصطلحات</button><p className="field-hint">{PRACTICE_BANK.source.disclaimer}</p></section>
      </aside>
    </div>
    {quiz && <section ref={quizRef} tabIndex={-1} className="teacher-quiz card stack" aria-label="تدريب تيتشر لوجستيك"><div className="card-heading"><div><span className="eyebrow">{quiz.mode === 'bank' ? 'من بنك الاختبارات المرفق' : 'من صورتك اللوجستية'}</span><h2>{quiz.finished ? 'كفو، خلصت التدريب!' : `السؤال ${number(quiz.index + 1)} من ${number(quiz.questions.length)}`}</h2></div><button className="icon-button" aria-label="إغلاق التدريب" onClick={() => { stopSpeech(); setQuiz(null); setQuizFeedback(''); }}><X size={19} /></button></div>{quiz.finished ? <><div className="teacher-quiz-score"><CheckCircle2 size={28} /><strong>{number(quizScore)} / {number(quiz.questions.length)}</strong><p>{quizScore === quiz.questions.length ? 'ممتاز، ثبّت الفهم بمثال من عندك وراجع لاحقاً.' : 'كل محاولة تعلّمك. راجع الأسئلة اللي أخطأت فيها، ثم جرّب مرة ثانية.'}</p></div><div className="stack">{quiz.questions.map(question => <div className="teacher-source" key={question.id}><span>{quiz.answers[question.id] === question.answer ? '✓' : '↺'} {question.question}<br />الإجابة المرجعية: {question.options.find(option => option.key === question.answer)?.text}<br /><small>{question.source.label}</small></span></div>)}</div><div className="row"><button className="btn btn-primary" onClick={() => startQuiz(quiz.mode)}>تدريب جديد</button><button className="btn btn-secondary" onClick={() => navigate(quiz.mode === 'bank' ? 'practice' : 'logistics')}>راجع المرجع</button></div></> : currentQuestion && <><h3>{currentQuestion.question}</h3><div className="row"><button className="btn btn-ghost" disabled={!hasSpeech} onClick={() => speak(`${currentQuestion.question}. ${currentQuestion.options.map(option => `${option.key}: ${option.text}`).join('. ')}`)}><Volume2 size={16} />اسمع السؤال والخيارات</button><button className="btn btn-ghost" onClick={() => { inputRef.current?.focus(); inputRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }}>أكتب الإجابة في المحادثة</button></div><div className="teacher-quiz-options">{currentQuestion.options.map(option => <button className={`teacher-quiz-option btn btn-secondary ${quiz.checked && option.key === currentQuestion.answer ? 'correct' : ''} ${quiz.checked && quiz.answers[currentQuestion.id] === option.key && option.key !== currentQuestion.answer ? 'incorrect' : ''}`} key={option.key} disabled={quiz.checked} onClick={() => checkQuiz(option.key)}><strong>{option.key}</strong><span>{option.text}</span></button>)}</div><p className="field-hint">المصدر: {currentQuestion.source.label}</p>{quizFeedback && <p className="notice" role="status">{quizFeedback}</p>}{quiz.checked && <div className="row"><button className="btn btn-primary" onClick={nextQuestion}>{quiz.index + 1 === quiz.questions.length ? 'عرض النتيجة' : 'السؤال التالي'}</button><button className="btn btn-ghost" onClick={() => navigate(currentQuestion.source.page ?? 'practice')}>افتح المرجع</button></div>}</>}</section>}
    <p className="field-hint">المساعد يعمل محلياً باسترجاع ملاحظاتك وشروحات معدّة للتخصص، ولا يتصل بنموذج ذكاء اصطناعي أو يدخل موقع الجامعة. عند نقص المرجع يوضّح لك ذلك؛ لا يضمن درجة أو يغطي محاضرات لم تضفها.</p>
  </div>;
}
