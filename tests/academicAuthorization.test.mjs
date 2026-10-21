import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('unapproved students cannot read academic APIs, group files, or direct PDF links', async t => {
 const dir=mkdtempSync(join(tmpdir(),'academic-gate-'));
 const staticDir=join(dir,'public');mkdirSync(join(staticDir,'course-library'),{recursive:true});
 const pdf=Buffer.from('%PDF-1.4\nsynthetic study file\n%%EOF');
 writeFileSync(join(staticDir,'course-library','sample.pdf'),pdf);
 const port=32178,base='http://127.0.0.1:'+port;
 const child=spawn(process.execPath,['--experimental-strip-types','server/index.mjs'],{env:{...process.env,PORT:String(port),NODE_ENV:'production',LEADER_DATA_DIR:dir,LEADER_STATIC_DIR:staticDir,LEADER_OWNER_SETUP_KEY:'synthetic-owner-secret',LEADER_OWNER_EMAIL:'',TWILIO_ACCOUNT_SID:'',TWILIO_AUTH_TOKEN:'',TWILIO_VERIFY_SERVICE_SID:''},stdio:['ignore','pipe','pipe']});
 t.after(async()=>{if(child.exitCode===null){const ended=once(child,'exit');child.kill();await ended;}rmSync(dir,{recursive:true,force:true});});
 await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw Error('server exited');}),new Promise((_,reject)=>setTimeout(()=>reject(Error('startup timeout')),10000).unref())]);
 async function req(path,{cookie='',method='GET',value}={}){
  const response=await fetch(base+path,{method,headers:{Origin:base,...(cookie?{Cookie:cookie}:{}),...(value?{'Content-Type':'application/json'}:{})},body:value?JSON.stringify(value):undefined});
  let json;try{json=await response.clone().json();}catch{}
  return {status:response.status,json,bytes:Buffer.from(await response.arrayBuffer()),cookie:response.headers.get('set-cookie')?.split(';')[0]||''};
 }
 const owner=await req('/api/auth/register',{method:'POST',value:{username:'owner@example.test',password:'12345',ownerKey:'synthetic-owner-secret'}});
 assert.equal(owner.status,200);
 const a=await req('/api/auth/register',{method:'POST',value:{username:'a@example.test',password:'12345'}});
 const b=await req('/api/auth/register',{method:'POST',value:{username:'b@example.test',password:'12345'}});
 assert.equal(a.json.user.approval,'pending');
 const academic=['/api/academic/shared','/api/data','/api/projects','/api/projects/3/file','/course-library/sample.pdf'];
 for(const path of academic){
  assert.equal((await req(path)).status,401,'anonymous '+path);
  assert.equal((await req(path,{cookie:a.cookie})).status,403,'pending '+path);
  assert.equal((await req(path,{cookie:owner.cookie})).status,path.includes('/projects/3/file')?404:200,'owner '+path);
 }
 const session=await req('/api/auth/session',{cookie:a.cookie});
 assert.equal(session.status,200);assert.equal(session.json.data.courses.length,0);
 const proof=Buffer.from('%PDF-1.4\nsynthetic evidence\n%%EOF').toString('base64');
 assert.equal((await req('/api/student/evidence',{cookie:a.cookie,method:'POST',value:{data:proof}})).status,200);
 assert.equal((await req('/api/owner/students/approval',{cookie:owner.cookie,method:'POST',value:{userId:a.json.user.id,approval:'approved'}})).status,200);
 assert.equal((await req('/api/academic/shared',{cookie:a.cookie})).status,200);
 assert.equal((await req('/api/data',{cookie:a.cookie})).status,200);
 assert.equal((await req('/api/projects',{cookie:a.cookie})).status,200);
 assert.equal((await req('/course-library/sample.pdf',{cookie:a.cookie})).status,200);
 assert.equal((await req('/api/projects/3/file',{cookie:a.cookie})).status,403,'approved but not group member');
 assert.equal((await req('/api/projects/assign',{cookie:owner.cookie,method:'POST',value:{username:'a@example.test',group:3}})).status,200);
 assert.equal((await req('/api/projects/3/file',{cookie:a.cookie,method:'POST',value:{data:pdf.toString('base64')}})).status,200);
 assert.equal((await req('/api/projects/3/file',{cookie:a.cookie})).status,200);
 assert.equal((await req('/api/projects/3/file',{cookie:owner.cookie})).status,200);
 assert.equal((await req('/api/projects/3/file',{cookie:b.cookie})).status,403,'unapproved IDOR');
 assert.equal((await req('/api/projects/4/file',{cookie:a.cookie})).status,403,'approved IDOR');
 assert.equal((await req('/api/owner/students/'+a.json.user.id+'/evidence',{cookie:a.cookie})).status,403,'student cannot fetch evidence directly');
 assert.equal((await req('/api/owner/students/'+a.json.user.id+'/evidence',{cookie:owner.cookie})).status,200);
 assert.equal((await req('/api/owner/students/approval',{cookie:owner.cookie,method:'POST',value:{userId:a.json.user.id,approval:'rejected'}})).status,200);
 assert.equal((await req('/api/projects/3/file',{cookie:a.cookie})).status,403,'revoked approval must take effect immediately');
 assert.equal((await req('/course-library/sample.pdf',{cookie:a.cookie})).status,403,'revoked static file');
});
