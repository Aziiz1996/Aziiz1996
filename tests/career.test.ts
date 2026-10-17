import test from 'node:test';
import assert from 'node:assert/strict';
import { APPLICATION_STATUS, DEFAULT_OPPORTUNITY_LINKS, applicationLetter, applicationProfileExport, applicationProfileFields, applicationProfileText, filterApplications, opportunityUrlError } from '../src/career.ts';
import type { CareerApplication, StudentProfile } from '../src/types.ts';

function profile(overrides: Partial<StudentProfile> = {}): StudentProfile {
  return { fullName: '', email: '', phone: '', city: '', headline: '', summary: '', university: '', major: '', graduationYear: '', education: '', experience: '', skills: [], linkedin: '', website: '', ...overrides };
}

test('portal URLs require HTTPS and never allow embedded login credentials', () => {
  for (const url of ['javascript:alert(1)', 'http://example.com', 'https://user:secret@example.com/', '', 'example.com', 'https://' ]) assert.ok(opportunityUrlError(url), url);
  for (const url of ['https://jadarat.sa/', 'https://www.linkedin.com/jobs/?keywords=supply', ' https://doroob.sa/ ']) assert.equal(opportunityUrlError(url), '', url);
  assert.ok(opportunityUrlError('https://example.com/' + 'x'.repeat(2048)));
  assert.equal(DEFAULT_OPPORTUNITY_LINKS.length, 4);
  assert.ok(DEFAULT_OPPORTUNITY_LINKS.every(link => !opportunityUrlError(link.url)));
});

test('profile export contains application fields and uploaded CV but no photo or app backup data', () => {
  const original = profile({ fullName: 'أحمد', skills: ['المخزون'], photo: { name: 'avatar.png', dataUrl: 'data:image/png;base64,PHOTO', mime: 'image/png', size: 5, updatedAt: '2026-10-17' }, cv: { name: 'cv.pdf', dataUrl: 'data:application/pdf;base64,PDF', mime: 'application/pdf', size: 3, updatedAt: '2026-10-17' } });
  const extended = { ...original, transactions: [{ amount: 4500 }], tasks: [{ grade: 99 }], UNIVERSITY_PASSWORD: 'hidden', incomeRules: ['private'] };
  const result = applicationProfileExport(extended);
  assert.deepEqual(Object.keys(result).sort(), ['format', 'profile', 'version']);
  assert.equal(result.format, 'madar-application-profile'); assert.equal(result.version, 1);
  assert.equal(result.profile.cv?.dataUrl, original.cv?.dataUrl);
  assert.equal(result.profile.photo, undefined);
  for (const secret of ['PHOTO', '4500', 'transactions', 'tasks', 'incomeRules', 'UNIVERSITY_PASSWORD', 'hidden']) assert.ok(!JSON.stringify(result).includes(secret), secret);
  result.profile.skills.push('جديد'); result.profile.cv!.name = 'changed.pdf';
  assert.deepEqual(original.skills, ['المخزون']); assert.equal(original.cv!.name, 'cv.pdf');
});

test('empty fields remain empty in export and absent from text ready for sites', () => {
  const empty = profile();
  assert.deepEqual(applicationProfileFields(empty), []);
  assert.equal(applicationProfileText(empty), '');
  assert.equal(applicationProfileExport(empty).profile.cv, undefined);
  assert.equal(applicationProfileExport(empty).profile.fullName, '');
});

test('copy fields use only actual entered profile facts', () => {
  const student = profile({ fullName: 'نورة', email: 'nora@example.com', skills: ['Excel', 'التنظيم'], summary: 'طالبة في الدبلوم' });
  const fields = applicationProfileFields(student);
  assert.equal(fields.length, 4);
  assert.equal(fields.find(field => field.key === 'skills')?.value, 'Excel، التنظيم');
  assert.equal(applicationProfileText(student), 'الاسم الكامل: نورة\nالبريد الإلكتروني: nora@example.com\nنبذة عني: طالبة في الدبلوم\nالمهارات: Excel، التنظيم');
});

test('letter never invents experience, qualifications, graduation or attachments', () => {
  const text = applicationLetter(profile(), 'منسق مخزون', 'job');
  assert.match(text, /منسق مخزون/);
  for (const invented of ['خبرة', 'خريج', 'بكالوريوس', 'أرفق', 'شهادة', 'Excel', 'خبير', 'جامعتي']) assert.ok(!text.includes(invented), invented);
  const factual = applicationLetter(profile({ fullName: 'أحمد', major: 'سلاسل الإمداد', university: 'الجامعة', experience: 'تدريب لمدة شهر', skills: ['Excel'] }), 'التدريب', 'course');
  for (const supplied of ['أحمد', 'سلاسل الإمداد', 'الجامعة', 'تدريب لمدة شهر', 'Excel', 'دورة']) assert.ok(factual.includes(supplied), supplied);
  assert.ok(!factual.includes('تخرج'));
});

test('letter uses actual education field without inventing a second qualification', () => {
  const text = applicationLetter(profile({ education: 'دبلوم قيد الدراسة', major: 'اللوجستيات', graduationYear: '2027' }), 'تدريب', 'job');
  assert.match(text, /التعليم: دبلوم قيد الدراسة/);
  assert.ok(!text.includes('تخرجت')); assert.ok(!text.includes('2027')); assert.ok(!text.includes('بكالوريوس'));
});

test('application tracking filters dates inclusively and preserves the source list', () => {
  const app = (id: string, overrides: Partial<CareerApplication>): CareerApplication => ({ id, title: 'إدارة مخزون', organization: 'جهة', kind: 'job', url: 'https://example.com', status: 'preparing', createdAt: '2026-10-17', notes: '', ...overrides });
  const items = [app('old', { createdAt: '2026-10-01' }), app('sent', { status: 'submitted', createdAt: '2026-10-17T20:00:00Z' }), app('course', { kind: 'course', title: 'دورة مشتريات', createdAt: '2026-10-20' }), app('future', { createdAt: '2026-11-01' })];
  const base = { status: '' as const, kind: '' as const, from: '', to: '', search: '' };
  assert.deepEqual(filterApplications(items, { ...base, status: 'submitted' }).map(item => item.id), ['sent']);
  assert.deepEqual(filterApplications(items, { ...base, from: '2026-10-17', to: '2026-10-20' }).map(item => item.id), ['course', 'sent']);
  assert.deepEqual(filterApplications(items, { ...base, kind: 'course', search: 'مشتريات' }).map(item => item.id), ['course']);
  assert.deepEqual(filterApplications(items, { ...base, search: '  غير موجود  ' }), []);
  assert.deepEqual(items.map(item => item.id), ['old', 'sent', 'course', 'future']);
  assert.equal(APPLICATION_STATUS.preparing, 'أجهّز الطلب');
});
