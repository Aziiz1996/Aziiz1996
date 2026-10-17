import { useHeaderLayout } from './headerLayout';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BookOpen, Menu, Newspaper, ShieldCheck, UserRound, ArrowLeft, CalendarDays, Check, ChevronLeft, CircleHelp, ClipboardList, Clock3, ExternalLink, FileText, GraduationCap, LayoutDashboard, Settings2, Sparkles, Target, Wallet, AlertCircle, Users, BriefcaseBusiness } from 'lucide-react';
import { AppProvider, useApp } from './store';
import { CourseBadge, EmptyState, Modal } from './ui';
import { addDays, buildStudyPlan, daysUntil, financeSummary, formatDate, isLessonTemplate, todayISO } from './logic';
import { CoursesPage, PlanPage, TasksPage } from './Academic';
import AuthGate from './AuthGate';
import UniversityPage from './University';
import OpportunitiesPage from './Opportunities';
import GroupsPage from './Groups';
import PracticePage from './Practice';
import AssistantPage from './Assistant';
import NotesPage from './Notes';
import FinancePage from './Finance';
import SettingsPage from './Settings';
import ProfilePage from './Profile';
import LogisticsPage from './Logistics';
import UpdatesPage from './Updates';
import OwnerPage from './Owner';
import { getStudentProfile } from './dataExtensions';
import { AuthProvider, useAuth } from './auth';
import type { Page } from './types';
import { LOGISTICS_TERMS } from './logisticsContent';

const NAV = [
  { id: 'university', label: 'الجامعة — الكلية التطبيقية', icon: GraduationCap },
  { id: 'opportunities', label: 'فرص سلاسل الإمداد', icon: BriefcaseBusiness },
  { id: 'groups', label: 'مجموعات المشاريع', icon: Users },
  { id: 'exams', label: 'جدول الاختبارات', icon: CalendarDays },
  { id: 'practice', label: 'اختبارات تجريبية', icon: CircleHelp },
  { id: 'assistant', label: 'تيتشر لوجستيك', icon: CircleHelp },
  { id: 'dashboard', label: 'نظرة عامة', icon: LayoutDashboard },
  { id: 'courses', label: 'المواد والمحاضرات', icon: GraduationCap },
  { id: 'plan', label: 'خطة المذاكرة', icon: CalendarDays },
  { id: 'tasks', label: 'المهام والاختبارات', icon: ClipboardList },
  { id: 'notes', label: 'ملخصات المواد', icon: FileText },
  { id: 'finance', label: 'ميزانيتي', icon: Wallet },
  { id: 'profile', label: 'الملف الشخصي', icon: UserRound },
  { id: 'logistics', label: 'دليل اللوجستيات', icon: BookOpen },
  { id: 'updates', label: 'جديد التخصص', icon: Newspaper },
  { id: 'owner', label: 'لوحة المالك', icon: ShieldCheck },
  { id: 'settings', label: 'الإعدادات', icon: Settings2 },
] as const;
const DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const KIND_NAMES = { exam: 'اختبار', assignment: 'واجب', project: 'مشروع' };
const number = (value: number) => new Intl.NumberFormat('ar-SA', { maximumFractionDigits: 1 }).format(value);

