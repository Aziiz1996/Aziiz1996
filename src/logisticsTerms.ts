export type LogisticsCategory = 'shipping' | 'documents' | 'warehousing' | 'metrics' | 'contracts' | 'safety';
export interface LogisticsTerm { id: string; abbreviation: string; english: string; arabic: string; category: LogisticsCategory; note?: string; }
export const LOGISTICS_CATEGORIES: { id: LogisticsCategory; label: string }[] = [
  { id: 'shipping', label: 'النقل وسلاسل الإمداد' }, { id: 'documents', label: 'المستندات والمشتريات' },
  { id: 'warehousing', label: 'المخازن والمستودعات' }, { id: 'metrics', label: 'القياس والأداء' },
  { id: 'contracts', label: 'الشحن والعقود' }, { id: 'safety', label: 'الجودة والسلامة' },
];
/** Transcribed from the user's terminology image; the two Bill of Lading rows are preserved. */
export const LOGISTICS_TERMS: LogisticsTerm[] = [
  { id: 'ETA', abbreviation: 'ETA', english: 'Estimated Time of Arrival', arabic: 'وقت الوصول المتوقع', category: 'shipping' },
  { id: 'ETD', abbreviation: 'ETD', english: 'Estimated Time of Departure', arabic: 'وقت المغادرة المتوقع', category: 'shipping' },
  { id: 'ATD', abbreviation: 'ATD', english: 'Actual Time of Departure', arabic: 'وقت المغادرة الفعلي', category: 'shipping' },
  { id: 'ATA', abbreviation: 'ATA', english: 'Actual Time of Arrival', arabic: 'وقت الوصول الفعلي', category: 'shipping' },
  { id: 'POD', abbreviation: 'POD', english: 'Proof of Delivery', arabic: 'إثبات التسليم', category: 'documents' },
  { id: 'BOL', abbreviation: 'BOL', english: 'Bill of Lading', arabic: 'سند الشحن', category: 'documents' },
  { id: 'AWB', abbreviation: 'AWB', english: 'Air Waybill', arabic: 'بوليصة الشحن الجوي', category: 'documents' },
  { id: 'BL', abbreviation: 'BL', english: 'Bill of Lading (Sea)', arabic: 'سند الشحن البحري', category: 'documents' },
  { id: 'HS Code', abbreviation: 'HS Code', english: 'Harmonized System Code', arabic: 'الرمز الجمركي الموحد', category: 'documents' },
  { id: 'CBM', abbreviation: 'CBM', english: 'Cubic Meter', arabic: 'المتر المكعب', category: 'metrics' },
  { id: 'KG', abbreviation: 'KG', english: 'Kilogram', arabic: 'كيلوغرام', category: 'metrics' },
  { id: 'TON', abbreviation: 'TON', english: 'Ton (Metric)', arabic: 'الطن المتري', category: 'metrics' },
  { id: 'FCL', abbreviation: 'FCL', english: 'Full Container Load', arabic: 'حمولة الحاوية الكاملة', category: 'shipping' },
  { id: 'LCL', abbreviation: 'LCL', english: 'Less than Container Load', arabic: 'حمولة أقل من حاوية كاملة', category: 'shipping' },
  { id: 'FTL', abbreviation: 'FTL', english: 'Full Truck Load', arabic: 'حمولة الشاحنة الكاملة', category: 'shipping' },
  { id: 'LTL', abbreviation: 'LTL', english: 'Less than Truck Load', arabic: 'حمولة أقل من الشاحنة', category: 'shipping' },
  { id: 'TMS', abbreviation: 'TMS', english: 'Transport Management System', arabic: 'نظام إدارة النقل', category: 'shipping' },
  { id: 'WMS', abbreviation: 'WMS', english: 'Warehouse Management System', arabic: 'نظام إدارة المستودعات', category: 'warehousing' },
  { id: 'SCM', abbreviation: 'SCM', english: 'Supply Chain Management', arabic: 'إدارة سلسلة الإمداد', category: 'shipping' },
  { id: '3PL', abbreviation: '3PL', english: 'Third Party Logistics', arabic: 'مزود الخدمات اللوجستية من الطرف الثالث', category: 'shipping' },
  { id: '4PL', abbreviation: '4PL', english: 'Fourth Party Logistics', arabic: 'مزود الخدمات اللوجستية من الطرف الرابع', category: 'shipping' },
  { id: 'RMA', abbreviation: 'RMA', english: 'Return Merchandise Authorization', arabic: 'إذن إرجاع البضاعة', category: 'documents' },
  { id: 'DC', abbreviation: 'DC', english: 'Distribution Center', arabic: 'مركز التوزيع', category: 'warehousing' },
  { id: 'FC', abbreviation: 'FC', english: 'Fulfillment Center', arabic: 'مركز تنفيذ الطلبات', category: 'warehousing' },
  { id: 'PO', abbreviation: 'PO', english: 'Purchase Order', arabic: 'أمر الشراء', category: 'documents' },
  { id: 'SO', abbreviation: 'SO', english: 'Sales Order', arabic: 'أمر البيع', category: 'documents' },
  { id: 'INV', abbreviation: 'INV', english: 'Invoice', arabic: 'الفاتورة', category: 'documents' },
  { id: 'C/O', abbreviation: 'C/O', english: 'Certificate of Origin', arabic: 'شهادة المنشأ', category: 'documents' },
  { id: 'D/O', abbreviation: 'D/O', english: 'Delivery Order', arabic: 'إذن التسليم', category: 'documents' },
  { id: 'FR', abbreviation: 'FR', english: 'Freight', arabic: 'أجرة الشحن', category: 'contracts' },
  { id: 'CFR', abbreviation: 'CFR', english: 'Cost and Freight', arabic: 'التكلفة والشحن', category: 'contracts' },
  { id: 'CIF', abbreviation: 'CIF', english: 'Cost, Insurance and Freight', arabic: 'التكلفة والتأمين والشحن', category: 'contracts' },
  { id: 'FOB', abbreviation: 'FOB', english: 'Free on Board', arabic: 'التسليم على ظهر السفينة', category: 'contracts' },
  { id: 'DDP', abbreviation: 'DDP', english: 'Delivered Duty Paid', arabic: 'تسليم مع دفع الرسوم الجمركية', category: 'contracts' },
  { id: 'DDU', abbreviation: 'DDU', english: 'Delivered Duty Unpaid', arabic: 'تسليم بدون دفع الرسوم الجمركية', category: 'contracts', note: 'مصطلح تاريخي في شروط التجارة الدولية. تحقق من إصدار الشروط المعتمد في عقدك؛ لا يُستخدم DDU ضمن Incoterms 2020.' },
  { id: 'INCOTERMS', abbreviation: 'INCOTERMS', english: 'International Commercial Terms', arabic: 'مصطلحات التجارة الدولية', category: 'contracts' },
  { id: 'TAT', abbreviation: 'TAT', english: 'Turnaround Time', arabic: 'وقت الدورة التشغيلية', category: 'metrics' },
  { id: 'SLA', abbreviation: 'SLA', english: 'Service Level Agreement', arabic: 'اتفاقية مستوى الخدمة', category: 'contracts' },
  { id: 'KPI', abbreviation: 'KPI', english: 'Key Performance Indicator', arabic: 'مؤشر الأداء الرئيسي', category: 'metrics' },
  { id: 'EDI', abbreviation: 'EDI', english: 'Electronic Data Interchange', arabic: 'التبادل الإلكتروني للبيانات', category: 'documents' },
  { id: 'ASN', abbreviation: 'ASN', english: 'Advance Shipping Notice', arabic: 'إشعار الشحن المسبق', category: 'documents' },
  { id: 'VGM', abbreviation: 'VGM', english: 'Verified Gross Mass', arabic: 'الوزن الإجمالي المؤكد', category: 'metrics' },
  { id: 'DEM', abbreviation: 'DEM', english: 'Demurrage', arabic: 'رسوم التأخير في الميناء', category: 'shipping' },
  { id: 'DET', abbreviation: 'DET', english: 'Detention', arabic: 'رسوم احتجاز الحاوية', category: 'shipping' },
  { id: 'CFS', abbreviation: 'CFS', english: 'Container Freight Station', arabic: 'محطة تجميع الحاويات', category: 'warehousing' },
  { id: 'IMO', abbreviation: 'IMO', english: 'International Maritime Organization', arabic: 'المنظمة البحرية الدولية', category: 'safety' },
  { id: 'HSE', abbreviation: 'HSE', english: 'Health, Safety & Environment', arabic: 'الصحة والسلامة والبيئة', category: 'safety' },
  { id: 'GDP', abbreviation: 'GDP', english: 'Good Distribution Practice', arabic: 'ممارسات التوزيع الجيد', category: 'safety', note: 'المقصود بهذا الاختصار في الصورة هو ممارسات التوزيع الجيد في السياق اللوجستي.' },
  { id: 'RFS', abbreviation: 'RFS', english: 'Ready for Shipment', arabic: 'جاهز للشحن', category: 'shipping' },
  { id: 'RFP', abbreviation: 'RFP', english: 'Request for Proposal', arabic: 'طلب تقديم عرض', category: 'documents' },
];

