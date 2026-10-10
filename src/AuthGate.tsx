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
 if (loading) return <main className="auth-screen"><p role="status">جارٍ التحقق من حسابك…</p></main>;
 if (session) return <><div className="account-bar"><span>حساب {session.user.username}</span><button className="btn btn-secondary" disabled={busy} onClick={() => void logout()}>تسجيل الخروج</button>{error && <span role="alert">{error}</span>}</div>{children(session)}</>;
 return <main className="auth-screen"><section className="card stack auth-card"><img src="./leader-icon.png" width={76} height={76} alt="أيقونة عزيز ليدر" /><h1>عزيز ليدر</h1><p>حسابك، محاضراتك، وخطة مذاكرتك في مكان واحد.</p><div className="row"><button className="btn btn-secondary" aria-pressed={mode === 'login'} onClick={() => { setMode('login'); setError(''); }}>تسجيل الدخول</button><button className="btn btn-secondary" aria-pressed={mode === 'register'} onClick={() => { setMode('register'); setError(''); }}>حساب جديد</button></div><form className="stack" onSubmit={submit}><label htmlFor="account-username">البريد الإلكتروني</label><input id="account-username" type="email" required maxLength={254} autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} /><label htmlFor="account-password">كلمة المرور</label><input id="account-password" type="password" required minLength={10} maxLength={128} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} />{mode === 'register' && <><p className="field-hint">استخدم كلمة مرور من ١٠ أحرف على الأقل. كل حساب يبدأ ببيانات مستقلة. التحقق من ملكية البريد واستعادة كلمة المرور غير متاحين في النسخة الحالية.</p><details><summary>إعداد حساب صاحب التطبيق</summary><label htmlFor="owner-key">رمز إعداد صاحب التطبيق</label><input id="owner-key" type="password" autoComplete="off" value={ownerKey} onChange={e => setOwnerKey(e.target.value)} /><p className="field-hint">اتركه فارغاً للحساب العادي. الرمز يُجهّز في الخادم، ولا ترسله في المحادثة.</p></details></>}{error && <p className="notice danger" role="alert">{error}</p>}<button className="btn btn-primary" disabled={busy}>{busy ? 'جارٍ الاتصال…' : mode === 'register' ? 'إنشاء حسابي' : 'الدخول إلى حسابي'}</button></form><a className="btn btn-secondary" href="https://www.snapchat.com/add/azaf.5" target="_blank" rel="noopener noreferrer">تواصل مع عزيز عبر سناب</a><p className="muted">هذا حساب عزيز ليدر، مستقل عن حساب الجامعة. تسجيل الدخول والحفظ يحتاجان اتصالاً بالخادم.</p></section></main>;
}
