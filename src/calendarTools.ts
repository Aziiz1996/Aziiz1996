import type { AppData, UniversityEvent } from './types';

const pad = (value: number) => String(value).padStart(2, '0');
const localDate = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const localTime = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;
const unescapeIcs = (value: string) => value.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');

function parseIcsDate(value: string) {
  const raw = value.trim();
  if (/^\d{8}$/.test(raw)) return { date: `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`, time: '' };
  if (!/^\d{8}T\d{6}Z?$/.test(raw)) return null;
  const iso = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T${raw.slice(9, 11)}:${raw.slice(11, 13)}:${raw.slice(13, 15)}${raw.endsWith('Z') ? 'Z' : ''}`;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return { date: localDate(parsed), time: localTime(parsed) };
}

export function parseMoodleCalendar(content: string): UniversityEvent[] {
  if (content.length > 5_000_000) throw new Error('ملف التقويم أكبر من الحد المسموح.');
  const lines = content.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
  const events: UniversityEvent[] = [];
  let current: Record<string, string> | null = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { current = {}; continue; }
    if (line === 'END:VEVENT') {
      if (current) {
        const start = parseIcsDate(current.DTSTART || '');
        const end = parseIcsDate(current.DTEND || '');
        const title = unescapeIcs(current.SUMMARY || 'موعد جامعي').trim();
        if (start && title) {
          const lowered = title.toLocaleLowerCase('ar');
          const kind: UniversityEvent['kind'] = /اختبار|exam|quiz|midterm|final/.test(lowered) ? 'exam' : /واجب|تكليف|assignment|due/.test(lowered) ? 'assignment' : /محاضرة|lecture|class|جلسة/.test(lowered) ? 'lecture' : 'event';
          events.push({ id: `moodle-${current.UID || `${start.date}-${start.time}-${title}`}`.slice(0, 145), title, date: start.date, time: start.time, endDate: end?.date, endTime: end?.time, kind, description: unescapeIcs(current.DESCRIPTION || '').slice(0, 200000), url: current.URL?.startsWith('https://') ? current.URL : undefined });
        }
      }
      current = null; continue;
    }
    if (!current) continue;
    const split = line.indexOf(':'); if (split < 0) continue;
    const key = line.slice(0, split).split(';')[0].toUpperCase();
    current[key] = line.slice(split + 1);
  }
  return [...new Map(events.map(event => [event.id, event])).values()];
}

const escapeIcs = (value: string) => value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
const stamp = (date: string, time = '') => `${date.replaceAll('-', '')}${time ? `T${time.replace(':', '')}00` : ''}`;
const alarm = (trigger: string, label: string) => `BEGIN:VALARM\r\nTRIGGER:${trigger}\r\nACTION:DISPLAY\r\nDESCRIPTION:${escapeIcs(label)}\r\nEND:VALARM`;

export function buildStudyCalendar(data: AppData) {
  const rows = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Az Logistics//Study Calendar//AR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:عز اللوجستيات'];
  const add = (id: string, title: string, date: string, time: string, endDate: string | undefined, endTime: string | undefined, details: string, alarms: string[]) => {
    rows.push('BEGIN:VEVENT', `UID:${escapeIcs(id)}@az-logistics`, `DTSTAMP:${stamp(localDate(new Date()), localTime(new Date()))}`, time ? `DTSTART:${stamp(date, time)}` : `DTSTART;VALUE=DATE:${stamp(date)}`, time && endTime ? `DTEND:${stamp(endDate || date, endTime)}` : `DTEND;VALUE=DATE:${stamp(endDate || date)}`, `SUMMARY:${escapeIcs(title)}`, `DESCRIPTION:${escapeIcs(details)}`, ...alarms, 'END:VEVENT');
  };
  for (const event of data.universityEvents ?? []) add(event.id, event.title, event.date, event.time, event.endDate, event.endTime, event.description || 'موعد مستورد من تقويم الجامعة', event.kind === 'lecture' ? [alarm('-PT1H', 'محاضرة بعد ساعة')] : [alarm('-P1D', 'موعد جامعي غداً'), alarm('-PT2H', 'موعد جامعي بعد ساعتين')]);
  for (const task of data.tasks.filter(task => !task.completed)) add(task.id, task.title, task.due, task.time || '09:00', task.due, task.endTime, task.kind === 'exam' ? 'اختبار مسجل في عز اللوجستيات' : 'واجب أو مهمة مسجلة في عز اللوجستيات', [alarm('-P1D', 'موعد غداً'), alarm('-PT2H', 'متبقي ساعتان')]);
  const today = new Date();
  for (let offset = 0; offset < 56; offset++) {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
    for (const lecture of data.lectures.filter(item => item.day === date.getDay() && item.start)) {
      const course = data.courses.find(item => item.id === lecture.courseId)?.name ?? 'محاضرة';
      add(`${lecture.id}-${localDate(date)}`, course, localDate(date), lecture.start, localDate(date), lecture.end || undefined, lecture.location || 'محاضرة أسبوعية', [alarm('-PT1H', 'محاضرتك بعد ساعة')]);
    }
  }
  rows.push('END:VCALENDAR');
  return rows.join('\r\n');
}
