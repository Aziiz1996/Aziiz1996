import type { AppData } from "./types.ts";
export const STORAGE_KEY = 'madar.student.v1';
export function validUniversityUrl(value: string) {
  if (!value) return true;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
}
export const emptyData = (): AppData => ({
  version: 1, incomeRules: [], courses: [], lectures: [], tasks: [], notes: [], transactions: [],
  settings: { name: '', currency: 'SAR', monthlyBudget: 0, dailyMinutes: 90, studyStart: '18:00', studyDays: [0, 1, 2, 3, 4, 6], universityName: 'الجامعة السعودية الإلكترونية', universityUrl: 'https://lms.ac-seu.com/login/index.php?loginredirect=1' },
});

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const textValue = (x: unknown) => typeof x === 'string' && x.length <= 200000;
const validDate = (x: unknown) => {
  if (typeof x !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x)) return false;
  const d = new Date(x + 'T12:00:00');
  return !Number.isNaN(d.getTime()) && `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` === x;
};
const validTime = (x: unknown) => typeof x === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(x);
const boundedNumber = (x: unknown, min: number, max: number) => typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max;

export function validateData(value: unknown): value is AppData {
  if (!isObject(value) || value.version !== 1 || !isObject(value.settings) || (value.demo !== undefined && typeof value.demo !== 'boolean') || (value.profile !== undefined && typeof value.profile !== 'boolean')) return false;
  const s = value.settings;
  if (value.projectGroups !== undefined && (!Array.isArray(value.projectGroups) || value.projectGroups.length > 1000 || !value.projectGroups.every(g => isObject(g) && typeof g.id === 'string' && g.id.length > 0 && g.id.length < 150 && textValue(g.name) && textValue(g.notes) && Array.isArray(g.members) && g.members.length <= 9 && g.members.every(textValue)) || new Set(value.projectGroups.map(g => g.id)).size !== value.projectGroups.length)) return false;
  if ((s.universityName !== undefined && !textValue(s.universityName)) || (s.universityUrl !== undefined && (typeof s.universityUrl !== 'string' || !validUniversityUrl(s.universityUrl)))) return false;
  if (!textValue(s.name) || typeof s.currency !== 'string' || !['SAR', 'AED', 'KWD', 'USD', 'EUR', 'EGP', 'QAR', 'BHD', 'OMR'].includes(s.currency) || !boundedNumber(s.monthlyBudget, 0, 1e9) || !boundedNumber(s.dailyMinutes, 0, 720) || !validTime(s.studyStart) || !Array.isArray(s.studyDays) || !s.studyDays.every(d => Number.isInteger(d) && d >= 0 && d <= 6) || new Set(s.studyDays).size !== s.studyDays.length) return false;
  for (const key of ['courses', 'lectures', 'tasks', 'notes', 'transactions']) {
    const rows = value[key];
    if (!Array.isArray(rows) || rows.length > 10000 || !rows.every(x => isObject(x) && typeof x.id === 'string' && x.id.length > 0 && x.id.length < 150) || new Set(rows.map(x => x.id)).size !== rows.length) return false;
  }
  const courses = value.courses as Record<string, unknown>[];
  const courseIds = new Set(courses.map(c => c.id));
  const courseRef = (id: unknown) => id === '' || courseIds.has(id);
  const optionalTime = (x: unknown) => x === undefined || x === '' || validTime(x);
  if (value.incomeRules !== undefined && (!Array.isArray(value.incomeRules) || value.incomeRules.length > 1000 || new Set(value.incomeRules.map(r => r?.id)).size !== value.incomeRules.length || !value.incomeRules.every(r => isObject(r) && textValue(r.id) && textValue(r.title) && textValue(r.category) && boundedNumber(r.amount, 0.01, 1e9) && (r.day === null || (Number.isInteger(r.day) && boundedNumber(r.day, 1, 31)))))) return false;
  return courses.every(c => textValue(c.name) && typeof c.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(c.color)) &&
    (value.lectures as Record<string, unknown>[]).every(l => courseIds.has(l.courseId) && Number.isInteger(l.day) && boundedNumber(l.day, 0, 6) && optionalTime(l.start) && optionalTime(l.end) && (!l.end || (!!l.start && (l.end as string) > (l.start as string))) && textValue(l.location) && (l.attendanceUrl === undefined || (typeof l.attendanceUrl === 'string' && validUniversityUrl(l.attendanceUrl))) && (l.fileUrl === undefined || (typeof l.fileUrl === 'string' && validUniversityUrl(l.fileUrl))) && (l.timePending === undefined || textValue(l.timePending))) &&
    (value.tasks as Record<string, unknown>[]).every(t => textValue(t.title) && courseRef(t.courseId) && ['assignment', 'project', 'exam'].includes(t.kind as string) && validDate(t.due) && ['low', 'medium', 'high'].includes(t.priority as string) && boundedNumber(t.minutes, 0, 100000) && typeof t.completed === 'boolean' && optionalTime(t.time) && optionalTime(t.endTime) && (!t.endTime || (!!t.time && (t.endTime as string) > (t.time as string))) && (t.timePending === undefined || textValue(t.timePending))) &&
    (value.notes as Record<string, unknown>[]).every(n => textValue(n.title) && courseRef(n.courseId) && textValue(n.content) && textValue(n.summary) && typeof n.updatedAt === 'string' && !Number.isNaN(Date.parse(n.updatedAt))) &&
    (value.transactions as Record<string, unknown>[]).every(t => textValue(t.title) && ['expense', 'income'].includes(t.kind as string) && boundedNumber(t.amount, 0.01, 1e9) && textValue(t.category) && validDate(t.date) && (t.ruleId === undefined || textValue(t.ruleId)));
}

