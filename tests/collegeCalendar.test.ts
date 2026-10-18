import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyData } from '../src/validation.ts';
import { mergeSharedAcademics } from '../src/sharedAcademics.ts';
import { COLLEGE_CALENDAR, mergeCollegeCalendar } from '../src/collegeCalendar.ts';
import { buildStudyCalendar } from '../src/calendarTools.ts';
import { academicAlerts } from '../src/academicAlerts.ts';
import { COURSE_LIBRARY } from '../src/courseLibrary.ts';
import { readFileSync, existsSync } from 'node:fs';

test('college calendar fills source times, preserves confirmed conflicts and is idempotent',()=>{
 const original=mergeSharedAcademics(emptyData()).data;
 const result=mergeCollegeCalendar(original);
 assert.equal(result.conflicts.length,1);
 assert.equal(result.data.tasks.find(t=>t.id==='exam-procurement')?.time,'21:15');
 assert.equal(result.data.tasks.find(t=>t.id==='exam-business')?.time,'20:00');
 assert.equal(result.data.tasks.find(t=>t.id==='exam-business')?.endTime,'21:30');
 assert.equal(original.tasks.find(t=>t.id==='exam-business')?.time,undefined);
 assert.equal(result.data.tasks.filter(t=>t.kind==='assignment').length,1);
 assert.deepEqual(mergeCollegeCalendar(result.data).data,result.data);
 const rescheduled=structuredClone(result.data);const business=rescheduled.tasks.find(t=>t.id==='exam-business')!;business.due='2026-12-18';
 const kept=mergeCollegeCalendar(rescheduled).data;assert.deepEqual(kept,rescheduled);
 const accepted=mergeCollegeCalendar(result.data,COLLEGE_CALENDAR.find(e=>e.courseId==='procurement'&&e.kind==='exam')!.id);
 assert.equal(accepted.conflicts.length,0);
 assert.equal(accepted.data.tasks.find(t=>t.id==='exam-procurement')?.time,'08:00');
});
test('source calendar joins existing calendar and alert pipelines without duplicate assignment alarms',()=>{
 const data=mergeCollegeCalendar(mergeSharedAcademics(emptyData()).data).data;
 const ics=buildStudyCalendar(data);const event=COLLEGE_CALENDAR.find(e=>e.kind==='assignment')!;
 assert.equal(ics.split('SUMMARY:'+event.title).length-1,1);
 assert.match(ics,/BEGIN:VALARM/);
 const alerts=academicAlerts(data,new Date('2026-11-28T00:00:00+03:00'));
 assert.equal(alerts.filter(a=>a.title===event.title).length,2);
 assert.ok(!COLLEGE_CALENDAR.some(e=>/2027|https:|sesskey|token|azoz51059/.test(JSON.stringify(e))));
});
test('every shared PDF exists, is unique and keeps five teaching course sections',()=>{
 assert.equal(COURSE_LIBRARY.length,31);assert.equal(new Set(COURSE_LIBRARY.map(f=>f.url)).size,31);
 assert.equal(COURSE_LIBRARY.filter(f=>f.kind==='lecture').length,23);
 assert.equal(new Set(COURSE_LIBRARY.filter(f=>f.kind==='lecture').map(f=>f.course)).size,5);
 // An unpublished library has no activation manifest; the UI keeps every file action disabled.
 if(!existsSync('public/course-library/manifest.json'))return;
 const manifest=JSON.parse(readFileSync('public/course-library/manifest.json','utf8'));assert.equal(manifest.version,1);
 assert.equal(new Set(manifest.files).size,manifest.files.length);assert.ok(manifest.files.every((url:string)=>COURSE_LIBRARY.some(f=>f.url===url)));
 for(const file of COURSE_LIBRARY.filter(f=>manifest.files.includes(f.url))){const bytes=readFileSync('public'+file.url);assert.equal(bytes.subarray(0,5).toString(),'%PDF-');assert.equal(bytes.length,file.bytes);}
});
