import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AppData, Page } from './types';
import { validateData } from './validation';

export interface OwnerDesign {
  appName: string; welcomeTitle: string; welcomeMessage: string; accentColor: string; navigation: Page[]; hiddenPages: Page[];
}
const ALL_PAGES: Page[] = ['dashboard', 'university', 'courses', 'plan', 'tasks', 'exams', 'practice', 'assistant', 'logistics', 'updates', 'notes', 'finance', 'groups', 'profile', 'opportunities', 'settings', 'owner'];
export const DEFAULT_OWNER_DESIGN: OwnerDesign = {
  appName: 'عز اللوجستيات', welcomeTitle: 'خطوة اليوم تصنع غداً أجمل.',
  welcomeMessage: 'يا هلا بلوجستي المستقبل! نرتّب دراستك ومواعيدك ومصروفاتك، ونمشي معك خطوة بخطوة.',
  accentColor: '#FF6B00', navigation: [...ALL_PAGES], hiddenPages: [],
};
export interface AccountUser { id: string; username: string; owner: boolean; }
interface AuthContextValue {
  authenticated: boolean; username: string; role: 'owner' | null; design: OwnerDesign; loading: boolean;
  refresh: () => Promise<void>; saveDesign: (design: OwnerDesign) => Promise<void>;
  getOwnerData: () => Promise<AppData>; saveOwnerData: (data: AppData) => Promise<void>;
}
const AuthContext = createContext<AuthContextValue | null>(null);
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
function readDesign(value: unknown): OwnerDesign {
  if (!record(value) || typeof value.appName !== 'string' || !value.appName.trim() || value.appName.length > 80 || typeof value.welcomeTitle !== 'string' || value.welcomeTitle.length > 200 || typeof value.welcomeMessage !== 'string' || value.welcomeMessage.length > 1000 || typeof value.accentColor !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value.accentColor)) throw new Error('إعدادات المظهر المستلمة غير صالحة.');
  const pages = (items: unknown): items is Page[] => Array.isArray(items) && items.every(item => ALL_PAGES.includes(item as Page)) && new Set(items).size === items.length;
  if (!pages(value.navigation) || !pages(value.hiddenPages) || value.hiddenPages.includes('dashboard') || value.hiddenPages.includes('owner')) throw new Error('إعدادات قائمة التنقل غير صالحة.');
  return { appName: value.appName, welcomeTitle: value.welcomeTitle, welcomeMessage: value.welcomeMessage, accentColor: value.accentColor,
    navigation: [...value.navigation, ...ALL_PAGES.filter(page => !(value.navigation as Page[]).includes(page))], hiddenPages: [...value.hiddenPages] };
}

/** Reuses AuthGate's existing leader_session and owner role; it creates no second account. */
export function AuthProvider({ user, children }: { user: AccountUser; children: ReactNode }) {
  const [design, setDesign] = useState<OwnerDesign>(DEFAULT_OWNER_DESIGN);
  const [loading, setLoading] = useState(true);
  const request = useCallback(async (path: string, method = 'GET', body?: unknown, ownerOnly = false): Promise<unknown> => {
    if (ownerOnly && !user.owner) throw new Error('هذه العملية متاحة لمدير التطبيق فقط.');
    let response: Response;
    try { response = await fetch(path, { method, credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(ownerOnly ? { 'X-Leader-Account': user.id } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }); }
    catch { throw new Error('تعذّر الاتصال بالخادم. تحقق من الاتصال وحاول مجدداً.'); }
    let value: unknown;
    try { value = await response.json(); } catch { throw new Error('خدمة إدارة التطبيق غير متاحة حالياً.'); }
    if (!response.ok) throw new Error(record(value) && typeof value.error === 'string' ? value.error : 'تعذّر إكمال العملية.');
    return value;
  }, [user.id, user.owner]);
  const refresh = useCallback(async () => { setLoading(true); try { setDesign(readDesign(await request('/api/design'))); } finally { setLoading(false); } }, [request]);
  useEffect(() => { void refresh().catch(() => {}); }, [refresh]);
  useEffect(() => {
    const rgb = [1, 3, 5].map(index => parseInt(design.accentColor.slice(index, index + 2), 16));
    const channel = (value: number) => { const n = value / 255; return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4; };
    const luminance = channel(rgb[0]) * 0.2126 + channel(rgb[1]) * 0.7152 + channel(rgb[2]) * 0.0722;
    const luminanceOf = (values: number[]) => channel(values[0]) * 0.2126 + channel(values[1]) * 0.7152 + channel(values[2]) * 0.0722;
    let darkChannels = rgb.map(value => Math.round(value * 0.78));
    while (1.05 / (luminanceOf(darkChannels) + 0.05) < 4.5) darkChannels = darkChannels.map(value => Math.floor(value * 0.85));
    const dark = '#' + darkChannels.map(value => value.toString(16).padStart(2, '0')).join('');
    const root = document.documentElement;
    root.style.setProperty('--primary', design.accentColor);
    root.style.setProperty('--primary-dark', dark);
    root.style.setProperty('--primary-light', design.accentColor + '18');
    root.style.setProperty('--primary-contrast', (1.05 / (luminance + 0.05)) >= ((luminance + 0.05) / 0.05) ? '#ffffff' : '#000000');
    document.title = `${design.appName} — رفيق دبلوم سلاسل الإمداد`;
  }, [design.accentColor, design.appName]);
  const saveDesign = useCallback(async (value: OwnerDesign) => { setDesign(readDesign(await request('/api/owner/design', 'PUT', readDesign(value), true))); }, [request]);
  const getOwnerData = useCallback(async () => { const value = await request('/api/owner/data', 'GET', undefined, true); if (!validateData(value)) throw new Error('النسخة المحفوظة غير صالحة. لم تتغير بياناتك.'); return value; }, [request]);
  const saveOwnerData = useCallback(async (value: AppData) => { if (!validateData(value)) throw new Error('راجع بيانات حسابك قبل حفظ النسخة.'); await request('/api/owner/data', 'PUT', value, true); }, [request]);
  const username = user.username === 'aziiz1996@owner.invalid' ? 'Aziiz1996' : user.username;
  return <AuthContext.Provider value={{ authenticated: user.owner, username, role: user.owner ? 'owner' : null, design, loading, refresh, saveDesign, getOwnerData, saveOwnerData }}>{children}</AuthContext.Provider>;
}
export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error('AuthProvider is required'); return value; }
