import type { AppData, UniversityEvent } from './types.ts';
import { validateData } from './validation.ts';

const normalize=(s:string)=>s.normalize('NFKC').replace(/[إأآ]/g,'ا').replace(/ة/g,'ه').replace(/[^\p{L}\p{N}]/gu,'');
export function calendarCourse(data:AppData, id:string, name:string) {
 return data.courses.find(c=>c.id===id||normalize(c.name).includes(normalize(name)));
}
/** Source times fill missing fields. A confirmed student time is changed only by an explicit action. */
export function mergeCollegeCalendar(data:AppData, acceptConflictId?:string) {
 if(!validateData(data))throw Error('invalid-calendar-data');
 const next=structuredClone(data);let added=0,updated=0;const conflicts:string[]=[];
 for(const event of COLLEGE_CALENDAR){
  const course=calendarCourse(next,event.courseId!,event.courseName);if(!course)continue;
  const task=next.tasks.find(t=>t.id===event.id+'-task'||event.kind==='exam'&&t.id==='exam-'+event.courseId||t.courseId===course.id&&t.kind===event.kind&&t.due===event.date);
  if(task){
   if(task.due!==event.date)continue;
   const conflict=!!task.time&&task.time!==event.time||!!task.endTime&&!!event.endTime&&task.endTime!==event.endTime;
   if(conflict&&acceptConflictId!==event.id){conflicts.push(event.id);continue;}
   if(!task.time||!task.endTime&&event.endTime||acceptConflictId===event.id){task.time=event.time;task.endTime=event.endTime;task.timePending=undefined;updated++;}
   continue;
  }
  const {courseName,...value}=event;
  next.universityEvents??=[];
  if(!next.universityEvents.some(e=>e.id===event.id))next.universityEvents.push({...value,courseId:course.id});
  next.tasks.push({id:event.id+'-task',courseId:course.id,title:event.title,kind:event.kind==='exam'?'exam':'assignment',due:event.date,time:event.time,endTime:event.endTime,minutes:event.kind==='exam'?180:90,priority:'high',completed:false});added++;
 }
 if(!validateData(next))throw Error('invalid-calendar-result');
 return {data:next,added,updated,conflicts};
}
export const COLLEGE_CALENDAR:readonly (UniversityEvent & {courseName:string})[] = [
  {
    "id": "moodle-32358@lms.ac-seu.com",
    "title": "نافذة الاختبار الفصلي — مقدمة في إدارة سلاسل الإمداد",
    "courseId": "supply",
    "courseName": "مقدمة في إدارة سلاسل الإمداد",
    "date": "2026-10-14",
    "time": "19:00",
    "endDate": "2026-10-14",
    "endTime": "20:30",
    "kind": "exam",
    "description": "من تصدير تقويم مودل بتاريخ ١٧ أكتوبر ٢٠٢٦، بتوقيت السعودية. راجع منصة الكلية للتحديثات. الوقت المعروض نافذة الإتاحة وليس مدة محاولة الاختبار."
  },
  {
    "id": "moodle-32306@lms.ac-seu.com",
    "title": "نافذة الاختبار الفصلي — مبادئ إدارة الأعمال",
    "courseId": "business",
    "courseName": "مبادئ إدارة الأعمال",
    "date": "2026-10-18",
    "time": "20:00",
    "endDate": "2026-10-18",
    "endTime": "21:30",
    "kind": "exam",
    "description": "من تصدير تقويم مودل بتاريخ ١٧ أكتوبر ٢٠٢٦، بتوقيت السعودية. راجع منصة الكلية للتحديثات. الوقت المعروض نافذة الإتاحة وليس مدة محاولة الاختبار."
  },
  {
    "id": "moodle-32354@lms.ac-seu.com",
    "title": "نافذة الاختبار الفصلي — إدارة النقل والشحن الدولي",
    "courseId": "transport",
    "courseName": "إدارة النقل والشحن الدولي",
    "date": "2026-10-20",
    "time": "20:00",
    "endDate": "2026-10-20",
    "endTime": "21:00",
    "kind": "exam",
    "description": "من تصدير تقويم مودل بتاريخ ١٧ أكتوبر ٢٠٢٦، بتوقيت السعودية. راجع منصة الكلية للتحديثات. الوقت المعروض نافذة الإتاحة وليس مدة محاولة الاختبار."
  },
  {
    "id": "moodle-31778@lms.ac-seu.com",
    "title": "نافذة الاختبار الفصلي — إدارة المشتريات والعقود والمناقصات",
    "courseId": "procurement",
    "courseName": "إدارة المشتريات والعقود والمناقصات",
    "date": "2026-10-22",
    "time": "08:00",
    "endDate": "2026-10-22",
    "endTime": "09:15",
    "kind": "exam",
    "description": "من تصدير تقويم مودل بتاريخ ١٧ أكتوبر ٢٠٢٦، بتوقيت السعودية. راجع منصة الكلية للتحديثات. الوقت المعروض نافذة الإتاحة وليس مدة محاولة الاختبار."
  },
  {
    "id": "moodle-29475@lms.ac-seu.com",
    "title": "موعد تسليم الواجب — إدارة المشتريات والعقود والمناقصات",
    "courseId": "procurement",
    "courseName": "إدارة المشتريات والعقود والمناقصات",
    "date": "2026-11-30",
    "time": "00:00",
    "endDate": "2026-11-30",
    "kind": "assignment",
    "description": "من تصدير تقويم مودل بتاريخ ١٧ أكتوبر ٢٠٢٦، بتوقيت السعودية. راجع منصة الكلية للتحديثات. "
  }
];
