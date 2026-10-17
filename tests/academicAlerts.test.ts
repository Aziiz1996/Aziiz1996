import test from 'node:test';
import assert from 'node:assert/strict';
import { academicAlerts } from '../src/academicAlerts.ts';
import { emptyData } from '../src/validation.ts';
test('academic alerts deduplicate imported tasks, skip unknown times and cap the device queue',()=>{
 const data=emptyData(); const now=new Date('2026-10-17T12:00:00');
 data.universityEvents=[{id:'exam',title:'Exam',date:'2026-10-19',time:'20:00',kind:'exam',description:''},{id:'unknown',title:'Unknown',date:'2026-10-20',time:'',kind:'lecture',description:''}];
 data.tasks=[{id:'exam-task',title:'Exam',courseId:'',kind:'exam',due:'2026-10-19',time:'20:00',priority:'high',minutes:0,completed:false}];
 const alerts=academicAlerts(data,now);assert.equal(alerts.length,2);assert.deepEqual(alerts.map(a=>a.minutes),[1440,120]);assert.ok(alerts.every(a=>a.at>now.getTime()));
 data.courses=[{id:'one',name:'Course',color:'#000000'}];
 data.lectures=Array.from({length:20},(_,i)=>({id:'lecture-'+i,courseId:'one',day:1,start:'18:00',end:'19:00',location:''}));
 const limited=academicAlerts(data,now);assert.equal(limited.length,56);assert.ok(limited.every((a,i)=>!i||limited[i-1].at<=a.at));
});
