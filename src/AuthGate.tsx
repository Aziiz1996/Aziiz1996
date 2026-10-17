import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { AppData } from './types';
import { validateData } from './validation';
import Recovery from './Recovery';
import { disableAcademicReminders } from './reminders';
import { House, LogOut, UserRound } from 'lucide-react';
interface Account { id: string; username: string; owner: boolean; canClaimOwner?:boolean; ownerKeyRequired?:boolean; }
interface Session { user: Account; data: AppData; }
export default function AuthGate({ children }: { children: (session: Session) => ReactNode }) {
 const [session, setSession] = useState<Session | null>(null);
 const [recovering, setRecovering] = useState(false);
 const [loading, setLoading] = useState(true);
 const [mode, setMode] = useState<'login' | 'register'>('login');
 const [ownerKey,setOwnerKey]=useState('');
 const [username, setUsername] = useState('');
 const [password, setPassword] = useState('');
 const [currentPassword, setCurrentPassword] = useState('');
 const [newPassword, setNewPassword] = useState('');
 const [passwordMessage, setPasswordMessage] = useState('');
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState('');
 useEffect(() => {
  const controller = new AbortController();
  fetch('/api/auth/session', { signal: controller.signal, cache: 'no-store' }).then(async response => {
   if (response.status === 401) return;
   if (!response.ok) throw new Error();
   const value = await response.json();
   if (!value.user || !validateData(value.data)) throw new Error();
   setSession(value);
  }).catch(() => { if (!controller.signal.aborted) setError('خادم الحسابات غير متاح. تسجيل الدخول يحتاج تشغيل الخادم واتصالاً بالإنترنت.'); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
  return () => controller.abort();
 }, []);
 async function submit(event: FormEvent) {
  event.preventDefault(); setBusy(true); setError('');
  try {
   const response = await fetch('/api/auth/' + mode, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
   const value = await response.json();
   if (!response.ok) throw new Error(value.error || 'تعذّر تسجيل الدخول.');
   if (!value.user || !validateData(value.data)) throw new Error('استجابة الخادم غير صالحة.');
   setPassword(''); setSession(value);
  } catch (e) { setError(e instanceof Error ? e.message : 'تعذّر الاتصال بالخادم.'); }
  finally { setBusy(false); }
 }
 async function logout() {
  setBusy(true);
  try {
   const response = await fetch('/api/auth/logout', { method: 'POST' });
   if (!response.ok) throw new Error();
   await disableAcademicReminders().catch(() => {});
   setSession(null); setError('');
  } catch { setError('تعذّر تسجيل الخروج. حاول مجدداً.'); }
  finally { setBusy(false); }
 }
 async function changePassword(event: FormEvent) {
  event.preventDefault(); setBusy(true); setPasswordMessage('');
  try {
   const response = await fetch('/api/auth/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword, newPassword }) });
   const value = await response.json();
   if (!response.ok) throw new Error(value.error || 'تعذّر تغيير كلمة المرور.');
   if (!value.user || !validateData(value.data)) throw new Error('استجابة الخادم غير صالحة.');
   setSession(value); setCurrentPassword(''); setNewPassword(''); setPasswordMessage('تم تغيير كلمة المرور.');
  } catch (e) { setPasswordMessage(e instanceof Error ? e.message : 'تعذّر تغيير كلمة المرور.'); }
  finally { setBusy(false); }
 }
 async function claimOwner() {

  setBusy(true); setError('');
  try {
   const response = await fetch('/api/auth/claim-owner', { method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ownerKey}) });
   const value = await response.json();
   if (!response.ok) throw new Error(value.error || 'تعذّر تفعيل حساب الإدارة.');
   if (!value.user || !validateData(value.data)) throw new Error('استجابة الخادم غير صالحة.');
   setSession(value);setOwnerKey('');
  } catch (e) { setError(e instanceof Error ? e.message : 'تعذّر تفعيل حساب الإدارة.'); }
  finally { setBusy(false); }
 }
 if (recovering && !session) return <main className="auth-screen"><section className="card stack auth-card"><Recovery onRecovered={value => { setSession(value); setRecovering(false); }} /><button className="btn btn-secondary" onClick={() => setRecovering(false)}>العودة للدخول</button></section></main>;
 if (loading) return <main className="auth-screen"><p role="status">جارٍ التحقق من حسابك…</p></main>;
 if (session) return <><nav className="account-bar" aria-label="شريط الحساب والتنقل"><button className="btn btn-home" onClick={() => window.dispatchEvent(new Event('az-logistics-home'))}><House size={18} />القائمة الرئيسية</button><span className="account-identity"><UserRound size={18} />{session.user.owner ? 'مدير التطبيق' : 'حساب الطالب'} — {session.user.username}</span>{session.user.canClaimOwner && <details><summary className="btn btn-secondary">تفعيل حساب المالك</summary><form className="stack" onSubmit={e=>{e.preventDefault();void claimOwner();}}>{session.user.ownerKeyRequired&&<label>رمز تفعيل المالك<input type="password" required autoComplete="off" maxLength={512} value={ownerKey} onChange={e=>setOwnerKey(e.target.value)} /></label>}<p>تفعيل هذا الحساب كمدير للتطبيق وفق إعدادات الخادم.</p><button className="btn btn-primary" disabled={busy}>تفعيل الحساب</button></form></details>}<details><summary className="btn btn-secondary">حماية واستعادة الحساب</summary><Recovery authenticated /></details><details><summary className="btn btn-secondary">تغيير كلمة المرور</summary><form className="stack" onSubmit={changePassword}><label htmlFor="current-password">كلمة المرور الحالية</label><input id="current-password" type="password" required autoComplete="current-password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} /><label htmlFor="new-password">كلمة المرور الجديدة</label><input id="new-password" type="password" required minLength={5} maxLength={128} autoComplete="new-password" value={newPassword} onChange={e => setNewPassword(e.target.value)} /><span className="field-hint">٥ خانات على الأقل، بدون شروط للحروف أو الأرقام.</span><button className="btn btn-primary" disabled={busy}>حفظ كلمة المرور</button>{passwordMessage && <span role="status">{passwordMessage}</span>}</form></details><button className="btn btn-logout" disabled={busy} onClick={() => void logout()}><LogOut size={18} />تسجيل الخروج</button>{error && <span role="alert">{error}</span>}</nav>{children(session)}</>;
 return <main className="auth-screen"><section className="card stack auth-card"><img src="./leader-icon.png" width={76} height={76} alt="أيقونة عز اللوجستيات" /><h1>عز اللوجستيات</h1><p>حسابك، محاضراتك، وخطة مذاكرتك في مكان واحد.</p><div className="row"><button className="btn btn-secondary" aria-pressed={mode === 'login'} onClick={() => { setMode('login'); setError(''); }}>تسجيل الدخول</button><button className="btn btn-secondary" aria-pressed={mode === 'register'} onClick={() => { setMode('register'); setError(''); }}>حساب جديد</button></div><form className="stack" onSubmit={submit}><label htmlFor="account-username">البريد الإلكتروني</label><input id="account-username" type="email" required maxLength={254} autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} /><label htmlFor="account-password">كلمة المرور</label><input id="account-password" type="password" required minLength={mode === 'register' ? 5 : 3} maxLength={128} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} />{mode === 'register' && <><p className="notice">نوع الحساب تحدده إعدادات الخادم. إذا كان حسابك مؤهلًا للإدارة، يظهر خيار «تفعيل حساب المالك» بعد الدخول وقد يطلب رمز التفعيل الخاص بالاستضافة.</p><p className="field-hint">كلمة المرور ٥ خانات على الأقل، من غير شروط للحروف الكبيرة أو الصغيرة أو الأرقام. كل حساب يبدأ ببيانات مستقلة.</p></>}{error && <p className="notice danger" role="alert">{error}</p>}<button className="btn btn-primary" disabled={busy}>{busy ? 'جارٍ الاتصال…' : mode === 'register' ? 'إنشاء حسابي' : 'الدخول إلى حسابي'}</button></form><button className="btn btn-secondary" onClick={() => setRecovering(true)}>نسيت كلمة المرور أو البريد الإلكتروني</button><a className="btn btn-secondary" href="https://www.snapchat.com/add/azaf.5" target="_blank" rel="noopener noreferrer">تواصل مع عزيز عبر سناب</a><p className="muted">هذا حساب عز اللوجستيات، مستقل عن حساب الجامعة. تسجيل الدخول والحفظ يحتاجان اتصالاً بالخادم.</p></section></main>;
}
