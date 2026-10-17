import { addDays, todayISO } from './logic.ts';
import type { AppData, StudyRun, TaskKind } from './types.ts';

export interface StudyPhase {
  id: 'prepare' | 'understand' | 'recall' | 'practice' | 'reflect';
  title: string;
  seconds: number;
  goal: string;
  actions: string[];
}

/** Allocate every second once, including short sessions, without rounding the total up. */
export function allocateStudySeconds(minutes: number, kind: TaskKind = 'exam'): number[] {
  const total = Number.isFinite(minutes) ? Math.max(0, Math.round(minutes * 60)) : 0;
  const weights = kind === 'project' ? [10, 20, 15, 48, 7] : kind === 'assignment' ? [8, 20, 20, 45, 7] : [8, 27, 30, 28, 7];
  const base = total >= 5 ? 1 : 0;
  const left = total - base * 5;
  const raw = weights.map(weight => left * weight / 100);
  const result = raw.map(seconds => base + Math.floor(seconds));
  const order = raw.map((seconds, index) => ({ index, remainder: seconds % 1 })).sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  const missing = total - result.reduce((sum, seconds) => sum + seconds, 0);
  for (let index = 0; index < missing; index++) result[order[index].index]++;
  return result;
}

export function studyPhases(minutes: number, kind: TaskKind = 'exam'): StudyPhase[] {
  const seconds = allocateStudySeconds(minutes, kind);
  const short = minutes < 15;
  const count = short ? 'فكرة واحدة' : 'ثلاث أفكار';
  const questions = short ? 'سؤال واحد' : 'ثلاثة أسئلة';
  return [
    { id: 'prepare', title: 'جهّز هدفك', seconds: seconds[0], goal: short ? 'اختر عنواناً واحداً تستطيع شرحه بعد قليل.' : 'حدد جزءاً صغيراً من المادة ونتيجة واضحة للجلسة.', actions: [
      'ضع الجوال على الصامت، وافتح مذكرتك ومصدر المادة فقط.',
      kind === 'exam' ? `اكتب: «سأشرح ${count} وأجيب عن ${questions} دون النظر».` : kind === 'project' ? 'اختر ناتجاً صغيراً قابلاً للفحص: فقرة، جدول، أو جزء يعمل من المشروع.' : 'اقرأ المطلوب وحدد سؤالاً أو جزءاً واحداً ستنجزه بنفسك.',
      'دوّن ما تعرفه وما يصعب عليك قبل فتح الشرح.',
    ] },
    { id: 'understand', title: 'افهم ببساطة', seconds: seconds[1], goal: `فسّر ${count} بكلماتك وبمثال من حياتك.`, actions: [
      'اقرأ مقطعاً قصيراً من محاضرتك أو الملخص، ثم توقف.',
      'اسأل: ما الفكرة؟ لماذا تحدث؟ وما مثالها؟ اشرح كأنك تشرح لصديق يبدأ من الصفر.',
      'إذا تعثرت، ارجع إلى نقطة الغموض وحدها واكتبها كسؤال محدد.',
    ] },
    { id: 'recall', title: 'استرجع من الذاكرة', seconds: seconds[2], goal: `أجب عن ${questions} والمصدر مغلق.`, actions: [
      'أغلق المصدر فعلاً. اكتب ما تتذكره أو قل الشرح بصوتك.',
      short ? 'اسأل نفسك: ما الفكرة الأساسية؟ ثم أعط مثالاً دون مساعدة.' : 'كوّن ثلاثة أسئلة: تعريف، مقارنة، وتطبيق. أجب قبل أن تكشف الحل.',
      'افتح المصدر بعد الإجابة، وصحح النقص بلون مختلف. الخطأ يحدد ما ستراجعه.',
    ] },
    { id: 'practice', title: kind === 'project' ? 'أنجز جزءاً واختبره' : 'طبّق واختبر فهمك', seconds: seconds[3], goal: kind === 'project' ? 'احفظ ناتجاً صغيراً يحقق بنداً من متطلبات المشروع.' : kind === 'assignment' ? 'أنجز جزءاً من الواجب مع توضيح سبب كل خطوة.' : `حل ${short ? 'سؤالاً تطبيقياً واحداً' : 'سؤالين أو ثلاثة'} دون مساعدة.`, actions: [
      kind === 'project' ? 'نفذ الجزء الذي اخترته، ثم قارنه بمعيار التسليم أو قائمة المتطلبات.' : kind === 'assignment' ? 'حل السؤال بنفسك أولاً؛ استخدم الشرح بعد المحاولة إذا احتجت.' : 'اختر أسئلة من المحاضرة أو نموذج موثوق، وحدد لنفسك وقتاً للحل.',
      kind === 'project' ? 'افحص النتيجة، وأصلح مشكلة واحدة قبل الانتقال لجزء جديد.' : 'صحح الحل ودوّن سبب الخطأ، ثم أعد السؤال الذي أخطأت فيه دون نسخ.',
      'إن بقي غموض، اكتب سؤالاً محدداً لتسأله للمحاضر أو في وقت المراجعة.',
    ] },
    { id: 'reflect', title: 'ثبّت خطوتك القادمة', seconds: seconds[4], goal: 'اكتب ما تعلمته وما ستراجعه، وسجّل وقتك الفعلي.', actions: [
      'اذكر أهم فكرة من الذاكرة، وحدد نقطة واحدة تحتاج مراجعة.',
      'قيّم فهمك بناءً على قدرتك على الحل والشرح، ثم سجّل أدناه دقائق العمل الفعلية.',
      'بعد الحفظ، خذ استراحة قصيرة. ستجد مواعيد المراجعة المتباعدة في الخطة.',
    ] },
  ];
}