export function normalizeLogisticsSearch(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('en').replace(/[\u064b-\u065f\u0670\u0640]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
}
export function searchTerms(query: string, category: LogisticsCategory | 'all' = 'all', source: readonly LogisticsTerm[] = LOGISTICS_TERMS): LogisticsTerm[] {
  const tokens = normalizeLogisticsSearch(query).split(' ').filter(Boolean);
  return source.filter(term => {
    if (category !== 'all' && term.category !== category) return false;
    const haystack = normalizeLogisticsSearch(`${term.abbreviation} ${term.english} ${term.arabic}`);
    return tokens.every(token => haystack.includes(token));
  });
}
function randomSource(seed: number): () => number {
  let state = Math.trunc(seed) >>> 0;
  return () => { state += 0x6d2b79f5; let result = Math.imul(state ^ (state >>> 15), 1 | state); result ^= result + Math.imul(result ^ (result >>> 7), 61 | result); return ((result ^ (result >>> 14)) >>> 0) / 4294967296; };
}
export function shuffleTerms<T>(values: readonly T[], seed: number): T[] {
  const result = [...values]; const random = randomSource(seed);
  for (let index = result.length - 1; index > 0; index--) { const next = Math.floor(random() * (index + 1)); [result[index], result[next]] = [result[next], result[index]]; }
  return result;
}
export interface TermQuizQuestion { id: string; termId: string; abbreviation: string; english: string; options: string[]; correctAnswer: string; }
export interface TermQuizReview { question: TermQuizQuestion; answer: string | undefined; correct: boolean; }
export function createTermQuiz(source: readonly LogisticsTerm[] = LOGISTICS_TERMS, count = 10, seed = 1): TermQuizQuestion[] {
  const unique = [...new Map(source.map(term => [term.id, term])).values()];
  const meanings = [...new Set(unique.map(term => term.arabic))];
  if (meanings.length < 2 || !Number.isFinite(count) || count < 1) return [];
  return shuffleTerms(unique, seed).slice(0, Math.min(unique.length, Math.floor(count))).map((term, index) => {
    const otherMeanings = shuffleTerms(meanings.filter(meaning => meaning !== term.arabic), seed + index * 31 + 7).slice(0, 3);
    return { id: `term-${index}-${term.id}`, termId: term.id, abbreviation: term.abbreviation, english: term.english, correctAnswer: term.arabic, options: shuffleTerms([term.arabic, ...otherMeanings], seed + index * 17 + 19) };
  });
}
export function gradeQuiz(questions: readonly TermQuizQuestion[], answers: Readonly<Record<string, string>>): { score: number; total: number; answered: number; review: TermQuizReview[] } {
  const review = questions.map(question => ({ question, answer: answers[question.id], correct: answers[question.id] === question.correctAnswer }));
  return { score: review.filter(row => row.correct).length, total: questions.length, answered: review.filter(row => row.answer !== undefined && row.question.options.includes(row.answer)).length, review };
}
