import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createSignupService } from '../server/signup.mjs';
import { createStudentAccess } from '../server/student-access.mjs';
const env={TWILIO_ACCOUNT_SID:'AC'+'a'.repeat(32),TWILIO_VERIFY_SERVICE_SID:'VA'+'b'.repeat(32),TWILIO_AUTH_TOKEN:'synthetic-test-token'};
const sid='VE'+'c'.repeat(32);
const payload={email:'student@example.test',phone:'+966500000001',consent:true};

test('restart cannot reset cooldown; forwarded identities do not reset per-phone or global limits',async()=>{
 const db=new DatabaseSync(':memory:');let stamp=1000000;
 const options={env,now:()=>stamp,fetcher:async()=>Response.json({sid,status:'pending'})};
 try{
  await createSignupService(db,options).handle('/api/auth/send-otp',payload,'one');
  await assert.rejects(createSignupService(db,options).handle('/api/auth/send-otp',payload,'two'),error=>error.status===429&&error.retryAfter===60);
  stamp+=60001;
  await createSignupService(db,options).handle('/api/auth/send-otp',payload,'two');
 }finally{db.close();}
});

test('concurrent checks and a reused provider SID cannot create two verified proofs',async()=>{
 const db=new DatabaseSync(':memory:');let release;const pending=new Promise(resolve=>release=resolve);
 const service=createSignupService(db,{env,fetcher:async(url,options)=>{
  if(url.endsWith('/VerificationCheck')){assert.equal(options.body.get('VerificationSid'),sid);await pending;}
  return Response.json({sid,status:url.endsWith('/VerificationCheck')?'approved':'pending'});
 }});
 try{
  const first=await service.handle('/api/auth/send-otp',payload,'one');
  const checking=service.handle('/api/auth/verify-otp',{challenge:first.challenge,code:'123456'},'one');
  await assert.rejects(service.handle('/api/auth/verify-otp',{challenge:first.challenge,code:'123456'},'one'));
  release();assert.equal((await checking).valid,true);
  await assert.rejects(service.handle('/api/auth/verify-otp',{challenge:first.challenge,code:'123456'},'one'));
  const second=await service.handle('/api/auth/send-otp',{...payload,phone:'+966500000002'},'one');
  await assert.rejects(service.handle('/api/auth/verify-otp',{challenge:second.challenge,code:'123456'},'one'));
 }finally{db.close();}
});

test('provider failure never verifies phone and consent is enforced before a send',async()=>{
 const db=new DatabaseSync(':memory:');let calls=0;
 const service=createSignupService(db,{env,fetcher:async()=>{calls++;return new Response('private provider detail',{status:500});}});
 try{
  await assert.rejects(service.handle('/api/auth/send-otp',{...payload,consent:false},'one'));
  assert.equal(calls,0);
  await assert.rejects(service.handle('/api/auth/send-otp',payload,'one'),error=>error.status===503&&!error.message.includes('private'));
  assert.equal(db.prepare('SELECT count(*) AS n FROM signup_verifications WHERE verified=1').get().n,0);
 }finally{db.close();}
});

test('student approval is separate from verified phone and owner role; decisions are audited',()=>{
 const db=new DatabaseSync(':memory:');
 db.exec("CREATE TABLE users(id TEXT PRIMARY KEY,owner INTEGER); INSERT INTO users VALUES ('student',0),('owner',1)");
 createSignupService(db,{env:{}});
 const access=createStudentAccess(db);
 try{
  assert.deepEqual(access.status('student'),{approval:'pending',phoneVerified:false});
  db.prepare('INSERT INTO account_details VALUES (?,?,?,?)').run('student','learner','','+966500000001');
  assert.deepEqual(access.status('student'),{approval:'pending',phoneVerified:true});
  access.decide('student','approved','owner');
  assert.deepEqual(access.status('student'),{approval:'approved',phoneVerified:true});
  assert.equal(db.prepare("SELECT owner FROM users WHERE id='student'").get().owner,0);
  assert.equal(db.prepare('SELECT actor FROM student_access_audit').get().actor,'owner');
  access.decide('student','rejected','owner');
  assert.equal(access.status('student').approval,'rejected');
  assert.throws(()=>access.decide('owner','approved','student'));
 }finally{db.close();}
});
