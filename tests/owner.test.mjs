import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { initializeOwner, OWNER_TECHNICAL_EMAIL } from '../server/initialize-owner.mjs';
import { DEFAULT_OWNER_DESIGN, validateOwnerDesign, createOwnerDesignService } from '../server/owner-design.mjs';
import { emptyData } from '../src/validation.ts';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'az-owner-fixture-'));
  const dataDir = join(root, 'accounts'), privateDir = join(root, '.madar');
  await mkdir(privateDir, { mode: 0o700 });
  const profile = emptyData();
  profile.settings.name = 'Synthetic private owner';
  profile.courses.push({ id:'old-inventory', name:'إدارة المخزون والمخازن', color:'#ff6b00' });
  profile.lectures.push({ id:'private-lecture', courseId:'old-inventory', day:4, start:'15:00', end:'', location:'Synthetic lecture' });
  profile.notes.push({ id:'private-note', courseId:'old-inventory', title:'Synthetic owner private note', content:'Private fixture', summary:'', updatedAt:new Date().toISOString() });
  await writeFile(join(privateDir, 'profile.json'), JSON.stringify(profile));
  const result = await initializeOwner({ root, dataDir });
  const credentialText = await readFile(join(privateDir, 'owner-credentials.txt'), 'utf8');
  const password = /^password: (.+)$/m.exec(credentialText)[1];
  return { root, dataDir, privateDir, password, result, close: () => rm(root, { recursive:true, force:true }) };
}
async function serve(f) {
  const allocator = createServer(); allocator.listen(0,'127.0.0.1'); await once(allocator,'listening');
  const port = allocator.address().port; await new Promise(resolve => allocator.close(resolve));
  const staticDir=join(f.root,'static'); await mkdir(join(staticDir,'personal-lessons'),{recursive:true});
  await writeFile(join(staticDir,'personal-lessons','index.json'),'{"private":true}');
  const child=spawn(process.execPath,['--experimental-strip-types','server/index.mjs'],{
    cwd:process.cwd(),env:{...process.env,PORT:String(port),NODE_ENV:'test',OPENAI_API_KEY:'',LEADER_DATA_DIR:f.dataDir,LEADER_STATIC_DIR:staticDir,LEADER_OWNER_SETUP_KEY:'synthetic-owner-setup-key'},stdio:['ignore','pipe','pipe'],
  });
  await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw Error('Fixture server exited');}),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('Fixture startup timeout')),10000);timer.unref();})]);
  const base=`http://127.0.0.1:${port}`;
  async function request(path,{method='GET',cookie='',account='',value,origin=base,rawBody}={}) {
    const headers={Origin:origin,...(cookie?{Cookie:cookie}:{}),...(account?{'X-Leader-Account':account}:{}),...(value!==undefined||rawBody!==undefined?{'Content-Type':'application/json'}:{})};
    const response=await fetch(base+path,{method,headers,...(value!==undefined||rawBody!==undefined?{body:rawBody??JSON.stringify(value)}:{})});
    let json;try{json=await response.json();}catch{}
    return {status:response.status,json,cookie:response.headers.get('set-cookie')?.split(';')[0]||'',headers:response.headers};
  }
  const login=()=>request('/api/auth/login',{method:'POST',value:{username:'Aziiz1996',password:f.password}});
  return {request,login,close:async()=>{child.kill();await once(child,'exit');}};
}

test('owner CLI creates a private single owner only once and preserves seeded data',async()=>{
  const f=await fixture();
  try {
    assert.equal(f.result.created,true);assert.equal(f.result.seeded,true);
    assert.equal((await stat(join(f.privateDir,'owner-credentials.txt'))).mode&0o777,0o600);
    assert.equal((await stat(f.privateDir)).mode&0o777,0o700);
    const db=new DatabaseSync(join(f.dataDir,'leader.sqlite'));
    const before=db.prepare('SELECT * FROM users').get();
    assert.equal(before.username,OWNER_TECHNICAL_EMAIL);assert.equal(before.owner,1);
    assert.equal(before.password_hash===f.password,false);assert.equal(before.password_hash.length,128);
    const data=JSON.parse(before.data);assert.equal(data.settings.name,'Synthetic private owner');assert.equal(data.courses.length,1);
    assert.equal(data.courses[0].id,'inventory-management');assert.equal(data.notes[0].courseId,'inventory-management');
    const existing=await initializeOwner({root:f.root,dataDir:f.dataDir});assert.equal(existing.created,false);
    const after=db.prepare('SELECT * FROM users').get();assert.equal(after.password_hash===before.password_hash,true);assert.equal(after.data===before.data,true);
    assert.equal((await readFile(join(f.privateDir,'owner-credentials.txt'),'utf8')).includes(f.password),true);
    db.close();
  }finally{await f.close();}
});

