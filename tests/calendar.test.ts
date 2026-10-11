import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStudyCalendar, parseMoodleCalendar } from '../src/calendarTools.ts';
import { emptyData } from '../src/validation.ts';

test('Moodle ICS events import with useful types and stable identifiers', () => {
  const source = `BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:lecture-1\r\nDTSTART:20261012T170000\r\nDTEND:20261012T180000\r\nSUMMARY:محاضرة إدارة المخزون\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:exam-1\r\nDTSTART:20261015T090000\r\nSUMMARY:الاختبار النصفي\r\nEND:VEVENT\r\nEND:VCALENDAR`;
  const events = parseMoodleCalendar(source);
  assert.equal(events.length, 2);
  assert.equal(events[0].kind, 'lecture');
  assert.equal(events[1].kind, 'exam');
  assert.equal(events[1].date, '2026-10-15');
});

test('iPhone calendar export includes university events, tasks and reminder alarms', () => {
  const data = emptyData();
  data.universityEvents = [{ id:'moodle-one', title:'محاضرة لوجستيات', date:'2026-10-15', time:'17:00', endDate:'2026-10-15', endTime:'18:00', kind:'lecture', description:'قاعة افتراضية' }];
  data.tasks.push({ id:'exam-one', title:'اختبار المخزون', courseId:'', kind:'exam', due:'2026-10-20', priority:'high', minutes:120, completed:false, time:'09:00' });
  const calendar = buildStudyCalendar(data);
  assert.match(calendar, /X-WR-CALNAME:عز اللوجستيات/);
  assert.match(calendar, /SUMMARY:محاضرة لوجستيات/);
  assert.match(calendar, /SUMMARY:اختبار المخزون/);
  assert.match(calendar, /BEGIN:VALARM/);
});
