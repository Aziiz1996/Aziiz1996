import { useEffect, useState } from 'react';
import { SectionHeader } from './ui';
import { LOGISTICS_QUESTIONS } from './logisticsContent';

const defaultQuestions = [
  { question: 'ما المقصود بمدة التوريد؟', options: ['الوقت بين طلب البضاعة واستلامها', 'عدد وحدات المخزون', 'سعر بيع المنتج'], correct: 0, explanation: 'مدة التوريد هي الزمن من إصدار الطلب إلى استلامه، وتؤثر في توقيت إعادة الطلب.' },
  { question: 'ما الهدف الأساسي من مخزون الأمان؟', options: ['زيادة أسعار البيع', 'تقليل أثر تقلب الطلب وتأخر التوريد', 'إلغاء متابعة المخزون'], correct: 1, explanation: 'مخزون الأمان يساعد على مواجهة عدم اليقين في الطلب والتوريد، لكنه يضيف تكلفة احتفاظ.' },
  { question: 'ماذا يعني أسلوب FIFO في حركة المخزون؟', options: ['صرف الوحدات الأعلى سعراً أولاً', 'صرف أحدث الوحدات أولاً', 'صرف الوحدات الأقدم دخولاً أولاً'], correct: 2, explanation: 'الوارد أولاً يصرف أولاً؛ يساعد هذا الأسلوب على تقليل بقاء الوحدات القديمة.' },
];

export default function PracticePage() {
  const [questions, setQuestions] = useState([...LOGISTICS_QUESTIONS]);
  const [fromLessons, setFromLessons] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    fetch('./personal-lessons/index.json', { signal: controller.signal }).then(async response => {
      if (!response.ok) return;
      const value = await response.json();
      if (!Array.isArray(value.lessons)) return;
      const items = value.lessons.flatMap((l: { questions?: typeof defaultQuestions }) => l.questions ?? []);
      if (items.length) { setQuestions(items); setFromLessons(true); }
    }).catch(() => {});
    return () => controller.abort();
  }, []);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const score = questions.filter((q, i) => answers[i] === q.correct).length;
  return <div className="page-content stack">
    <SectionHeader eyebrow="تدرّب خطوة بخطوة" title="اختبارات تجريبية" description="تدريب تمهيدي في سلاسل الإمداد مع تصحيح وتفسير للإجابة." />
    <p className="notice">{fromLessons ? 'هذه أسئلة تدريب أُعدّت من محاضراتك الخمس في إدارة المخزون والمخازن، مع تفسير ومراجع للصفحات. ليست اختبارات رسمية للجامعة.' : 'هذه أسئلة عامة للتدريب، وليست أسئلة من مقرراتك أو اختبارات الجامعة. نخصصها لدروسك بعد وصول ملفاتها.'}</p>
    {questions.map((q, i) => <section className="card stack" key={q.question}><h2>{i + 1}. {q.question}</h2>{q.options.map((option, j) => <label className="row" key={option}><input type="radio" name={`practice-${i}`} checked={answers[i] === j} disabled={submitted} onChange={() => setAnswers(old => ({ ...old, [i]: j }))} />{option}</label>)}{submitted && <p className="notice">{answers[i] === q.correct ? 'إجابة صحيحة.' : `الإجابة الصحيحة: ${q.options[q.correct]}.`} {q.explanation}</p>}</section>)}
    {submitted ? <section className="card stack" aria-live="polite"><h2>نتيجتك: {score} من {questions.length}</h2><button className="btn btn-secondary" onClick={() => { setSubmitted(false); setAnswers({}); }}>إعادة التدريب</button></section> : <button className="btn btn-primary" disabled={Object.keys(answers).length !== questions.length} onClick={() => setSubmitted(true)}>تصحيح الإجابات</button>}
  </div>;
}
