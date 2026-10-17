import test from 'node:test';
import assert from 'node:assert/strict';
import { answerTutor, tutorReferences } from '../server/tutor.mjs';
const data={notes:[{id:'one',title:'إدارة المخزون',content:'ABC يرتب الأصناف حسب قيمة الاستهلاك.\n\nفقرة أخرى.'},{id:'two',title:'ملاحظات مختلفة',content:'لا يوجد نص مطابق.'}],tasks:[],transactions:[{title:'Private finance'}]};
test('teacher uses relevant account notes and distinguishes lookup from AI',async()=>{
 const local=await answerTutor(data,'اشرح ABC');assert.equal(local.mode,'library');assert.match(local.answer,/قيمة الاستهلاك/);assert.equal(local.sources[0].id,'one');
 assert.deepEqual(tutorReferences(data,'غيرمطابق'),[]);
 assert.match((await answerTutor({...data,tasks:[{title:'Exam',due:'2026-10-20',time:'20:00',completed:false}]},'متى موعد الاختبار')).answer,/20:00/);
});
test('AI receives only selected notes and uses explicit consent plus a server key',async()=>{
 const prior=process.env.OPENAI_API_KEY;const originalFetch=globalThis.fetch;
 try{delete process.env.OPENAI_API_KEY;await assert.rejects(()=>answerTutor(data,'ABC',true),/tutor-unconfigured/);
 process.env.OPENAI_API_KEY='synthetic-key';let calls=0;
 globalThis.fetch=async(url,options)=>{calls++;assert.equal(url,'https://api.openai.com/v1/responses');const body=JSON.parse(options.body);assert.equal(body.store,false);assert.ok(!JSON.stringify(body).includes('Private finance'));assert.ok(JSON.stringify(body).includes('قيمة الاستهلاك'));return {ok:true,json:async()=>({output:[{type:'message',content:[{type:'output_text',text:'Synthetic explanation'}]}]})};};
 assert.equal((await answerTutor(data,'ABC')).mode,'library');assert.equal(calls,0);
 assert.equal((await answerTutor(data,'ABC',true)).answer,'Synthetic explanation');assert.equal(calls,1);
 }finally{globalThis.fetch=originalFetch;if(prior===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=prior;}
});
