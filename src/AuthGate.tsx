import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { AppData } from './types';
import { validateData } from './validation';
interface Account { id: string; username: string; owner: boolean; }
interface Session { user: Account; data: AppData; }
export default function AuthGate({ children }: { children: (session: Session) => ReactNode }) {
 const [session, setSession] = useState<Session | null>(null);
 const [loading, setLoading] = useState(true);
 const [mode, setMode] = useState<'login' | 'register'>('login');
 const [username, setUsername] = useState('');
 const [password, setPassword] = useState('');
 const [ownerKey, setOwnerKey] = useState('');
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
   const response = await fetch('/api/auth/' + mode, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password, ownerKey }) });
   const value = await response.json();
   if (!response.ok) throw new Error(value.error || 'تعذّر تسجيل الدخول.');
   if (!value.user || !validateData(value.data)) throw new Error('استجابة الخادم غير صالحة.');
   setPassword(''); setOwnerKey(''); setSession(value);
  } catch (e) { setError(e instanceof Error ? e.message : 'تعذّر الاتصال بالخادم.'); }
  finally { setBusy(false); }
 }
 async function logout() {
  setBusy(true);
  try {
   const response = await fetch('/api/auth/logout', { method: 'POST' });
   if (!response.ok) throw new Error();
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
  if (!window.confirm('هل تريدين جعل هذا الحساب حساب رئيسة تشغيل البرنامج؟ يمكن تفعيل حساب واحد فقط.')) return;
  setBusy(true); setError('');
  try {
   const response = await fetch('/api/auth/claim-owner', { method: 'POST' });
   const value = await response.json();
   if (!response.ok) throw new Error(value.error || 'تعذّر تفعيل حساب الإدارة.');
   if (!value.user || !validateData(value.data)) throw new Error('استجابة الخادم غير صالحة.');
   setSession(value);
  } catch (e) { setError(e instanceof Error ? e.message : 'تعذّر تفعيل حساب الإدارة.'); }
  finally { setBusy(false); }
 }
 if (loading) return <main className="auth-screen"><p role="status">جارٍ التحقق من حسابك…</p></main>;
 if (session) return <><div className="account-bar"><span>{session.user.owner ? 'رئيسة تشغيل البرنامج' : 'حساب الطالب'} — {session.user.username}</span>{!session.user.owner && <button className="btn btn-primary" disabled={busy} onClick={() => void claimOwner()}>تفعيل حساب رئيسة التشغيل</button>}<details><summary className="btn btn-secondary">تغيير كلمة المرور</summary><form className="stack" onSubmit={changePassword}><label htmlFor="current-password">كلمة المرور الحالية</label><input id="current-password" type="password" required autoComplete="current-password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} /><label htmlFor="new-password">كلمة المرور الجديدة</label><input id="new-password" type="password" required minLength={3} maxLength={128} autoComplete="new-password" value={newPassword} onChange={e => setNewPassword(e.target.value)} /><span className="field-hint">٣ خانات على الأقل، بدون شروط للحروف أو الأرقام.</span><button className="btn btn-primary" disabled={busy}>حفظ كلمة المرور</button>{passwordMessage && <span role="status">{passwordMessage}</span>}</form></details><button className="btn btn-secondary" disabled={busy} onClick={() => void logout()}>تسجيل الخروج</button>{error && <span role="alert">{error}</span>}</div>{children(session)}</>;
 return <main className="auth-screen"><section className="card stack auth-card"><img src="./leader-icon.png" width={76} height={76} alt="أيقونة عزيز ليدر" /><h1>عزيز ليدر</h1><p>حسابك، محاضراتك، وخطة مذاكرتك في مكان واحد.</p><div className="row"><button className="btn btn-secondary" aria-pressed={mode === 'login'} onClick={() => { setMode('login'); setError(''); }}>تسجيل الدخول</button><button className="btn btn-secondary" aria-pressed={mode === 'register'} onClick={() => { setMode('register'); setError(''); }}>حساب جديد</button></div><form className="stack" onSubmit={submit}><label htmlFor="account-username">البريد الإلكتروني</label><input id="account-username" type="email" required maxLength={254} autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} /><label htmlFor="account-password">كلمة المرور</label><input id="account-password" type="password" required minLength={3} maxLength={128} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} />{mode === 'register' && <><p className="notice">إذا لم يُنشأ حساب الإدارة بعد، يصبح أول حساب جديد هو حساب «رئيسة تشغيل البرنامج» تلقائياً. احفظي البريد وكلمة المرور في مكان آمن.</p><p className="field-hint">كلمة المرور ٣ خانات على الأقل، من غير شروط للحروف الكبيرة أو الصغيرة أو الأرقام. كل حساب يبدأ ببيانات مستقلة.</p><details><summary>إعداد متقدم برمز الإدارة</summary><label htmlFor="owner-key">رمز إعداد صاحب التطبيق</label><input id="owner-key" type="password" autoComplete="off" value={ownerKey} onChange={e => setOwnerKey(e.target.value)} /><p className="field-hint">اتركيه فارغاً في النسخة العادية. يُستخدم فقط إذا أُضيف رمز خاص في الخادم.</p></details></>}{error && <p className="notice danger" role="alert">{error}</p>}<button className="btn btn-primary" disabled={busy}>{busy ? 'جارٍ الاتصال…' : mode === 'register' ? 'إنشاء حسابي' : 'الدخول إلى حسابي'}</button></form><a className="btn btn-secondary" href="https://www.snapchat.com/add/azaf.5" target="_blank" rel="noopener noreferrer">تواصل مع عزيز عبر سناب</a><p className="muted">هذا حساب عزيز ليدر، مستقل عن حساب الجامعة. تسجيل الدخول والحفظ يحتاجان اتصالاً بالخادم.</p></section></main>;
}
