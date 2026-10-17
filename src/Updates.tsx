import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, BookOpen, ExternalLink, Globe2, Newspaper, RefreshCw, Search, Ship } from 'lucide-react';
import { EmptyState, Field, SectionHeader } from './ui';

type Category = 'all' | 'saudi' | 'shipping' | 'procurement' | 'warehouse';
type NewsItem = {
  id: string; title: string; summary: string; url: string; sourceName: string; feedName: string;
  publisherURL: string | null; publishedAt: string; categories: Category[];
};
type NewsResult = {
  status: 'ready' | 'partial' | 'stale' | 'empty' | 'unavailable'; items: NewsItem[];
  fetchedAt: string | null; stale: boolean; retryAfterSeconds: number; message: string;
  sources: { id: string; name: string; itemCount: number }[];
  unavailableSources: { sourceId: string; sourceName: string; status: string }[];
};
const categories: { id: Category; label: string }[] = [
  { id: 'all', label: 'آخر أخبار التخصص' }, { id: 'saudi', label: 'في السعودية' },
  { id: 'shipping', label: 'النقل والشحن' }, { id: 'procurement', label: 'المشتريات والتوريد' },
  { id: 'warehouse', label: 'المخزون والمستودعات' },
];
const date = (value: string, withTime = false) => new Intl.DateTimeFormat('ar-SA-u-ca-gregory', {
  day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Riyadh',
  ...(withTime ? { hour: 'numeric', minute: '2-digit' } as const : {}),
}).format(new Date(value));
const numeral = (value: number) => new Intl.NumberFormat('ar-SA').format(value);

