import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { AppData, Page } from './types';
import { validateData } from './dataValidation';
import { useAuth } from './auth';
export { validateData } from './dataValidation';

export const STORAGE_KEY = 'madar.student.v1';
export function validUniversityUrl(value: string) {
  if (!value) return true;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
}
export const emptyData = (): AppData => ({
  version: 1, incomeRules: [], courses: [], lectures: [], tasks: [], notes: [], transactions: [],
  settings: { name: '', currency: 'SAR', monthlyBudget: 0, dailyMinutes: 90, studyStart: '18:00', studyDays: [0, 1, 2, 3, 4, 6] },
});


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
  back: () => void; forward: () => void; canGoBack: boolean; canGoForward: boolean; forwardPage: Page | null;
}
const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const { authenticated } = useAuth();
  const [initial] = useState(loadData);
  const [data, setData] = useState<AppData>(initial.data);
  const dataRef = useRef(data);
  const [storageError, setStorageError] = useState(initial.error);
  const [recoveryRaw, setRecoveryRaw] = useState(initial.recoveryRaw);
  const pages: Page[] = ['dashboard', 'courses', 'plan', 'tasks', 'practice', 'logistics', 'notes', 'finance', 'profile', 'opportunities', 'settings', 'owner', 'teacher', 'updates'];
  const pageFromUrl = (): Page => pages.includes(window.location.hash.slice(1) as Page) ? window.location.hash.slice(1) as Page : 'dashboard';
  const [page, setPage] = useState<Page>(pageFromUrl);
  const [navigation, setNavigation] = useState(() => ({ pages: [page] as Page[], index: 0 }));
  const navigationRef = useRef(navigation);
  const navigationSession = useRef(crypto.randomUUID());
  const [toast, setToast] = useState('');
  const notify = useCallback((message: string) => setToast(message), []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 4500); return () => clearTimeout(timer); }, [toast]);
  const persist = useCallback((next: AppData, allowRecovery = false) => {
    if (recoveryRaw !== null && !allowRecovery) { setStorageError('التغييرات الجديدة مؤقتة؛ احتفظ بالنسخة الأصلية من الإعدادات ثم استورد نسخة صالحة أو أكد حذف البيانات لبدء نسخة جديدة.'); return; }
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); setStorageError(''); }
    catch { setStorageError('لم تُحفظ آخر التغييرات على الجهاز. صدّر نسخة احتياطية من الإعدادات قبل إغلاق التطبيق.'); }
  }, [recoveryRaw]);
  const update = useCallback((recipe: (draft: AppData) => void) => {
    const next = structuredClone(dataRef.current);
    recipe(next); dataRef.current = next; persist(next); setData(next);
  }, [persist]);
  const replace = useCallback((next: AppData) => {
    if (!validateData(next)) return false;
    const value = structuredClone(next); dataRef.current = value;
    setData(value); setRecoveryRaw(null); persist(value, true); return true;
  }, [persist]);
  useEffect(() => {
    if (!authenticated || initial.error) return;
    try { if (localStorage.getItem(STORAGE_KEY)) return; } catch { return; }
    const controller = new AbortController();
    fetch('/__madar_profile', { signal: controller.signal }).then(async response => {
      if (!response.ok) return;
      const value: unknown = await response.json();
      if (validateData(value) && !localStorage.getItem(STORAGE_KEY)) replace(value);
    }).catch(() => { /* Optional personal profile; ordinary installations start empty. */ });
    return () => controller.abort();
  }, [authenticated, initial.error, replace]);
  useEffect(() => {
    const current = navigationRef.current;
    window.history.replaceState({ madarSession: navigationSession.current, index: current.index }, '', `#${current.pages[current.index]}`);
    const onPop = (event: PopStateEvent) => {
      const state = event.state;
      const route = pageFromUrl();
      const current = navigationRef.current;
      const index = state?.madarSession === navigationSession.current && Number.isInteger(state.index) && current.pages[state.index] === route ? state.index : -1;
      const next = index >= 0 ? { ...current, index } : { pages: [route], index: 0 };
      navigationRef.current = next; setNavigation(next); setPage(route);
      window.scrollTo({ top: 0, behavior: 'auto' });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const navigate = useCallback((next: Page) => {
    const previous = navigationRef.current;
    if (previous.pages[previous.index] !== next) {
      const current = { pages: [...previous.pages.slice(0, previous.index + 1), next], index: previous.index + 1 };
      navigationRef.current = current; setNavigation(current); setPage(next);
      window.history.pushState({ madarSession: navigationSession.current, index: current.index }, '', `#${next}`);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);
  const back = useCallback(() => { if (navigationRef.current.index > 0) window.history.back(); }, []);
  const forward = useCallback(() => { if (navigationRef.current.index < navigationRef.current.pages.length - 1) window.history.forward(); }, []);
  return <AppContext.Provider value={{ data, page, update, notify, navigate, replace, storageError, recoveryRaw, back, forward, canGoBack: navigation.index > 0, canGoForward: navigation.index < navigation.pages.length - 1, forwardPage: navigation.pages[navigation.index + 1] ?? null }}>
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
