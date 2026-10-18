import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
test('wizard creates a real account, handle login works and cloud speech requires a session',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'registration-server-')),base='http://127.0.0.1:31521';
 const child=spawn(process.execPath,['--experimental-strip-types','server/index.mjs'],{env:{...process.env,PORT:'31521',LEADER_DATA_DIR:directory,NODE_ENV:'test',TWILIO_AUTH_TOKEN:'',OPENAI_API_KEY:'',ANTHROPIC_API_KEY:'',AZURE_SPEECH_KEY:'',LEADER_OWNER_SETUP_KEY:'synthetic-owner-key'},stdio:['ignore','pipe','pipe']});
 try{await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw Error('server exited');}),new Promise((_,reject)=>{setTimeout(()=>reject(Error('startup timeout')),10000).unref();})]);
 const request=async(path,value,cookie='',origin=base)=>{const r=await fetch(base+path,{method:value?'POST':'GET',headers:{Origin:origin,...(value?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},body:value?JSON.stringify(value):undefined});return {status:r.status,value:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
 assert.equal((await request('/api/auth/signup-options')).value.smsEnabled,false);assert.equal((await request('/api/speak',{text:'hello'})).status,401);
 const signup={handle:'new_student',fullName:'Synthetic Student',birthdate:'2000-01-01',phone:'0501234567'};
 const created=await request('/api/auth/register',{username:'synthetic@example.test',password:'12345',signup});assert.equal(created.status,200);assert.equal(created.value.data.settings.name,signup.fullName);assert.equal(created.value.data.studentProfile.phone,'+966501234567');
 assert.equal((await request('/api/auth/check-username',{handle:signup.handle})).value.available,false);assert.equal((await request('/api/speak',{text:'hello'},created.cookie)).status,503);
 assert.equal((await request('/api/auth/register',{username:'other@example.test',password:'12345',signup})).status,400);
 const login=await request('/api/auth/login',{username:signup.handle,password:'12345'});assert.equal(login.status,200);assert.equal(login.value.user.id,created.value.user.id);
 assert.equal((await request('/api/auth/send-otp',{email:'synthetic@example.test',phone:signup.phone})).status,503);
 assert.equal((await request('/api/auth/verify-otp',{code:'123456'},'', 'https://foreign.example')).status,403);
 }finally{const exit=once(child,'exit');child.kill();await exit;rmSync(directory,{recursive:true,force:true});}
});
