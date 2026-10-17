import type { CareerApplication, OpportunityLink, StudentProfile } from './types.ts';
import { validHttpsUrl } from './dataExtensions.ts';

export const DEFAULT_OPPORTUNITY_LINKS: OpportunityLink[] = [
  { id: 'jadarat', name: 'جدارات', url: 'https://jadarat.sa/', kind: 'job' },
  { id: 'linkedin', name: 'لينكدإن', url: 'https://www.linkedin.com/jobs/', kind: 'job' },
  { id: 'doroob', name: 'دروب', url: 'https://doroob.sa/', kind: 'course' },
  { id: 'coursera', name: 'كورسيرا', url: 'https://www.coursera.org/', kind: 'course' },
];

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
  return { format: 'madar-application-profile' as const, version: 1 as const, profile: fields };
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
