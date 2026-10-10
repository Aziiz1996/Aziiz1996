import { useState } from 'react';
import { BriefcaseBusiness, ExternalLink, Search } from 'lucide-react';
import { SectionHeader } from './ui';

const categories = ['الكل', 'توظيف', 'دورات', 'شهادات مهنية', 'تجسير وإكمال دراسة'] as const;
type Category = typeof categories[number];
const resources: { name: string; category: Category; url: string; description: string; terms: string }[] = [
  { name: 'جدارات', category: 'توظيف', url: 'https://jadarat.sa/', description: 'ابحث عن إعلانات وظائف المشتريات والمخزون والمستودعات واللوجستيات.', terms: 'تحقق من المؤهل المطلوب والخبرة وموقع الوظيفة قبل التقديم.' },
  { name: 'صندوق تنمية الموارد البشرية — هدف', category: 'توظيف', url: 'https://www.hrdf.org.sa/', description: 'استكشف برامج دعم التوظيف والتدريب وخدمات تطوير المسار المهني.', terms: 'أهلية كل برنامج تختلف؛ راجع اشتراطاته الحالية لحامل الدبلوم.' },
  { name: 'LinkedIn', category: 'توظيف', url: 'https://www.linkedin.com/jobs/', description: 'ابحث عن Supply Chain وLogistics وWarehouse وProcurement، وتابع صفحات الشركات.', terms: 'راجع جهة الإعلان وتفاصيل الوظيفة؛ وجود الإعلان لا يعني اعتماده من التطبيق.' },
  { name: 'دروب', category: 'دورات', url: 'https://doroob.sa/', description: 'استكشف التدريب الإلكتروني والمهارات التي تدعم التوظيف والعمل الإداري.', terms: 'توفر دورة متخصصة ورسومها ونوع شهادتها يراجع في صفحة الدورة.' },
  { name: 'المؤسسة العامة للتدريب التقني والمهني', category: 'دورات', url: 'https://tvtc.gov.sa/', description: 'راجع خدمات التدريب ومعلومات المنشآت والبرامج التدريبية.', terms: 'تحقق من ترخيص الجهة واعتماد البرنامج؛ ترخيص المنشأة وحده لا يثبت اعتماد كل شهادة.' },
  { name: 'ASCM', category: 'شهادات مهنية', url: 'https://www.ascm.org/', description: 'استكشف شهادات CPIM وCSCP وCLTD في المخزون وسلاسل الإمداد واللوجستيات.', terms: 'راجع المتطلبات واللغة والرسوم. الشهادة المهنية لا تعادل تلقائياً مؤهلاً جامعياً.' },
  { name: 'CIPS', category: 'شهادات مهنية', url: 'https://www.cips.org/', description: 'مسارات تعلم وشهادات متخصصة في المشتريات والتوريد.', terms: 'اختر المستوى المناسب وتحقق من جهة التدريب ومتطلبات الالتحاق.' },
  { name: 'الجامعة السعودية الإلكترونية', category: 'تجسير وإكمال دراسة', url: 'https://seu.edu.sa/', description: 'راجع إعلانات القبول وسياسات إكمال الدراسة ومعادلة المقررات.', terms: 'هذا رابط للاستفسار عن القبول؛ لم يتم التحقق من وجود تجسير متاح لدبلومك.' },
  { name: 'جامعة الملك عبدالعزيز', category: 'تجسير وإكمال دراسة', url: 'https://www.kau.edu.sa/', description: 'راجع بوابات القبول وإعلانات البرامج، واستفسر عن المسارات المناسبة لمؤهلك.', terms: 'توفر برنامج وشروط قبول الدبلوم ومعادلته تحتاج تأكيداً من الجامعة.' },
  { name: 'جامعة الملك سعود', category: 'تجسير وإكمال دراسة', url: 'https://ksu.edu.sa/', description: 'تابع القبول والبرامج الأكاديمية واسأل عن إكمال الدراسة ومعادلة الساعات.', terms: 'هذا دليل لجهة أكاديمية، وليس إعلاناً عن تجسير مفتوح.' },
];

export default function OpportunitiesPage() {
  const [category, setCategory] = useState<Category>('الكل');
  const [query, setQuery] = useState('');
  const filtered = resources.filter(r => (category === 'الكل' || r.category === category) && `${r.name} ${r.description} ${r.category}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <div className="page-content stack">
    <SectionHeader eyebrow="خطوتك بعد الدبلوم" title="فرص سلاسل الإمداد" description="دليل للتوظيف والتدريب والشهادات وإكمال الدراسة." />
    <p className="notice">هذه روابط لجهات ومنصات، وليست قائمة إعلانات محدثة تلقائياً. راجع المواعيد والأهلية والاعتماد داخل موقع الجهة؛ الروابط لم تُفحص مباشرة في هذه البيئة.</p>
    <div className="row opportunity-filters"><div className="search-field"><Search size={18} /><input aria-label="البحث في مواقع الفرص" value={query} onChange={e => setQuery(e.target.value)} placeholder="وظائف، مخزون، مشتريات، شهادات…" /></div><select className="input" aria-label="نوع الفرصة" value={category} onChange={e => setCategory(e.target.value as Category)}>{categories.map(c => <option key={c}>{c}</option>)}</select></div>
    <section className="card stack"><h2><BriefcaseBusiness size={20} />كلمات تساعدك في البحث</h2><p>مساعد مشتريات، منسق لوجستي، مراقب مخزون، أمين مستودع، منسق سلاسل الإمداد، مساعد تخطيط.</p><p dir="ltr">Supply Chain Assistant · Logistics Coordinator · Inventory Controller · Warehouse · Procurement Assistant</p><p className="muted">هذه كلمات بحث، وليست وظائف مضمونة أو تأكيداً لمناسبة كل إعلان لدبلومك.</p></section>
    <div className="note-grid">{filtered.map(resource => <article className="card stack" key={resource.name}><span className="badge">{resource.category}</span><h2>{resource.name}</h2><p>{resource.description}</p><p className="muted">{resource.terms}</p><a className="btn btn-primary" href={resource.url} target="_blank" rel="noopener noreferrer" aria-label={`فتح ${resource.name}`}><ExternalLink size={17} />فتح الموقع</a></article>)}</div>
    {!filtered.length && <p role="status">لا توجد روابط مطابقة. غيّر كلمة البحث أو اختر كل الأنواع.</p>}
    <section className="card stack"><h2>قبل التقديم للتجسير</h2><p>اسأل جهة القبول عن قبول تخصص دبلومك والجهة المانحة، والمعدل المطلوب، ومعادلة الساعات، ونمط الدراسة والرسوم وموعد التقديم. قبول الدبلوم لا يعني بالضرورة وجود برنامج تجسير.</p></section>
  </div>;
}
