import { useEffect, useState } from 'react';
import { useAuth } from './auth';

type Topic={group:number;topic:string;week:string};
type Document={group:number;topic:string;document:{filename:string;size:number;updated_at:string}|null};
type Projects={suggestions:Topic[];assignedGroup:number|null;owner:boolean;documents:Document[]};
export default function GroupsPage(){
 const {role}=useAuth();
 const [data,setData]=useState<Projects|null>(null);
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const [username,setUsername]=useState('');
 const [selected,setSelected]=useState(3);
 async function load(){
  try{const r=await fetch('/api/projects',{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw Error('تعذر تحميل المشاريع');setData(await r.json());setError('');}catch(e){setError(e instanceof Error?e.message:'تعذر التحميل');}
 }
 useEffect(()=>{void load();},[]);
 async function upload(group:number,file:File){
  if(!file.name.toLowerCase().endsWith('.pdf')||file.size>5*1024*1024){setError('اختر ملف PDF بحجم 5 ميغابايت أو أقل');return;}
  setBusy(true);setError('');
  try{
   const encoded=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(Error('تعذر قراءة الملف'));reader.readAsDataURL(file);});
   const r=await fetch('/api/projects/'+group+'/file',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({data:encoded})});
   const value=await r.json();if(!r.ok)throw Error(value.error||'تعذر رفع الملف');await load();
  }catch(e){setError(e instanceof Error?e.message:'تعذر رفع الملف');}finally{setBusy(false);}
 }
 async function assign(){
  setBusy(true);setError('');
  try{
   const r=await fetch('/api/projects/assign',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,group:selected})});
   const value=await r.json();if(!r.ok)throw Error(value.error||'تعذر تعيين الطالب');setUsername('');await load();
  }catch(e){setError(e instanceof Error?e.message:'تعذر التعيين');}finally{setBusy(false);}
 }
 return <div className="page-content stack" dir="rtl">
  <header className="stack"><span className="eyebrow">مشاريع الطلاب</span><h1>مقترحات المشاريع ومجموعات الطلاب</h1><p className="muted">العناوين التالية أفكار مقترحة للطلاب وليست مشاريع منشورة أو واجبات معتمدة. ملفات المشاريع خاصة بأعضاء كل مجموعة فقط.</p></header>
  {error&&<p className="notice" role="alert">{error}</p>}
  <section className="card stack"><h2>المواضيع المقترحة</h2>{data?<div className="note-grid">{data.suggestions.map(item=><article className="card stack" key={item.group}><strong>مجموعة {item.group}</strong><p>{item.topic}</p><small>{item.week} — مقترح للطلاب</small></article>)}</div>:<p>جاري تحميل المقترحات...</p>}</section>
  {role==='owner'&&data&&<section className="card stack"><h2>تعيين الطالب في مجموعته</h2><p className="muted">لا يتم منح صلاحية رفع إلا لحساب طالب مسجل وبعد تعيينه من المسؤول.</p><label>اسم مستخدم الطالب المسجل<input value={username} onChange={e=>setUsername(e.target.value)} placeholder="البريد الإلكتروني للحساب" /></label><label>المجموعة<select value={selected} onChange={e=>setSelected(Number(e.target.value))}>{data.suggestions.map(t=><option key={t.group} value={t.group}>مجموعة {t.group}</option>)}</select></label><button className="btn btn-primary" disabled={busy||!username.trim()} onClick={()=>void assign()}>تفعيل صلاحية المجموعة</button></section>}
  <section className="card stack"><h2>مساحة ملفات مجموعتك</h2>
   {!data?<p>جاري التحقق من العضوية...</p>:data.documents.length===0?<p>لم يتم تعيين حسابك في مجموعة بعد. اطلب من المسؤول تفعيل عضويتك.</p>:data.documents.map(item=><article key={item.group} className="card stack"><h3>مجموعة {item.group} — {item.topic}</h3>{item.document?<p><a className="btn btn-secondary" href={'/api/projects/'+item.group+'/file'} target="_blank" rel="noreferrer">فتح مشروع المجموعة PDF</a> · {Math.round(item.document.size/1024)} كيلوبايت</p>:<p>ما فيه ملف مرفوع إلى الآن</p>}<label>رفع أو تحديث مشروع مجموعتك PDF<input type="file" accept=".pdf,application/pdf" disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(file)void upload(item.group,file);e.target.value='';}} /></label></article>)}
  </section>
 </div>;
}
