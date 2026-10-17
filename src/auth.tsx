import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { AppData, Page } from './types';
import { validateData } from './dataValidation';

export interface OwnerDesign {
  appName: string;
  welcomeTitle: string;
  welcomeMessage: string;
  accentColor: string;
  navigation: Page[];
  hiddenPages: Page[];
}

const ALL_PAGES: Page[] = ['dashboard', 'courses', 'plan', 'tasks', 'practice', 'teacher', 'logistics', 'notes', 'updates', 'finance', 'profile', 'opportunities', 'settings', 'owner'];
export const DEFAULT_OWNER_DESIGN: OwnerDesign = {
  appName: 'مدار',
  welcomeTitle: 'خطوة اليوم تصنع غداً أجمل.',
  welcomeMessage: 'مرحباً بأهل اللوجستيات. من المحاضرة إلى الميدان: رتّب وقتك، افهم المصطلح، وطبّق ما تتعلمه خطوة بخطوة.',
  accentColor: '#6b4fe0',
  navigation: [...ALL_PAGES],
  hiddenPages: [],
};

interface Session {
  authenticated: boolean;
  username: string | null;
  role: 'owner' | null;
  csrfToken: string | null;
}

interface AuthContextValue extends Session {
  design: OwnerDesign;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  saveDesign: (design: OwnerDesign) => Promise<void>;
  getOwnerData: () => Promise<AppData>;
  saveOwnerData: (data: AppData) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

const ANONYMOUS: Session = { authenticated: false, username: null, role: null, csrfToken: null };
const AuthContext = createContext<AuthContextValue | null>(null);
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

function readSession(value: unknown): Session {
  if (!isRecord(value) || typeof value.authenticated !== 'boolean') throw new Error('استجابة تسجيل الدخول غير مكتملة. حاول مرة أخرى.');
  if (!value.authenticated) return ANONYMOUS;
  if (value.role !== 'owner' || typeof value.username !== 'string' || !value.username || typeof value.csrfToken !== 'string' || !value.csrfToken) {
    throw new Error('تعذّر التحقق من صلاحية جلسة المالك. سجّل الدخول من جديد.');
  }
  return { authenticated: true, username: value.username, role: 'owner', csrfToken: value.csrfToken };
}

function readDesign(value: unknown): OwnerDesign {
  if (!isRecord(value) || typeof value.appName !== 'string' || !value.appName.trim() || value.appName.length > 80 || typeof value.welcomeTitle !== 'string' || value.welcomeTitle.length > 200 || typeof value.welcomeMessage !== 'string' || value.welcomeMessage.length > 1000 || typeof value.accentColor !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value.accentColor)) {
    throw new Error('إعدادات المظهر المستلمة غير صالحة.');
  }
  const pages = (items: unknown): items is Page[] => Array.isArray(items) && items.every(item => ALL_PAGES.includes(item as Page)) && new Set(items).size === items.length;
  if (!pages(value.navigation) || !pages(value.hiddenPages) || value.hiddenPages.includes('dashboard') || value.hiddenPages.includes('owner')) {
    throw new Error('إعدادات قائمة التنقل غير صالحة.');
  }
  return {
    appName: value.appName,
    welcomeTitle: value.welcomeTitle,
    welcomeMessage: value.welcomeMessage,
    accentColor: value.accentColor,
    navigation: [...value.navigation, ...ALL_PAGES.filter(page => !(value.navigation as Page[]).includes(page))],
    hiddenPages: [...value.hiddenPages],
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>(ANONYMOUS);
  const sessionRef = useRef(session);
  const [design, setDesign] = useState<OwnerDesign>(DEFAULT_OWNER_DESIGN);
  const [loading, setLoading] = useState(true);

  const applySession = useCallback((value: Session) => { sessionRef.current = value; setSession(value); }, []);

  const request = useCallback(async (path: string, method = 'GET', body?: unknown, ownerOnly = false): Promise<unknown> => {
    const current = sessionRef.current;
    if (ownerOnly && (!current.authenticated || current.role !== 'owner' || !current.csrfToken)) throw new Error('سجّل الدخول بحساب المالك للمتابعة.');
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (method !== 'GET' && current.csrfToken && path !== '/api/login') headers['X-CSRF-Token'] = current.csrfToken;
    let response: Response;
    try {
      response = await fetch(path, { method, credentials: 'same-origin', headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    } catch { throw new Error('تعذّر الاتصال بالخادم. تحقق من الاتصال وحاول مجدداً.'); }
    let value: unknown;
    try { value = await response.json(); } catch { throw new Error('خدمة حساب المالك غير متاحة حالياً. تحقق من تشغيل خادم التطبيق.'); }
    if (!response.ok) {
      if (response.status === 401 && path !== '/api/login') applySession(ANONYMOUS);
      throw new Error(isRecord(value) && typeof value.error === 'string' ? value.error : 'تعذّر إكمال العملية. حاول مجدداً.');
    }
    return value;
  }, [applySession]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const results = await Promise.allSettled([request('/api/session'), request('/api/design')]);
      if (results[0].status === 'fulfilled') {
        try { applySession(readSession(results[0].value)); } catch (error) { applySession(ANONYMOUS); throw error; }
      } else applySession(ANONYMOUS);
      if (results[1].status === 'fulfilled') setDesign(readDesign(results[1].value));
      if (results[0].status === 'rejected') throw results[0].reason;
      if (results[1].status === 'rejected') throw results[1].reason;
    } finally { setLoading(false); }
  }, [applySession, request]);

  useEffect(() => { void refresh().catch(() => { /* The ordinary app remains available without the owner service. */ }); }, [refresh]);
  useEffect(() => {
    const rgb = [1, 3, 5].map(index => parseInt(design.accentColor.slice(index, index + 2), 16));
    const luminanceOf = (channels: number[]) => {
      const values = channels.map(channel => { const value = channel / 255; return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4; });
      return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
    };
    let darkChannels = rgb.map(channel => Math.round(channel * 0.78));
    while (1.05 / (luminanceOf(darkChannels) + 0.05) < 4.5) darkChannels = darkChannels.map(channel => Math.floor(channel * 0.85));
    const dark = '#' + darkChannels.map(channel => channel.toString(16).padStart(2, '0')).join('');
    const linear = rgb.map(channel => { const value = channel / 255; return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4; });
    const luminance = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
    const root = document.documentElement;
    root.style.setProperty('--primary', design.accentColor);
    root.style.setProperty('--primary-dark', dark);
    root.style.setProperty('--primary-light', design.accentColor + '18');
    root.style.setProperty('--primary-contrast', (1.05 / (luminance + 0.05)) >= ((luminance + 0.05) / 0.05) ? '#ffffff' : '#17131f');
    document.title = `${design.appName} — حياتك الدراسية بوضوح`;
  }, [design]);

  const login = useCallback(async (username: string, password: string) => {
    const next = readSession(await request('/api/login', 'POST', { username, password }));
    if (!next.authenticated) throw new Error('تعذّر تسجيل الدخول. تحقق من بيانات حساب المالك.');
    applySession(next);
  }, [applySession, request]);

  const logout = useCallback(async () => {
    await request('/api/logout', 'POST', undefined, true);
    applySession(ANONYMOUS);
  }, [applySession, request]);

  const saveDesign = useCallback(async (value: OwnerDesign) => {
    const valid = readDesign(value);
    const saved = await request('/api/owner/design', 'PUT', valid, true);
    setDesign(readDesign(saved));
  }, [request]);

  const getOwnerData = useCallback(async () => {
    const value = await request('/api/owner/data', 'GET', undefined, true);
    if (!validateData(value)) throw new Error('النسخة المحفوظة على الخادم غير صالحة. لم تتغير بيانات هذا الجهاز.');
    return value;
  }, [request]);

  const saveOwnerData = useCallback(async (value: AppData) => {
    if (!validateData(value)) throw new Error('بيانات هذا الجهاز غير مكتملة. راجع نسختك من الإعدادات أولاً.');
    await request('/api/owner/data', 'PUT', value, true);
  }, [request]);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    if (newPassword.length < 12) throw new Error('استخدم كلمة مرور جديدة من ١٢ حرفاً على الأقل.');
    await request('/api/owner/password', 'POST', { currentPassword, newPassword }, true);
    applySession(ANONYMOUS);
    await refresh();
  }, [applySession, refresh, request]);

  return <AuthContext.Provider value={{ ...session, design, loading, login, logout, refresh, saveDesign, getOwnerData, saveOwnerData, changePassword }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('AuthProvider is required');
  return context;
}
