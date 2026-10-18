import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { buildCourseLibrary } from '../scripts/build-course-library.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function fixture(){
 const root=mkdtempSync(join(tmpdir(),'course-parts-')),bytes=Buffer.from('%PDF-synthetic-test-fixture'),id=sha(bytes).slice(0,20),source=join(root,'course-library-source');
 mkdirSync(join(source,id),{recursive:true});const parts=[bytes.subarray(0,8),bytes.subarray(8)].map((b,index)=>{const file=String(index).padStart(3,'0')+'.part';writeFileSync(join(source,id,file),b);return {file,sha256:sha(b)};});
 const manifest={version:1,files:[{id,sha256:sha(bytes),bytes:bytes.length,parts}]};const save=()=>writeFileSync(join(source,'manifest.json'),JSON.stringify(manifest));save();return {root,source,bytes,id,manifest,save};
}
test('source parts reconstruct exact PDF bytes and activate only verified files',()=>{
 const f=fixture();try{assert.equal(buildCourseLibrary(f.root),1);assert.deepEqual(readFileSync(join(f.root,'public/course-library',f.id+'.pdf')),f.bytes);assert.deepEqual(JSON.parse(readFileSync(join(f.root,'public/course-library/manifest.json'),'utf8')),{version:1,files:['/course-library/'+f.id+'.pdf']});}finally{rmSync(f.root,{recursive:true,force:true});}
});
test('tampered or unsafe source parts never produce an activation manifest',()=>{
 for(const mode of ['path','bytes','duplicate']){const f=fixture();try{if(mode==='path')f.manifest.files[0].parts[0].file='../outside';if(mode==='bytes')writeFileSync(join(f.source,f.id,'000.part'),'modified');if(mode==='duplicate')f.manifest.files.push(structuredClone(f.manifest.files[0]));f.save();assert.throws(()=>buildCourseLibrary(f.root),/invalid-library|library-part-integrity/);assert.equal(existsSync(join(f.root,'public/course-library/manifest.json')),false);}finally{rmSync(f.root,{recursive:true,force:true});}}
});