export function studyKind(data: AppData, run: StudyRun): TaskKind {
  return run.kind ?? data.tasks.find(task => task.id === run.taskId)?.kind ?? 'exam';
}

/** Project a running clock from its timestamp; no render or interval increments persisted time. */
export function studyTimer(run: StudyRun, now: number) {
  const passed = run.runningSince === null ? 0 : Math.max(0, (now - run.runningSince) / 1000);
  const consumed = Math.min(run.remainingSeconds, passed);
  return { remainingSeconds: Math.max(0, run.remainingSeconds - consumed), elapsedSeconds: run.elapsedSeconds + consumed };
}

export function pauseStudyRun(run: StudyRun, now: number, kind: TaskKind = 'exam'): StudyRun {
  const timer = studyTimer(run, now);
  const stepRemaining = [...(run.stepRemaining ?? allocateStudySeconds(run.plannedMinutes, kind))];
  stepRemaining[run.step] = timer.remainingSeconds;
  return { ...run, ...timer, stepRemaining, runningSince: null };
}

export function moveStudyStep(run: StudyRun, nextStep: number, now: number, kind: TaskKind = 'exam'): StudyRun {
  const paused = pauseStudyRun(run, now, kind);
  const step = Math.min(4, Math.max(0, Math.trunc(nextStep)));
  return { ...paused, step, remainingSeconds: paused.stepRemaining![step] };
}

export function actualStudyLimit(data: AppData, run: StudyRun) {
  return Math.max(0, Math.min(run.plannedMinutes, data.tasks.find(task => task.id === run.taskId)?.minutes ?? 0));
}

export function measuredStudyMinutes(run: StudyRun, now: number) {
  // Tenths are rounded down so a skipped phase never becomes credited study time.
  return Math.floor(studyTimer(run, now).elapsedSeconds / 6) / 10;
}

export function spacedReviewDates(date: string, score: number): string[] {
  return (score >= 4 ? [3, 7] : [1, 3, 7]).map(days => addDays(date, days));
}

/** Apply the completion to the latest draft exactly once; preserve task completion status. */
export function finishStudySession(data: AppData, runId: string, minutes: number, score: number, reflection: string, now: number): boolean {
  const run = data.activeStudy;
  if (!run || run.id !== runId || data.studyLog?.some(log => log.id === runId)) return false;
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > actualStudyLimit(data, run) + 1e-8 || !Number.isInteger(score) || score < 0 || score > 5) return false;
  const date = todayISO(new Date(now));
  const task = data.tasks.find(item => item.id === run.taskId);
  if (task) task.minutes = Math.max(0, Math.round((task.minutes - minutes) * 1000) / 1000);
  data.studyLog = [{ id: run.id, taskId: run.taskId, title: run.title, date, minutes, score, reflection: reflection.trim(), completedAt: new Date(now).toISOString(), reviewDates: minutes > 0 ? spacedReviewDates(date, score) : [], reviewedDates: [] }, ...(data.studyLog ?? [])];
  data.activeStudy = null;
  return true;
}
