import { useMemo, useState, type FormEvent } from 'react';
import { ArrowDownLeft, ArrowUpRight, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, CircleDollarSign, Pencil, Plus, Search, Trash2, Wallet } from 'lucide-react';
import { useApp } from './store';
import { EmptyState, Field, Modal, SectionHeader } from './ui';
import { financeSummary, formatDate, todayISO } from './logic';
import type { IncomeRule, Transaction } from './types';

type TransactionForm = Omit<Transaction, 'id' | 'amount'> & { amount: string };
type IncomeRuleForm = Omit<IncomeRule, 'id' | 'amount' | 'day'> & { amount: string; day: string };
type IncomeReceipt = { ruleId: string; month: string; amount: string; date: string };
const expenseCategories = ['طعام', 'مواصلات', 'دراسة', 'سكن', 'تسوق', 'ترفيه', 'أخرى'];
const incomeCategories = ['مكافأة جامعية', 'راتب', 'عمل إضافي', 'هدية', 'أخرى'];

function blankForm(): TransactionForm {
  return { title: '', kind: 'expense', amount: '', category: '', date: todayISO() };
}

function moveMonth(month: string, offset: number) {
  const [year, number] = month.split('-').map(Number);
  const next = new Date(year, number - 1 + offset, 1, 12);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
}

function expectedDate(month: string, day: number) {
  const [year, number] = month.split('-').map(Number);
  const lastDay = new Date(year, number, 0, 12).getDate();
  return `${month}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}

function validDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T12:00:00`);
  const [year, month, day] = date.split('-').map(Number);
  return !Number.isNaN(parsed.getTime()) && parsed.getFullYear() === year && parsed.getMonth() + 1 === month && parsed.getDate() === day;
}