test('owner CLI does not promote or overwrite a pre-existing ordinary account',async()=>{
  const f=await fixture();
  try{
    const db=new DatabaseSync(join(f.dataDir,'leader.sqlite'));db.prepare('UPDATE users SET owner=0').run();
    const before=db.prepare('SELECT * FROM users').get();
    const result=await initializeOwner({root:f.root,dataDir:f.dataDir});assert.equal(result.reason,'accounts-exist');
    const after=db.prepare('SELECT * FROM users').get();assert.equal(after.owner,0);assert.equal(after.password_hash===before.password_hash,true);assert.equal(after.data===before.data,true);db.close();
  }finally{await f.close();}
});

test('owner CLI honors an explicitly configured hosted owner policy',async()=>{
  const root=await mkdtemp(join(tmpdir(),'az-configured-owner-'));
  try{
    for(const policy of [{ownerEmail:'host-owner@example.com'},{setupKey:'synthetic-hosted-setup-key'}]){
      const result=await initializeOwner({root,dataDir:join(root,'accounts'),...policy});assert.equal(result.reason,'configured-owner-setup');
    }
    const db=new DatabaseSync(join(root,'accounts/leader.sqlite'));assert.equal(db.prepare('SELECT COUNT(*) AS count FROM users').get().count,0);db.close();
  }finally{await rm(root,{recursive:true,force:true});}
});

test('existing leader_session authorizes owner design while ordinary students retain their account flow',async()=>{
  const f=await fixture();const s=await serve(f);
  try{
    assert.equal((await s.request('/api/design')).status,401);assert.equal((await s.request('/api/owner/data')).status,401);
    assert.equal((await s.request('/api/auth/register',{method:'POST',value:{username:'Aziiz1996',password:'synthetic-pass'}})).status,400);
    const owner=await s.login();assert.equal(owner.status,200);assert.equal(owner.json.user.owner,true);assert.equal(owner.json.user.username,OWNER_TECHNICAL_EMAIL);
    assert.equal(owner.headers.get('set-cookie').startsWith('leader_session='),true);
    const ordinary=await s.request('/api/auth/register',{method:'POST',value:{username:'student@example.com',password:'synthetic-student-pass',owner:true}});
    assert.equal(ordinary.status,200);assert.equal(ordinary.json.user.owner,false);
    const ownerAuth={cookie:owner.cookie,account:owner.json.user.id};
    assert.equal((await s.request('/api/design',{cookie:ordinary.cookie})).status,200);
    assert.equal((await s.request('/api/owner/design',{method:'PUT',cookie:ordinary.cookie,account:ordinary.json.user.id,value:DEFAULT_OWNER_DESIGN})).status,403);
    assert.equal((await s.request('/api/owner/design',{...ownerAuth,method:'PUT',origin:'https://outside.example',value:DEFAULT_OWNER_DESIGN})).status,403);
    assert.equal((await s.request('/api/owner/design',{cookie:owner.cookie,account:ordinary.json.user.id,method:'PUT',value:DEFAULT_OWNER_DESIGN})).status,403);
    const design={...DEFAULT_OWNER_DESIGN,appName:'Synthetic Az design',hiddenPages:['finance'],navigation:['owner','university','dashboard']};
    assert.equal((await s.request('/api/owner/design',{...ownerAuth,method:'PUT',value:design})).status,200);
    assert.equal((await s.request('/api/design',{cookie:ordinary.cookie})).json.appName,'Synthetic Az design');
    assert.equal((await s.request('/api/owner/design',{...ownerAuth,method:'PUT',value:{...design,hiddenPages:['owner']}})).status,400);
    assert.equal((await s.request('/api/owner/design',{...ownerAuth,method:'PUT',value:{...design,accentColor:'javascript:1'}})).status,400);
    assert.equal((await s.request('/api/design',{cookie:owner.cookie})).json.appName,'Synthetic Az design');
    assert.equal((await s.request('/api/auth/logout',{cookie:owner.cookie,method:'POST'})).status,200);
    assert.equal((await s.request('/api/owner/data',ownerAuth)).status,401);
  }finally{await s.close();await f.close();}
});

