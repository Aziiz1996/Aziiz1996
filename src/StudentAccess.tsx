import { useEffect, useState } from 'react';

type Approval = 'pending' | 'approved' | 'rejected';
type Access = { approval: Approval; phoneVerified: boolean };
type Student = Access & { id: string; username: string };
const labels = { pending: 'بانتظار اعتماد الإدارة', approved: 'معتمد من الإدارة', rejected: 'غير معتمد' };
async function request(path: string, body?: unknown) {
  const response = await fetch(path, { method: body ? 'POST' : 'GET', cache: 'no-store',
    headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const value = await response.json();
  if (!response.ok) throw Error(value.error || 'تعذر تحميل حالة الاعتماد.');
  return value;
}

export function StudentStatus() {
  const [access, setAccess] = useState<Access | null>(null);
  const [error, setError] = useState('');
  async function refresh() {
    try { setAccess(await request('/api/student/access')); setError(''); }
    catch (issue) { setError(issue instanceof Error ? issue.message : 'تعذر التحديث.'); }
  }
  return <details><summary className="btn btn-secondary" onClick={() => { void refresh(); }}>حالة توثيق واعتماد الطالب</summary>
    <div className="stack"><p>التحقق من الهاتف منفصل عن اعتماد الطالب وعن إدارة التطبيق.</p>
      {access && <p>{access.phoneVerified ? 'الهاتف موثّق' : 'الهاتف غير موثّق'} · {labels[access.approval]}</p>}
      {error && <p role="alert">{error}</p>}<button className="btn btn-secondary" onClick={() => { void refresh(); }}>تحديث الحالة</button>
    </div></details>;
}

export function StudentApprovals() {
  const [students, setStudents] = useState<Student[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [offset, setOffset] = useState(0);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  async function load(page: number) {
    try { const value = await request('/api/owner/students?offset=' + page); setStudents(value.students); setNextOffset(value.nextOffset); setError(''); }
    catch (issue) { setError(issue instanceof Error ? issue.message : 'تعذر تحميل الطلاب.'); }
  }
  useEffect(() => { void load(offset); }, [offset]);
  async function decide(userId: string, approval: Approval) {
    setBusy(true);
    try { await request('/api/owner/students/approval', { userId, approval }); await load(offset); }
    catch (issue) { setError(issue instanceof Error ? issue.message : 'تعذر حفظ الاعتماد.'); }
    finally { setBusy(false); }
  }
  return <section className="card stack"><h2>اعتماد الطلاب</h2><p>راجع صفة الطالب بشكل مستقل. اعتماد الطالب لا يوثّق الهاتف ولا يمنح دور المالك أو عضوية مجموعة مشاريع.</p>
    {error && <p role="alert">{error}</p>}{students.length === 0 && <p>لا توجد حسابات طلاب في هذه الصفحة.</p>}
    {students.map(student => <div className="card stack" key={student.id}>
      <strong dir="ltr">{student.username}</strong><p>{student.phoneVerified ? 'هاتف موثّق' : 'هاتف غير موثّق'} · {labels[student.approval]}</p>
      <div className="row">{(['approved', 'rejected', 'pending'] as const).map(approval => <button key={approval} className="btn btn-secondary" disabled={busy || approval === student.approval} onClick={() => { void decide(student.id, approval); }}>{labels[approval]}</button>)}</div>
    </div>)}<div className="row"><button className="btn btn-secondary" disabled={offset === 0 || busy} onClick={() => setOffset(Math.max(0, offset - 100))}>السابق</button><button className="btn btn-secondary" disabled={nextOffset === null || busy} onClick={() => { if (nextOffset !== null) setOffset(nextOffset); }}>التالي</button></div>
  </section>;
}
