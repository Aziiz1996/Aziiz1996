import type { AppData, StudentProfile } from './types';
import { isValidAttachment } from './profileFiles.ts';
import { validatePracticeState } from './practiceLogic.ts';

export function getStudentProfile(data: AppData): StudentProfile {
  return {
    fullName: data.settings.name, email: '', phone: '', city: '', headline: '', summary: '', university: data.settings.universityName ?? '',
    major: '', graduationYear: '', education: '', experience: '', skills: [], linkedin: '', website: '', ...data.studentProfile,
  };
}

export function validHttpsUrl(value: string, allowEmpty = true): boolean {
  if (!value) return allowEmpty;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
}

const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown, max = 6000) => typeof value === 'string' && value.length <= max;
const identifier = (value: unknown) => typeof value === 'string' && value.length > 0 && value.length <= 150;
const number = (value: unknown, max: number, min = 0) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const integer = (value: unknown, max: number, min = 0) => number(value, max, min) && Number.isInteger(value);
const instant = (value: unknown) => typeof value === 'string' && value.length < 50 && Number.isFinite(Date.parse(value));
const date = (value: unknown) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + 'T12:00:00');
  return Number.isFinite(d.getTime()) && `${String(d.getFullYear()).padStart(4, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` === value;
};
const kind = (value: unknown) => ['assignment', 'project', 'exam'].includes(value as string);
const uniqueRows = (value: unknown, max: number): value is Record<string, unknown>[] => Array.isArray(value) && value.length <= max && value.every(row => object(row) && identifier(row.id)) && new Set(value.map(row => row.id)).size === value.length;
const uniqueDates = (value: unknown) => Array.isArray(value) && value.length <= 10 && value.every(date) && new Set(value).size === value.length;

export function validateProfile(value: unknown): value is StudentProfile {
  if (!object(value)) return false;
  const caps = { fullName: 80, email: 254, phone: 40, city: 100, headline: 160, summary: 4000, university: 150, major: 150, graduationYear: 4, education: 6000, experience: 6000, linkedin: 2000, website: 2000 };
  const allowed = new Set([...Object.keys(caps), 'skills', 'photo', 'cv']);
  if (!Object.keys(value).every(key => allowed.has(key)) || !Object.entries(caps).every(([key, max]) => text(value[key], max))) return false;
  if (value.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email as string)) return false;
  if (value.graduationYear && !/^\d{4}$/.test(value.graduationYear as string)) return false;
  return Array.isArray(value.skills) && value.skills.length <= 30 && value.skills.every(skill => text(skill, 80) && (skill as string).trim().length > 0) &&
    validHttpsUrl(value.linkedin as string) && validHttpsUrl(value.website as string) &&
    (value.photo === undefined || isValidAttachment(value.photo, 'photo')) && (value.cv === undefined || isValidAttachment(value.cv, 'cv'));
}

/** Optional additions keep every valid version-1 academic/finance backup readable. */
export function validateExtensions(value: Record<string, unknown>): boolean {
  if (!validatePracticeState(value)) return false;
  if (value.studentProfile !== undefined && !validateProfile(value.studentProfile)) return false;
  if (value.opportunityLinks !== undefined && (!uniqueRows(value.opportunityLinks, 200) || !value.opportunityLinks.every(link => text(link.name, 150) && validHttpsUrl(link.url as string, false) && ['job', 'course'].includes(link.kind as string)))) return false;
  if (value.applications !== undefined && (!uniqueRows(value.applications, 10000) || !value.applications.every(application => text(application.title, 200) && text(application.organization, 200) && text(application.url, 2000) && validHttpsUrl(application.url as string) && ['job', 'course'].includes(application.kind as string) && ['saved', 'preparing', 'submitted', 'accepted', 'rejected'].includes(application.status as string) && instant(application.createdAt) && text(application.notes, 6000)))) return false;
  if (value.activeStudy !== undefined && value.activeStudy !== null) {
    const run = value.activeStudy;
    if (!object(run) || !identifier(run.id) || !identifier(run.taskId) || !text(run.title, 300) || !date(run.date) || !number(run.plannedMinutes, 720, 0.01) || !integer(run.step, 4) || !number(run.remainingSeconds, Math.ceil((run.plannedMinutes as number) * 60)) || !number(run.elapsedSeconds, Math.ceil((run.plannedMinutes as number) * 60)) || !(run.runningSince === null || number(run.runningSince, 8.64e15, 1)) || !text(run.reflection, 6000) || (run.kind !== undefined && !kind(run.kind))) return false;
    if (run.stepRemaining !== undefined && (!Array.isArray(run.stepRemaining) || run.stepRemaining.length !== 5 || !run.stepRemaining.every(seconds => number(seconds, Math.ceil((run.plannedMinutes as number) * 60))) || run.stepRemaining.reduce((sum: number, n: number) => sum + n, 0) > Math.ceil((run.plannedMinutes as number) * 60))) return false;
  }
  if (value.studyLog !== undefined && (!uniqueRows(value.studyLog, 10000) || !value.studyLog.every(log => identifier(log.taskId) && text(log.title, 300) && date(log.date) && number(log.minutes, 720) && integer(log.score, 5) && text(log.reflection, 6000) && instant(log.completedAt) && uniqueDates(log.reviewDates) && uniqueDates(log.reviewedDates) && (log.reviewedDates as unknown[]).every(day => (log.reviewDates as unknown[]).includes(day))))) return false;
  if (object(value.activeStudy) && Array.isArray(value.studyLog)) { const activeId = value.activeStudy.id; if (value.studyLog.some(log => log.id === activeId)) return false; }
  return true;
}