test('manual owner backup is independent, validated, account-bound and bounded to 10 MiB',async()=>{
  const f=await fixture();const s=await serve(f);
  try{
    const owner=await s.login();const auth={cookie:owner.cookie,account:owner.json.user.id};
    const ordinary=await s.request('/api/auth/register',{method:'POST',value:{username:'other@example.com',password:'synthetic-other-pass'}});
    assert.equal((await s.request('/api/owner/data',auth)).status,404);
    const backup=structuredClone(owner.json.data);backup.settings.name='Synthetic backup only';
    assert.equal((await s.request('/api/owner/data',{...auth,method:'PUT',value:backup})).status,200);
    assert.equal((await s.request('/api/auth/session',{cookie:owner.cookie})).json.data.settings.name,'Synthetic private owner');
    assert.equal((await s.request('/api/owner/data',auth)).json.settings.name,'Synthetic backup only');
    assert.equal((await s.request('/api/owner/data',{cookie:ordinary.cookie})).status,403);
    const bad={...backup,settings:{...backup.settings,dailyMinutes:10000}};
    assert.equal((await s.request('/api/owner/data',{...auth,method:'PUT',value:bad})).status,400);
    assert.equal((await s.request('/api/owner/data',{...auth,method:'PUT',rawBody:'x'.repeat(10*1024*1024+1)})).status,413);
    assert.equal((await s.request('/api/owner/data',auth)).json.settings.name,'Synthetic backup only');
    assert.equal((await s.request('/api/auth/session',{cookie:ordinary.cookie})).json.data.settings.name,'other@example.com');
    for(const path of ['/personal-lessons/index.json','/personal-lessons%2findex.json','/%70ersonal-lessons/index.json']){
      assert.equal((await s.request(path)).status,404);assert.equal((await s.request(path,{cookie:ordinary.cookie})).status,404);
    }
    assert.equal((await s.request('/personal-lessons/index.json',{cookie:owner.cookie})).status,200);
  }finally{await s.close();await f.close();}
});

test('normal account password change revokes prior sessions and deletes bootstrap plaintext only for its owner',async()=>{
  const f=await fixture();const s=await serve(f);
  try{
    const owner=await s.login();const second=await s.login();
    const changed=await s.request('/api/auth/password',{method:'POST',cookie:owner.cookie,value:{currentPassword:f.password,newPassword:'synthetic-new-owner-password'}});
    assert.equal(changed.status,200);assert.equal(changed.json.user.owner,true);
    assert.equal((await s.request('/api/auth/session',{cookie:second.cookie})).status,401);
    assert.equal((await s.login()).status,401);
    assert.equal((await s.request('/api/auth/login',{method:'POST',value:{username:'Aziiz1996',password:'synthetic-new-owner-password'}})).status,200);
    let removed=false;try{await stat(join(f.privateDir,'owner-credentials.txt'));}catch(error){removed=error.code==='ENOENT';}assert.equal(removed,true);
    assert.equal((await initializeOwner({root:f.root,dataDir:f.dataDir})).reason,'owner-exists');
    let stillAbsent=false;try{await stat(join(f.privateDir,'owner-credentials.txt'));}catch(error){stillAbsent=error.code==='ENOENT';}assert.equal(stillAbsent,true);
  }finally{await s.close();await f.close();}
});

test('design validation preserves all existing main routes and refuses unsafe or duplicate values',()=>{
  for(const page of ['university','groups','exams','assistant','profile','updates'])assert.equal(DEFAULT_OWNER_DESIGN.navigation.includes(page),true);
  for(const change of [{hiddenPages:['dashboard']},{hiddenPages:['owner']},{navigation:['dashboard','dashboard']},{navigation:['unknown']},{accentColor:'#fff'},{appName:' '}]) assert.equal(validateOwnerDesign({...DEFAULT_OWNER_DESIGN,...change}),null);
  const db=new DatabaseSync(':memory:');const service=createOwnerDesignService(db);assert.equal(service.getDesign().appName,'عز اللوجستيات');db.close();
});
