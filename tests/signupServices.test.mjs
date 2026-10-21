import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createSignupService, normalizePhone } from '../server/signup.mjs';
import { synthesizeSpeech } from '../server/voice.mjs';
import { createTutorMemory, generateTutorReply } from '../server/tutor-provider.mjs';
const smsEnv={TWILIO_ACCOUNT_SID:'AC'+'a'.repeat(32),TWILIO_VERIFY_SERVICE_SID:'VA'+'b'.repeat(32),TWILIO_AUTH_TOKEN:'synthetic-test-token'};
test('disabled SMS never claims delivery; registration validates aliases, dates and phones',async()=>{
 const db=new DatabaseSync(':memory:');try{const service=createSignupService(db,{env:{}});assert.equal(service.enabled(),false);await assert.rejects(service.handle('/api/auth/send-otp',{},'local'),e=>e.status===503);
 assert.equal(normalizePhone('0501234567'),'+966501234567');assert.equal(normalizePhone('garbage'),'');
 for(const field of [{handle:'admin'},{birthdate:'2026-02-30'},{birthdate:'2099-01-01'},{phone:'123'}])assert.throws(()=>service.prepare({handle:'learner',fullName:'Synthetic Student',...field},'student@example.test'));
 const details=service.prepare({handle:'learner',fullName:'Synthetic Student',phone:'0501234567'},'student@example.test');assert.equal(details.verifiedPhone,'');service.save('one',details);assert.equal(service.available('learner'),false);
 }finally{db.close();}
});

test('clearing conversation during a pending reply prevents old history from returning',()=>{
 const memory=createTutorMemory(),old=memory.begin('one');memory.clear('one');const fresh=memory.begin('one');memory.finish('one','old question','old answer',old);assert.equal(memory.begin('one'),null);memory.finish('one','new question','new answer',fresh);const next=memory.begin('one');assert.deepEqual(next.map(m=>m.content),['new question','new answer']);memory.finish('one');
});
test('SMS proof is bound to email and phone, limited, expires and is consumed once',async()=>{
 const db=new DatabaseSync(':memory:');let stamp=1000000,calls=0;
 try{const service=createSignupService(db,{env:smsEnv,now:()=>stamp,fetcher:async(url,options)=>{calls++;assert.ok(url.startsWith('https://verify.twilio.com/v2/Services/VA'));assert.ok(options.headers.Authorization.startsWith('Basic '));return {ok:true,json:async()=>({sid:options.body.get('VerificationSid')||'VE'+String(calls).padStart(32,'0'),status:url.endsWith('/VerificationCheck')?'approved':'pending'})};}});
 const sent=await service.handle('/api/auth/send-otp',{phone:'0501234567',email:'student@example.test',consent:true},'local');assert.match(sent.challenge,/^[a-f0-9]{64}$/);
 const signup={handle:'learner',fullName:'Synthetic Student',phone:'0501234567',challenge:sent.challenge};assert.throws(()=>service.prepare(signup,'student@example.test'));
 assert.equal((await service.handle('/api/auth/verify-otp',{challenge:sent.challenge,code:'123456'},'local')).valid,true);
 assert.throws(()=>service.prepare(signup,'other@example.test'));assert.throws(()=>service.prepare({...signup,phone:'0501234568'},'student@example.test'));
 const first=service.prepare(signup,'student@example.test'),second=service.prepare({...signup,handle:'learner2'},'student@example.test');service.save('one',first);assert.throws(()=>service.save('two',second));
 const expiry=await service.handle('/api/auth/send-otp',{phone:'0501234568',email:'student@example.test',consent:true},'local');stamp+=600001;await assert.rejects(service.handle('/api/auth/verify-otp',{challenge:expiry.challenge,code:'123456'},'local'));assert.equal(calls,3);
 }finally{db.close();}
});
test('Azure SSML is escaped and audio is private binary, with bounded input',async()=>{
 let calls=0;const env={AZURE_SPEECH_KEY:'synthetic-key',AZURE_SPEECH_REGION:'uaenorth'};
 const bytes=await synthesizeSpeech('<voice>& "مرحبا"',{env,fetcher:async(url,options)=>{calls++;assert.equal(url,'https://uaenorth.tts.speech.microsoft.com/cognitiveservices/v1');assert.ok(options.body.includes('&lt;voice&gt;&amp; &quot;'));return {ok:true,arrayBuffer:async()=>new Uint8Array([1,2,3]).buffer};}});assert.deepEqual([...bytes],[1,2,3]);
 await assert.rejects(synthesizeSpeech('x'.repeat(4001),{env}),/speech-input/);await assert.rejects(synthesizeSpeech('hi',{env:{}}),/speech-unconfigured/);assert.equal(calls,1);
});

test('SMS checking stops after five guesses and resending is limited per phone',async()=>{
 const db=new DatabaseSync(':memory:');let checks=0,stamp=1000000;
 try{const service=createSignupService(db,{env:smsEnv,now:()=>stamp,fetcher:async url=>{if(url.endsWith('/VerificationCheck'))checks++;return {ok:true,json:async()=>({sid:'VE'+'1'.repeat(32),status:'pending'})};}});
 const payload={phone:'0501234567',email:'student@example.test',consent:true},first=await service.handle('/api/auth/send-otp',payload,'local');
 for(let i=0;i<5;i++)assert.equal((await service.handle('/api/auth/verify-otp',{challenge:first.challenge,code:'000000'},'local')).valid,false);
 await assert.rejects(service.handle('/api/auth/verify-otp',{challenge:first.challenge,code:'000000'},'local'));assert.equal(checks,5);
 await assert.rejects(service.handle('/api/auth/send-otp',payload,'local'),e=>e.status===429);stamp+=60001;await service.handle('/api/auth/send-otp',payload,'local');stamp+=60001;await service.handle('/api/auth/send-otp',payload,'local');stamp+=60001;await assert.rejects(service.handle('/api/auth/send-otp',payload,'local'),e=>e.status===429);
 }finally{db.close();}
});
test('Claude messages use server-selected history and memory never mixes account IDs',async()=>{
 const answer=await generateTutorReply('Scoped teacher',{question:'ABC'},[{role:'user',content:'Earlier question'},{role:'assistant',content:'Earlier answer'}],{env:{ANTHROPIC_API_KEY:'synthetic-key'},fetcher:async(url,options)=>{assert.equal(url,'https://api.anthropic.com/v1/messages');const body=JSON.parse(options.body);assert.equal(body.system,'Scoped teacher');assert.equal(body.messages.length,3);return {ok:true,json:async()=>({content:[{type:'text',text:'Synthetic reply'}]})};}});assert.equal(answer,'Synthetic reply');
 let stamp=0;const memory=createTutorMemory({now:()=>stamp});assert.deepEqual(memory.begin('one'),[]);assert.equal(memory.begin('one'),null);memory.finish('one','first question','first answer');assert.deepEqual(memory.begin('two'),[]);memory.finish('two');assert.equal(memory.begin('one').length,2);memory.finish('one');memory.clear('one');assert.deepEqual(memory.begin('one'),[]);memory.finish('one','again','answer');stamp=1800001;assert.deepEqual(memory.begin('one'),[]);memory.finish('one');
});
