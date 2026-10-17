import type { AppData, Course, Lecture, Task } from './types.ts';
import { validateData } from './validation.ts';

interface SharedAcademicCatalog {
  readonly id: string;
  readonly semester: 'fall-2026';
  readonly semesterLabel: string;
  readonly timezone: 'Asia/Riyadh';
  readonly provenance: {
    readonly source: 'user-provided';
    readonly universityVerified: false;
    readonly notice: string;
  };
  readonly preparationMinutes: { readonly value: 180; readonly estimated: true; readonly notice: string };
  readonly courses: readonly Readonly<Course>[];
  readonly lectures: readonly Readonly<Lecture>[];
  readonly exams: readonly Readonly<Task>[];
}

/** Academic fields approved for sharing; this module never reads a private profile file. */
export const SHARED_ACADEMIC_CATALOG: SharedAcademicCatalog = Object.freeze({
  id: 'logistics-fall-2026',
  semester: 'fall-2026',
  semesterLabel: 'الفصل الدراسي لخريف ٢٠٢٦',
  timezone: 'Asia/Riyadh',
  provenance: Object.freeze({
    source: 'user-provided',
    universityVerified: false,
    notice: 'جدول دراسي قدّمه المستخدم ووافق على مشاركته. لم يُتحقق منه من الجامعة؛ راجع المواعيد مع منصتك الدراسية.',
  }),
  preparationMinutes: Object.freeze({
    value: 180,
    estimated: true,
    notice: '١٨٠ دقيقة تحضير تقديرية لكل اختبار، قابلة للتعديل وليست متطلباً جامعياً.',
  }),
  courses: Object.freeze([
    Object.freeze({ id: 'inventory-management', name: 'إدارة المخزون والمخازن', color: '#6b4fe0' }),
    Object.freeze({ id: 'procurement', name: 'إدارة المشتريات والعقود والمناقصات', color: '#2a9b8f' }),
    Object.freeze({ id: 'transport', name: 'إدارة النقل والشحن الدولي', color: '#e99854' }),
    Object.freeze({ id: 'business', name: 'مبادئ إدارة الأعمال', color: '#d67591' }),
    Object.freeze({ id: 'supply', name: 'مقدمة في إدارة سلاسل الإمداد', color: '#588ec5' }),
  ]),
  lectures: Object.freeze([
    Object.freeze({ id: 'lecture-supply', courseId: 'supply', day: 0, start: '18:00', end: '20:00', location: '' }),
    Object.freeze({ id: 'lecture-transport', courseId: 'transport', day: 2, start: '18:00', end: '20:00', location: '' }),
    Object.freeze({ id: 'lecture-business', courseId: 'business', day: 3, start: '18:00', end: '20:00', location: '' }),
    Object.freeze({ id: 'lecture-procurement', courseId: 'procurement', day: 4, start: '18:00', end: '20:00', location: '' }),
    Object.freeze({ id: 'lecture-inventory', courseId: 'inventory-management', day: 4, start: '15:00', end: '', location: '', timePending: 'وقت انتهاء محاضرة المخزون لم يُحدد' }),
  ]),
  exams: Object.freeze([
    Object.freeze({ id: 'exam-inventory', title: 'الاختبار الفصلي — إدارة المخزون والمخازن', courseId: 'inventory-management', kind: 'exam', due: '2026-10-11', time: '20:00', endTime: '21:00', priority: 'high', minutes: 180, completed: false }),
    Object.freeze({ id: 'exam-supply', title: 'اختبار مقدمة في إدارة سلاسل الإمداد', courseId: 'supply', kind: 'exam', due: '2026-10-14', timePending: 'اختبار مسائي؛ وقت البداية لم يُحدد', priority: 'high', minutes: 180, completed: false }),
    Object.freeze({ id: 'exam-business', title: 'اختبار مبادئ إدارة الأعمال', courseId: 'business', kind: 'exam', due: '2026-10-18', timePending: 'اختبار مسائي؛ وقت البداية لم يُحدد', priority: 'high', minutes: 180, completed: false }),
    Object.freeze({ id: 'exam-transport', title: 'اختبار إدارة النقل والشحن الدولي', courseId: 'transport', kind: 'exam', due: '2026-10-20', timePending: 'اختبار مسائي؛ وقت البداية لم يُحدد', priority: 'high', minutes: 180, completed: false }),
    Object.freeze({ id: 'exam-procurement', title: 'اختبار إدارة المشتريات والعقود والمناقصات', courseId: 'procurement', kind: 'exam', due: '2026-10-22', time: '21:15', timePending: 'اختبار مسائي؛ وقت الانتهاء لم يُحدد', priority: 'high', minutes: 180, completed: false }),
  ]),
});

function normalizedCourseName(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[إأآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .replace(/[\u064B-\u065F\u0670ـ]/g, '').replace(/[^\p{L}\p{N}]/gu, '');
}
const COURSE_ALIASES: Record<string, readonly string[]> = {
  'inventory-management': ['inventory'],
  procurement: [], transport: [], business: [], supply: [],
};

export interface SharedAcademicMerge {
  data: AppData;
  addedCourses: number;
  addedLectures: number;
  addedExams: number;
}

/** Append missing shared records atomically. Existing account records always keep their own values. */
export function mergeSharedAcademics(data: AppData): SharedAcademicMerge {
  if (!validateData(data)) throw new Error('shared-academics-invalid-data');
  const next = structuredClone(data);
  let addedCourses = 0;
  let addedLectures = 0;
  let addedExams = 0;
  const canonicalByCourseId = new Map<string, string>();
  const accountCourseIds = new Map<string, string>();
  for (const shared of SHARED_ACADEMIC_CATALOG.courses) {
    const name = normalizedCourseName(shared.name);
    const aliases = COURSE_ALIASES[shared.id] ?? [];
    const matching = next.courses.filter(course => course.id === shared.id || aliases.includes(course.id) || normalizedCourseName(course.name).includes(name));
    let existing = matching.find(course => course.id === shared.id) ?? matching.find(course => aliases.includes(course.id)) ?? matching[0];
    if (!existing) {
      existing = { ...shared };
      next.courses.push(existing);
      addedCourses++;
    }
    // All duplicate course identities participate in appointment deduplication, while new rows use one stable identity.
    for (const course of matching) canonicalByCourseId.set(course.id, shared.id);
    canonicalByCourseId.set(existing.id, shared.id);
    accountCourseIds.set(shared.id, existing.id);
  }
  for (const shared of SHARED_ACADEMIC_CATALOG.lectures) {
    const exists = next.lectures.some(lecture => lecture.id === shared.id ||
      canonicalByCourseId.get(lecture.courseId) === shared.courseId && lecture.day === shared.day && lecture.start === shared.start);
    if (exists) continue;
    next.lectures.push({ ...shared, courseId: accountCourseIds.get(shared.courseId)! });
    addedLectures++;
  }
  for (const shared of SHARED_ACADEMIC_CATALOG.exams) {
    const exists = next.tasks.some(task => task.id === shared.id || task.kind === 'exam' &&
      canonicalByCourseId.get(task.courseId) === shared.courseId && task.due === shared.due);
    if (exists) continue;
    next.tasks.push({ ...shared, courseId: accountCourseIds.get(shared.courseId)! });
    addedExams++;
  }
  // Capacity limits and all cross-references are checked before the caller receives anything to persist.
  if (!validateData(next)) throw new Error('shared-academics-invalid-result');
  return { data: next, addedCourses, addedLectures, addedExams };
}
