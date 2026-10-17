import test from 'node:test';
import assert from 'node:assert/strict';
import { SHARED_ACADEMIC_CATALOG, mergeSharedAcademics } from '../src/sharedAcademics.ts';
import { emptyData, validateData } from '../src/validation.ts';

const catalog = SHARED_ACADEMIC_CATALOG;

test('the shared catalog includes only approved academic fields, with source and estimate notices', () => {
  assert.deepEqual(Object.keys(catalog).sort(), ['id', 'semester', 'semesterLabel', 'timezone', 'provenance', 'preparationMinutes', 'courses', 'lectures', 'exams'].sort());
  assert.equal(catalog.semester, 'fall-2026');
  assert.equal(catalog.timezone, 'Asia/Riyadh');
  assert.equal(catalog.provenance.source, 'user-provided');
  assert.equal(catalog.provenance.universityVerified, false);
  assert.equal(catalog.preparationMinutes.estimated, true);
  assert.equal(catalog.preparationMinutes.value, 180);
  assert.equal(catalog.courses.length, 5);
  assert.equal(catalog.lectures.length, 5);
  assert.equal(catalog.exams.length, 5);
  assert.ok(catalog.exams.every(exam => exam.kind === 'exam' && !exam.completed && exam.minutes === 180));
  for (const course of catalog.courses) assert.deepEqual(Object.keys(course).sort(), ['id', 'name', 'color'].sort());
  const serialized = JSON.stringify(catalog);
  for (const privateField of ['transactions', 'incomeRules', 'studentProfile', 'photo', 'cv', 'applications', 'monthlyBudget', 'salary', '4500', '1080', '1085', 'assignment']) assert.ok(!serialized.includes(privateField), privateField);
  assert.ok(Object.isFrozen(catalog) && Object.isFrozen(catalog.courses) && Object.isFrozen(catalog.courses[0]));
});

test('new and existing accounts receive five courses, weekly lectures and historical exam dates idempotently', () => {
  const input = emptyData();
  const before = structuredClone(input);
  const first = mergeSharedAcademics(input);
  assert.deepEqual(input, before);
  assert.deepEqual([first.addedCourses, first.addedLectures, first.addedExams], [5, 5, 5]);
  assert.equal(first.data.courses[0].id, 'inventory-management');
  assert.deepEqual(first.data.tasks.map(task => task.due), ['2026-10-11', '2026-10-14', '2026-10-18', '2026-10-20', '2026-10-22']);
  assert.ok(validateData(first.data));
  assert.ok(validateData(JSON.parse(JSON.stringify(first.data))));
  const second = mergeSharedAcademics(first.data);
  assert.deepEqual([second.addedCourses, second.addedLectures, second.addedExams], [0, 0, 0]);
  assert.deepEqual(second.data, first.data);
});

test('unknown lecture and examination clocks remain unknown rather than receiving guessed times', () => {
  const { data } = mergeSharedAcademics(emptyData());
  const inventory = data.lectures.find(lecture => lecture.id === 'lecture-inventory')!;
  assert.equal(inventory.day, 4);
  assert.equal(inventory.start, '15:00');
  assert.equal(inventory.end, '');
  assert.match(inventory.timePending!, /لم يُحدد/);
  assert.deepEqual(data.lectures.filter(lecture => lecture.id !== 'lecture-inventory').map(lecture => [lecture.day, lecture.start, lecture.end]), [[0, '18:00', '20:00'], [2, '18:00', '20:00'], [3, '18:00', '20:00'], [4, '18:00', '20:00']]);
  const first = data.tasks.find(task => task.id === 'exam-inventory')!;
  assert.equal(first.time, '20:00'); assert.equal(first.endTime, '21:00');
  for (const id of ['exam-supply', 'exam-business', 'exam-transport']) {
    const exam = data.tasks.find(task => task.id === id)!;
    assert.equal(exam.time, undefined); assert.equal(exam.endTime, undefined); assert.match(exam.timePending!, /مسائي/);
  }
  const last = data.tasks.find(task => task.id === 'exam-procurement')!;
  assert.equal(last.time, '21:15'); assert.equal(last.endTime, undefined);
});

test('existing shared record IDs preserve rescheduled dates, edited clocks, course names and completion', () => {
  const input = mergeSharedAcademics(emptyData()).data;
  input.courses[0].name = 'اسم مخصص للمادة'; input.courses[0].color = '#123456';
  input.tasks[0].due = '2026-10-25'; input.tasks[0].time = '22:00'; input.tasks[0].endTime = ''; input.tasks[0].completed = true; input.tasks[0].minutes = 12.5;
  input.lectures[0].day = 1; input.lectures[0].start = '19:00'; input.lectures[0].end = '21:00';
  const result = mergeSharedAcademics(input);
  assert.deepEqual([result.addedCourses, result.addedLectures, result.addedExams], [0, 0, 0]);
  assert.deepEqual(result.data, input);
});

