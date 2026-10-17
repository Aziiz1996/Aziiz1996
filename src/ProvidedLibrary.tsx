import { PROVIDED_MATERIALS } from './providedMaterials';
import { mergeStudyMaterials } from './studyMaterials';
import { useApp } from './store';

const normalize=(s:string)=>s.replace(/[إأآ]/g,'ا').replace(/\s+/g,' ').trim();
export default function ProvidedLibrary({courseId}:{courseId?:string}) {
 const {data,replace,notify}=useApp();const course=data.courses.find(c=>c.id===courseId);
 const summaries=PROVIDED_MATERIALS.summaries.filter(s=>!courseId || (course && normalize(course.name).includes(normalize(s.courseName))));
 if(!summaries.length)return null;
 function add(){try{const result=mergeStudyMaterials(data,{format:'az-logistics-materials-v1',summaries,quizzes:[]});if(!replace(result.data))throw Error();notify(`أُضيف ${result.summaries} ملخصات؛ بقيت النسخ الموجودة وتعديلاتك محفوظة.`);}catch{notify('تعذرت إضافة نسخ للحساب؛ يمكنك قراءة النصوص المشتركة هنا.');}}
 return <section className="card stack"><h2>الملخصات المشتركة</h2><p>نصوص دراسية متاحة لكل مستخدم مسجل، كما وردت في الملفات المضافة. راجعها مع المحاضرات الأصلية؛ لم تُراجع معلوماتها علميًا.</p><button className="btn btn-secondary" onClick={add}>إضافة نسخة إلى ملاحظاتي</button>{summaries.map(s=><details key={s.id}><summary>{s.title} · {s.courseName}</summary><p className="preserve-lines">{s.content}</p></details>)}</section>;
}
