import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AppData, Page } from './types';

export const STORAGE_KEY = 'madar.student.v1';
export function validUniversityUrl(value: string) {
  if (!value) return true;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
}
export const emptyData = (): AppData => ({
  version: 1, incomeRules: [], courses: [], lectures: [], tasks: [], notes: [], transactions: [],
  settings: { name: '', currency: 'SAR', monthlyBudget: 0, dailyMinutes: 90, studyStart: '18:00', studyDays: [0, 1, 2, 3, 4, 6] },
});

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const textValue = (x: unknown) => typeof x === 'string' && x.length <= 200000;
const validDate = (x: unknown) => {
  if (typeof x !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x)) return false;
  const d = new Date(x + 'T12:00:00');
  return !Number.isNaN(d.getTime()) && `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` === x;
};
const validTime = (x: unknown) => typeof x === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(x);
const boundedNumber = (x: unknown, min: number, max: number) => typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max;

export function validateData(value: unknown): value is AppData {
  if (!isObject(value) || value.version !== 1 || !isObject(value.settings) || (value.demo !== undefined && typeof value.demo !== 'boolean') || (value.profile !== undefined && typeof value.profile !== 'boolean')) return false;
  const s = value.settings;
  if ((s.universityName !== undefined && !textValue(s.universityName)) || (s.universityUrl !== undefined && (typeof s.universityUrl !== 'string' || !validUniversityUrl(s.universityUrl)))) return false;
  if (!textValue(s.name) || typeof s.currency !== 'string' || !['SAR', 'AED', 'KWD', 'USD', 'EUR', 'EGP', 'QAR', 'BHD', 'OMR'].includes(s.currency) || !boundedNumber(s.monthlyBudget, 0, 1e9) || !boundedNumber(s.dailyMinutes, 0, 720) || !validTime(s.studyStart) || !Array.isArray(s.studyDays) || !s.studyDays.every(d => Number.isInteger(d) && d >= 0 && d <= 6) || new Set(s.studyDays).size !== s.studyDays.length) return false;
  for (const key of ['courses', 'lectures', 'tasks', 'notes', 'transactions']) {
    const rows = value[key];
    if (!Array.isArray(rows) || rows.length > 10000 || !rows.every(x => isObject(x) && typeof x.id === 'string' && x.id.length > 0 && x.id.length < 150) || new Set(rows.map(x => x.id)).size !== rows.length) return false;
  }
  const courses = value.courses as Record<string, unknown>[];
  const courseIds = new Set(courses.map(c => c.id));
  const courseRef = (id: unknown) => id === '' || courseIds.has(id);
  const optionalTime = (x: unknown) => x === undefined || x === '' || validTime(x);
  if (value.incomeRules !== undefined && (!Array.isArray(value.incomeRules) || value.incomeRules.length > 1000 || new Set(value.incomeRules.map(r => r?.id)).size !== value.incomeRules.length || !value.incomeRules.every(r => isObject(r) && textValue(r.id) && textValue(r.title) && textValue(r.category) && boundedNumber(r.amount, 0.01, 1e9) && (r.day === null || (Number.isInteger(r.day) && boundedNumber(r.day, 1, 31)))))) return false;
  return courses.every(c => textValue(c.name) && typeof c.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(c.color)) &&
    (value.lectures as Record<string, unknown>[]).every(l => courseIds.has(l.courseId) && Number.isInteger(l.day) && boundedNumber(l.day, 0, 6) && optionalTime(l.start) && optionalTime(l.end) && (!l.end || (!!l.start && (l.end as string) > (l.start as string))) && textValue(l.location) && (l.timePending === undefined || textValue(l.timePending))) &&
    (value.tasks as Record<string, unknown>[]).every(t => textValue(t.title) && courseRef(t.courseId) && ['assignment', 'project', 'exam'].includes(t.kind as string) && validDate(t.due) && ['low', 'medium', 'high'].includes(t.priority as string) && boundedNumber(t.minutes, 0, 100000) && typeof t.completed === 'boolean' && optionalTime(t.time) && optionalTime(t.endTime) && (!t.endTime || (!!t.time && (t.endTime as string) > (t.time as string))) && (t.timePending === undefined || textValue(t.timePending))) &&
    (value.notes as Record<string, unknown>[]).every(n => textValue(n.title) && courseRef(n.courseId) && textValue(n.content) && textValue(n.summary) && typeof n.updatedAt === 'string' && !Number.isNaN(Date.parse(n.updatedAt))) &&
    (value.transactions as Record<string, unknown>[]).every(t => textValue(t.title) && ['expense', 'income'].includes(t.kind as string) && boundedNumber(t.amount, 0.01, 1e9) && textValue(t.category) && validDate(t.date) && (t.ruleId === undefined || textValue(t.ruleId)));
}

