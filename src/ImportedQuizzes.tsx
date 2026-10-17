import { useState } from 'react';
import { PROVIDED_MATERIALS } from './providedMaterials';
import { useApp } from './store';
import { gradeImportedQuiz } from './studyMaterials';
import type { ImportedQuiz } from './types';

function QuizAttempt({quiz}:{quiz:ImportedQuiz}) {
 const [answers,setAnswers]=useState<Record<string,number>>({});const [done,setDone]=useState(false);
 const result=gradeImportedQuiz(quiz,answers);
 function submit(){if(result.unanswered&&!window.confirm(`بقي ${result.unanswered} أسئلة دون إجابة. هل تريد إنهاء المحاولة وتصحيحها؟`))return;setDone(true);}
 return <section className="stack"><h2>{quiz.title}</h2><p className="muted">تدريب من الملف الذي أضفته، مع التصحيح بعد التسليم. ليس اختبارًا رسميًا للكلية.</p><strong role="status">تمت الإجابة عن {result.total-result.unanswered} من {result.total}</strong><progress value={result.total-result.unanswered} max={result.total} style={{width:'100%'}} />{quiz.questions.map((q,i)=><fieldset className="card stack" key={q.id}><legend>{i+1}. {q.question}</legend>{q.options.map((option,j)=><label className="row" key={j}><input type="radio" name={`imported-${quiz.id}-${q.id}`} checked={answers[q.id]===j} disabled={done} onChange={()=>setAnswers(old=>({...old,[q.id]:j}))} /><span>{['أ','ب','ج','د','هـ','و','ز','ح'][j]} — {option}</span></label>)}{done&&<p className="notice">{answers[q.id]===q.correct?'إجابة صحيحة.':`الإجابة الصحيحة: ${q.options[q.correct]}`}</p>}</fieldset>)}{done?<section className="card stack" aria-live="polite"><h3>النتيجة: {result.correct} من {result.total} — {result.percent}٪</h3><p>{result.wrong} إجابات خاطئة و{result.unanswered} أسئلة متروكة.</p><button className="btn btn-secondary" onClick={()=>{if(window.confirm('هل تريد بدء محاولة جديدة؟')){setAnswers({});setDone(false);}}}>إعادة الاختبار</button></section>:<button className="btn btn-primary" onClick={submit}>إنهاء الاختبار والتصحيح التلقائي</button>}</section>;
}

export default function ImportedQuizzes() {
 const {data}=useApp();const quizzes=[...new Map([...(data.quizzes??[]),...PROVIDED_MATERIALS.quizzes].map(q=>[q.id,q])).values()];const [selected,setSelected]=useState(quizzes[0]?.id??'');
 const quiz=quizzes.find(q=>q.id===selected)||quizzes[0];
 if(!quiz)return null;
 return <section className="card stack"><h2>الاختبارات المشتركة والمضافة</h2><label>اختر الاختبار<select className="input" value={quiz.id} onChange={e=>setSelected(e.target.value)}>{quizzes.map(q=><option key={q.id} value={q.id}>{q.title} ({q.questions.length} سؤالًا)</option>)}</select></label><QuizAttempt quiz={quiz} key={quiz.id} /></section>;
}
