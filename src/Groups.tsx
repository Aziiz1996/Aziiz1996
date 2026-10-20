import { useEffect, useState, type FormEvent } from 'react';
import { Plus, Users, Trash2, Pencil } from 'lucide-react';
import { useApp } from './store';
import { useAuth } from './auth';
import { Field, Modal, SectionHeader } from './ui';
import type { ProjectGroup } from './types';
import { PROJECT_GROUP_CATALOG } from './projectGroupCatalog';

export default function GroupsPage() {
  const { data, update, notify } = useApp();
  const { role } = useAuth();
  const [privateInfo,setPrivateInfo]=useState<{name:string;title:string;leader:string;members:{display_name:string;leader:number}[];document:{filename:string;size:number}|null;owner:boolean}|null>(null);
  const [privateError,setPrivateError]=useState('');
  const [privateBusy,setPrivateBusy]=useState(false);
  const [credentials,setCredentials]=useState<{name:string;username:string;password:string}[]>([]);
  async function loadPrivate(){
   const response=await fetch('/api/group3',{cache:'no-store'});
   if(response.ok)setPrivateInfo(await response.json());
   else setPrivateError(response.status===403?'المشروع خاص بأعضاء مجموعة 3 فقط.':'تعذر تحميل المشروع.');
  }
  useEffect(()=>{void loadPrivate();},[]);
  async function provision(){
   if(!confirm('إنشاء 8 حسابات مستقلة لأعضاء مجموعة 3؟ ستظهر كلمات المرور مرة واحدة فقط، احفظها قبل مغادرة الصفحة.'))return;
   setPrivateBusy(true);try{
    const response=await fetch('/api/group3/provision',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
    const value=await response.json();if(!response.ok)throw new Error(value.error||'تعذر إنشاء الحسابات');
    setCredentials(value.credentials);await loadPrivate();
   }catch(error){notify(error instanceof Error?error.message:'تعذر إنشاء الحسابات');}finally{setPrivateBusy(false);}
  }
  async function uploadPrivate(file:File){
   if(file.type!=='application/pdf'||file.size>5*1024*1024){notify('اختر PDF بحجم لا يزيد عن 5 ميغابايت.');return;}
   setPrivateBusy(true);try{
    const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('تعذر قراءة الملف'));reader.readAsDataURL(file);});
    const response=await fetch('/api/group3/file',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({data})});
    const value=await response.json();if(!response.ok)throw new Error(value.error||'تعذر رفع الملف');
    await loadPrivate();notify('تم حفظ الملف داخل المساحة الخاصة');
   }catch(error){notify(error instanceof Error?error.message:'تعذر رفع الملف');}finally{setPrivateBusy(false);}
  }
  const [editing, setEditing] = useState<ProjectGroup | 'new' | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ProjectGroup | null>(null);
  const [name, setName] = useState('');
  const [members, setMembers] = useState('');
  const [notes, setNotes] = useState('');
  const groups = data.projectGroups ?? [];
  const group = groups.find(g => g.id === selected);
  function edit(value: ProjectGroup | 'new') {
    setEditing(value); setName(value === 'new' ? '' : value.name);
    setMembers(value === 'new' ? '' : value.members.join('\n')); setNotes(value === 'new' ? '' : value.notes);
  }
  function save(event: FormEvent) {
    event.preventDefault(); if (!editing || !name.trim()) return;
    if (members.split('\n').filter(m => m.trim()).length > 9) { notify('سعة المجموعة تسعة أعضاء.'); return; }
    const value: ProjectGroup = { id: editing === 'new' ? crypto.randomUUID() : editing.id, name: name.trim(), members: members.split('\n').map(m => m.trim()).filter(Boolean), notes: notes.trim() };
    update(d => { d.projectGroups ??= []; const index = d.projectGroups.findIndex(g => g.id === value.id); if (index < 0) d.projectGroups.push(value); else d.projectGroups[index] = value; });
    setEditing(null); notify('حُفظت مجموعة المشروع');
  }
  return <div className="page-content stack">
    <SectionHeader eyebrow="رتّب العمل الجماعي" title="مجموعات المشاريع" description="مساحة مستقلة لكل مجموعة: أسماء الأعضاء وملاحظات المشروع." action={<button className="btn btn-primary" onClick={() => edit('new')}><Plus size={18} />إضافة مجموعة</button>} />
    <section className="card stack">
      <h2>مجموعة 3 — الطاقة النظيفة في النقل والتوزيع</h2>
      <p>قائدة المجموعة: هدى وحيد أمين. الملف والمشاركة خاصان بالأعضاء المصرح لهم فقط.</p>
      {privateInfo ? <div className="stack">
        <p>الأعضاء: {privateInfo.members.length+1} من ٩ (يشمل حساب المالك)</p>
        {privateInfo.members.length>0&&<ul>{privateInfo.members.map(m=><li key={m.display_name}>{m.display_name}{m.leader?' — قائدة المجموعة':''}</li>)}</ul>}
        {privateInfo.document?<a className="btn btn-primary" href="/api/group3/file" target="_blank" rel="noreferrer">فتح ملف المشروع المحمي</a>:<p>ملف المشروع لم يُرفع بعد.</p>}
        {role==='owner'&&<div className="stack">
          {!privateInfo.members.length&&<button className="btn btn-primary" disabled={privateBusy} onClick={provision}>إنشاء حسابات أعضاء المجموعة الثمانية</button>}
          <label>رفع عرض المشروع PDF (للمالك فقط) <input type="file" accept="application/pdf" disabled={privateBusy} onChange={e=>{const file=e.target.files?.[0];if(file)void uploadPrivate(file);e.target.value='';}} /></label>
          {credentials.length>0&&<div className="stack"><strong>بيانات الدخول المؤقتة — انسخها الآن، لن تظهر مرة ثانية</strong>
            <textarea readOnly rows={10} value={credentials.map(c=>c.name+' | '+c.username+' | '+c.password).join('\\n')}/>
            <button className="btn btn-secondary" onClick={()=>navigator.clipboard.writeText(credentials.map(c=>c.name+' | '+c.username+' | '+c.password).join('\\n'))}>نسخ بيانات الحسابات</button>
          </div>}
        </div>}
      </div>:<p>{privateError||'جاري التحقق من صلاحية الدخول...'}</p>}
    </section>
    <section className="stack">
      <h2>توزيع مجموعات إدارة المخزون والمخازن</h2>
      <p>١١ مجموعة حسب جدول توزيع الطلاب. المجموعة ٤ غير مدرجة في المصدر. عرض الأسماء هنا لا يمنح صلاحية فتح ملف مجموعة ٣ الخاص.</p>
      <div className="note-grid">{PROJECT_GROUP_CATALOG.map(item=><article className="card stack" key={item.group}>
        <h3>مجموعة {item.group}</h3>
        <p><strong>{item.topic}</strong></p><p>{item.week} — {item.members.length} أعضاء</p>
        <details><summary>عرض أسماء الأعضاء</summary><ul>{item.members.map(member=><li key={member}>{member}</li>)}</ul></details>
      </article>)}</div>
    </section>
    <p className="notice">المجموعات محفوظة على جهازك. دعوة الأعضاء والمحادثة والمزامنة بينهم غير متاحة في هذه النسخة.</p>
    {!groups.length && <section className="card stack"><Users size={32} /><h2>أضف أول مجموعة مشروع</h2><p>يمكنك إنشاء أكثر من مجموعة وفتح تفاصيل كل واحدة.</p></section>}
    <div className="note-grid">{groups.map(g => <article className="card stack" key={g.id}><Users size={24} /><h2>{g.name}</h2><p>{g.members.length} من ٩ أعضاء</p><button className="btn btn-primary" onClick={() => setSelected(g.id)}>فتح المجموعة</button><div className="row"><button className="btn btn-secondary" onClick={() => edit(g)}><Pencil size={16} />تعديل</button><button className="btn btn-ghost danger" onClick={() => setDeleting(g)}><Trash2 size={16} />حذف</button></div></article>)}</div>
    {group && <Modal title={group.name} onClose={() => setSelected(null)}><div className="stack"><h3>الأعضاء</h3>{group.members.length ? <ul>{group.members.map((m, i) => <li key={i}>{m}</li>)}</ul> : <p>لم تضف أعضاء بعد.</p>}<h3>ملاحظات المشروع</h3><p className="preserve-lines">{group.notes || 'لا توجد ملاحظات بعد.'}</p><button className="btn btn-secondary" onClick={() => { setSelected(null); edit(group); }}>تعديل المجموعة</button></div></Modal>}
    {editing && <Modal title={editing === 'new' ? 'مجموعة جديدة' : 'تعديل المجموعة'} onClose={() => setEditing(null)}><form className="stack" onSubmit={save}><Field label="اسم المجموعة"><input required maxLength={160} value={name} onChange={e => setName(e.target.value)} /></Field><Field label="الأعضاء، حتى تسعة أسماء، اسم في كل سطر"><textarea rows={5} maxLength={10000} value={members} onChange={e => setMembers(e.target.value)} /></Field><Field label="ملاحظات المشروع"><textarea rows={5} maxLength={200000} value={notes} onChange={e => setNotes(e.target.value)} /></Field><button className="btn btn-primary">حفظ المجموعة</button></form></Modal>}
    {deleting && <Modal title="حذف المجموعة؟" onClose={() => setDeleting(null)}><p>سيُحذف اسم المجموعة وأعضاؤها وملاحظاتها.</p><button className="btn btn-danger" onClick={() => { update(d => { d.projectGroups = (d.projectGroups ?? []).filter(g => g.id !== deleting.id); }); setDeleting(null); notify('حُذفت المجموعة'); }}>حذف المجموعة</button></Modal>}
  </div>;
}
