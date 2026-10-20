import { COURSE_LIBRARY } from './courseLibrary';
import { PROVIDED_MATERIALS } from './providedMaterials';
import { TRANSPORT_QUESTIONS } from './transportQuestions';
import { useApp } from './store';
import { useEffect, useState } from 'react';

const normalize=(s:string)=>s.normalize('NFKC').replace(/[إأآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/[^\p{L}\p{N}]/gu,'');
export default function CourseFiles({courseId}:{courseId?:string}) {
 const {data}=useApp();const course=data.courses.find(c=>c.id===courseId);
 const [ready,setReady]=useState<readonly string[]>([]);
 useEffect(()=>{const controller=new AbortController();fetch('/course-library/manifest.json',{signal:controller.signal,cache:'no-cache'}).then(r=>r.ok?r.json():null).then(value=>setReady(value?.version===1&&Array.isArray(value.files)?value.files.filter((url:unknown):url is string=>typeof url==='string'&&COURSE_LIBRARY.some(f=>f.url===url)):[])).catch(()=>{});return()=>controller.abort();},[]);
 const files=COURSE_LIBRARY.filter(f=>!courseId||(course&&normalize(course.name).includes(normalize(f.course))));
 const groups=[...new Set(files.map(f=>f.course))];
 const summaries=PROVIDED_MATERIALS.summaries;
 if(!files.length)return null;
 return <section className="card stack" aria-label="مكتبة ملفات المحاضرات">
  <div><span className="eyebrow">لكل الحسابات</span><h2>ملفات المحاضرات والمراجع</h2><p className="muted">محاضرات PDF مرتبة حسب المادة، مع التوصيفات وأدلة الكلية. النسخ المكررة غير معروضة. بعض الملفات كبيرة وقد يستغرق فتحها وقتًا.</p></div>
  {files.some(f=>!ready.includes(f.url))&&<p className="notice" role="status">بعض ملفات PDF بانتظار اكتمال الرفع. الملفات المنشورة تظهر بأزرار الفتح والتنزيل؛ تظل الملخصات النصية متاحة.</p>}
  {groups.map(group=><details key={group} open={!!courseId} className="course-file-group"><summary>{group} · {files.filter(f=>f.course===group).length} ملفات</summary><ul className="course-file-list">{files.filter(f=>f.course===group).sort((a,b)=>({lecture:0,syllabus:1,reference:2}[a.kind]-{lecture:0,syllabus:1,reference:2}[b.kind])||a.order-b.order||a.title.localeCompare(b.title,'ar',{numeric:true})).map(f=><li key={f.id}><div><strong>{f.title}</strong><p className="muted">{f.kind==='lecture'?'محاضرة':f.kind==='syllabus'?'توصيف المقرر':'مرجع الكلية'} · {f.pages} صفحة · {(f.bytes/1048576).toFixed(1)} م.ب.</p></div><div className="row">{ready.includes(f.url)?<><a className="btn btn-secondary" href={f.url} target="_blank" rel="noopener noreferrer" aria-label={'فتح '+f.title}>فتح PDF</a><a className="btn btn-ghost" href={f.url} download={f.title+'.pdf'} aria-label={'تنزيل '+f.title}>تنزيل</a></>:<button className="btn btn-secondary" disabled>بانتظار رفع الملف</button>}</div></li>)}</ul></details>)}
 </section>;
}
