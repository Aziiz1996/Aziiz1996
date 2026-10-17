import { useState } from 'react';
import AzQuiz from './AzQuiz';
import { SectionHeader } from './ui';
import { LOGISTICS_QUESTIONS } from './logisticsContent';

export default function PracticePage() {
  const questions = LOGISTICS_QUESTIONS;
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const score = questions.filter((q, i) => answers[i] === q.correct).length;
  return <div className="page-content stack">
    <AzQuiz />
    <SectionHeader eyebrow="تدرّب خطوة بخطوة" title="اختبارات تجريبية" description="تدريب تمهيدي في سلاسل الإمداد مع تصحيح وتفسير للإجابة." />
    <p className="notice">أسئلة تدريب من المحاضرات الخمس المتاحة في المشروع، مع تفسير للإجابات. ليست اختبارات رسمية للجامعة.</p>
    {questions.map((q, i) => <section className="card stack" key={q.question}><h2>{i + 1}. {q.question}</h2>{q.options.map((option, j) => <label className="row" key={option}><input type="radio" name={`practice-${i}`} checked={answers[i] === j} disabled={submitted} onChange={() => setAnswers(old => ({ ...old, [i]: j }))} />{option}</label>)}{submitted && <p className="notice">{answers[i] === q.correct ? 'إجابة صحيحة.' : `الإجابة الصحيحة: ${q.options[q.correct]}.`} {q.explanation}</p>}</section>)}
    {submitted ? <section className="card stack" aria-live="polite"><h2>نتيجتك: {score} من {questions.length}</h2><button className="btn btn-secondary" onClick={() => { setSubmitted(false); setAnswers({}); }}>إعادة التدريب</button></section> : <button className="btn btn-primary" disabled={Object.keys(answers).length !== questions.length} onClick={() => setSubmitted(true)}>تصحيح الإجابات</button>}
  </div>;
}
