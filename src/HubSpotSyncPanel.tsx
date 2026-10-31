import { useCallback, useEffect, useState } from 'react';
import { Check, RefreshCw, Users } from 'lucide-react';

type SyncStatus = { configured: boolean; pending: number; syncing: number; synced: number; failed: number; skipped: number };

async function request(path: string, method: 'GET' | 'POST' = 'GET') {
  const response = await fetch(path, { method, cache: 'no-store', headers: method === 'POST' ? { 'Content-Type': 'application/json' } : {}, body: method === 'POST' ? '{}' : undefined });
  const value = await response.json();
  if (!response.ok) throw Error(value.error || 'تعذر قراءة حالة HubSpot.');
  return value;
}

export default function HubSpotSyncPanel() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    try { setStatus(await request('/api/owner/hubspot/status')); setError(''); }
    catch (issue) { setError(issue instanceof Error ? issue.message : 'تعذر قراءة حالة HubSpot.'); }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 5000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  async function backfill() {
    setBusy(true); setError(''); setMessage('');
    try {
      const value = await request('/api/owner/hubspot/backfill', 'POST');
      setMessage(`بدأت مزامنة ${value.queued} حسابًا. ستظهر الأعداد هنا عند اكتمال الإرسال.`);
      await refresh();
    } catch (issue) { setError(issue instanceof Error ? issue.message : 'تعذر بدء المزامنة.'); }
    finally { setBusy(false); }
  }

  return <section className="card stack">
    <div className="card-heading"><div><span className="eyebrow">إدارة الاتصالات</span><h2><Users size={19} /> ربط HubSpot</h2><p className="muted">تُزامن الأسماء والبريد وأرقام الجوال فقط؛ تُرسل الحسابات الجديدة بعد موافقة صاحبها في نموذج التسجيل.</p></div></div>
    {!status?.configured && <p className="field-hint">أضف HUBSPOT_ACCESS_TOKEN في إعدادات Environment لخدمة Abdualaziz على Render. أنشئ مفتاحًا خاصًا بصلاحية كتابة جهات الاتصال، واحفظه في Render دون إرساله في المحادثة.</p>}
    {status?.configured && <div className="owner-data-summary"><span>{status.pending} بانتظار الإرسال</span><span>{status.syncing} جارٍ</span><span>{status.synced} مكتمل</span><span>{status.failed} تعذّر</span><span>{status.skipped} مستبعد</span></div>}
    {message && <p role="status">{message}</p>}{error && <p className="notice danger" role="alert">{error}</p>}
    <button className="btn btn-primary" type="button" disabled={busy || !status?.configured} onClick={() => void backfill()}><RefreshCw size={17} />{busy ? 'جارٍ تجهيز المزامنة…' : 'مزامنة الحسابات الحالية'}</button>
    <p className="muted">المزامنة تستخدم البريد لتحديث جهة الاتصال المطابقة أو إنشاء جهة جديدة. لا تتضمن كلمات المرور أو ملفات الدراسة.</p>
    {(status?.synced ?? 0) > 0 && <span className="field-hint"><Check size={15} /> تمت مزامنة حسابات إلى HubSpot.</span>}
  </section>;
}

