import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMoodleData } from '../server/moodle.mjs';

test('Moodle courses and upcoming events are normalized for the study dashboard', () => {
  const timestamp = Math.floor(Date.parse('2026-10-11T09:30:00Z') / 1000);
  const result = normalizeMoodleData(
    { sitename:'الكلية التطبيقية', fullname:'عزيز', userid:42 },
    [{ id:7, fullname:'إدارة <b>المخزون</b>', shortname:'INV' }],
    { events:[
      { id:80, name:'اختبار المخزون', timestart:timestamp, timeduration:3600, description:'<p>الفصل الأول</p>', url:'https://lms.ac-seu.com/calendar/view.php', courseid:7 },
      { id:81, name:'واجب التخطيط', timestart:timestamp + 86400, description:'تسليم النشاط', courseid:7 },
      { id:82, name:'محاضرة سلاسل الإمداد', timestart:timestamp + 172800, courseid:7 },
    ] },
  );
  assert.equal(result.siteName, 'الكلية التطبيقية');
  assert.deepEqual(result.courses[0], { id:'moodle-course-7', moodleId:7, name:'إدارة المخزون', color:'#0B1B3D' });
  assert.equal(result.events[0].kind, 'exam');
  assert.equal(result.events[1].kind, 'assignment');
  assert.equal(result.events[2].kind, 'lecture');
  assert.equal(result.events[0].date, '2026-10-11');
  assert.equal(result.events[0].time, '12:30');
  assert.equal(result.events[0].endTime, '13:30');
  assert.equal(result.events[0].description, 'الفصل الأول');
  assert.equal(result.events[0].courseId, 'moodle-course-7');
});

test('Moodle normalization rejects unsafe links and malformed events', () => {
  const result = normalizeMoodleData({}, [], { events:[
    { id:1, name:'موعد', timestart:0, url:'javascript:alert(1)' },
    { id:2, name:'موعد عام', timestart:1700000000, url:'http://insecure.example' },
  ] });
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].url, undefined);
  assert.equal(result.events[0].kind, 'event');
});
