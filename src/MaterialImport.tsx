import { useState } from 'react';
import { Upload } from 'lucide-react';
import { useApp } from './store';
import { mergeStudyMaterials, parseMaterialBundle } from './studyMaterials';

export default function MaterialImport() {
 const {data,replace}=useApp();const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
 async function read(file?:File) {
  if(!file)return;setBusy(true);setMessage('');
  try{
   if(file.size>2_000_000)throw Error('حجم الحزمة يتجاوز ٢ ميجابايت.');
   const result=mergeStudyMaterials(data,parseMaterialBundle(await file.text()));
   if(!replace(result.data))throw Error('لم تقبل البيانات.');
   setMessage(`أُضيف ${result.summaries} ملخصات و${result.quizzes} اختبارات إلى حسابك. تم تخطي ${result.skipped} عناصر موجودة مسبقًا دون استبدالها. تحقق من مؤشر الحفظ أعلى الصفحة قبل الخروج.`);
  }catch(e){setMessage(e instanceof Error?e.message:'تعذر استيراد الحزمة.');}finally{setBusy(false);}
 }
 return <section className="card stack"><h2>إضافة ملخصاتك واختباراتك</h2><p>اختر حزمة المواد المجهزة للبرنامج بصيغة JSON. ستضاف ملخصات الحزمة إلى موادها المناسبة واختباراتها إلى صفحة التدريب في حسابك، وتبقى ملاحظاتك الحالية محفوظة. ملفات Word وHTML الأصلية تحتاج تجهيزًا قبل استيرادها.</p><label className="btn btn-secondary"><Upload size={18} />{busy?'جارٍ الاستيراد…':'رفع حزمة الملخصات والاختبارات'}<input type="file" accept="application/json,.json" disabled={busy} onChange={e=>{void read(e.target.files?.[0]);e.target.value='';}} /></label>{message&&<p className="notice" role="status">{message}</p>}</section>;
}