export default function FinancePage() {
  const { data, update, notify } = useApp();
  const [month, setMonth] = useState(() => todayISO().slice(0, 7));
  const [kindFilter, setKindFilter] = useState<'all' | Transaction['kind']>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<TransactionForm | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState('');
  const [deleting, setDeleting] = useState<Transaction | null>(null);
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetValue, setBudgetValue] = useState('');
  const [budgetError, setBudgetError] = useState('');
  const [ruleForm, setRuleForm] = useState<IncomeRuleForm | null>(null);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [ruleError, setRuleError] = useState('');
  const [deletingRule, setDeletingRule] = useState<IncomeRule | null>(null);
  const [receipt, setReceipt] = useState<IncomeReceipt | null>(null);
  const [receiptError, setReceiptError] = useState('');

  const money = (amount: number) => {
    try {
      return new Intl.NumberFormat('ar-SA', { style: 'currency', currency: data.settings.currency }).format(amount);
    } catch {
      return `${new Intl.NumberFormat('ar-SA', { maximumFractionDigits: 2 }).format(amount)} ${data.settings.currency}`;
    }
  };
  const summary = useMemo(() => financeSummary(data.transactions, month), [data.transactions, month]);
  const monthlyTransactions = useMemo(() => data.transactions.filter(item => item.date.startsWith(`${month}-`)), [data.transactions, month]);
  const categories = useMemo(() => [...new Set(monthlyTransactions.map(item => item.category))].sort((a, b) => a.localeCompare(b, 'ar')), [monthlyTransactions]);
  const transactions = useMemo(() => monthlyTransactions
    .filter(item => kindFilter === 'all' || item.kind === kindFilter)
    .filter(item => categoryFilter === 'all' || item.category === categoryFilter)
    .filter(item => !search.trim() || `${item.title} ${item.category}`.toLocaleLowerCase('ar').includes(search.trim().toLocaleLowerCase('ar')))
    .sort((a, b) => b.date.localeCompare(a.date)), [monthlyTransactions, kindFilter, categoryFilter, search]);
  const budget = data.settings.monthlyBudget;
  const budgetPercent = budget > 0 ? Math.round(summary.expense / budget * 100) : 0;
  const monthTitle = new Intl.DateTimeFormat('ar-SA', { month: 'long', year: 'numeric', calendar: 'gregory' }).format(new Date(`${month}-01T12:00:00`));
  const suggestions = [...new Set([...(form?.kind === 'income' ? incomeCategories : expenseCategories), ...data.transactions.filter(item => item.kind === form?.kind).map(item => item.category)])];
  const incomeRules = data.incomeRules ?? [];
  const expectedIncome = incomeRules.reduce((total, rule) => total + rule.amount, 0);
  const receivedRuleIncome = monthlyTransactions.filter(item => item.kind === 'income' && item.ruleId).reduce((total, item) => total + item.amount, 0);
  const receiptRule = receipt ? incomeRules.find(rule => rule.id === receipt.ruleId) : undefined;

  function selectMonth(value: string) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return;
    setMonth(value);
    setCategoryFilter('all');
  }

  function openNew() {
    setEditingId(null);
    setFormError('');
    setForm(blankForm());
  }

  function openEdit(item: Transaction) {
    setEditingId(item.id);
    setFormError('');
    setForm({ title: item.title, kind: item.kind, amount: String(item.amount), category: item.category, date: item.date, ...(item.ruleId ? { ruleId: item.ruleId } : {}) });
  }

  function saveTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) return;
    const amount = Number(form.amount);
    if (!form.title.trim() || !form.category.trim() || !validDate(form.date) || !Number.isFinite(amount) || amount < 0.01 || amount > 1_000_000_000) {
      setFormError('اكتب عنوانًا وتصنيفًا، وحدّد التاريخ ومبلغًا أكبر من صفر ولا يتجاوز مليارًا.');
      return;
    }
    if (form.ruleId && data.transactions.some(item => item.id !== editingId && item.ruleId === form.ruleId && item.date.slice(0, 7) === form.date.slice(0, 7))) {
      setFormError('تم تسجيل استلام هذا المصدر في الشهر المختار بالفعل. اختر تاريخًا في شهر آخر أو عدّل العملية الموجودة.');
      return;
    }
    const transaction: Transaction = {
      id: editingId || crypto.randomUUID(),
      title: form.title.trim(),
      kind: form.kind,
      amount,
      category: form.category.trim(),
      date: form.date,
      ...(form.ruleId ? { ruleId: form.ruleId } : {}),
    };
    update(draft => {
      const existing = draft.transactions.findIndex(item => item.id === transaction.id);
      if (existing >= 0) draft.transactions[existing] = transaction;
      else draft.transactions.push(transaction);
    });
    selectMonth(transaction.date.slice(0, 7));
    setKindFilter('all');
    setSearch('');
    setForm(null);
    notify(editingId ? 'تم تحديث العملية المالية.' : 'تمت إضافة العملية المالية.');
  }

  function saveBudget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = Number(budgetValue);
    if (!budgetValue.trim() || !Number.isFinite(value) || value < 0 || value > 1_000_000_000) {
      setBudgetError('أدخل ميزانية من صفر إلى مليار.');
      return;
    }
    update(draft => { draft.settings.monthlyBudget = value; });
    setEditingBudget(false);
    notify(value > 0 ? 'تم تحديث الميزانية الشهرية.' : 'تم إلغاء حد الميزانية الشهرية.');
  }

  function openRule(rule?: IncomeRule) {
    setEditingRuleId(rule?.id ?? null);
    setRuleError('');
    setRuleForm(rule ? { title: rule.title, amount: String(rule.amount), category: rule.category, day: rule.day === null ? '' : String(rule.day) } : { title: '', amount: '', category: 'دخل شهري', day: '' });
  }

  function saveRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ruleForm) return;
    const amount = Number(ruleForm.amount);
    const day = ruleForm.day === '' ? null : Number(ruleForm.day);
    if (!ruleForm.title.trim() || !ruleForm.category.trim() || !Number.isFinite(amount) || amount < 0.01 || amount > 1_000_000_000 || (day !== null && (!Number.isInteger(day) || day < 1 || day > 31))) {
      setRuleError('اكتب اسم المصدر وتصنيفه ومبلغًا أكبر من صفر، واختر يومًا من ١ إلى ٣١ أو اترك الموعد غير محدّد.');
      return;
    }
    const rule: IncomeRule = { id: editingRuleId ?? crypto.randomUUID(), title: ruleForm.title.trim(), amount, category: ruleForm.category.trim(), day };
    update(draft => {
      const rules = draft.incomeRules ?? [];
      const existing = rules.findIndex(item => item.id === rule.id);
      if (existing >= 0) rules[existing] = rule;
      else rules.push(rule);
      draft.incomeRules = rules;
    });
    setRuleForm(null);
    notify(editingRuleId ? 'تم تحديث مصدر الدخل. العمليات المستلمة سابقًا لم تتغيّر.' : 'تمت إضافة مصدر الدخل الشهري.');
  }

  function openReceipt(rule: IncomeRule) {
    if (monthlyTransactions.some(item => item.ruleId === rule.id)) {
      notify('تم تسجيل استلام هذا المصدر في الشهر المختار بالفعل.');
      return;
    }
    setReceiptError('');
    setReceipt({ ruleId: rule.id, month, amount: String(rule.amount), date: rule.day === null ? '' : expectedDate(month, rule.day) });
  }

  function saveReceipt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!receipt || !receiptRule) return;
    const amount = Number(receipt.amount);
    if (!Number.isFinite(amount) || amount < 0.01 || amount > 1_000_000_000 || !validDate(receipt.date) || receipt.date.slice(0, 7) !== receipt.month) {
      setReceiptError('أدخل المبلغ المستلم وتاريخ الاستلام الفعلي ضمن الشهر المختار.');
      return;
    }
    if (data.transactions.some(item => item.ruleId === receipt.ruleId && item.date.slice(0, 7) === receipt.month)) {
      setReceiptError('تم تسجيل استلام هذا المصدر في الشهر المختار بالفعل.');
      return;
    }
    const transaction: Transaction = { id: crypto.randomUUID(), title: receiptRule.title, kind: 'income', amount, category: receiptRule.category, date: receipt.date, ruleId: receipt.ruleId };
    update(draft => {
      if (!draft.transactions.some(item => item.ruleId === receipt.ruleId && item.date.slice(0, 7) === receipt.month)) draft.transactions.push(transaction);
    });
    setReceipt(null);
    setKindFilter('all');
    setCategoryFilter('all');
    setSearch('');
    notify('تم تأكيد الاستلام وإضافته إلى الدخل المسجّل.');
  }

  return (
    <div className="stack">
      <SectionHeader eyebrow="مساحتك المالية" title="ميزانيتي" description="سجّل دخلك ومصروفاتك، وتابع ميزانيتك شهرًا بشهر." action={<button className="btn btn-primary" onClick={openNew}><Plus size={18} aria-hidden="true" /> إضافة عملية</button>} />

      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div className="row" style={{ gap: 10 }}>
          <button className="icon-button" aria-label="الشهر السابق" onClick={() => selectMonth(moveMonth(month, -1))}><ChevronRight size={20} aria-hidden="true" /></button>
          <label className="row" style={{ gap: 10 }}><span className="muted">الشهر</span><input className="input" style={{ width: 175 }} type="month" value={month} onChange={event => selectMonth(event.target.value)} aria-label="شهر الميزانية" /></label>
          <button className="icon-button" aria-label="الشهر التالي" onClick={() => selectMonth(moveMonth(month, 1))}><ChevronLeft size={20} aria-hidden="true" /></button>
        </div>
        <span className="chip">{monthTitle}</span>
      </div>

      <section className="card" aria-labelledby="income-rules-title">
        <div className="card-heading"><div><h2 id="income-rules-title">دخلي الشهري المتوقع</h2><p className="muted">مواعيد مصادر دخلك المتكررة في {monthTitle}.</p></div><button className="btn btn-secondary" onClick={() => openRule()}><Plus size={17} aria-hidden="true" /> إضافة مصدر دخل</button></div>
        {incomeRules.length ? <>
          <div className="income-total row" style={{ flexWrap: 'wrap', justifyContent: 'space-between', gap: 14, marginBottom: 20 }}><div><span className="muted">إجمالي الدخل المتوقع</span><strong style={{ display: 'block', fontSize: 28, marginTop: 6 }}>{money(expectedIncome)}</strong></div><div><span className="muted">المستلم من المصادر المتكررة</span><strong style={{ display: 'block', marginTop: 6 }}>{money(receivedRuleIncome)}</strong></div></div>
          <div className="income-rules">
            {incomeRules.map(rule => {
              const received = monthlyTransactions.find(item => item.ruleId === rule.id);
              const date = rule.day === null ? null : expectedDate(month, rule.day);
              return <article className="income-rule" key={rule.id}>
                <div className="income-rule-header row" style={{ justifyContent: 'space-between', gap: 10 }}><strong>{rule.title}</strong><div className="row" style={{ gap: 3 }}><button className="icon-button" aria-label={`تعديل مصدر الدخل ${rule.title}`} onClick={() => openRule(rule)}><Pencil size={16} aria-hidden="true" /></button><button className="icon-button danger" aria-label={`حذف مصدر الدخل ${rule.title}`} onClick={() => setDeletingRule(rule)}><Trash2 size={16} aria-hidden="true" /></button></div></div>
                <strong style={{ display: 'block', fontSize: 23, marginBlock: 10 }}>{money(rule.amount)}</strong>
                <div className="income-rule-meta row muted" style={{ gap: 6, flexWrap: 'wrap' }}><CalendarDays size={15} aria-hidden="true" />{date ? <span>متوقع في <time dateTime={date}>{formatDate(date)}</time>{Number(date.slice(8)) !== rule.day ? ' (آخر يوم في الشهر)' : ''}</span> : <span>موعد الصرف يحتاج تأكيدًا</span>}</div>
                <div className="income-rule-actions row" style={{ marginTop: 16, justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>{received ? <><span className="badge"><CheckCircle2 size={15} aria-hidden="true" /> تم الاستلام: {money(received.amount)}</span><button className="btn btn-ghost" onClick={() => openEdit(received)}>عرض العملية</button></> : <button className="btn btn-secondary" onClick={() => openReceipt(rule)}><CheckCircle2 size={16} aria-hidden="true" /> تأكيد الاستلام</button>}</div>
              </article>;
            })}
          </div>
          <p className="muted" style={{ marginTop: 16 }}>الدخل المتوقع لا يدخل في رصيد الشهر إلا بعد تأكيد الاستلام. المواعيد المتوقعة تتكرر كل شهر.</p>
        </> : <EmptyState icon={CalendarDays} title="أضف مصادر دخلك الشهرية" description="سجّل الراتب أو الدعم ومواعيد صرفه، ثم أكّد الاستلام عند وصول المبلغ." action={<button className="btn btn-primary" onClick={() => openRule()}>إضافة مصدر دخل</button>} />}
      </section>

      <div className="stat-grid">
        <div className="stat-card"><span className="stat-icon"><ArrowDownLeft size={21} aria-hidden="true" /></span><span className="muted">الدخل المسجّل</span><strong>{money(summary.income)}</strong><span className="muted">جميع إيرادات الشهر</span></div>
        <div className="stat-card"><span className="stat-icon"><ArrowUpRight size={21} aria-hidden="true" /></span><span className="muted">المصروفات</span><strong>{money(summary.expense)}</strong><span className="muted">جميع مصروفات الشهر</span></div>
        <div className="stat-card"><span className="stat-icon"><Wallet size={21} aria-hidden="true" /></span><span className="muted">رصيد الشهر</span><strong className={summary.balance < 0 ? 'danger' : undefined}>{money(summary.balance)}</strong><span className="muted">الدخل المسجّل ناقص المصروفات</span></div>
      </div>

      <div className="finance-grid">
        <section className="card" aria-labelledby="budget-title">
          <div className="card-heading"><h2 id="budget-title">الميزانية الشهرية</h2><button className="btn btn-ghost" onClick={() => { setBudgetValue(String(budget)); setBudgetError(''); setEditingBudget(true); }}><Pencil size={16} aria-hidden="true" /> {budget > 0 ? 'تعديل' : 'تحديد الميزانية'}</button></div>
          {editingBudget ? (
            <form className="stack" onSubmit={saveBudget}>
              <Field label={`حد المصروفات الشهري (${data.settings.currency})`}><input className="input" type="number" inputMode="decimal" min="0" max="1000000000" step="0.01" value={budgetValue} onChange={event => setBudgetValue(event.target.value)} autoFocus required /></Field>
              <p className="muted">يُطبّق هذا الحد على كل شهر. أدخل صفرًا لإلغاء الحد.</p>
              {budgetError && <p className="danger" role="alert">{budgetError}</p>}
              <div className="row" style={{ gap: 8 }}><button className="btn btn-primary" type="submit">حفظ الميزانية</button><button className="btn btn-secondary" type="button" onClick={() => setEditingBudget(false)}>إلغاء</button></div>
            </form>
          ) : budget > 0 ? (
            <div className="stack">
              <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}><strong>{money(summary.expense)}</strong><span className="muted">من {money(budget)}</span></div>
              <div className="progress" role="progressbar" aria-label="المصروفات من الميزانية الشهرية" aria-valuenow={Math.min(budgetPercent, 100)} aria-valuemin={0} aria-valuemax={100} aria-valuetext={`${budgetPercent}٪ من الميزانية`}><span style={{ display: 'block', height: '100%', width: `${Math.min(budgetPercent, 100)}%`, background: summary.expense > budget ? 'var(--danger, #dc5454)' : 'var(--accent, #397c69)' }} /></div>
              <div className={summary.expense > budget ? 'notice danger' : 'muted'}>{summary.expense > budget ? `تجاوزت الميزانية بـ ${money(summary.expense - budget)}.` : `المتبقي من الميزانية: ${money(budget - summary.expense)}`} <span>({budgetPercent}٪ مستخدم)</span></div>
            </div>
          ) : <p className="muted">حدّد ميزانية شهرية لتعرف كم صرفت وكم تبقّى من الحد الذي اخترته.</p>}
        </section>

        <section className="card" aria-labelledby="categories-title">
          <div className="card-heading"><h2 id="categories-title">أين تذهب مصروفاتي؟</h2><span className="badge">{summary.categories.length} تصنيفات</span></div>
          {summary.categories.length ? <div className="category-list">
            {[...summary.categories].sort((a, b) => b.amount - a.amount).map(category => {
              const percent = summary.expense > 0 ? category.amount / summary.expense * 100 : 0;
              return <div key={category.name} className="stack" style={{ gap: 8 }}>
                <div className="row" style={{ justifyContent: 'space-between', gap: 10 }}><span>{category.name}</span><strong>{money(category.amount)}</strong></div>
                <div className="progress" aria-hidden="true"><span style={{ display: 'block', height: '100%', width: `${percent}%`, background: 'var(--accent, #397c69)' }} /></div>
                <span className="muted" style={{ fontSize: 12 }}>{Math.round(percent)}٪ من المصروفات</span>
              </div>;
            })}
          </div> : <EmptyState icon={CircleDollarSign} title="لم تسجّل مصروفات هذا الشهر" description="أضف أول مصروف لتظهر التصنيفات هنا." />}
        </section>
      </div>

      <section className="card" aria-labelledby="transactions-title">
        <div className="card-heading"><h2 id="transactions-title">العمليات المالية</h2><span className="badge">{transactions.length} عملية</span></div>
        {monthlyTransactions.length > 0 && <div className="row" style={{ flexWrap: 'wrap', alignItems: 'end', gap: 12, marginBottom: 20 }}>
          <Field label="البحث"><div style={{ position: 'relative' }}><Search size={17} aria-hidden="true" style={{ position: 'absolute', right: 12, top: 13, color: 'var(--muted, #7c8991)' }} /><input className="input" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="عنوان العملية أو التصنيف" style={{ paddingRight: 38 }} /></div></Field>
          <Field label="النوع"><select className="input" value={kindFilter} onChange={event => setKindFilter(event.target.value as 'all' | Transaction['kind'])}><option value="all">كل العمليات</option><option value="expense">المصروفات</option><option value="income">الدخل</option></select></Field>
          <Field label="التصنيف"><select className="input" value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)}><option value="all">كل التصنيفات</option>{categories.map(category => <option key={category} value={category}>{category}</option>)}</select></Field>
        </div>}
        {transactions.length > 0 ? <div className="transaction-list">
          {transactions.map(item => <div className="transaction-item" key={item.id}>
            <span className={`transaction-icon ${item.kind}`} aria-hidden="true">{item.kind === 'income' ? <ArrowDownLeft size={20} /> : <ArrowUpRight size={20} />}</span>
            <div style={{ flex: 1, minWidth: 0 }}><strong style={{ overflowWrap: 'anywhere' }}>{item.title}</strong><div className="row muted" style={{ flexWrap: 'wrap', gap: 8, fontSize: 13, marginTop: 5 }}><span>{item.kind === 'income' ? 'دخل' : 'مصروف'}</span><span>·</span><span>{item.category}</span><span>·</span><time dateTime={item.date}>{formatDate(item.date, true)}</time></div></div>
            <strong style={{ whiteSpace: 'nowrap', color: item.kind === 'income' ? 'var(--accent, #397c69)' : undefined }}>{item.kind === 'income' ? '+' : '−'}{money(item.amount)}</strong>
            <div className="row" style={{ gap: 4 }}><button className="icon-button" aria-label={`تعديل ${item.title}`} onClick={() => openEdit(item)}><Pencil size={17} aria-hidden="true" /></button><button className="icon-button danger" aria-label={`حذف ${item.title}`} onClick={() => setDeleting(item)}><Trash2 size={17} aria-hidden="true" /></button></div>
          </div>)}
        </div> : monthlyTransactions.length === 0 ? <EmptyState icon={Wallet} title="بداية واضحة لميزانيتك" description={`لا توجد عمليات مسجّلة في ${monthTitle}. سجّل دخلك أو أول مصروف.`} action={<button className="btn btn-primary" onClick={openNew}><Plus size={17} aria-hidden="true" /> إضافة عملية</button>} /> : <EmptyState icon={Search} title="لا توجد عمليات مطابقة" description="جرّب كلمة أخرى أو أزل عوامل التصفية." action={<button className="btn btn-secondary" onClick={() => { setSearch(''); setKindFilter('all'); setCategoryFilter('all'); }}>مسح التصفية</button>} />}
      </section>

      {form && <Modal title={editingId ? 'تعديل العملية المالية' : 'إضافة عملية مالية'} onClose={() => setForm(null)}>
        <form className="stack" onSubmit={saveTransaction}>
          <Field label="عنوان العملية"><input className="input" value={form.title} maxLength={120} onChange={event => setForm({ ...form, title: event.target.value })} placeholder="مثل: شراء كتب للمادة" required autoFocus /></Field>
          <div className="form-grid">
            <Field label="النوع"><select className="input" value={form.kind} disabled={Boolean(form.ruleId)} onChange={event => setForm({ ...form, kind: event.target.value as Transaction['kind'], category: '' })}><option value="expense">مصروف</option><option value="income">دخل</option></select></Field>
            <Field label={`المبلغ (${data.settings.currency})`}><input className="input" type="number" inputMode="decimal" value={form.amount} min="0.01" max="1000000000" step="0.01" onChange={event => setForm({ ...form, amount: event.target.value })} placeholder="0.00" required /></Field>
            <Field label="التصنيف"><input className="input" value={form.category} maxLength={60} list="finance-category-options" onChange={event => setForm({ ...form, category: event.target.value })} placeholder="اختر أو اكتب تصنيفًا" required /><datalist id="finance-category-options">{suggestions.map(category => <option key={category} value={category} />)}</datalist></Field>
            <Field label="التاريخ"><input className="input" type="date" value={form.date} onChange={event => setForm({ ...form, date: event.target.value })} required /></Field>
          </div>
          {form.ruleId && <p className="muted">هذه عملية استلام مرتبطة بمصدر دخل شهري. يمكنك تعديل المبلغ أو تاريخ الاستلام.</p>}
          {formError && <p className="danger" role="alert">{formError}</p>}
          <div className="row" style={{ gap: 8 }}><button className="btn btn-primary" type="submit">{editingId ? 'حفظ التعديلات' : 'إضافة العملية'}</button><button className="btn btn-secondary" type="button" onClick={() => setForm(null)}>إلغاء</button></div>
        </form>
      </Modal>}

      {deleting && <Modal title="حذف العملية المالية" onClose={() => setDeleting(null)}>
        <div className="stack"><p>هل تريد حذف «{deleting.title}» بقيمة {money(deleting.amount)}؟ ستتغيّر إجماليات الشهر بعد الحذف.</p><div className="row" style={{ gap: 8 }}><button className="btn btn-primary" style={{ background: 'var(--danger, #dc5454)' }} onClick={() => { update(draft => { draft.transactions = draft.transactions.filter(item => item.id !== deleting.id); }); setDeleting(null); notify('تم حذف العملية المالية.'); }}>حذف العملية</button><button className="btn btn-secondary" onClick={() => setDeleting(null)}>إلغاء</button></div></div>
      </Modal>}

      {ruleForm && <Modal title={editingRuleId ? 'تعديل مصدر الدخل الشهري' : 'إضافة مصدر دخل شهري'} onClose={() => setRuleForm(null)}>
        <form className="stack" onSubmit={saveRule}>
          <Field label="اسم مصدر الدخل"><input className="input" value={ruleForm.title} onChange={event => setRuleForm({ ...ruleForm, title: event.target.value })} maxLength={120} placeholder="مثل: الراتب" required autoFocus /></Field>
          <div className="form-grid"><Field label={`المبلغ الشهري المتوقع (${data.settings.currency})`}><input className="input" type="number" inputMode="decimal" value={ruleForm.amount} onChange={event => setRuleForm({ ...ruleForm, amount: event.target.value })} min="0.01" max="1000000000" step="0.01" required /></Field><Field label="يوم الصرف المتوقع"><select className="input" value={ruleForm.day} onChange={event => setRuleForm({ ...ruleForm, day: event.target.value })}><option value="">غير محدّد / يحتاج تأكيدًا</option>{Array.from({ length: 31 }, (_, index) => index + 1).map(day => <option key={day} value={day}>يوم {day} من كل شهر</option>)}</select></Field></div>
          <Field label="التصنيف"><input className="input" value={ruleForm.category} onChange={event => setRuleForm({ ...ruleForm, category: event.target.value })} maxLength={60} required /></Field>
          <p className="muted">في الأشهر التي تنتهي قبل اليوم المختار، يظهر الموعد في آخر يوم من الشهر. تغيير المصدر لا يغيّر العمليات المستلمة سابقًا.</p>
          {ruleError && <p className="danger" role="alert">{ruleError}</p>}
          <div className="row" style={{ gap: 8 }}><button className="btn btn-primary" type="submit">حفظ المصدر</button><button className="btn btn-secondary" type="button" onClick={() => setRuleForm(null)}>إلغاء</button></div>
        </form>
      </Modal>}

      {deletingRule && <Modal title="حذف مصدر الدخل الشهري" onClose={() => setDeletingRule(null)}><div className="stack"><p>هل تريد حذف مصدر «{deletingRule.title}» من الدخل المتوقع؟ ستبقى جميع العمليات المستلمة سابقًا في سجلّك.</p><div className="row" style={{ gap: 8 }}><button className="btn btn-primary" style={{ background: 'var(--danger, #dc5454)' }} onClick={() => { update(draft => { draft.incomeRules = (draft.incomeRules ?? []).filter(rule => rule.id !== deletingRule.id); }); setDeletingRule(null); notify('تم حذف مصدر الدخل مع الاحتفاظ بالعمليات المسجّلة.'); }}>حذف المصدر</button><button className="btn btn-secondary" onClick={() => setDeletingRule(null)}>إلغاء</button></div></div></Modal>}

      {receipt && receiptRule && <Modal title={`تأكيد استلام ${receiptRule.title}`} onClose={() => setReceipt(null)}>
        <form className="stack" onSubmit={saveReceipt}>
          <p>راجع المبلغ وتاريخ الاستلام الفعلي. تأكيدك يضيف عملية دخل واحدة إلى سجل الشهر المختار.</p>
          <div className="form-grid"><Field label={`المبلغ المستلم (${data.settings.currency})`}><input className="input" type="number" inputMode="decimal" value={receipt.amount} onChange={event => setReceipt({ ...receipt, amount: event.target.value })} min="0.01" max="1000000000" step="0.01" required /></Field><Field label="تاريخ الاستلام الفعلي"><input className="input" type="date" value={receipt.date} onChange={event => setReceipt({ ...receipt, date: event.target.value })} min={`${receipt.month}-01`} max={expectedDate(receipt.month, 31)} required /></Field></div>
          {receipt.date > todayISO() && <p className="notice">التاريخ المختار في المستقبل. تأكّد أنه تاريخ الاستلام الفعلي قبل إضافته إلى السجل.</p>}
          {receiptError && <p className="danger" role="alert">{receiptError}</p>}
          <div className="row" style={{ gap: 8 }}><button className="btn btn-primary" type="submit">نعم، استلمت المبلغ</button><button className="btn btn-secondary" type="button" onClick={() => setReceipt(null)}>إلغاء</button></div>
        </form>
      </Modal>}
    </div>
  );
}
