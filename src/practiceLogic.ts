import type { PracticeAttempt, PracticeRun } from './types.ts';
import { PRACTICE_BANK, PRACTICE_QUESTIONS, PRACTICE_QUESTION_BY_ID } from './practiceBank.ts';

const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const identifier = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 150;
const timestamp = (value: unknown): value is string => {
  if (typeof value !== 'string' || value.length !== 24) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
};
const mode = (value: unknown) => value === 'practice' || value === 'exam';

export function validPracticeQuestions(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.length <= PRACTICE_QUESTIONS.length &&
    value.every(id => typeof id === 'string' && PRACTICE_QUESTION_BY_ID.has(id)) && new Set(value).size === value.length;
}

function validAnswers(answers: unknown, questionIds: string[]): answers is Record<string, string> {
  if (!object(answers) || Object.keys(answers).length > questionIds.length) return false;
  return Object.entries(answers).every(([id, answer]) => questionIds.includes(id) && typeof answer === 'string' &&
    PRACTICE_QUESTION_BY_ID.get(id)?.options.some(option => option.letter === answer));
}

export function gradePractice(questionIds: string[], answers: Record<string, string>) {
  const correctIds: string[] = []; const wrongIds: string[] = []; const skippedIds: string[] = [];
  for (const id of questionIds) {
    const question = PRACTICE_QUESTION_BY_ID.get(id);
    if (!question) continue;
    if (!Object.hasOwn(answers, id)) skippedIds.push(id);
    else if (answers[id] === question.answer) correctIds.push(id);
    else wrongIds.push(id);
  }
  const total = correctIds.length + wrongIds.length + skippedIds.length;
  return { score: correctIds.length, total, correctIds, wrongIds, skippedIds, percent: total ? Math.round(correctIds.length / total * 100) : 0 };
}

export function selectPracticeQuestions(count: number, random: () => number = Math.random): string[] {
  const ids = PRACTICE_QUESTIONS.map(question => question.id);
  if (count >= ids.length) return ids;
  const size = Math.max(1, Math.min(ids.length, Math.floor(Number.isFinite(count) ? count : 10)));
  for (let i = ids.length - 1; i > 0; i--) {
    const value = random();
    const j = Math.max(0, Math.min(i, Math.floor((Number.isFinite(value) ? value : 0) * (i + 1))));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.slice(0, size);
}

export function createPracticeRun(options: { count?: number; questionIds?: string[]; mode?: PracticeRun['mode']; now?: number; id?: string; random?: () => number } = {}): PracticeRun {
  const questionIds = options.questionIds ? [...options.questionIds] : selectPracticeQuestions(options.count ?? 40, options.random);
  if (!validPracticeQuestions(questionIds)) throw new Error('مجموعة الأسئلة غير صالحة.');
  const selectedMode = options.mode ?? 'practice';
  if (!mode(selectedMode)) throw new Error('وضع الاختبار غير صالح.');
  const id = options.id ?? crypto.randomUUID();
  if (!identifier(id)) throw new Error('معرّف المحاولة غير صالح.');
  return { id, bankId: PRACTICE_BANK.id, questionIds, answers: {}, currentIndex: 0, startedAt: new Date(options.now ?? Date.now()).toISOString(), mode: selectedMode };
}

export function finishPracticeRun(run: PracticeRun, now: number = Date.now()): PracticeAttempt {
  const finishedAt = new Date(Math.max(now, Date.parse(run.startedAt))).toISOString();
  const grade = gradePractice(run.questionIds, run.answers);
  return { id: run.id, bankId: run.bankId, questionIds: [...run.questionIds], answers: { ...run.answers },
    startedAt: run.startedAt, finishedAt, score: grade.score, total: grade.total, mode: run.mode };
}

/** Validate only optional practice fields; other app extensions are checked by their owner. */
export function validatePracticeState(value: Record<string, unknown>): boolean {
  const baseKeys = ['id', 'bankId', 'questionIds', 'answers', 'startedAt', 'mode'];
  function base(row: unknown): row is Record<string, unknown> & { questionIds: string[]; answers: Record<string, string> } {
    return object(row) && identifier(row.id) && row.bankId === PRACTICE_BANK.id && validPracticeQuestions(row.questionIds) &&
      validAnswers(row.answers, row.questionIds) && timestamp(row.startedAt) && mode(row.mode);
  }
  const run = value.activePractice;
  if (run !== undefined && run !== null && (!base(run) || !Object.keys(run).every(key => [...baseKeys, 'currentIndex'].includes(key)) ||
    !Number.isInteger(run.currentIndex) || (run.currentIndex as number) < 0 || (run.currentIndex as number) >= run.questionIds.length)) return false;
  const attempts = value.practiceAttempts;
  if (attempts === undefined) return true;
  if (!Array.isArray(attempts) || attempts.length > 1000 || new Set(attempts.map(attempt => object(attempt) ? attempt.id : undefined)).size !== attempts.length) return false;
  for (const attempt of attempts) {
    if (!base(attempt) || !Object.keys(attempt).every(key => [...baseKeys, 'finishedAt', 'score', 'total'].includes(key)) || !timestamp(attempt.finishedAt) ||
      Date.parse(attempt.finishedAt) < Date.parse(attempt.startedAt as string) || !Number.isInteger(attempt.score) || !Number.isInteger(attempt.total) ||
      attempt.total !== attempt.questionIds.length || attempt.score !== gradePractice(attempt.questionIds, attempt.answers).score ||
      (object(run) && run.id === attempt.id)) return false;
  }
  return true;
}
