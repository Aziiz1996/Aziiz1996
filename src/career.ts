import type { CareerApplication, OpportunityLink, StudentProfile } from './types.ts';
import { validHttpsUrl } from './dataExtensions.ts';

export const OPPORTUNITY_CATEGORIES = ['الكل', 'توظيف', 'دورات', 'شهادات مهنية', 'تجسير وإكمال دراسة'] as const;
export type OpportunityCategory = typeof OPPORTUNITY_CATEGORIES[number];
export interface OpportunityResource extends OpportunityLink {
  category: Exclude<OpportunityCategory, 'الكل'>;
  description: string;
  terms: string;
}

/** Keep the existing logistics directory, including professional certificates and further study. */
export const OPPORTUNITY_RESOURCES: OpportunityResource[] = [
  { id: 'jadarat', name: 'جدارات', kind: 'job', category: 'توظيف', url: 'https://jadarat.sa/', description: 'ابحث عن إعلانات وظائف المشتريات والمخزون والمستودعات واللوجستيات.', terms: 'تحقق من المؤهل المطلوب والخبرة وموقع الوظيفة قبل التقديم.' },
  { id: 'hrdf', name: 'صندوق تنمية الموارد البشرية — هدف', kind: 'job', category: 'توظيف', url: 'https://www.hrdf.org.sa/', description: 'استكشف برامج دعم التوظيف والتدريب وخدمات تطوير المسار المهني.', terms: 'أهلية كل برنامج تختلف؛ راجع اشتراطاته الحالية لحامل الدبلوم.' },
  { id: 'linkedin', name: 'LinkedIn', kind: 'job', category: 'توظيف', url: 'https://www.linkedin.com/jobs/', description: 'ابحث عن Supply Chain وLogistics وWarehouse وProcurement، وتابع صفحات الشركات.', terms: 'راجع جهة الإعلان وتفاصيل الوظيفة؛ وجود الإعلان لا يعني اعتماده من التطبيق.' },
  { id: 'doroob', name: 'دروب', kind: 'course', category: 'دورات', url: 'https://doroob.sa/', description: 'استكشف التدريب الإلكتروني والمهارات التي تدعم التوظيف والعمل الإداري.', terms: 'توفر دورة متخصصة ورسومها ونوع شهادتها يراجع في صفحة الدورة.' },
  { id: 'tvtc', name: 'المؤسسة العامة للتدريب التقني والمهني', kind: 'course', category: 'دورات', url: 'https://tvtc.gov.sa/', description: 'راجع خدمات التدريب ومعلومات المنشآت والبرامج التدريبية.', terms: 'تحقق من ترخيص الجهة واعتماد البرنامج؛ ترخيص المنشأة وحده لا يثبت اعتماد كل شهادة.' },
  { id: 'ascm', name: 'ASCM', kind: 'course', category: 'شهادات مهنية', url: 'https://www.ascm.org/', description: 'استكشف شهادات CPIM وCSCP وCLTD في المخزون وسلاسل الإمداد واللوجستيات.', terms: 'راجع المتطلبات واللغة والرسوم. الشهادة المهنية لا تعادل تلقائياً مؤهلاً جامعياً.' },
  { id: 'cips', name: 'CIPS', kind: 'course', category: 'شهادات مهنية', url: 'https://www.cips.org/', description: 'مسارات تعلم وشهادات متخصصة في المشتريات والتوريد.', terms: 'اختر المستوى المناسب وتحقق من جهة التدريب ومتطلبات الالتحاق.' },
  { id: 'seu', name: 'الجامعة السعودية الإلكترونية', kind: 'course', category: 'تجسير وإكمال دراسة', url: 'https://seu.edu.sa/', description: 'راجع إعلانات القبول وسياسات إكمال الدراسة ومعادلة المقررات.', terms: 'هذا رابط للاستفسار عن القبول؛ لم يتم التحقق من وجود تجسير متاح لدبلومك.' },
  { id: 'kau', name: 'جامعة الملك عبدالعزيز', kind: 'course', category: 'تجسير وإكمال دراسة', url: 'https://www.kau.edu.sa/', description: 'راجع بوابات القبول وإعلانات البرامج، واستفسر عن المسارات المناسبة لمؤهلك.', terms: 'توفر برنامج وشروط قبول الدبلوم ومعادلته تحتاج تأكيداً من الجامعة.' },
  { id: 'ksu', name: 'جامعة الملك سعود', kind: 'course', category: 'تجسير وإكمال دراسة', url: 'https://ksu.edu.sa/', description: 'تابع القبول والبرامج الأكاديمية واسأل عن إكمال الدراسة ومعادلة الساعات.', terms: 'هذا دليل لجهة أكاديمية، وليس إعلاناً عن تجسير مفتوح.' },
  { id: 'coursera', name: 'كورسيرا', kind: 'course', category: 'دورات', url: 'https://www.coursera.org/', description: 'ابحث عن دورات سلاسل الإمداد واللوجستيات وتحليل البيانات لتطوير مهاراتك.', terms: 'راجع لغة الدورة ورسومها ومتطلبات الشهادة؛ لا تعني الشهادة قبولاً وظيفياً أو معادلة أكاديمية.' },
 ];