export default function UpdatesPage() {
  const [result, setResult] = useState<NewsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [category, setCategory] = useState<Category>('all');
  const [query, setQuery] = useState('');
  const [retryAt, setRetryAt] = useState(0);
  const [clock, setClock] = useState(Date.now());
  const request = useRef<AbortController | null>(null);
  const sequence = useRef(0);

  async function load(refresh = false) {
    const current = ++sequence.current;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true); setError('');
    const timeout = window.setTimeout(() => controller.abort(), 22000);
    try {
      const response = await fetch(refresh ? '/api/news?refresh=1' : '/api/news', { signal: controller.signal, headers: { Accept: 'application/json' } });
      if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error('service-unavailable');
      const payload = await response.json() as NewsResult;
      if (!Array.isArray(payload.items) || !['ready', 'partial', 'stale', 'empty', 'unavailable'].includes(payload.status)) throw new Error('invalid-response');
      if (current !== sequence.current) return;
      setResult(payload);
      setRetryAt(Date.now() + Math.max(0, payload.retryAfterSeconds || 0) * 1000);
      setClock(Date.now());
    } catch {
      if (current !== sequence.current) return;
      setError('تعذر الاتصال بخدمة الأخبار الآن. يمكنك إعادة المحاولة بعد قليل.');
      setRetryAt(Date.now() + 10000); setClock(Date.now());
    } finally {
      window.clearTimeout(timeout);
      if (current === sequence.current) setLoading(false);
    }
  }
  useEffect(() => { void load(); return () => { ++sequence.current; request.current?.abort(); }; }, []);
  useEffect(() => {
    if (!retryAt || retryAt <= Date.now()) return;
    const timer = window.setInterval(() => {
      const now = Date.now(); setClock(now);
      if (now >= retryAt) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);
  const remaining = Math.max(0, Math.ceil((retryAt - clock) / 1000));
  const items = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('ar-SA');
    return (result?.items ?? []).filter(item => (category === 'all' || item.categories.includes(category)) && (!term || `${item.title} ${item.summary} ${item.sourceName}`.toLocaleLowerCase('ar-SA').includes(term)));
  }, [result, category, query]);
  const unavailable = result?.status === 'unavailable' || !!error;
  const stale = !!result && (result.stale || !!error);
  const refreshButton = <button className="btn btn-secondary" disabled={loading || remaining > 0} onClick={() => void load(true)}><RefreshCw size={17} className={loading ? 'news-refreshing' : undefined} />{loading ? 'جارٍ جلب الأخبار…' : remaining > 0 ? `التحديث بعد ${numeral(remaining)} ث` : 'تحديث الأخبار'}</button>;
  function resetFilters() { setCategory('all'); setQuery(''); }

  return <div className="updates-page stack">
    <SectionHeader eyebrow="من المقرر إلى الواقع" title="جديد تخصصك" description="أخبار النقل والمخزون والمشتريات وسلاسل الإمداد، بمصدر وتاريخ نشر واضحين." action={refreshButton} />
    <section className="news-hero card">
      <div className="news-hero-icon" aria-hidden="true"><Ship size={30} /></div>
      <div><span className="eyebrow">عينك على قطاع اللوجستيات</span><h2>اربط دراستك بما يحدث حولك.</h2><p className="muted">اقرأ الخبر، وحدد علاقته بمادة تدرسها، ثم دوّن أثره المحتمل على التكلفة أو الوقت أو مستوى الخدمة. أي استنتاج منك يحتاج مراجعة المصدر.</p></div>
    </section>
    <section className={`news-status notice${unavailable || stale ? ' notice-warning' : ''}`} aria-live="polite" aria-busy={loading}>
      {unavailable || stale ? <AlertCircle size={20} /> : <Globe2 size={20} />}
      <div><strong>{loading && !result ? 'نبحث في مصادر أخبار التخصص…' : error || result?.message || 'بانتظار أخبار التخصص.'}</strong>
        {result?.fetchedAt && <p className="news-date">{stale ? 'آخر نسخة محفوظة' : 'آخر جلب للمصادر'}: <time dateTime={result.fetchedAt}>{date(result.fetchedAt, true)}</time> · بتوقيت الرياض</p>}
        {stale && <p>الأخبار المعروضة محفوظة من جلب سابق؛ تحقق من تاريخ كل خبر قبل الاعتماد عليه.</p>}
        {!loading && result?.unavailableSources.length ? <p className="muted">مصادر تعذر تحديثها: {result.unavailableSources.map(source => source.sourceName).join('، ')}.</p> : null}
      </div>
    </section>
    <section className="card stack news-filters" aria-label="البحث في أخبار التخصص">
      <div className="news-search"><Field label="ابحث داخل الأخبار المحملة"><span className="news-search-input"><Search size={18} aria-hidden="true" /><input type="search" placeholder="مثال: الموانئ، المخزون، supply chain" value={query} onChange={event => setQuery(event.target.value)} /></span></Field><span className="muted" role="status">{numeral(items.length)} خبر مطابق</span></div>
      <div className="news-topics" role="group" aria-label="تصنيف أخبار التخصص">{categories.map(item => <button key={item.id} className={category === item.id ? 'chip active' : 'chip'} aria-pressed={category === item.id} onClick={() => setCategory(item.id)}>{item.label}</button>)}</div>
      {(query || category !== 'all') && <button className="btn btn-ghost" onClick={resetFilters}>مسح التصفية</button>}
    </section>
    {items.length ? <div className="news-grid">{items.map(item => <article key={item.id} className="card news-card">
      <div className="news-meta"><span className="news-source"><Newspaper size={16} />{item.sourceName}</span><time className="news-date" dateTime={item.publishedAt}>{date(item.publishedAt)}</time></div>
      <h2>{item.title}</h2>
      {item.summary && <p className="news-summary">{item.summary}</p>}
      {!!item.categories.length && <div className="news-topics">{item.categories.map(topic => <span className="chip" key={topic}>{categories.find(entry => entry.id === topic)?.label}</span>)}</div>}
      <div className="news-footer"><a className="btn btn-secondary" href={item.url} target="_blank" rel="noopener noreferrer">اقرأ الخبر من المصدر<ExternalLink size={16} /></a><span className="muted">{item.feedName.includes('Google') ? 'رابط الخبر عبر أخبار Google' : 'من موقع الناشر'}</span></div>
    </article>)}</div> : !loading && <EmptyState icon={unavailable ? Globe2 : Search} title={unavailable ? 'الأخبار غير متاحة حالياً' : query || category !== 'all' ? 'لا يوجد خبر مطابق للتصفية' : 'لا توجد أخبار حديثة مطابقة الآن'} description={unavailable ? 'تعذر الوصول إلى المصادر. عند عودة الاتصال ستظهر الأخبار الفعلية بمصادرها وتواريخها؛ لن نملأ الصفحة بأخبار افتراضية.' : query || category !== 'all' ? 'جرّب كلمة أخرى أو أزل التصفية. البحث هنا في الأخبار التي جُلبت فقط.' : 'المصادر المتاحة لم تعرض خبراً حديثاً مطابقاً للتخصص. يمكنك التحديث لاحقاً.'} action={query || category !== 'all' ? <button className="btn btn-secondary" onClick={resetFilters}>عرض أخبار التخصص المحملة</button> : undefined} />}
    <aside className="card news-reading-tip"><h3><BookOpen size={18} /> خذ فائدة واحدة من كل خبر</h3><p className="muted">اكتب: ماذا حدث؟ بأي مفهوم من مقرراتي يرتبط؟ وما الدليل في المصدر؟ الأخبار معرفة مساندة لدراستك، وليست بديلاً عن محاضرتك أو إعلان الجامعة.</p></aside>
    <p className="muted news-disclaimer">مصادر المتابعة: الجهات السعودية الرسمية عبر أخبار Google، وSupply Chain Dive. تُجلب الأخبار عند فتح الصفحة أو التحديث وتُحفظ مؤقتاً عشر دقائق؛ التغطية تعتمد على ما تنشره هذه المصادر. راجع الإعلان الأصلي لأي قرار أو لائحة. روابط المصادر تفتح خارج مدار.</p>
  </div>;
}
