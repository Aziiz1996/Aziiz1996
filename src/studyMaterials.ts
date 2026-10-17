import type { AppData, ImportedQuiz } from './types.ts';
import { validateData, validImportedQuiz } from './validation.ts';

export interface ProvidedSummary { id:string; title:string; courseName:string; content:string; sourceName?:string; }
export interface MaterialBundle { format:'az-logistics-materials-v1'; summaries:ProvidedSummary[]; quizzes:ImportedQuiz[]; }
const object=(v:unknown):v is Record<string,unknown>=>!!v && typeof v==='object'&&!Array.isArray(v);
const text=(v:unknown,max=200000)=>typeof v==='string'&&!!v.trim()&&v.length<=max;
const normalize=(s:string)=>s.normalize('NFKC').replace(/[إأآ]/g,'ا').replace(/[\u064B-\u065Fـ]/g,'').replace(/\s+/g,' ').trim();


export function parseMaterialBundle(raw:string):MaterialBundle {
 if(raw.length>2_000_000)throw Error('حزمة الملفات أكبر من الحد المسموح.');
 const v:unknown=JSON.parse(raw);
 if(!object(v)||v.format!=='az-logistics-materials-v1'||!Array.isArray(v.summaries)||v.summaries.length>50||!Array.isArray(v.quizzes)||v.quizzes.length>20||(!v.summaries.length&&!v.quizzes.length))throw Error('اختر حزمة ملخصات واختبارات صالحة للبرنامج.');
 if(!v.summaries.every(s=>object(s)&&text(s.id,149)&&text(s.title,200)&&text(s.courseName,200)&&text(s.content)&&(s.sourceName===undefined||text(s.sourceName,300)))||!v.quizzes.every(validImportedQuiz))throw Error('محتوى الحزمة غير صالح؛ لم تُستورد أي بيانات.');
 return v as unknown as MaterialBundle;
}

export function mergeStudyMaterials(data:AppData,bundle:MaterialBundle) {
 // Validate even for programmatic callers, before modifying the existing data.
 const safe=parseMaterialBundle(JSON.stringify(bundle)); const next=structuredClone(data);
 let summaries=0,quizzes=0,skipped=0;
 for(const s of safe.summaries) {
  if(next.notes.some(n=>n.id===s.id)){skipped++;continue;}
  const target=normalize(s.courseName);
  const candidates=next.courses.filter(c=>normalize(c.name).includes(target));
  let course=candidates.find(c=>c.id.startsWith('moodle-course-'))||candidates[0];
  if(!course){const base='summary-course-'+s.id.slice(0,100);let id=base,suffix=0;while(next.courses.some(c=>c.id===id))id=base+'-'+(++suffix);course={id,name:s.courseName,color:'#7567dd'};next.courses.push(course);}
  next.notes.push({id:s.id,title:s.title,courseId:course.id,content:s.content,summary:'',updatedAt:new Date().toISOString()});summaries++;
 }
 next.quizzes??=[];
 for(const q of safe.quizzes){if(next.quizzes.some(existing=>existing.id===q.id)){skipped++;continue;}next.quizzes.push(q);quizzes++;}
 if(!validateData(next))throw Error('تجاوزت الحزمة حدود البيانات أو لم تتوافق معها. لم تتغير بياناتك.');
 return {data:next,summaries,quizzes,skipped};
}

export function gradeImportedQuiz(quiz:ImportedQuiz,answers:Record<string,number>) {
 if(!validImportedQuiz(quiz))throw Error('اختبار غير صالح.');
 const correct=quiz.questions.filter(q=>answers[q.id]===q.correct).length;
 const answered=quiz.questions.filter(q=>Number.isInteger(answers[q.id])&&answers[q.id]>=0&&answers[q.id]<q.options.length).length;
 return {correct,total:quiz.questions.length,unanswered:quiz.questions.length-answered,wrong:answered-correct,percent:Math.round(correct/quiz.questions.length*100)};
}
