const DEFAULT_BASE = 'https://lms.ac-seu.com';

function moodleBase() {
  const base = new URL(process.env.MOODLE_BASE_URL || DEFAULT_BASE);
  if (base.protocol !== 'https:') throw new Error('moodle-config');
  return base;
}

async function post(path, values) {
  const url = new URL(path, moodleBase());
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, { method:'POST', headers:{ 'Content-Type':'application/x-www-form-urlencoded', Accept:'application/json' }, body:new URLSearchParams(values), signal:controller.signal });
    if (!response.ok) throw new Error('moodle-http');
    return await response.json();
  } finally { clearTimeout(timer); }
}

async function call(token, fn, values = {}) {
  const result = await post('/webservice/rest/server.php', { wstoken:token, wsfunction:fn, moodlewsrestformat:'json', ...values });
  if (result?.exception || result?.errorcode) throw new Error(result?.message || 'moodle-function');
  return result;
}

export async function connectMoodle(username, password) {
  const result = await post('/login/token.php', { username, password, service:process.env.MOODLE_SERVICE_NAME || 'moodle_mobile_app' });
  if (!result?.token) throw new Error(result?.error || 'moodle-login');
  return result.token;
}

const clean = value => String(value || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim().slice(0, 200000);
const safeUrl = value => { try { const url = new URL(String(value || '')); return url.protocol === 'https:' ? url.href : undefined; } catch { return undefined; } };
const riyadhParts = timestamp => Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Riyadh', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23' }).formatToParts(new Date(timestamp * 1000)).map(part => [part.type, part.value]));

export function normalizeMoodleData(site, courses, upcoming) {
  const normalizedCourses = (Array.isArray(courses) ? courses : []).map(course => ({ id:`moodle-course-${course.id}`, moodleId:Number(course.id), name:clean(course.fullname || course.displayname || course.shortname || 'مادة مودل'), color:'#0B1B3D' })).filter(course => Number.isFinite(course.moodleId));
  const events = (Array.isArray(upcoming?.events) ? upcoming.events : Array.isArray(upcoming) ? upcoming : []).flatMap(event => {
    const stamp = Number(event.timestart || event.timesort || event.timecreated);
    if (!Number.isFinite(stamp) || stamp <= 0) return [];
    const start = riyadhParts(stamp);
    const duration = Math.max(0, Number(event.timeduration || 0));
    const end = duration ? riyadhParts(stamp + duration) : null;
    const title = clean(event.name || event.activityname || 'موعد مودل');
    const lower = title.toLocaleLowerCase('ar');
    const kind = /اختبار|exam|quiz|midterm|final/.test(lower) ? 'exam' : /واجب|تكليف|assignment|due/.test(lower) ? 'assignment' : /محاضرة|lecture|class|جلسة/.test(lower) ? 'lecture' : 'event';
    return [{ id:`moodle-api-${event.id || `${stamp}-${title}`}`.slice(0, 145), moodleId:Number(event.id || 0), title, date:`${start.year}-${start.month}-${start.day}`, time:`${start.hour}:${start.minute}`, endDate:end ? `${end.year}-${end.month}-${end.day}` : undefined, endTime:end ? `${end.hour}:${end.minute}` : undefined, kind, description:clean(event.description || event.formattedtime || ''), url:safeUrl(event.url || event.viewurl), courseId:event.courseid ? `moodle-course-${event.courseid}` : undefined }];
  });
  return { siteName:clean(site?.sitename), fullName:clean(site?.fullname), userId:Number(site?.userid), courses:normalizedCourses, events };
}

export async function syncMoodle(token) {
  const site = await call(token, 'core_webservice_get_site_info');
  const courses = await call(token, 'core_enrol_get_users_courses', { userid:String(site.userid) });
  let upcoming;
  try { upcoming = await call(token, 'core_calendar_get_calendar_upcoming_view', { courseid:'0', categoryid:'0' }); }
  catch { upcoming = await call(token, 'core_calendar_get_calendar_events', { 'options[userevents]':'1', 'options[siteevents]':'1', 'options[timestart]':String(Math.floor(Date.now() / 1000)), 'options[timeend]':String(Math.floor(Date.now() / 1000) + 180 * 86400) }); }
  return normalizeMoodleData(site, courses, upcoming);
}