function portalKey(value: string): string {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.hostname.toLowerCase().replace(/^www\./, '')}${url.pathname.replace(/\/+$/, '')}${url.search}`;
  } catch { return value.trim(); }
}

/** Preserve the first directory entry when a suggested portal points to the same site. */
export function mergeOpportunityLinks(existing: OpportunityLink[], additions: OpportunityLink[]): OpportunityLink[] {
  const seen = new Set<string>();
  return [...existing, ...additions].filter(link => {
    const key = portalKey(link.url);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).map(link => ({ id: link.id, name: link.name, url: link.url, kind: link.kind }));
}

export const DEFAULT_OPPORTUNITY_LINKS: OpportunityLink[] = mergeOpportunityLinks(
  OPPORTUNITY_RESOURCES.slice(0, 10),
  [OPPORTUNITY_RESOURCES[0], OPPORTUNITY_RESOURCES[2], OPPORTUNITY_RESOURCES[3], OPPORTUNITY_RESOURCES[10]],
);

export function opportunityResource(link: OpportunityLink): OpportunityResource | undefined {
  return OPPORTUNITY_RESOURCES.find(resource => portalKey(resource.url) === portalKey(link.url));
}

export function opportunityCategory(link: OpportunityLink): Exclude<OpportunityCategory, 'الكل'> {
  return opportunityResource(link)?.category ?? (link.kind === 'job' ? 'توظيف' : 'دورات');
}


export const APPLICATION_STATUS: Record<CareerApplication['status'], string> = {
  saved: 'محفوظة', preparing: 'أجهّز الطلب', submitted: 'أرسلت الطلب', accepted: 'مقبول', rejected: 'لم يُقبل',
};

export function opportunityUrlError(value: string): string {
  return value.length > 2000 || !validHttpsUrl(value.trim(), false)
    ? 'أدخل رابطاً صحيحاً يبدأ بـ https:// ومن دون اسم مستخدم أو كلمة مرور في الرابط.' : '';
}

/** Explicit field selection keeps application exports separate from financial/study backups. */
export function applicationProfileExport(profile: StudentProfile) {
  const fields: StudentProfile = {
    fullName: profile.fullName, email: profile.email, phone: profile.phone, city: profile.city,
    headline: profile.headline, summary: profile.summary, university: profile.university,
    major: profile.major, graduationYear: profile.graduationYear, education: profile.education,
    experience: profile.experience, skills: [...profile.skills], linkedin: profile.linkedin, website: profile.website,
  };
  if (profile.cv) fields.cv = {
    name: profile.cv.name, mime: profile.cv.mime, dataUrl: profile.cv.dataUrl,
    size: profile.cv.size, updatedAt: profile.cv.updatedAt,
  };
  return { format: 'az-logistics-application-profile' as const, version: 1 as const, profile: fields };
}

export function applicationProfileFields(profile: StudentProfile): { key: string; label: string; value: string }[] {
  return [
    { key: 'fullName', label: 'الاسم الكامل', value: profile.fullName },
    { key: 'email', label: 'البريد الإلكتروني', value: profile.email },
    { key: 'phone', label: 'رقم الجوال', value: profile.phone },
    { key: 'city', label: 'المدينة', value: profile.city },
    { key: 'headline', label: 'المسمى المهني', value: profile.headline },
    { key: 'summary', label: 'نبذة عني', value: profile.summary },
    { key: 'university', label: 'الجامعة', value: profile.university },
    { key: 'major', label: 'التخصص', value: profile.major },
    { key: 'graduationYear', label: 'سنة التخرج', value: profile.graduationYear },
    { key: 'education', label: 'التعليم', value: profile.education },
    { key: 'experience', label: 'الخبرات', value: profile.experience },
    { key: 'skills', label: 'المهارات', value: profile.skills.join('، ') },
    { key: 'linkedin', label: 'لينكدإن', value: profile.linkedin },
    { key: 'website', label: 'الموقع الشخصي', value: profile.website },
  ].filter(field => field.value.trim());
}

export function applicationProfileText(profile: StudentProfile): string {
  return applicationProfileFields(profile).map(field => `${field.label}: ${field.value}`).join('\n');
}

/** A factual template. No invented graduation, achievements, employment or credentials. */
export function applicationLetter(profile: StudentProfile, title: string, kind: 'job' | 'course'): string {
  const lines = ['السلام عليكم،', '', `أرغب في التقديم على ${kind === 'job' ? 'فرصة' : 'دورة'} «${title.trim() || 'الفرصة المحددة'}».`];
  if (profile.fullName.trim()) lines.push(`اسمي ${profile.fullName.trim()}.`);
  if (profile.summary.trim()) lines.push(profile.summary.trim());
  if (profile.education.trim()) lines.push(`التعليم: ${profile.education.trim()}`);
  else if (profile.major.trim() || profile.university.trim()) lines.push(`بيانات دراستي: ${[profile.major.trim(), profile.university.trim()].filter(Boolean).join('، ')}.`);
  if (profile.experience.trim()) lines.push(`الخبرات: ${profile.experience.trim()}`);
  if (profile.skills.some(skill => skill.trim())) lines.push(`المهارات: ${profile.skills.filter(skill => skill.trim()).join('، ')}.`);
  lines.push('', 'شكراً لوقتكم واهتمامكم.');
  return lines.join('\n');
}

export function filterApplications(applications: CareerApplication[], filters: {
  status: CareerApplication['status'] | ''; kind: OpportunityLink['kind'] | ''; from: string; to: string; search: string;
}): CareerApplication[] {
  const search = filters.search.trim().toLocaleLowerCase('ar');
  return applications.filter(item => (!filters.status || item.status === filters.status) &&
    (!filters.kind || item.kind === filters.kind) && (!filters.from || item.createdAt.slice(0, 10) >= filters.from) &&
    (!filters.to || item.createdAt.slice(0, 10) <= filters.to) &&
    (!search || `${item.title} ${item.organization}`.toLocaleLowerCase('ar').includes(search)))
    .slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