function loadData(): { data: AppData; error: string; recoveryRaw: string | null } {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { data: emptyData(), error: '', recoveryRaw: null };
    const parsed: unknown = JSON.parse(raw);
    if (!validateData(parsed)) return { data: emptyData(), error: 'تعذر قراءة البيانات المحفوظة. النسخة الأصلية محفوظة؛ صدّرها للاستعادة من الإعدادات. التغييرات الجديدة مؤقتة حتى تستورد نسخة صالحة أو تؤكد بداية جديدة.', recoveryRaw: raw };
    return { data: parsed, error: '', recoveryRaw: null };
  } catch { return { data: emptyData(), error: raw ? 'تعذر قراءة النسخة المحفوظة. صدّر الأصل من الإعدادات قبل استعادة بياناتك أو بدء نسخة جديدة.' : 'تعذر الوصول إلى البيانات المحفوظة. تحقق من إعدادات المتصفح، واحتفظ بنسخة احتياطية.', recoveryRaw: raw }; }
}

interface AppContextValue {
  data: AppData; page: Page; update: (recipe: (draft: AppData) => void) => void;
  notify: (message: string) => void; navigate: (page: Page) => void;
  replace: (data: AppData) => boolean; storageError: string; recoveryRaw: string | null;
}
const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(loadData);
  const [data, setData] = useState<AppData>(initial.data);
  const [storageError, setStorageError] = useState(initial.error);
  const [recoveryRaw, setRecoveryRaw] = useState(initial.recoveryRaw);
  const [page, setPage] = useState<Page>('dashboard');
  const [toast, setToast] = useState('');
  const notify = useCallback((message: string) => setToast(message), []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 4500); return () => clearTimeout(timer); }, [toast]);
  const persist = useCallback((next: AppData, allowRecovery = false) => {
    if (recoveryRaw !== null && !allowRecovery) { setStorageError('التغييرات الجديدة مؤقتة؛ احتفظ بالنسخة الأصلية من الإعدادات ثم استورد نسخة صالحة أو أكد حذف البيانات لبدء نسخة جديدة.'); return; }
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); setStorageError(''); }
    catch { setStorageError('لم تُحفظ آخر التغييرات على الجهاز. صدّر نسخة احتياطية من الإعدادات قبل إغلاق التطبيق.'); }
  }, [recoveryRaw]);
  const update = useCallback((recipe: (draft: AppData) => void) => {
    setData(previous => { const next = structuredClone(previous); recipe(next); persist(next); return next; });
  }, [persist]);
  const replace = useCallback((next: AppData) => {
    if (!validateData(next)) return false;
    setData(structuredClone(next)); setRecoveryRaw(null); persist(next, true); return true;
  }, [persist]);
  useEffect(() => {
    if (!import.meta.env.DEV || initial.error) return;
    try { if (localStorage.getItem(STORAGE_KEY)) return; } catch { return; }
    const controller = new AbortController();
    fetch('/__madar_profile', { signal: controller.signal }).then(async response => {
      if (!response.ok) return;
      const value: unknown = await response.json();
      if (validateData(value) && !localStorage.getItem(STORAGE_KEY)) replace(value);
    }).catch(() => { /* Optional personal profile; ordinary installations start empty. */ });
    return () => controller.abort();
  }, [initial.error, replace]);
  const navigate = useCallback((next: Page) => { setPage(next); window.scrollTo({ top: 0, behavior: 'smooth' }); }, []);
  return <AppContext.Provider value={{ data, page, update, notify, navigate, replace, storageError, recoveryRaw }}>
    {children}
    {toast && <div className="toast" role="status">{toast}</div>}
  </AppContext.Provider>;
}

export function useApp() { const context = useContext(AppContext); if (!context) throw new Error('AppProvider is required'); return context; }

export function downloadFile(name: string, content: string, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