function Dashboard() {
  const { data, navigate, update } = useApp();
  const { design, username } = useAuth();
  const displayName = data.settings.name || username || '';
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => { const timer = setInterval(() => setClock(new Date()), 60000); return () => clearInterval(timer); }, []);
  const today = todayISO(clock);
  const plan = useMemo(() => buildStudyPlan(data), [data, clock]);
  const sessions = plan.sessions.filter(s => s.date === today);
  const lectures = data.lectures.filter(l => l.day === clock.getDay() && !isLessonTemplate(l));
  const universityEvents = (data.universityEvents ?? []).filter(event => event.date === today);
  const schedule = [...lectures.map(l => ({ id: l.id, start: l.start ?? '', end: l.end ?? '', title: data.courses.find(c => c.id === l.courseId)?.name ?? 'محاضرة', courseId: l.courseId, detail: l.location || 'محاضرة جامعية', kind: 'lecture' })), ...universityEvents.map(event => ({ id:event.id, start:event.time, end:event.endTime ?? '', title:event.title, courseId:event.courseId ?? '', detail:event.description || 'موعد مستورد من مودل', kind:event.kind })), ...sessions.map(s => ({ id: s.id, start: s.start, end: s.end, title: s.title, courseId: s.courseId, detail: `${s.minutes} دقيقة مذاكرة`, kind: 'study' })), ...data.tasks.filter(t => t.kind === 'exam' && t.due === today && !t.completed && !universityEvents.some(event => `${event.id}-task` === t.id)).map(t => ({ id: t.id, start: t.time ?? '', end: t.endTime ?? '', title: t.title, courseId: t.courseId, detail: t.timePending ?? 'موعد اختبار', kind: 'exam' }))].sort((a, b) => a.start.localeCompare(b.start));
  const active = data.tasks.filter(t => !t.completed);
  const deadlines = active.slice().sort((a, b) => a.due.localeCompare(b.due)).slice(0, 5);
  const upcomingExams = active.filter(t => t.kind === 'exam' && t.due >= today).length;
  const completed = data.tasks.filter(t => t.completed).length;
  const progress = data.tasks.length ? Math.round(completed / data.tasks.length * 100) : 0;
  const finance = financeSummary(data.transactions, today.slice(0, 7));
  const expected = (data.incomeRules ?? []).reduce((sum, rule) => sum + rule.amount, 0);
  const nextIncome = (data.incomeRules ?? []).filter(r => r.day !== null).map(r => {
    const base = new Date(today + 'T12:00:00');
    for (let offset = 0; offset < 120; offset++) {
      const date = new Date(base.getFullYear(), base.getMonth() + offset, 1, 12);
      date.setDate(Math.min(r.day!, new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()));
      const value = todayISO(date);
      if (value >= today && !data.transactions.some(t => t.kind === 'income' && t.ruleId === r.id && t.date.slice(0, 7) === value.slice(0, 7))) return { ...r, date: value };
    }
    return null;
  }).filter((r): r is NonNullable<typeof r> => r !== null).sort((a, b) => a.date.localeCompare(b.date))[0];
  const currency = (value: number) => new Intl.NumberFormat('ar-SA', { style: 'currency', currency: data.settings.currency, maximumFractionDigits: 0 }).format(value);
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  return <div className="page-content">
    <div className="row study-shortcuts"><button className="btn btn-secondary" onClick={() => navigate('university')}><GraduationCap size={20} />الجامعة — الكلية التطبيقية</button><button className="btn btn-secondary" onClick={() => navigate('opportunities')}><BriefcaseBusiness size={20} />فرص سلاسل الإمداد</button><button className="btn btn-secondary" onClick={() => navigate('groups')}><Users size={20} />مجموعات المشاريع</button><button className="btn btn-secondary" onClick={() => navigate('notes')}><FileText size={20} />ملخصات المواد</button><button className="btn btn-secondary" onClick={() => navigate('courses')}><GraduationCap size={20} />المحاضرات</button><button className="btn btn-secondary" onClick={() => navigate('exams')}><CalendarDays size={20} />جدول الاختبارات</button><button className="btn btn-secondary" onClick={() => navigate('practice')}><CircleHelp size={20} />اختبارات تجريبية</button></div>
    <section className="welcome-card">
      <div className="welcome-copy"><span className="hero-tag"><Sparkles size={14} /> مساحتك، على طريقتك</span><h1>أهلاً{displayName ? `، ${displayName}` : ' بك يا لوجستي'} 👋<br />{design.welcomeTitle}</h1><p>{design.welcomeMessage}</p><button className="btn btn-primary" onClick={() => navigate(data.courses.length ? 'plan' : 'courses')}>{data.courses.length ? 'شاهد خطة المذاكرة' : 'ابدأ بإضافة موادك'}<ArrowLeft size={18} /></button></div>
      <div className="welcome-art" aria-hidden="true"><span className="orbit" /><span className="art-book" /><span className="art-book-two" /><span className="art-star">✦</span></div>
    </section>
    <button className="logistics-feature" onClick={() => navigate('logistics')}><span className="logistics-feature-icon"><img src={`${import.meta.env.BASE_URL}logistics-terminology.jpg`} alt="دليل مصطلحات اللوجستيات" /></span><span><strong>مصطلحات اللوجستيات في متناولك</strong><span>٥٠ مصطلحاً من صورتك · بحث وبطاقات مراجعة وتدريب</span></span><ArrowLeft size={22} /></button>
    <section className="logistics-showcase" aria-label="مجالات سلاسل الإمداد">
      <button className="logistics-scene warehouse" onClick={() => navigate('courses')}><span>إدارة المستودعات</span><strong>من الاستلام إلى الصرف</strong></button>
      <button className="logistics-scene network" onClick={() => navigate('opportunities')}><span>النقل والتوزيع</span><strong>شبكة تصل المورد بالعميل</strong></button>
      <button className="logistics-scene planning" onClick={() => navigate('plan')}><span>التخطيط والتحليل</span><strong>قرار أفضل من بيانات أوضح</strong></button>
    </section>
    <section className="card logistics-dictionary"><div className="card-heading"><div><span className="eyebrow">لغة التخصص</span><h2>مفردات لوجستية مهمة</h2></div></div><div className="term-grid">{LOGISTICS_TERMS.map(([english, arabic, meaning]) => <article className="term-card" key={english}><span dir="ltr">{english}</span><strong>{arabic}</strong><p>{meaning}</p></article>)}</div></section>
    <div className="stat-grid dashboard-stats">
      <article className="stat-card"><span className="stat-icon"><ClipboardList size={22} /></span><span className="stat-label">مهام تنتظر خطوتك</span><strong className="stat-value">{number(active.length)}</strong><span className="muted">واجبات ومشروعات واختبارات</span></article>
      <article className="stat-card"><span className="stat-icon teal"><Clock3 size={22} /></span><span className="stat-label">خطة اليوم</span><strong className="stat-value">{number(sessions.reduce((sum, s) => sum + s.minutes, 0))}<small> دقيقة</small></strong><span className="muted">{number(sessions.length)} جلسات موزعة</span></article>
      <article className="stat-card"><span className="stat-icon coral"><GraduationCap size={22} /></span><span className="stat-label">اختبارات قادمة</span><strong className="stat-value">{number(upcomingExams)}</strong><span className="muted">موعد واضح، استعداد أفضل</span></article>
      <article className="stat-card"><span className="stat-icon amber"><Wallet size={22} /></span><span className="stat-label">الدخل الشهري المتوقع</span><strong className="stat-value money-value">{currency(expected)}</strong><span className="muted">المسجل فعلياً: {currency(finance.income)}</span></article>
    </div>
    {data.profile && <div className="notice profile-banner"><CircleHelp size={20} /><span>خطة أولية: {number(data.settings.dailyMinutes)} دقيقة مذاكرة يومياً، من <b dir="ltr">{data.settings.studyStart}</b>. مدة التحضير لكل اختبار تقديرية ويمكن تعديلها.</span><button className="btn btn-ghost" onClick={() => navigate('settings')}>تعديل وقتي</button></div>}
    {plan.unscheduledMinutes > 0 && <div className="notice notice-warning"><AlertCircle size={20} /><span>هناك {number(plan.unscheduledMinutes)} دقيقة لم تجد وقتاً قبل موعدها. راجع وقتك المتاح والمواعيد الناقصة.</span><button className="btn btn-ghost" onClick={() => navigate('plan')}>راجع الخطة</button></div>}
    <div className="dashboard-grid">
      <div className="dashboard-main stack">
        <section className="card"><div className="card-heading"><div><span className="eyebrow">اليوم، بوضوح</span><h2>ما الذي ينتظرك؟</h2></div><button className="section-link" onClick={() => navigate('plan')}>الخطة كاملة<ChevronLeft size={16} /></button></div>
          <div className="week-strip">{week.map(date => <div key={date} className={date === today ? 'week-day active' : 'week-day'}><span>{DAY_NAMES[new Date(date + 'T12:00:00').getDay()]}</span><strong>{number(new Date(date + 'T12:00:00').getDate())}</strong><i className={data.tasks.some(t => t.due === date && !t.completed) ? 'has-event' : ''} /></div>)}</div>
          {schedule.length ? <div className="schedule-list">{schedule.map(event => <div key={event.id} className="schedule-item"><div className="schedule-time" dir="ltr"><strong>{event.start || '—'}</strong><span>{event.end || 'غير محدد'}</span></div><span className={`schedule-marker ${event.kind}`} /><div className="schedule-content"><strong>{event.title}</strong><div className="row"><CourseBadge id={event.courseId} /><span className="muted">{event.detail}</span></div></div><span className={`chip ${event.kind}`}>{event.kind === 'lecture' ? 'محاضرة' : event.kind === 'exam' ? 'اختبار' : event.kind === 'assignment' ? 'واجب' : event.kind === 'event' ? 'موعد' : 'مذاكرة'}</span></div>)}</div> : <EmptyState icon={CalendarDays} title="يومك متاح لبداية جميلة" description={active.length ? 'راجع أيام المذاكرة والأوقات المتاحة في الإعدادات.' : 'أضف مهامك ومواعيدك لتظهر خطة اليوم هنا.'} action={<button className="btn btn-secondary" onClick={() => navigate('tasks')}>إضافة مهمة</button>} />}
        </section>
        <section className="card"><div className="card-heading"><div><span className="eyebrow">الأقرب أولاً</span><h2>مواعيد مهمة</h2></div><button className="section-link" onClick={() => navigate('tasks')}>فتح التقويم<ChevronLeft size={16} /></button></div>
          {deadlines.length ? <div className="deadline-list">{deadlines.map(task => { const left = daysUntil(task.due, today); return <div className="deadline-item" key={task.id}><label className="task-check"><input type="checkbox" aria-label={`إنجاز ${task.title}`} checked={task.completed} onChange={() => update(d => { const t = d.tasks.find(x => x.id === task.id); if (t) t.completed = true; })} /><span><Check size={13} /></span></label><div className="deadline-body"><strong>{task.title}</strong><div className="row"><CourseBadge id={task.courseId} /><span className="muted">{formatDate(task.due, true)}{task.time && <b dir="ltr"> · {task.time}</b>}</span></div></div><span className={`countdown ${left <= 1 ? 'urgent' : ''}`}>{left < 0 ? 'متأخر' : left === 0 ? 'اليوم' : left === 1 ? 'غداً' : `بعد ${number(left)} أيام`}</span><span className={`badge kind-${task.kind}`}>{KIND_NAMES[task.kind]}</span></div>; })}</div> : <EmptyState icon={Check} title="قائمتك خفيفة" description="أضف اختباراً أو واجباً، وسنرتب المواعيد الأقرب هنا." />}
        </section>
      </div>
      <aside className="dashboard-side stack">
        <section className="card progress-card"><span className="eyebrow">كل إنجاز يحسب</span><h2>تقدمك في المهام</h2><div className="progress-ring" role="img" aria-label={`إنجاز المهام ${progress} بالمائة`} style={{ background: `conic-gradient(#6b4fe0 ${progress * 3.6}deg, #eeebf7 0deg)` }}><div><strong>{number(progress)}٪</strong><span className="muted">إنجاز</span></div></div><p className="muted">{number(completed)} من {number(data.tasks.length)} مهام مكتملة</p><button className="btn btn-secondary" onClick={() => navigate('tasks')}>تابع إنجازك<ArrowLeft size={16} /></button></section>
        <section className="card"><div className="card-heading"><h2><Wallet size={19} /> لمحة مالية</h2><button className="icon-button" aria-label="فتح الميزانية" onClick={() => navigate('finance')}><ChevronLeft size={18} /></button></div><div className="finance-peek"><div><span className="muted">مصروفات الشهر</span><strong>{currency(finance.expense)}</strong></div><div><span className="muted">رصيد الشهر المسجل</span><strong className={finance.balance < 0 ? 'danger' : ''}>{currency(finance.balance)}</strong></div></div>{nextIncome && <div className="next-income"><span className="chip">أقرب دفعة متوقعة</span><strong>{nextIncome.title} · {currency(nextIncome.amount)}</strong><span className="muted">{formatDate(nextIncome.date, true)} · سجّلها عند الاستلام</span></div>}<button className="section-link" onClick={() => navigate('finance')}>تفاصيل ميزانيتك<ChevronLeft size={16} /></button></section>
        <section className="card study-tip"><Target size={25} /><h3>مراجعة قصيرة، أثر أكبر</h3><p>بعد كل محاضرة: أغلق ملاحظاتك، واكتب أهم ثلاث أفكار من الذاكرة. اختبر فهمك بسؤالين ثم راجع ما فاتك.</p><button className="section-link" onClick={() => navigate('notes')}>افتح ملاحظاتك<ChevronLeft size={16} /></button></section>
      </aside>
    </div>
  </div>;
}

