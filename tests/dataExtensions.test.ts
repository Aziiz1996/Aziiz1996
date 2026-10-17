import test from 'node:test';
import assert from 'node:assert/strict';
import { getStudentProfile, validateExtensions } from '../src/dataExtensions.ts';
import type { AppData, StudyLog, StudyRun } from '../src/types.ts';

const base = { settings: { name: 'طالب', universityName: 'جامعة تجريبية' } } as AppData;
const profile = getStudentProfile(base);
const log: StudyLog = { id: 'completed-run', taskId: 'task', title: 'جلسة تجريبية', date: '2026-10-17', minutes: 12.5, score: 3, reflection: 'أراجع المثال', completedAt: '2026-10-17T10:00:00.000Z', reviewDates: ['2026-10-18', '2026-10-20', '2026-10-24'], reviewedDates: ['2026-10-18'] };
const run: StudyRun = { id: 'active-run', taskId: 'task', title: 'جلسة تالية', date: '2026-10-17', plannedMinutes: 0.5, step: 0, remainingSeconds: 3, runningSince: null, elapsedSeconds: 0, reflection: '', stepRemaining: [3, 8, 9, 8, 2], kind: 'exam' };

test('version-one backups without new fields remain valid and profile defaults preserve the existing student name', () => {
  assert.equal(validateExtensions({}), true);
  assert.equal(profile.fullName, 'طالب');
  assert.equal(profile.university, 'جامعة تجريبية');
  assert.deepEqual(profile.skills, []);
  assert.equal(validateExtensions({ studentProfile: profile }), true);
});

test('fractional confirmed study minutes and fractional active sessions survive JSON backup roundtrips', () => {
  const record = { studentProfile: profile, studyLog: [log], activeStudy: run };
  assert.equal(validateExtensions(JSON.parse(JSON.stringify(record))), true);
  assert.equal(validateExtensions({ ...record, studyLog: [{ ...log, minutes: 0.1 }] }), true);
  assert.equal(validateExtensions({ activeStudy: { ...run, plannedMinutes: 0.11, remainingSeconds: 1, stepRemaining: [1, 2, 2, 1, 1] } }), true);
});

test('corrupt timers, duplicate completed runs, and forged review dates cannot lock restored study state', () => {
  assert.equal(validateExtensions({ activeStudy: { ...run, step: 9 } }), false);
  assert.equal(validateExtensions({ activeStudy: { ...run, remainingSeconds: 3000 } }), false);
  assert.equal(validateExtensions({ activeStudy: { ...run, id: log.id }, studyLog: [log] }), false);
  assert.equal(validateExtensions({ studyLog: [log, log] }), false);
  assert.equal(validateExtensions({ studyLog: [{ ...log, reviewedDates: ['2026-10-19'] }] }), false);
});

test('new profile backup fields reject executable file URLs and unexpected credential fields', () => {
  assert.equal(validateExtensions({ studentProfile: { ...profile, password: 'unexpected' } }), false);
  assert.equal(validateExtensions({ studentProfile: { ...profile, website: 'javascript:alert(1)' } }), false);
  assert.equal(validateExtensions({ studentProfile: { ...profile, cv: { name: 'cv.pdf', mime: 'application/pdf', dataUrl: 'https://files.example/cv.pdf', size: 12, updatedAt: '2026-10-17' } } }), false);
});

test('portal and manual application backup records preserve status without allowing unsafe destinations', () => {
  const link = { id: 'portal', name: 'موقع تجريبي', kind: 'job', url: 'https://example.com/jobs' };
  const application = { id: 'application', title: 'فرصة تجريبية', organization: 'جهة تجريبية', kind: 'job', url: link.url, status: 'preparing', createdAt: '2026-10-17T10:00:00.000Z', notes: '' };
  assert.equal(validateExtensions({ opportunityLinks: [link], applications: [application] }), true);
  assert.equal(validateExtensions({ opportunityLinks: [{ ...link, url: 'https://user:pass@example.com' }] }), false);
  assert.equal(validateExtensions({ applications: [{ ...application, status: 'automatically-submitted' }] }), false);
});
