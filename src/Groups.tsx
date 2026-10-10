import { useState, type FormEvent } from 'react';
import { Plus, Users, Trash2, Pencil } from 'lucide-react';
import { useApp } from './store';
import { Field, Modal, SectionHeader } from './ui';
import type { ProjectGroup } from './types';

export default function GroupsPage() {
  const { data, update, notify } = useApp();
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
    <p className="notice">المجموعات محفوظة على جهازك. دعوة الأعضاء والمحادثة والمزامنة بينهم غير متاحة في هذه النسخة.</p>
    {!groups.length && <section className="card stack"><Users size={32} /><h2>أضف أول مجموعة مشروع</h2><p>يمكنك إنشاء أكثر من مجموعة وفتح تفاصيل كل واحدة.</p></section>}
    <div className="note-grid">{groups.map(g => <article className="card stack" key={g.id}><Users size={24} /><h2>{g.name}</h2><p>{g.members.length} من ٩ أعضاء</p><button className="btn btn-primary" onClick={() => setSelected(g.id)}>فتح المجموعة</button><div className="row"><button className="btn btn-secondary" onClick={() => edit(g)}><Pencil size={16} />تعديل</button><button className="btn btn-ghost danger" onClick={() => setDeleting(g)}><Trash2 size={16} />حذف</button></div></article>)}</div>
    {group && <Modal title={group.name} onClose={() => setSelected(null)}><div className="stack"><h3>الأعضاء</h3>{group.members.length ? <ul>{group.members.map((m, i) => <li key={i}>{m}</li>)}</ul> : <p>لم تضف أعضاء بعد.</p>}<h3>ملاحظات المشروع</h3><p className="preserve-lines">{group.notes || 'لا توجد ملاحظات بعد.'}</p><button className="btn btn-secondary" onClick={() => { setSelected(null); edit(group); }}>تعديل المجموعة</button></div></Modal>}
    {editing && <Modal title={editing === 'new' ? 'مجموعة جديدة' : 'تعديل المجموعة'} onClose={() => setEditing(null)}><form className="stack" onSubmit={save}><Field label="اسم المجموعة"><input required maxLength={160} value={name} onChange={e => setName(e.target.value)} /></Field><Field label="الأعضاء، حتى تسعة أسماء، اسم في كل سطر"><textarea rows={5} maxLength={10000} value={members} onChange={e => setMembers(e.target.value)} /></Field><Field label="ملاحظات المشروع"><textarea rows={5} maxLength={200000} value={notes} onChange={e => setNotes(e.target.value)} /></Field><button className="btn btn-primary">حفظ المجموعة</button></form></Modal>}
    {deleting && <Modal title="حذف المجموعة؟" onClose={() => setDeleting(null)}><p>سيُحذف اسم المجموعة وأعضاؤها وملاحظاتها.</p><button className="btn btn-danger" onClick={() => { update(d => { d.projectGroups = (d.projectGroups ?? []).filter(g => g.id !== deleting.id); }); setDeleting(null); notify('حُذفت المجموعة'); }}>حذف المجموعة</button></Modal>}
  </div>;
}