function Avatar() {
  const { data } = useApp();
  const profile = getStudentProfile(data);
  return profile.photo ? <img src={profile.photo.dataUrl} alt="الصورة الشخصية" /> : <>{profile.fullName?.[0] || 'م'}</>;
}

function Shell() {
  useHeaderLayout();
  const { data, page, navigate, storageError, back, forward, canGoBack, canGoForward, forwardPage } = useApp();
  const { design, authenticated, username } = useAuth();
  const profile = getStudentProfile(data);
  const orderedNav = [...design.navigation, ...NAV.map(item => item.id).filter(id => !design.navigation.includes(id))].map(id => NAV.find(item => item.id === id)).filter((item): item is typeof NAV[number] => !!item && (item.id !== 'owner' || authenticated) && (item.id === 'owner' || item.id === 'dashboard' || !design.hiddenPages.includes(item.id)));
  const current = NAV.find(n => n.id === page) ?? NAV[0];
  const next = canGoForward ? NAV.find(n => n.id === forwardPage) : orderedNav[orderedNav.findIndex(n => n.id === current.id) + 1];
  const accountName = profile.fullName || username || 'مساحتي الشخصية';
  const activeTasks = data.tasks.filter(t => !t.completed).length;
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => { if (window.innerWidth < 780) document.querySelector('.nav-item[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, [page]);
  return <div className="app-shell">
    <aside className="sidebar">
      <button className="brand" onClick={() => navigate('dashboard')} aria-label={`${design.appName}، الصفحة الرئيسية`}><span className="brand-icon"><img src="./leader-icon.png" alt="" /></span><span><strong>{design.appName}</strong><small className="brand-caption">رفيق دبلوم سلاسل الإمداد</small></span></button>
      <span className="sidebar-label">مساحتك اليومية</span>
      <nav aria-label="التنقل الرئيسي">{orderedNav.map(({ id, label, icon: Icon }) => <button key={id} className={page === id ? 'nav-item active' : 'nav-item'} aria-current={page === id ? 'page' : undefined} onClick={() => navigate(id as Page)}><Icon size={20} /><span>{label}</span>{id === 'tasks' && activeTasks > 0 && <span className="nav-count">{number(activeTasks)}</span>}</button>)}
        {data.settings.universityUrl && <a className="nav-item university-link" href={data.settings.universityUrl} target="_blank" rel="noopener noreferrer" aria-label="فتح موقع الجامعة في نافذة جديدة"><ExternalLink size={20} /><span>موقع الجامعة</span></a>}
      </nav>
      <div className="sidebar-bottom"><span className="sidebar-quote">خطوة اليوم<br />تصنع غداً أجمل.</span><div className="sidebar-profile"><button className="avatar profile-avatar" aria-label="عرض الملف الشخصي" onClick={() => navigate('profile')}><Avatar /></button><div><strong>{accountName}</strong><span>{authenticated ? 'المالك · المبرمج · المصمم' : 'خطوة بخطوة ✦'}</span></div><button className="icon-button" aria-label="تعديل التفضيلات" onClick={() => navigate('settings')}><Settings2 size={18} /></button></div></div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="topbar-title"><span>مساحتي</span><ChevronLeft size={14} /><strong>{current.label}</strong></div><div className="topbar-actions"><span className="today-label"><CalendarDays size={17} />{formatDate(todayISO(), true)}</span><button className="account-chip" aria-label="فتح الملف الشخصي" onClick={() => navigate('profile')}><span className="avatar profile-avatar"><Avatar /></span><span className="account-copy"><span className="account-caption">{authenticated ? 'حساب المالك' : 'أهلاً وسهلاً'}</span><strong className="account-name">{accountName}</strong></span></button></div></header>
      {storageError && <div className="notice danger storage-warning" role="alert">{storageError}</div>}
      {data.demo && <div className="notice demo-banner"><Sparkles size={18} /><span>هذه بيانات تجريبية. ابدأ ببياناتك من الإعدادات.</span><button className="btn btn-ghost" onClick={() => navigate('settings')}>فتح الإعدادات</button></div>}
      {page === 'university' && <UniversityPage />}
      {page === 'groups' && <GroupsPage />}
      {page === 'exams' && <TasksPage key="exams" initialKind="exam" />}
      {page === 'assistant' && <AssistantPage />}
      {page === 'dashboard' && <Dashboard />}
      {page === 'courses' && <CoursesPage />}
      {page === 'plan' && <PlanPage />}
      {page === 'tasks' && <TasksPage key="tasks" />}
      {page === 'practice' && <PracticePage />}
      {page === 'logistics' && <div className="page-content"><LogisticsPage /></div>}
      {page === 'updates' && <div className="page-content"><UpdatesPage /></div>}
      {page === 'notes' && <NotesPage />}
      {page === 'finance' && <div className="page-content"><FinancePage /></div>}
      {page === 'profile' && <div className="page-content"><ProfilePage /></div>}
      {page === 'opportunities' && <div className="page-content"><OpportunitiesPage /></div>}
      {page === 'settings' && <div className="page-content"><SettingsPage /></div>}
      {page === 'owner' && <div className="page-content"><OwnerPage /></div>}
      <nav className="page-navigation" aria-label="التنقل بين الصفحات"><button className="btn btn-secondary" disabled={!canGoBack} onClick={back}><ArrowRight size={18} />عودة</button><button className="btn btn-secondary menu-button" onClick={() => setMenuOpen(true)}><Menu size={18} />القائمة</button><span className="page-navigation-current">{current.label}</span><button className="btn btn-primary" disabled={!next} onClick={() => { if (canGoForward) forward(); else if (next) navigate(next.id); }}>التالي{next && <span className="next-page-label">: {next.label}</span>}<ArrowLeft size={18} /></button></nav>
      {menuOpen && <Modal title="القائمة الرئيسية" onClose={() => setMenuOpen(false)}><div className="app-menu-intro"><strong>أهلاً {profile.fullName || 'بك يا لوجستي'} 👋</strong><p className="muted">اختر مساحتك، أو أغلق القائمة لتكمل من الصفحة نفسها.</p></div><div className="app-menu-grid">{orderedNav.map(({ id, label, icon: Icon }) => <button key={id} className={`app-menu-item ${id === page ? 'active' : ''}`} onClick={() => { navigate(id); setMenuOpen(false); }}><Icon size={24} /><span>{label}</span>{id === page && <small>أنت هنا</small>}</button>)}</div><button className="btn btn-secondary" onClick={() => setMenuOpen(false)}>العودة إلى {current.label}</button></Modal>}
    </main>
  </div>;
}

export default function App() { return <AuthGate>{session => <AuthProvider user={session.user}><AppProvider key={`${session.user.id}-${session.user.owner}`} accountData={session.data} accountId={session.user.id}><Shell /></AppProvider></AuthProvider>}</AuthGate>; }
