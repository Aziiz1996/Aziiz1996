import type { AppData } from './types.ts';
export function academicAlerts(data:AppData, now = new Date()) {
 const events:Array<{key:string;title:string;start:number;minutes:number}> = [];
 for (const e of data.universityEvents ?? []) {
  // A date without a time is not enough to promise a timed notification.
  if (!e.time) continue;
  events.push({key:e.id,title:e.title,start:new Date(`${e.date}T${e.time}:00`).getTime(),minutes:e.kind === 'lecture' ? 60 : 120});
  if(e.kind !== 'lecture') events.push({key:e.id+'-day',title:e.title,start:new Date(`${e.date}T${e.time}:00`).getTime(),minutes:1440});
 }
 const importedTasks = new Set((data.universityEvents ?? []).map(e=>e.id+'-task'));
 for(const t of data.tasks.filter(t=>!t.completed && t.time && !importedTasks.has(t.id))) {
  for(const minutes of [1440,120]) events.push({key:t.id+'-'+minutes,title:t.title,start:new Date(`${t.due}T${t.time}:00`).getTime(),minutes});
 }
 for(let offset=0;offset<56;offset++) {
  const date=new Date(now.getFullYear(),now.getMonth(),now.getDate()+offset);
  for(const l of data.lectures.filter(l=>l.day===date.getDay() && l.start)) {
   const [hour,minute]=l.start.split(':').map(Number);
   const start=new Date(date.getFullYear(),date.getMonth(),date.getDate(),hour,minute).getTime();
   events.push({key:l.id+'-'+date.toISOString(),title:data.courses.find(c=>c.id===l.courseId)?.name || 'محاضرة',start,minutes:60});
  }
 }
 return events.map(e=>({...e,at:e.start-e.minutes*60000})).filter(e=>Number.isFinite(e.at)&&e.at>now.getTime()).sort((a,b)=>a.at-b.at).slice(0,56);
}
