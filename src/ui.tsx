import { useEffect, useRef, type ReactNode } from 'react';
import { BookOpen, X, type LucideIcon } from 'lucide-react';
import { useApp } from './store';

export function SectionHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <header className="page-header"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{description && <p className="muted">{description}</p>}</div>{action}</header>;
}
export function EmptyState({ icon: Icon = BookOpen, title, description, action }: { icon?: LucideIcon; title: string; description: string; action?: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon"><Icon size={28} /></span><h3>{title}</h3><p className="muted">{description}</p>{action}</div>;
}
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}
export function CourseBadge({ id }: { id: string }) {
  const { data } = useApp(); const course = data.courses.find(c => c.id === id);
  return <span className="badge"><i style={{ background: course?.color ?? '#9a94ab', width: 7, height: 7, borderRadius: '50%', display: 'inline-block' }} /> {course?.name ?? 'عام'}</span>;
}
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useRef('modal-' + crypto.randomUUID());
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusable = () => Array.from(ref.current?.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex="0"]') ?? []).filter(el => !el.hasAttribute('disabled'));
    focusable()[1]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
      if (event.key === 'Tab') {
        const items = focusable(); const first = items[0]; const last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = oldOverflow; document.removeEventListener('keydown', onKey); previous?.focus(); };
  }, []);
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><div ref={ref} className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId.current}><header className="modal-header"><h2 id={titleId.current}>{title}</h2><button className="icon-button" aria-label="إغلاق النافذة" onClick={onClose}><X size={20} /></button></header><div className="modal-body">{children}</div></div></div>;
}
