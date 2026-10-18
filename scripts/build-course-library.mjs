import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export function buildCourseLibrary(projectRoot=process.cwd()) {
 const source=resolve(projectRoot,'course-library-source');
 const manifest=JSON.parse(readFileSync(join(source,'manifest.json'),'utf8'));
 if(manifest.version!==1||!Array.isArray(manifest.files)||!manifest.files.length||manifest.files.length>100)throw Error('invalid-library-manifest');
 const ids=new Set(),verified=[];
 for(const file of manifest.files){
  if(!/^[a-f0-9]{20}$/.test(file.id)||ids.has(file.id)||!/^[a-f0-9]{64}$/.test(file.sha256)||file.sha256.slice(0,20)!==file.id||!Number.isSafeInteger(file.bytes)||file.bytes<5||file.bytes>100_000_000||!Array.isArray(file.parts)||!file.parts.length||file.parts.length>200)throw Error('invalid-library-file');
  ids.add(file.id);const chunks=[];let size=0;
  for(const [index,part] of file.parts.entries()){
   if(part.file!==String(index).padStart(3,'0')+'.part'||!/^[a-f0-9]{64}$/.test(part.sha256))throw Error('invalid-library-part');
   const bytes=readFileSync(join(source,file.id,part.file));size+=bytes.length;
   if(size>file.bytes||digest(bytes)!==part.sha256)throw Error('library-part-integrity');chunks.push(bytes);
  }
  const bytes=Buffer.concat(chunks);
  if(size!==file.bytes||digest(bytes)!==file.sha256||bytes.subarray(0,5).toString()!=='%PDF-')throw Error('library-file-integrity');
  verified.push({id:file.id,bytes});
 }
 const output=resolve(projectRoot,'public/course-library');mkdirSync(output,{recursive:true});
 for(const file of verified)writeFileSync(join(output,file.id+'.pdf'),file.bytes);
 writeFileSync(join(output,'manifest.json'),JSON.stringify({version:1,files:verified.map(f=>'/course-library/'+f.id+'.pdf')}));
 return verified.length;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log('Verified shared PDFs: '+buildCourseLibrary());
