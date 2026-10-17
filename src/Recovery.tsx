import { useState, type FormEvent } from 'react';
import { downloadFile } from './store';
import { validateData } from './validation';
import type { AppData } from './types';

interface RecoveredSession { user: { id:string; username:string; owner:boolean }; data:AppData; }
export default function Recovery({ authenticated = false, onRecovered }: { authenticated?: boolean; onRecovered?: (session:RecoveredSession) => void }) {
 const [currentPassword,setCurrentPassword] = useState('');
 const [recoveryCode,setRecoveryCode] = useState('');
 const [newPassword,setNewPassword] = useState('');
 const [issuedCode,setIssuedCode] = useState('');
 const [message,setMessage] = useState(''); const [busy,setBusy] = useState(false);
 async function submit(event:FormEvent) {
  event.preventDefault();setBusy(true);setMessage('');
  try {
   const response = await fetch('/api/auth/' + (authenticated ? 'recovery-code' : 'recover'), {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(authenticated ? {currentPassword} : {recoveryCode,newPassword})});
   const value = await response.json(); if (!response.ok) throw Error(value.error || 'تعذّر استرداد الحساب.');
   if (authenticated) { setIssuedCode(value.recoveryCode); setCurrentPassword(''); }
   else { if(!value.user || !validateData(value.data)) throw Error('استجابة غير صالحة.'); onRecovered?.(value); }
  } catch(e) { setMessage(e instanceof Error ? e.message : 'تعذّر الاتصال.'); } finally {setBusy(false);}
 }
 return <section className="stack"><h2>{authenticated ? 'رمز استرداد الحساب' : 'استعادة كلمة المرور والبريد'}</h2><p>{authenticated ? 'أنشئ رمزًا واحفظه خارج التطبيق. يتيح الدخول لحسابك عند نسيان البريد أو كلمة المرور، ويُستخدم مرة واحدة. إنشاء رمز جديد يلغي السابق، وتغيير كلمة المرور يلغيه أيضًا.' : 'أدخل رمز الاسترداد الذي حفظته من حسابك، ثم اختر كلمة مرور جديدة. سيظهر بريد حسابك بعد الدخول. إذا لم تحفظ رمزًا مسبقًا، لا يمكن استعادة الحساب بهذه الطريقة.'}</p><form className="stack" onSubmit={submit}>{authenticated ? <label>كلمة المرور الحالية<input className="input" type="password" required autoComplete="current-password" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)} /></label> : <><label>رمز الاسترداد<input className="input" required autoComplete="off" value={recoveryCode} onChange={e=>setRecoveryCode(e.target.value)} /></label><label>كلمة مرور جديدة (٥ خانات على الأقل)<input className="input" type="password" minLength={5} maxLength={128} required autoComplete="new-password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} /></label></>}<button className="btn btn-primary" disabled={busy}>{busy ? 'جارٍ التنفيذ…' : authenticated ? 'إنشاء رمز استرداد جديد' : 'استعادة حسابي'}</button></form>{issuedCode && <div className="notice stack"><strong>احفظ الرمز الآن؛ لن يظهر مرة أخرى بعد إغلاق الصفحة.</strong><code dir="ltr">{issuedCode}</code><button className="btn btn-secondary" onClick={()=>downloadFile('az-logistics-recovery.txt',issuedCode)}>تنزيل رمز الاسترداد</button></div>}{message && <p role="alert">{message}</p>}</section>;
}
