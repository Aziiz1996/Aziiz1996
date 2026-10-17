import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { PRACTICE_BANK, PRACTICE_QUESTIONS } from '../src/practiceBank.ts';
import { createPracticeRun, finishPracticeRun, gradePractice, selectPracticeQuestions, validatePracticeState } from '../src/practiceLogic.ts';

const now = Date.parse('2026-10-17T18:00:00.000Z');
const run = () => createPracticeRun({ questionIds: ['25', '26', '27'], id: 'run-1', now, mode: 'exam' });

test('user bank preserves 40 unique source IDs, four labeled choices and supplied answer keys', () => {
  assert.equal(PRACTICE_QUESTIONS.length, 40);
  assert.deepEqual(PRACTICE_QUESTIONS.map(question => question.id), Array.from({ length: 40 }, (_, index) => String(index + 1)));
  assert.equal(PRACTICE_BANK.id, 'inventory-v1');
  assert.match(PRACTICE_BANK.source.sha256, /^[a-f0-9]{64}$/);
  for (const question of PRACTICE_QUESTIONS) {
    assert.equal(question.options.length, 4);
    assert.equal(new Set(question.options.map(option => option.letter)).size, 4);
    assert.equal(question.options.filter(option => option.letter === question.answer).length, 1);
  }
  assert.equal(PRACTICE_QUESTIONS[25].q, 'إذا احتاج المستودع متابعة موقع الصنف وحركته داخله وش النظام المذكور');
  assert.equal(PRACTICE_QUESTIONS[25].answer, 'ج');
  // Canonical content hash of the supplied JSON; only IDs are normalized for app storage.
  const originalShape = PRACTICE_QUESTIONS.map(question => ({ ...question, id: Number(question.id) }));
  assert.equal(createHash('sha256').update(JSON.stringify(originalShape)).digest('hex'), 'c2c9c1a11e1a37fc96ccf47e6380d8e2e6c85be862c7981ea5aa3b81184b630e');
});

test('random short practices use unique real question IDs and full bank retains source order', () => {
  for (const count of [10, 20, 40]) {
    const selected = selectPracticeQuestions(count, () => 0.4);
    assert.equal(selected.length, count); assert.equal(new Set(selected).size, count);
    assert.ok(selected.every(id => PRACTICE_QUESTIONS.some(question => question.id === id)));
  }
  assert.deepEqual(selectPracticeQuestions(40), PRACTICE_QUESTIONS.map(question => question.id));
  assert.equal(selectPracticeQuestions(NaN, () => 0).length, 10);
  assert.throws(() => createPracticeRun({ questionIds: ['1', '1'] }));
  assert.throws(() => createPracticeRun({ questionIds: ['unknown'] }));
});

test('grading distinguishes a correct answer, wrong answer and unanswered question', () => {
  const result = gradePractice(['25', '26', '27'], { '25': 'ب', '26': 'أ' });
  assert.equal(result.score, 1); assert.equal(result.total, 3); assert.equal(result.percent, 33);
  assert.deepEqual(result.correctIds, ['25']); assert.deepEqual(result.wrongIds, ['26']); assert.deepEqual(result.skippedIds, ['27']);
  assert.equal(gradePractice([], {}).percent, 0);
});

test('finishing stores an immutable answer snapshot and never backdates before start', () => {
  const active = run(); active.answers = { '25': 'ب', '26': 'أ' };
  const attempt = finishPracticeRun(active, now + 5000);
  assert.equal(attempt.score, 1); assert.equal(attempt.total, 3); assert.equal(attempt.mode, 'exam');
  assert.equal(attempt.finishedAt, '2026-10-17T18:00:05.000Z');
  assert.equal(finishPracticeRun(active, now - 1000).finishedAt, active.startedAt);
  attempt.answers['25'] = 'أ'; attempt.questionIds.push('1');
  assert.equal(active.answers['25'], 'ب'); assert.equal(active.questionIds.length, 3);
});

test('optional practice validation preserves older backups and accepts valid resume/history', () => {
  assert.equal(validatePracticeState({}), true);
  assert.equal(validatePracticeState({ activePractice: null, practiceAttempts: [] }), true);
  const active = run(); active.answers['26'] = 'ج'; active.currentIndex = 1;
  assert.equal(validatePracticeState({ activePractice: active }), true);
  const completed = finishPracticeRun(active, now + 5000);
  assert.equal(validatePracticeState({ practiceAttempts: [completed] }), true);
  const second = createPracticeRun({ count: 10, id: 'second', now });
  assert.equal(validatePracticeState({ activePractice: second, practiceAttempts: [completed] }), true);
});

test('resume validation rejects unknown banks/IDs/answers, duplicate questions and out-of-range indexes', () => {
  for (const patch of [
    { bankId: 'made-up' }, { questionIds: [] }, { questionIds: ['99'] }, { questionIds: ['25', '25'] },
    { answers: { '25': 'هـ' } }, { answers: { '1': 'أ' } }, { answers: [] },
    { currentIndex: -1 }, { currentIndex: 3 }, { currentIndex: 0.5 }, { mode: 'official' },
    { startedAt: '2026-02-30T18:00:00.000Z' }, { startedAt: 'not-a-time' }, { surprise: 'hidden data' },
  ]) assert.equal(validatePracticeState({ activePractice: { ...run(), ...patch } }), false, JSON.stringify(patch));
});

test('history validation recomputes grade and total rather than accepting tampered scores', () => {
  const active = run(); active.answers = { '25': 'ب', '26': 'أ' };
  const attempt = finishPracticeRun(active, now + 5000);
  assert.equal(validatePracticeState({ practiceAttempts: [{ ...attempt, score: 3 }] }), false);
  assert.equal(validatePracticeState({ practiceAttempts: [{ ...attempt, total: 40 }] }), false);
  assert.equal(validatePracticeState({ practiceAttempts: [{ ...attempt, answers: { '25': 'أ' } }] }), false);
  assert.equal(validatePracticeState({ practiceAttempts: [{ ...attempt, finishedAt: '2026-10-17T17:00:00.000Z' }] }), false);
  assert.equal(validatePracticeState({ practiceAttempts: [attempt, attempt] }), false);
  assert.equal(validatePracticeState({ activePractice: active, practiceAttempts: [attempt] }), false);
});

test('wrong-and-skipped retry preserves only the relevant original IDs', () => {
  const first = run(); first.answers = { '25': 'ب', '26': 'أ' };
  const grade = gradePractice(first.questionIds, first.answers);
  const retryIds = first.questionIds.filter(id => !grade.correctIds.includes(id));
  const retry = createPracticeRun({ questionIds: retryIds, id: 'retry', now: now + 6000 });
  assert.deepEqual(retry.questionIds, ['26', '27']); assert.deepEqual(retry.answers, {});
  assert.equal(retry.mode, 'practice'); assert.equal(validatePracticeState({ activePractice: retry }), true);
});
