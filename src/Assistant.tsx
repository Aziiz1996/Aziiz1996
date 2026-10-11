import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Capacitor } from '@capacitor/core';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { Mic, Send, Volume2 } from 'lucide-react';
import { useApp } from './store';
import { SectionHeader } from './ui';
import { formatDate, summarizeText } from './logic';

export default function AssistantPage() {
  const { data, notify } = useApp();
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [listening, setListening] = useState(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; if (Capacitor.isNativePlatform()) { void SpeechRecognition.stop().catch(() => {}); void TextToSpeech.stop().catch(() => {}); } else window.speechSynthesis?.cancel(); }; }, []);
  async function listen() {
    if (!Capacitor.isNativePlatform()) { notify('الإدخال الصوتي متاح في نسخة الآيفون. يمكنك كتابة سؤالك هنا.'); return; }
    try {
      if (!(await SpeechRecognition.available()).available) { notify('التعرف على الصوت غير متاح على هذا الجهاز.'); return; }
      if ((await SpeechRecognition.requestPermissions()).speechRecognition !== 'granted') { notify('اسمح باستخدام الميكروفون والتعرف على الكلام من إعدادات الجهاز.'); return; }
      setListening(true);
      const result = await SpeechRecognition.start({ language: 'ar-SA', maxResults: 1, partialResults: false });
      if (mounted.current && result.matches?.[0]) setQuestion(result.matches[0]);
    } catch { if (mounted.current) notify('تعذّر التقاط الصوت. اكتب سؤالك أو حاول مرة أخرى.'); }
    finally { if (mounted.current) setListening(false); }
  }
  async function speak() {
    try {
      if (Capacitor.isNativePlatform()) await TextToSpeech.speak({ text: answer, lang: 'ar-SA', rate: 0.9 });
      else if ('speechSynthesis' in window) { window.speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(answer); utterance.lang = 'ar-SA'; window.speechSynthesis.speak(utterance); }
      else notify('قراءة الرد صوتياً غير متاحة هنا.');
    } catch { notify('تعذّرت القراءة الصوتية. الرد متاح كنص.'); }
  }
  function ask(event: FormEvent) {
    event.preventDefault();
    const q = question.trim();
    if (!q) return;
    if (/واجب|اختبار|مهام|موعد/.test(q)) {
      const tasks = data.tasks.filter(t => !t.completed).sort((a, b) => a.due.localeCompare(b.due)).slice(0, 5);
      setAnswer(tasks.length ? tasks.map(t => `${t.title}، موعده ${formatDate(t.due)}.`).join('\n') : 'لا توجد مهام غير منجزة محفوظة. أضف مواعيدك من صفحة المهام والاختبارات.');
      return;
    }
    const words = q.split(/\s+/).filter(w => w.length > 2);
    const note = data.notes.find(n => words.some(w => `${n.title} ${n.content}`.includes(w)));
    setAnswer(note ? `من ملاحظتك «${note.title}»:\n${note.summary || summarizeText(note.content)}\n\nهذا مقتطف من النص المحفوظ، راجعه مع الدرس الأصلي.` : 'أستطيع عرض مواعيدك والبحث في ملاحظاتك المحفوظة. أضف نص الدرس واسأل عنه. شرح الأسئلة المفتوحة والمحادثة الذكية يحتاجان ربط خدمة ذكاء اصطناعي؛ هذه الخدمة غير متصلة حالياً.');
  }
  return <div className="page-content">
    <SectionHeader eyebrow="تحدّث بالعربية" title="مساعد عز اللوجستيات" description="اسأل عن مهامك أو ابحث في ملاحظاتك المحفوظة." />
    <p className="notice">هذه نسخة أولية: الردود من بياناتك المحفوظة. خدمة الذكاء الاصطناعي ومنصة الجامعة غير متصلتين. قد يستخدم التعرف الصوتي خدمة آبل؛ يبدأ فقط عندما تضغط زر الميكروفون وتسمح له.</p>
    <form className="card stack" onSubmit={ask}>
      <label htmlFor="assistant-question">سؤالك</label><textarea id="assistant-question" rows={4} value={question} maxLength={4000} onChange={e => setQuestion(e.target.value)} placeholder="مثلاً: ما الواجبات القادمة؟" />
      <div className="row"><button className="btn btn-secondary" type="button" disabled={listening} onClick={() => void listen()}><Mic size={18} />{listening ? 'أستمع إليك…' : 'تحدث بالعربية'}</button>{listening && <button type="button" className="btn btn-secondary" onClick={() => void SpeechRecognition.stop()}>إيقاف الاستماع</button>}<button className="btn btn-primary" disabled={!question.trim() || listening}><Send size={18} />إرسال السؤال</button></div>
    </form>
    {answer && <section className="card stack" aria-live="polite"><h2>الرد</h2><p className="preserve-lines">{answer}</p><button className="btn btn-secondary" onClick={() => void speak()}><Volume2 size={18} />اسمع الرد</button><button className="btn btn-ghost" onClick={() => { if (Capacitor.isNativePlatform()) void TextToSpeech.stop(); else window.speechSynthesis?.cancel(); }}>إيقاف القراءة</button></section>}
  </div>;
}
