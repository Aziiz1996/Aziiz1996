import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { AppData, Page } from './types';

import { STORAGE_KEY, emptyData, validateData } from "./validation";
export { emptyData, validUniversityUrl, validateData, STORAGE_KEY } from "./validation";

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

export function AppProvider({ children, accountData, accountId }: { children: ReactNode; accountData?: AppData; accountId?: string }) {
  const [initial] = useState(() => accountData ? { data: accountData, error: "", recoveryRaw: null } : loadData());
  const saveQueue = useRef(Promise.resolve());
  const [data, setData] = useState<AppData>(initial.data);
  const [storageError, setStorageError] = useState(initial.error);
  const [recoveryRaw, setRecoveryRaw] = useState(initial.recoveryRaw);
  const [page, setPage] = useState<Page>('dashboard');
  const [toast, setToast] = useState('');
  const notify = useCallback((message: string) => setToast(message), []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 4500); return () => clearTimeout(timer); }, [toast]);
  const persist = useCallback((next: AppData, allowRecovery = false) => {
    if (accountData) {
      setStorageError("جارٍ حفظ بيانات حسابك…");
      const snapshot = JSON.stringify(next);
      saveQueue.current = saveQueue.current.then(async () => {
        const response = await fetch("/api/data", { method: "PUT", headers: { "Content-Type": "application/json", "X-Leader-Account": accountId || "" }, body: snapshot });
        if (!response.ok) throw new Error();
        setStorageError("");
      }).catch(() => setStorageError("لم تُحفظ آخر التغييرات في حسابك. تحقق من الاتصال، وصدّر نسخة من الإعدادات قبل الخروج."));
      return;
    }
    if (recoveryRaw !== null && !allowRecovery) { setStorageError('التغييرات الجديدة مؤقتة؛ احتفظ بالنسخة الأصلية من الإعدادات ثم استورد نسخة صالحة أو أكد حذف البيانات لبدء نسخة جديدة.'); return; }
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); setStorageError(''); }
    catch { setStorageError('لم تُحفظ آخر التغييرات على الجهاز. صدّر نسخة احتياطية من الإعدادات قبل إغلاق التطبيق.'); }
  }, [recoveryRaw, accountData, accountId]);
  const update = useCallback((recipe: (draft: AppData) => void) => {
    setData(previous => { const next = structuredClone(previous); recipe(next); persist(next); return next; });
  }, [persist]);
  const replace = useCallback((next: AppData) => {
    if (!validateData(next)) return false;
    setData(structuredClone(next)); setRecoveryRaw(null); persist(next, true); return true;
  }, [persist]);
  useEffect(() => {
    if (accountData || !import.meta.env.DEV || initial.error) return;
    try { if (localStorage.getItem(STORAGE_KEY)) return; } catch { return; }
    const controller = new AbortController();
    fetch('/__madar_profile', { signal: controller.signal }).then(async response => {
      if (!response.ok) return;
      const value: unknown = await response.json();
      if (validateData(value) && !localStorage.getItem(STORAGE_KEY)) replace(value);
    }).catch(() => { /* Optional personal profile; ordinary installations start empty. */ });
    return () => controller.abort();
  }, [initial.error, replace, accountData]);
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
