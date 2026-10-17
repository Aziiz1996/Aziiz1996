import { useState } from 'react';
import MaterialImport from './MaterialImport';
import ImportedQuizzes from './ImportedQuizzes';
import AzQuiz from './AzQuiz';
import { SectionHeader } from './ui';
import { LOGISTICS_QUESTIONS } from './logisticsContent';
import InventoryPractice from './InventoryPractice';

export default function PracticePage() {
  const [tab, setTab] = useState<'inventory' | 'library'>('inventory');
  function changeTab(next: 'inventory' | 'library', focus = false) {
    setTab(next);
    if (focus) requestAnimationFrame(() => document.getElementById(`practice-tab-${next}`)?.focus());
  }
  return <div className="page-content stack">
    <div className="logistics-mode-tabs" role="tablist" aria-label="مصادر الاختبارات التدريبية" onKeyDown={event => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); changeTab(tab === 'inventory' ? 'library' : 'inventory', true); }
      else if (event.key === 'Home') { event.preventDefault(); changeTab('inventory', true); }
      else if (event.key === 'End') { event.preventDefault(); changeTab('library', true); }
    }}>
      <button id="practice-tab-inventory" role="tab" aria-controls="practice-panel-inventory" aria-selected={tab === 'inventory'} tabIndex={tab === 'inventory' ? 0 : -1} className={tab === 'inventory' ? 'active' : ''} onClick={() => changeTab('inventory')}>بنك المخزون · ٤٠ سؤالاً</button>
      <button id="practice-tab-library" role="tab" aria-controls="practice-panel-library" aria-selected={tab === 'library'} tabIndex={tab === 'library' ? 0 : -1} className={tab === 'library' ? 'active' : ''} onClick={() => changeTab('library')}>مكتبتي واختباراتي الأخرى</button>
    </div>
    <section id="practice-panel-inventory" role="tabpanel" aria-labelledby="practice-tab-inventory" hidden={tab !== 'inventory'} style={{ display: tab !== 'inventory' ? 'none' : undefined }}><InventoryPractice /></section>
    <section id="practice-panel-library" role="tabpanel" aria-labelledby="practice-tab-library" hidden={tab !== 'library'} style={{ display: tab !== 'library' ? 'none' : undefined }}><ExistingPracticeLibrary /></section>
  </div>;
}

function ExistingPracticeLibrary() {
  const questions = LOGISTICS_QUESTIONS;
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const score = questions.filter((q, i) => answers[i] === q.correct).length;
  return <div className="stack">
    <MaterialImport />
    <ImportedQuizzes />
    <details><summary>اختبار التطبيق العام</summary><AzQuiz /></details>
    <SectionHeader eyebrow="تدرّب خطوة بخطوة" title="اختبارات تجريبية" description="تدريب تمهيدي في سلاسل الإمداد مع تصحيح وتفسير للإجابة." />
    <p className="notice">أسئلة تدريب من المحاضرات الخمس المتاحة في المشروع، مع تفسير للإجابات. ليست اختبارات رسمية للجامعة.</p>
    {questions.map((q, i) => <section className="card stack" key={q.question}><h2>{i + 1}. {q.question}</h2>{q.options.map((option, j) => <label className="row" key={option}><input type="radio" name={`practice-${i}`} checked={answers[i] === j} disabled={submitted} onChange={() => setAnswers(old => ({ ...old, [i]: j }))} />{option}</label>)}{submitted && <p className="notice">{answers[i] === q.correct ? 'إجابة صحيحة.' : `الإجابة الصحيحة: ${q.options[q.correct]}.`} {q.explanation}</p>}</section>)}
    {submitted ? <section className="card stack" aria-live="polite"><h2>نتيجتك: {score} من {questions.length}</h2><button className="btn btn-secondary" onClick={() => { setSubmitted(false); setAnswers({}); }}>إعادة التدريب</button></section> : <button className="btn btn-primary" disabled={Object.keys(answers).length !== questions.length} onClick={() => setSubmitted(true)}>تصحيح الإجابات</button>}
  </div>;
}
