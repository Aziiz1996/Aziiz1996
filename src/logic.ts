import type { AppData, StudyPlan, Task, Transaction } from './types.ts';

const MINUTES_IN_DAY = 24 * 60;

/** Parse at local noon so display and date arithmetic never shift a calendar day. */
function parseDate(value: string): Date | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(12, 0, 0, 0);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date
    : null;
}

export function todayISO(date: Date = new Date()): string {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return '';
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function formatDate(value: string, short = false): string {
  const date = parseDate(value);
  if (!date) return 'تاريخ غير صالح';
  return new Intl.DateTimeFormat('ar-SA-u-ca-gregory', short
    ? { day: 'numeric', month: 'short' }
    : { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

export function addDays(value: string, count: number): string {
  const date = parseDate(value);
  if (!date || !Number.isFinite(count)) return '';
  date.setDate(date.getDate() + Math.trunc(count));
  return todayISO(date);
}

function calendarDay(date: Date): number {
  const utc = new Date(0);
  utc.setUTCFullYear(date.getFullYear(), date.getMonth(), date.getDate());
  utc.setUTCHours(0, 0, 0, 0);
  return utc.getTime() / 86_400_000;
}

export function daysUntil(value: string, today = todayISO()): number {
  const date = parseDate(value);
  const origin = parseDate(today);
  return date && origin ? calendarDay(date) - calendarDay(origin) : Number.POSITIVE_INFINITY;
}

function timeMinutes(value: string, allowMidnight = false): number | null {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) return null;
  const [hours, minutes] = value.split(':').map(Number);
  if (allowMidnight && hours === 24 && minutes === 0) return MINUTES_IN_DAY;
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : null;
}

function clockTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function positiveMinutes(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function dueMinutes(task: Task): number {
  const time = timeMinutes(task.time ?? '');
  // An exam can occur before the usual study start; without its time, prepare earlier.
  return time ?? (task.kind === 'exam' ? 0 : MINUTES_IN_DAY);
}

/** Build a bounded, deterministic plan; explicitly supplied dates use the whole study day. */
export function buildStudyPlan(data: AppData, today?: string): StudyPlan {
  const now = new Date();
  const origin = today && parseDate(today) ? today : todayISO(now);
  const plan: StudyPlan = { sessions: [], remaining: {}, unscheduledMinutes: 0 };
  const priority = { high: 0, medium: 1, low: 2 };
  const tasks = data.tasks.filter(task => !task.completed && positiveMinutes(task.minutes) > 0)
    .sort((a, b) => {
      const dueA = parseDate(a.due) ? a.due : '9999-99-99';
      const dueB = parseDate(b.due) ? b.due : '9999-99-99';
      return dueA.localeCompare(dueB) || dueMinutes(a) - dueMinutes(b)
        || (priority[a.priority] ?? 1) - (priority[b.priority] ?? 1)
        || a.id.localeCompare(b.id);
    });
  for (const task of tasks) plan.remaining[task.id] = positiveMinutes(task.minutes);
  const dailyBudget = Math.min(MINUTES_IN_DAY, positiveMinutes(data.settings.dailyMinutes));
  const studyDays = new Set(data.settings.studyDays.filter(day => Number.isInteger(day) && day >= 0 && day <= 6));
  const studyStart = timeMinutes(data.settings.studyStart) ?? 17 * 60;

  for (let offset = 0; offset < 28 && dailyBudget > 0 && studyDays.size; offset += 1) {
    const date = addDays(origin, offset);
    const weekday = parseDate(date)!.getDay();
    if (!studyDays.has(weekday)) continue;
    let cursor = studyStart;
    // With the live clock, avoid publishing sessions that already started today.
    if (today === undefined && offset === 0) {
      cursor = Math.max(cursor, now.getHours() * 60 + now.getMinutes() + (now.getSeconds() > 0 || now.getMilliseconds() > 0 ? 1 : 0));
    }
    let budget = dailyBudget;
    const occupied = data.lectures.filter(lecture => lecture.day === weekday)
      .map(lecture => {
        const start = timeMinutes(lecture.start);
        const end = timeMinutes(lecture.end, true);
        if (start === null) return { start: 0, end: MINUTES_IN_DAY };
        return { start, end: end !== null && end > start ? end : MINUTES_IN_DAY };
      });
    // Exam occupancy is independent of preparation minutes and completion status.
    for (const exam of data.tasks.filter(task => task.kind === 'exam' && task.due === date)) {
      const start = timeMinutes(exam.time ?? '');
      const end = timeMinutes(exam.endTime ?? '', true);
      if (start !== null) occupied.push({ start, end: end !== null && end > start ? end : MINUTES_IN_DAY });
    }
    occupied
      .sort((a, b) => a.start - b.start || a.end - b.end);

    while (budget > 0 && cursor < MINUTES_IN_DAY) {
      let windowEnd = MINUTES_IN_DAY;
      // Advancing through overlapping events handles their combined occupied interval.
      for (const event of occupied) {
        if (event.end <= cursor) continue;
        if (event.start <= cursor) {
          cursor = event.end;
          continue;
        }
        windowEnd = event.start;
        break;
      }
      if (cursor >= MINUTES_IN_DAY) break;
      const task: Task | undefined = tasks.find(candidate => plan.remaining[candidate.id] > 0
        && parseDate(candidate.due) !== null && candidate.due >= date
        && (candidate.due > date || dueMinutes(candidate) > cursor));
      if (!task) break;
      const deadline = task.due === date ? dueMinutes(task) : MINUTES_IN_DAY;
      const minutes = Math.min(45, budget, plan.remaining[task.id], Math.min(windowEnd, deadline) - cursor);
      if (minutes <= 0) break;
      const end = cursor + minutes;
      plan.sessions.push({
        id: `study-${date}-${task.id}-${plan.sessions.length + 1}`,
        date, start: clockTime(cursor), end: clockTime(end), minutes,
        taskId: task.id, courseId: task.courseId, title: task.title, kind: task.kind,
      });
      plan.remaining[task.id] -= minutes;
      budget -= minutes;
      cursor = end + 10;
    }
  }
  for (const [taskId, remaining] of Object.entries(plan.remaining)) {
    if (remaining === 0) delete plan.remaining[taskId];
    else plan.unscheduledMinutes += remaining;
  }
  return plan;
}

const stopWords = new Set(('the a an and or of to in on for with from that this these those it its is are was were be been as by at ' +
  'we you your they their our can will not has have had also into than then ' +
  'في من على الى إلى عن مع ان أن إن هذا هذه ذلك تلك هو هي هم نحن انا أنا كان كانت يكون تكون ' +
  'و او أو ثم كما قد كل لا ما التي الذي الذين بين حتى عند اذا إذا لكن او حيث له لها بها به').split(/\s+/));

function words(value: string): string[] {
  return (value.normalize('NFKC').toLowerCase().replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[أإآ]/g, 'ا')
    .match(/[\p{L}\p{N}]+/gu) ?? []).filter(word => word.length > 2 && !stopWords.has(word));
}

function excerpt(sentence: string): string {
  if (sentence.length <= 500) return sentence;
  const cutoff = sentence.lastIndexOf(' ', 497);
  return `${sentence.slice(0, cutoff > 350 ? cutoff : 497).trim()}…`;
}

/** Extract original sentences only; this is a first-pass summary, not generated interpretation. */
export function summarizeText(text: string): string {
  if (typeof text !== 'string' || !text.trim()) return '';
  const sentences = [...new Set(text.trim().split(/(?<=[.!?؟۔])\s+|\r?\n+/u)
    .map(sentence => sentence.trim()).filter(Boolean))];
  const frequency = new Map<string, number>();
  const tokens = sentences.map(words);
  for (const sentenceWords of tokens) {
    for (const word of new Set(sentenceWords)) frequency.set(word, (frequency.get(word) ?? 0) + 1);
  }
  const ranked = sentences.map((sentence, index) => {
    const sentenceWords = tokens[index];
    const relevance = sentenceWords.reduce((sum, word) => sum + Math.log1p(frequency.get(word) ?? 0), 0)
      / Math.sqrt(Math.max(1, sentenceWords.length));
    const definition = /\b(?:means|defined|refers)\b|(?:^|\s)(?:تعني|يعني|يعرف|يُعرّف|تُعرّف|هو|هي)(?:\s|:)/u.test(sentence) ? 2 : 0;
    return { index, score: relevance + definition };
  });
  const count = Math.min(6, Math.max(2, Math.ceil(sentences.length / 2)));
  const selected = new Set([0, ...ranked.filter(item => item.index !== 0)
    .sort((a, b) => b.score - a.score || a.index - b.index).slice(0, count - 1).map(item => item.index)]);
  return sentences.filter((_, index) => selected.has(index)).map(sentence => `• ${excerpt(sentence)}`).join('\n');
}

export function financeSummary(transactions: Transaction[], month: string): {
  income: number; expense: number; balance: number; categories: { name: string; amount: number }[];
} {
  const summary = { income: 0, expense: 0, balance: 0, categories: [] as { name: string; amount: number }[] };
  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(month)) return summary;
  const categories = new Map<string, number>();
  let incomeCents = 0;
  let expenseCents = 0;
  for (const transaction of transactions) {
    if (!parseDate(transaction.date) || transaction.date.slice(0, 7) !== month
      || !Number.isFinite(transaction.amount) || transaction.amount <= 0) continue;
    const cents = Math.round((transaction.amount + Number.EPSILON) * 100);
    if (!Number.isSafeInteger(cents)) continue;
    if (transaction.kind === 'income') incomeCents += cents;
    else if (transaction.kind === 'expense') {
      expenseCents += cents;
      const category = transaction.category.trim() || 'أخرى';
      categories.set(category, (categories.get(category) ?? 0) + cents);
    }
  }
  summary.income = incomeCents / 100;
  summary.expense = expenseCents / 100;
  summary.balance = (incomeCents - expenseCents) / 100;
  summary.categories = [...categories].map(([name, cents]) => ({ name, amount: cents / 100 }))
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, 'ar'));
  return summary;
}
