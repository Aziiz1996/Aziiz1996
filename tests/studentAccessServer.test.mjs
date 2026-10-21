import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

async function start(t,port,ownerKey) {
 const directory=mkdtempSync(join(tmpdir(),'student-access-')),base=`http://127.0.0.1:${port}`;
 const child=spawn(process.execPath,['--experimental-strip-types','server/index.mjs'],{env:{...process.env,PORT:String(port),LEADER_DATA_DIR:directory,NODE_ENV:'production',TWILIO_ACCOUNT_SID:'',TWILIO_VERIFY_SERVICE_SID:'',TWILIO_AUTH_TOKEN:'',LEADER_OWNER_EMAIL:'',LEADER_OWNER_SETUP_KEY:ownerKey},stdio:['ignore','pipe','pipe']});
 t.after(async()=>{const exited=once(child,'exit');child.kill();await exited;rmSync(directory,{recursive:true,force:true});});
 await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw Error('server exited');}),new Promise((_,reject)=>setTimeout(()=>reject(Error('startup timeout')),10000).unref())]);
 return async(path,payload,cookie='')=>{
  const r=await fetch(base+path,{method:payload?'POST':'GET',headers:{Origin:base,...(payload?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},body:payload?JSON.stringify(payload):undefined});
  return {status:r.status,value:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};
 };
}

test('owner alone can approve students; phone verification and project membership stay independent',async t=>{
 const request=await start(t,31926,'synthetic-owner-key');
 assert.equal((await request('/api/student/access')).status,401);
 const student=await request('/api/auth/register',{username:'student@example.test',password:'12345',role:'admin',approved:true});
 assert.equal(student.status,200);assert.equal(student.value.user.owner,false);
 assert.equal(student.value.user.phoneVerified,false);assert.equal(student.value.user.approval,'pending');
 assert.equal((await request('/api/owner/students',null,student.cookie)).status,403);
 assert.equal((await request('/api/owner/students/approval',{userId:student.value.user.id,approval:'approved'},student.cookie)).status,403);
 const owner=await request('/api/auth/register',{username:'owner@example.test',password:'12345',ownerKey:'synthetic-owner-key'});
 assert.equal(owner.value.user.owner,true);
 assert.equal((await request('/api/owner/students',null,owner.cookie)).value.students.length,1);
 assert.equal((await request('/api/owner/students/approval',{userId:student.value.user.id,approval:'approved'},owner.cookie)).status,400);
 const proof=Buffer.from('%PDF-1.4\nstudent enrollment proof\n%%EOF').toString('base64');
 assert.equal((await request('/api/student/evidence',{data:proof},student.cookie)).status,200);
 assert.equal((await request('/api/owner/students/approval',{userId:student.value.user.id,approval:'approved'},owner.cookie)).status,200);
 assert.equal((await request('/api/student/access',null,student.cookie)).value.approval,'approved');
 assert.equal((await request('/api/student/restricted',null,student.cookie)).status,403);
 assert.equal((await request('/api/projects',null,student.cookie)).value.assignedGroup,null);
 assert.equal((await request('/api/auth/session',null,student.cookie)).value.user.owner,false);
});

test('production without owner setup never promotes the first registered student',async t=>{
 const request=await start(t,31927,'');
 const student=await request('/api/auth/register',{username:'first@example.test',password:'12345'});
 assert.equal(student.value.user.owner,false);assert.equal(student.value.user.canClaimOwner,false);
 assert.equal((await request('/api/auth/claim-owner',{},student.cookie)).status,403);
 const login=await request('/api/auth/login',{username:'first@example.test',password:'12345'});
 assert.equal(login.value.user.owner,false);
});
