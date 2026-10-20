import { useState } from 'react';
import MaterialImport from './MaterialImport';
import ImportedQuizzes from './ImportedQuizzes';
import AzQuiz from './AzQuiz';
import { SectionHeader } from './ui';
import { LOGISTICS_QUESTIONS } from './logisticsContent';
import InventoryPractice from './InventoryPractice';
import { shuffledTransportQuestions } from './transportQuestions';

export default function PracticePage() {
  const [tab, setTab] = useState<'inventory' | 'transport' | 'library'>('transport');
  function changeTab(next: 'inventory' | 'transport' | 'library', focus = false) {
    setTab(next);
    if (focus) requestAnimationFrame(() => document.getElementById(`practice-tab-${next}`)?.focus());
  }
  return <div className="page-content stack">
    <div className="logistics-mode-tabs" role="tablist" aria-label="مصادر الاختبارات التدريبية" onKeyDown={event => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); changeTab(tab === 'inventory' ? 'transport' : tab === 'transport' ? 'library' : 'inventory', true); }
      else if (event.key === 'Home') { event.preventDefault(); changeTab('inventory', true); }
      else if (event.key === 'End') { event.preventDefault(); changeTab('library', true); }
    }}>
      <button id="practice-tab-inventory" role="tab" aria-controls="practice-panel-inventory" aria-selected={tab === 'inventory'} tabIndex={tab === 'inventory' ? 0 : -1} className={tab === 'inventory' ? 'active' : ''} onClick={() => changeTab('inventory')}>بنك المخزون · ٤٠ سؤالاً</button>
      <button id="practice-tab-transport" role="tab" aria-controls="practice-panel-transport" aria-selected={tab === 'transport'} tabIndex={tab === 'transport' ? 0 : -1} className={tab === 'transport' ? 'active' : ''} onClick={() => changeTab('transport')}>النقل والشحن الدولي · ٥٠ سؤالاً</button>
      <button id="practice-tab-library" role="tab" aria-controls="practice-panel-library" aria-selected={tab === 'library'} tabIndex={tab === 'library' ? 0 : -1} className={tab === 'library' ? 'active' : ''} onClick={() => changeTab('library')}>مكتبتي واختباراتي الأخرى</button>
    </div>
    <section id="practice-panel-inventory" role="tabpanel" aria-labelledby="practice-tab-inventory" hidden={tab !== 'inventory'} style={{ display: tab !== 'inventory' ? 'none' : undefined }}><InventoryPractice /></section>
    <section id="practice-panel-transport" role="tabpanel" aria-labelledby="practice-tab-transport" hidden={tab !== 'transport'} style={{ display: tab !== 'transport' ? 'none' : undefined }}><TransportPractice /></section>
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

function TransportPractice() {
 const [questions,setQuestions]=useState(shuffledTransportQuestions);
 const [answers,setAnswers]=useState<Record<number,number>>({});
 const [submitted,setSubmitted]=useState(false);
 const score=questions.filter((q,i)=>answers[i]===q.correct).length;
 return <div className="stack">
 <SectionHeader eyebrow="إدارة النقل والشحن الدولي | دار 104" title="اختبار النقل والشحن الدولي" description="٥٠ سؤال اختيارات تدريبية مع تصحيح وتفسير بعد التسليم. ليست أسئلة رسمية." />
 <p className="notice">جاوب على جميع الأسئلة ثم اضغط تسليم. يتغير ترتيب الأسئلة والخيارات عند الإعادة.</p>
 {questions.map((q,i)=><section className="card stack" key={i}><h2>{i+1}. {q.question}</h2>{q.options.map((option,j)=><label className="row" key={j}><input type="radio" name={`transport-${i}`} checked={answers[i]===j} disabled={submitted} onChange={()=>setAnswers(old=>({...old,[i]:j}))}/>{['أ','ب','ج','د'][j]} - {option}</label>)}{submitted&&<p className="notice">{answers[i]===q.correct?'إجابة صحيحة':`الإجابة الصحيحة: ${q.options[q.correct]}`}. {q.explanation}</p>}</section>)}
 {submitted?<section className="card stack" aria-live="polite"><h2>نتيجتك: {score} من {questions.length}</h2><button className="btn btn-primary" onClick={()=>{setQuestions(shuffledTransportQuestions());setAnswers({});setSubmitted(false)}}>اختبار جديد بترتيب مختلف</button></section>:<button className="btn btn-primary" disabled={Object.keys(answers).length!==questions.length} onClick={()=>setSubmitted(true)}>تسليم الاختبار والتصحيح</button>}
 </div>;
}