test('Arabic course names and aliases reuse existing identities and deduplicate different appointment IDs', () => {
  const input = emptyData();
  input.courses = [
    { id: 'moodle-inventory', name: 'اداره المخزون و المخازن — ١٠٣ دار', color: '#123456' },
    { id: 'moodle-transport', name: 'إدارة النّقل والشحن الدولي - دار ١٠١', color: '#234567' },
  ];
  input.lectures = [{ id: 'my-inventory-lecture', courseId: 'moodle-inventory', day: 4, start: '15:00', end: '16:45', location: 'رابط خاص' }];
  input.tasks = [{ id: 'my-inventory-exam', title: 'عنواني الخاص', courseId: 'moodle-inventory', kind: 'exam', due: '2026-10-11', time: '21:30', priority: 'medium', minutes: 30, completed: true }];
  const result = mergeSharedAcademics(input);
  assert.deepEqual([result.addedCourses, result.addedLectures, result.addedExams], [3, 4, 4]);
  assert.equal(result.data.courses.length, 5);
  assert.deepEqual(result.data.lectures[0], input.lectures[0]);
  assert.deepEqual(result.data.tasks[0], input.tasks[0]);
  assert.equal(result.data.lectures.find(lecture => lecture.id === 'lecture-transport')?.courseId, 'moodle-transport');
  assert.equal(result.data.tasks.find(task => task.id === 'exam-transport')?.courseId, 'moodle-transport');
  assert.ok(!result.data.courses.some(course => course.id === 'inventory-management'));
  assert.deepEqual(mergeSharedAcademics(result.data).data, result.data);
});

test('canonical inventory identity wins when duplicate course identities already exist without rewriting user data', () => {
  const input = emptyData();
  input.courses = [{ id: 'inventory-management', name: 'اسم مخصص', color: '#123456' }, { id: 'inventory', name: 'إدارة المخزون والمخازن', color: '#234567' }];
  input.lectures = [{ id: 'same-slot', courseId: 'inventory', day: 4, start: '15:00', end: '', location: '' }];
  const result = mergeSharedAcademics(input);
  assert.equal(result.addedCourses, 4);
  assert.equal(result.addedLectures, 4);
  assert.equal(result.data.tasks.find(task => task.id === 'exam-inventory')?.courseId, 'inventory-management');
  assert.deepEqual(result.data.courses.slice(0, 2), input.courses);
  assert.deepEqual(result.data.lectures[0], input.lectures[0]);
});

test('merging preserves private account fields and never shares personal assignments or finances', () => {
  const input = emptyData();
  input.settings.name = 'PRIVATE_STUDENT_NAME'; input.settings.monthlyBudget = 7654;
  input.tasks = [{ id: 'my-homework', title: 'PRIVATE_HOMEWORK', courseId: '', kind: 'assignment', due: '2026-11-30', priority: 'low', minutes: 20, completed: true }];
  input.transactions = [{ id: 'my-income', title: 'PRIVATE_INCOME', kind: 'income', amount: 4321, category: 'خاص', date: '2026-10-17' }];
  const result = mergeSharedAcademics(input);
  assert.deepEqual(result.data.settings, input.settings);
  assert.deepEqual(result.data.transactions, input.transactions);
  assert.deepEqual(result.data.tasks[0], input.tasks[0]);
  const another = mergeSharedAcademics(emptyData()).data;
  assert.ok(!JSON.stringify(another).includes('PRIVATE_'));
});

test('invalid input and over-capacity output are rejected atomically without changing the account or catalog', () => {
  const invalid = emptyData(); invalid.lectures = [{ id: 'invalid', courseId: 'not-existing', day: 0, start: '', end: '', location: '' }];
  const invalidBefore = structuredClone(invalid);
  assert.throws(() => mergeSharedAcademics(invalid), /shared-academics-invalid-data/);
  assert.deepEqual(invalid, invalidBefore);
  const full = emptyData();
  full.courses = Array.from({ length: 10000 }, (_, index) => ({ id: `custom-${index}`, name: `مادة ${index}`, color: '#123456' }));
  assert.ok(validateData(full));
  const fullBefore = structuredClone(full);
  const catalogBefore = JSON.stringify(catalog);
  assert.throws(() => mergeSharedAcademics(full), /shared-academics-invalid-result/);
  assert.deepEqual(full, fullBefore);
  assert.equal(JSON.stringify(catalog), catalogBefore);
});
