import test from 'node:test';
import assert from 'node:assert/strict';
import { actualStudyLimit, allocateStudySeconds, finishStudySession, measuredStudyMinutes, moveStudyStep, pauseStudyRun, spacedReviewDates, studyPhases, studyTimer } from '../src/studyMethods.ts';
import type { AppData, StudyRun, TaskKind } from '../src/types.ts';

const timestamp = new Date('2026-10-17T12:00:00').getTime();
function run(overrides: Partial<StudyRun> = {}): StudyRun {
  const stepRemaining = allocateStudySeconds(45);
  return { id: 'session-one', taskId: 'exam', title: 'التحضير للاختبار', date: '2026-10-17', plannedMinutes: 45, kind: 'exam', step: 0, remainingSeconds: stepRemaining[0], stepRemaining, elapsedSeconds: 0, runningSince: null, reflection: '', ...overrides };
}
function data(current: StudyRun = run()): AppData {
  return { version: 1, courses: [], lectures: [], notes: [], transactions: [], activeStudy: current,
    tasks: [{ id: 'exam', title: 'اختبار', kind: 'exam', due: '2026-10-18', courseId: '', completed: false, minutes: 90, priority: 'high' }],
    settings: { name: '', currency: 'SAR', monthlyBudget: 0, dailyMinutes: 90, studyStart: '18:00', studyDays: [0] } };
}

test('five study phases allocate the exact planned time, even tiny and fractional sessions', () => {
  for (const minutes of [0, 1 / 60, 0.5, 1, 3, 10, 15, 45, 120, 0.1]) {
    for (const kind of ['exam', 'assignment', 'project'] as TaskKind[]) {
      const allocated = allocateStudySeconds(minutes, kind);
      assert.equal(allocated.length, 5);
      assert.equal(allocated.reduce((sum, seconds) => sum + seconds, 0), Math.round(minutes * 60));
      assert.ok(allocated.every(seconds => Number.isInteger(seconds) && seconds >= 0));
      if (minutes * 60 >= 5) assert.ok(allocated.every(seconds => seconds >= 1));
    }
  }
  assert.deepEqual(allocateStudySeconds(NaN), [0, 0, 0, 0, 0]);
});

test('exam time emphasizes retrieval while projects prioritize a concrete working result', () => {
  const exam = allocateStudySeconds(45, 'exam');
  const project = allocateStudySeconds(45, 'project');
  assert.ok(exam[2] > project[2]);
  assert.ok(project[3] > exam[3]);
  assert.match(studyPhases(5)[2].goal, /سؤال واحد/);
  assert.match(studyPhases(45, 'project')[3].goal, /المشروع/);
});

test('background and refresh clocks use wall time, stop at the phase end, and never fabricate later phases', () => {
  const current = run({ runningSince: timestamp });
  assert.deepEqual(studyTimer(current, timestamp + 10_500), { remainingSeconds: current.remainingSeconds - 10.5, elapsedSeconds: 10.5 });
  const revived = JSON.parse(JSON.stringify(current)) as StudyRun;
  const afterLongAbsence = studyTimer(revived, timestamp + 60 * 60 * 1000);
  assert.equal(afterLongAbsence.remainingSeconds, 0);
  assert.equal(afterLongAbsence.elapsedSeconds, current.remainingSeconds);
  assert.ok(afterLongAbsence.elapsedSeconds < current.plannedMinutes * 60);
  assert.deepEqual(studyTimer(current, timestamp - 1000), { remainingSeconds: current.remainingSeconds, elapsedSeconds: 0 });
});

