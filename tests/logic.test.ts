import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays, buildStudyPlan, daysUntil, financeSummary, formatDate, summarizeText, todayISO } from '../src/logic.ts';
import type { AppData, Task, Transaction } from '../src/types.ts';

const origin = '2026-10-11'; // Sunday
function task(overrides: Partial<Task> = {}): Task {
  return { id: 'exam', title: 'اختبار', courseId: 'math', kind: 'exam', due: '2026-10-20', priority: 'high', minutes: 90, completed: false, time: '23:59', ...overrides };
}
function data(tasks: Task[] = [task()]): AppData {
  return { version: 1, courses: [], lectures: [], tasks, notes: [], transactions: [],
    settings: { name: 'طالب', currency: 'SAR', monthlyBudget: 1000, dailyMinutes: 120, studyStart: '17:00', studyDays: [0, 1, 2, 3, 4, 5, 6] } };
}
const minute = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));

test('dates use the local calendar and Gregorian display, with stable arithmetic', () => {
  assert.equal(todayISO(new Date(2026, 9, 11, 0, 1)), origin);
  assert.equal(addDays('2024-02-28', 2), '2024-03-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('1900-02-28', 1), '1900-03-01');
  assert.equal(addDays('2000-02-28', 1), '2000-02-29');
  assert.equal(addDays('0099-12-31', 1), '0100-01-01');
  assert.equal(daysUntil('0100-01-01', '0099-12-31'), 1);
  assert.equal(daysUntil('2026-10-14', origin), 3);
  assert.equal(daysUntil('2026-10-10', origin), -1);
  assert.equal(daysUntil('2026-03-10', '2026-03-07'), 3); // DST boundary in some time zones
  assert.match(formatDate(origin), /أكتوبر/);
  assert.notEqual(formatDate(origin, true), formatDate(origin));
});

test('malformed dates never normalize into another valid deadline', () => {
  assert.equal(addDays('2026-02-30', 1), '');
  assert.equal(addDays('not-a-date', 1), '');
  assert.equal(daysUntil('2026-02-30', origin), Infinity);
  assert.equal(formatDate('2026-13-01'), 'تاريخ غير صالح');
  assert.equal(todayISO(new Date(NaN)), '');
});

test('study blocks obey the minute budget and allow ten-minute breaks', () => {
  const input = data([task({ minutes: 210 })]);
  input.settings.dailyMinutes = 100;
  const plan = buildStudyPlan(input, origin);
  const firstDay = plan.sessions.filter(session => session.date === origin);
  assert.deepEqual(firstDay.map(session => session.minutes), [45, 45, 10]);
  assert.deepEqual(firstDay.map(session => [session.start, session.end]), [['17:00', '17:45'], ['17:55', '18:40'], ['18:50', '19:00']]);
  for (const date of new Set(plan.sessions.map(session => session.date))) {
    assert.ok(plan.sessions.filter(session => session.date === date).reduce((sum, session) => sum + session.minutes, 0) <= 100);
  }
  assert.equal(plan.unscheduledMinutes, 0);
  assert.deepEqual(buildStudyPlan(input, origin), plan);
});

test('the nearest deadline wins, then high priority for equal deadlines', () => {
  const input = data([task({ id: 'late', due: '2026-10-14', priority: 'high', minutes: 15 }),
    task({ id: 'low', due: origin, priority: 'low', minutes: 15 }),
    task({ id: 'high', due: origin, priority: 'high', minutes: 15 })]);
  assert.deepEqual(buildStudyPlan(input, origin).sessions.map(session => session.taskId), ['high', 'low', 'late']);
});

test('only selected weekdays are allocated and deadlines are respected', () => {
  const input = data([task({ id: 'soon', due: '2026-10-12', minutes: 100 }), task({ id: 'later', minutes: 100 })]);
  input.settings.studyDays = [2]; // Tuesday, after the first deadline
  const plan = buildStudyPlan(input, origin);
  assert.equal(plan.remaining.soon, 100);
  assert.ok(plan.sessions.every(session => new Date(`${session.date}T12:00:00`).getDay() === 2));
  assert.ok(plan.sessions.every(session => session.date <= input.tasks.find(item => item.id === session.taskId)!.due));
});

test('overdue and invalid deadlines remain visible, completed work is excluded', () => {
  const input = data([task({ id: 'past', due: '2026-10-10', minutes: 30 }),
    task({ id: 'invalid', due: '2026-02-30', minutes: 20 }),
    task({ id: 'done', completed: true, minutes: 100 }), task({ id: 'zero', minutes: 0 })]);
  const plan = buildStudyPlan(input, origin);
  assert.deepEqual(plan.sessions, []);
  assert.deepEqual(plan.remaining, { past: 30, invalid: 20 });
  assert.equal(plan.unscheduledMinutes, 50);
});

test('no weekdays, zero budget, and empty tasks produce no sessions', () => {
  const noDays = data();
  noDays.settings.studyDays = [];
  assert.equal(buildStudyPlan(noDays, origin).unscheduledMinutes, 90);
  const noBudget = data();
  noBudget.settings.dailyMinutes = 0;
  assert.equal(buildStudyPlan(noBudget, origin).sessions.length, 0);
  assert.equal(buildStudyPlan(noBudget, origin).unscheduledMinutes, 90);
  assert.deepEqual(buildStudyPlan(data([]), origin), { sessions: [], remaining: {}, unscheduledMinutes: 0 });
});

test('lectures, including overlapping lectures, occupy the time between free gaps', () => {
  const input = data([task({ due: origin, minutes: 120 })]);
  input.lectures = [
    { id: 'one', courseId: 'math', day: 0, start: '17:20', end: '18:00', location: '' },
    { id: 'two', courseId: 'math', day: 0, start: '17:50', end: '18:30', location: '' },
    { id: 'other-day', courseId: 'math', day: 1, start: '17:00', end: '23:00', location: '' },
  ];
  const plan = buildStudyPlan(input, origin);
  assert.deepEqual(plan.sessions.map(session => [session.start, session.end]),
    [['17:00', '17:20'], ['18:30', '19:15'], ['19:25', '20:10'], ['20:20', '20:30']]);
  assert.ok(plan.sessions.every(session => minute(session.end) <= 17 * 60 + 20 || minute(session.start) >= 18 * 60 + 30));
});

test('late study starts stop at midnight and report the shortage honestly', () => {
  const input = data([task({ due: origin, kind: 'assignment', time: undefined, minutes: 90 })]);
  input.settings.studyStart = '23:30';
  const plan = buildStudyPlan(input, origin);
  assert.deepEqual(plan.sessions.map(session => [session.start, session.end, session.minutes]), [['23:30', '24:00', 30]]);
  assert.equal(plan.remaining.exam, 60);
  assert.equal(plan.unscheduledMinutes, 60);
});

test('28-day horizon bounds large workloads and preserves all remaining minutes', () => {
  const input = data(Array.from({ length: 50 }, (_, index) => task({ id: `task-${index}`, minutes: 120, due: '2027-01-01' })));
  input.settings.dailyMinutes = 30;
  const plan = buildStudyPlan(input, origin);
  assert.equal(new Set(plan.sessions.map(session => session.date)).size, 28);
  assert.ok(plan.sessions.every(session => session.date <= '2026-11-07'));
  assert.equal(plan.sessions.reduce((sum, session) => sum + session.minutes, 0), 840);
  assert.equal(plan.unscheduledMinutes, 6000 - 840);
  assert.equal(Object.values(plan.remaining).reduce((sum, value) => sum + value, 0), plan.unscheduledMinutes);
});

test('invalid settings cannot create invalid clocks or mutate the input', () => {
  const input = data([task({ due: origin, minutes: 60 })]);
  input.settings.studyStart = '99:99';
  input.settings.studyDays = [0, -1, 8, NaN];
  const snapshot = structuredClone(input);
  const plan = buildStudyPlan(input, origin);
  assert.equal(plan.sessions[0].start, '17:00');
  assert.deepEqual(input, snapshot);
});

test('a timed deadline caps the final chunk and leaves expired preparation unscheduled', () => {
  const input = data([task({ id: 'timed', due: origin, time: '17:30', minutes: 60 }),
    task({ id: 'expired', kind: 'assignment', due: origin, time: '16:59', minutes: 30 })]);
  const plan = buildStudyPlan(input, origin);
  assert.deepEqual(plan.sessions.map(session => [session.taskId, session.start, session.end]), [['timed', '17:00', '17:30']]);
  assert.deepEqual(plan.remaining, { expired: 30, timed: 30 });
  assert.equal(plan.unscheduledMinutes, 60);
});

test('an exam with unknown time receives preparation only before its date', () => {
  const input = data([task({ id: 'today', due: origin, time: undefined, timePending: 'صباحاً أم مساءً؟', minutes: 30 }),
    task({ id: 'tomorrow', due: '2026-10-12', time: undefined, minutes: 45 })]);
  const plan = buildStudyPlan(input, origin);
  assert.deepEqual(plan.sessions.map(session => [session.taskId, session.date]), [['tomorrow', origin]]);
  assert.equal(plan.remaining.today, 30);
  assert.equal(plan.unscheduledMinutes, 30);
});

test('an assignment without a time can still use its due date', () => {
  const input = data([task({ kind: 'assignment', due: origin, time: undefined, minutes: 45 })]);
  assert.deepEqual(buildStudyPlan(input, origin).sessions.map(session => [session.start, session.end]), [['17:00', '17:45']]);
});

test('zero-preparation exams still block their calendar intervals for other work', () => {
  const input = data([task({ id: 'event', due: origin, time: '17:30', endTime: '18:30', minutes: 0 }),
    task({ id: 'work', due: origin, kind: 'project', time: undefined, minutes: 75 })]);
  const plan = buildStudyPlan(input, origin);
  assert.deepEqual(plan.sessions.map(session => [session.start, session.end]), [['17:00', '17:30'], ['18:30', '19:15']]);
  assert.equal(plan.unscheduledMinutes, 0);
  assert.ok(!('event' in plan.remaining));
});

test('a known exam start with unknown end blocks the rest of that day', () => {
  const input = data([task({ id: 'event', due: origin, time: '17:30', endTime: undefined, minutes: 0 }),
    task({ id: 'work', due: origin, kind: 'assignment', time: undefined, minutes: 75 })]);
  const plan = buildStudyPlan(input, origin);
  assert.deepEqual(plan.sessions.map(session => [session.start, session.end]), [['17:00', '17:30']]);
  assert.equal(plan.remaining.work, 45);
});

test('missing lecture times conservatively reserve the unknown interval', () => {
  const input = data([task({ due: origin, kind: 'assignment', time: undefined, minutes: 90 })]);
  input.lectures = [{ id: 'pending-end', courseId: '', day: 0, start: '17:30', end: '', location: '' }];
  const partial = buildStudyPlan(input, origin);
  assert.equal(partial.sessions.reduce((sum, session) => sum + session.minutes, 0), 30);
  assert.equal(partial.unscheduledMinutes, 60);
  input.lectures[0].start = '';
  const unknown = buildStudyPlan(input, origin);
  assert.deepEqual(unknown.sessions, []);
  assert.equal(unknown.unscheduledMinutes, 90);
  input.lectures[0].start = '24:05';
  assert.equal(buildStudyPlan(input, origin).sessions.length, 0);
});

test('timed deadlines are ordered before later deadlines on the same date', () => {
  const input = data([task({ id: 'later', due: origin, kind: 'assignment', priority: 'high', time: '20:00', minutes: 20 }),
    task({ id: 'earlier', due: origin, kind: 'assignment', priority: 'low', time: '17:30', minutes: 20 })]);
  assert.deepEqual(buildStudyPlan(input, origin).sessions.map(session => session.taskId), ['earlier', 'later']);
});

test('summary handles empty content and extracts only source sentences', () => {
  assert.equal(summarizeText('  \n '), '');
  const source = 'تتحدث المحاضرة عن البرمجة. الخوارزمية هي خطوات مرتبة لحل مشكلة. نستخدم الخوارزمية لترتيب البيانات. تبدأ الخوارزمية بتحديد المدخلات. توجد أمثلة كثيرة في المحاضرة. هذه فقرة جانبية عن القاعة. الخوارزمية تساعد على تحليل المشكلة. يمكن كتابة خطوات الخوارزمية بلغة بسيطة.';
  const summary = summarizeText(source);
  const lines = summary.split('\n').map(line => line.slice(2));
  assert.ok(lines.length < 8 && lines.length <= 6);
  assert.equal(lines[0], 'تتحدث المحاضرة عن البرمجة.');
  assert.ok(lines.includes('الخوارزمية هي خطوات مرتبة لحل مشكلة.'));
  assert.ok(lines.every(line => source.includes(line)));
  assert.equal(summarizeText(source), summary);
  assert.ok(summarizeText('A network connects computers. A protocol means agreed communication rules. Protocol rules define how data moves.').includes('A protocol means agreed communication rules.'));
});

test('summary caps long paragraphs without inventing new claims', () => {
  const source = 'كلمة '.repeat(400);
  const summary = summarizeText(source);
  assert.ok(summary.length <= 503);
  assert.ok(source.includes(summary.slice(2, -1)));
  assert.ok(summary.endsWith('…'));
});

function transaction(id: string, kind: 'income' | 'expense', amount: number, category = 'طعام', date = origin): Transaction {
  return { id, kind, amount, category, date, title: id };
}
test('monthly finance totals only positive valid entries in the exact calendar month', () => {
  const transactions = [transaction('salary', 'income', 1000, 'راتب'), transaction('meal', 'expense', 25.5),
    transaction('meal-two', 'expense', 4.5), transaction('transport', 'expense', 50, 'مواصلات'),
    transaction('previous', 'expense', 500, 'طعام', '2026-09-30'), transaction('next', 'income', 2000, 'راتب', '2026-11-01'),
    transaction('negative', 'expense', -30), transaction('zero', 'expense', 0), transaction('infinity', 'income', Infinity),
    transaction('nan', 'expense', NaN), transaction('bad-date', 'expense', 25, 'طعام', '2026-10-32')];
  assert.deepEqual(financeSummary(transactions, '2026-10'), { income: 1000, expense: 80, balance: 920,
    categories: [{ name: 'مواصلات', amount: 50 }, { name: 'طعام', amount: 30 }] });
  assert.deepEqual(financeSummary(transactions, '2026-1'), { income: 0, expense: 0, balance: 0, categories: [] });
});

test('financial decimals stay exact at currency precision and blank categories get a label', () => {
  const transactions = [transaction('a', 'income', 0.3), transaction('b', 'expense', 0.1, ' '), transaction('c', 'expense', 0.2, '')];
  assert.deepEqual(financeSummary(transactions, '2026-10'), { income: 0.3, expense: 0.3, balance: 0,
    categories: [{ name: 'أخرى', amount: 0.3 }] });
});