test('pause and back/next preserve phase clocks and credit each actual interval once', () => {
  const current = run({ runningSince: timestamp });
  const paused = pauseStudyRun(current, timestamp + 20_000);
  assert.equal(paused.elapsedSeconds, 20);
  assert.equal(paused.runningSince, null);
  assert.deepEqual(pauseStudyRun(paused, timestamp + 400_000), paused);
  const next = moveStudyStep(paused, 1, timestamp + 400_000);
  assert.equal(next.elapsedSeconds, 20);
  assert.equal(next.runningSince, null);
  const back = moveStudyStep(next, 0, timestamp + 800_000);
  assert.equal(back.remainingSeconds, current.remainingSeconds - 20);
  assert.equal(back.elapsedSeconds, 20);
  const resumed = { ...back, runningSince: timestamp + 800_000 };
  const moved = moveStudyStep(resumed, 4, timestamp + 810_000);
  assert.equal(moved.elapsedSeconds, 30);
  assert.equal(measuredStudyMinutes(moved, timestamp + 900_000), 0.5);
});

test('skipping all steps leaves actual minutes at zero and schedules no fake reviews', () => {
  const current = moveStudyStep(run(), 4, timestamp);
  const input = data(current);
  assert.equal(measuredStudyMinutes(current, timestamp), 0);
  assert.equal(finishStudySession(input, current.id, 0, 1, 'سأبدأ بعد الاستراحة', timestamp), true);
  assert.equal(input.tasks[0].minutes, 90);
  assert.equal(input.tasks[0].completed, false);
  assert.equal(input.studyLog?.[0].minutes, 0);
  assert.deepEqual(input.studyLog?.[0].reviewDates, []);
});

test('finish is atomic and idempotent, subtracts confirmed minutes once, and preserves task status', () => {
  const input = data();
  assert.equal(finishStudySession(input, 'session-one', 12.5, 3, '  أراجع المقارنة  ', timestamp), true);
  assert.equal(input.tasks[0].minutes, 77.5);
  assert.equal(input.tasks[0].completed, false);
  assert.equal(input.activeStudy, null);
  assert.equal(input.studyLog?.[0].reflection, 'أراجع المقارنة');
  assert.deepEqual(input.studyLog?.[0].reviewDates, ['2026-10-18', '2026-10-20', '2026-10-24']);
  assert.equal(finishStudySession(input, 'session-one', 12.5, 3, '', timestamp), false);
  assert.equal(input.tasks[0].minutes, 77.5);
  assert.equal(input.studyLog?.length, 1);
  const alreadyCompleted = data();
  alreadyCompleted.tasks[0].completed = true;
  finishStudySession(alreadyCompleted, 'session-one', 1, 5, '', timestamp);
  assert.equal(alreadyCompleted.tasks[0].completed, true);
});

test('finishing uses the latest task balance and rejects out of bounds input without any writes', () => {
  for (const invalid of [-1, 45.1, NaN, Infinity]) {
    const input = data();
    const original = structuredClone(input);
    assert.equal(finishStudySession(input, 'session-one', invalid, 3, '', timestamp), false);
    assert.deepEqual(input, original);
  }
  const input = data();
  input.tasks[0].minutes = 4;
  assert.equal(actualStudyLimit(input, input.activeStudy!), 4);
  assert.equal(finishStudySession(input, 'session-one', 5, 3, '', timestamp), false);
  assert.equal(input.studyLog, undefined);
  assert.equal(finishStudySession(input, 'session-one', 4, 3, '', timestamp), true);
  assert.equal(input.tasks[0].minutes, 0);
  assert.equal(input.tasks[0].completed, false);
  const deleted = data();
  deleted.tasks = [];
  assert.equal(actualStudyLimit(deleted, deleted.activeStudy!), 0);
  assert.equal(finishStudySession(deleted, 'session-one', 1, 3, '', timestamp), false);
  assert.equal(finishStudySession(deleted, 'session-one', 0, 3, '', timestamp), true);
});

test('confidence changes review spacing, handles calendar boundaries, and requires a valid score', () => {
  assert.deepEqual(spacedReviewDates('2026-12-30', 1), ['2026-12-31', '2027-01-02', '2027-01-06']);
  assert.deepEqual(spacedReviewDates('2026-12-30', 5), ['2027-01-02', '2027-01-06']);
  const input = data();
  for (const score of [-1, 6, 2.5, NaN]) assert.equal(finishStudySession(input, 'session-one', 1, score, '', timestamp), false);
  assert.equal(input.tasks[0].minutes, 90);
});
