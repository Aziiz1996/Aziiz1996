import { randomBytes, createHash } from 'node:crypto';

export const normalizePhone = value => {
 const text=String(value||'').trim().replace(/[\s()-]/g,'');
 const phone=/^05\d{8}$/.test(text)?'+966'+text.slice(1):text;
 return /^\+[1-9]\d{7,14}$/.test(phone)?phone:'';
};
export const validHandle = value => typeof value==='string'&&/^[a-z][a-z0-9_]{2,29}$/.test(value)&&!['admin','administrator','owner','aziiz1996','test','user'].includes(value);
const digest=value=>createHash('sha256').update(value).digest('hex');
const emailValue=value=>String(value||'').trim().normalize('NFKC').toLowerCase();
export function createSignupService(db,{env=process.env,fetcher=fetch,now=Date.now}={}) {
 db.exec('CREATE TABLE IF NOT EXISTS account_details (user_id TEXT PRIMARY KEY, handle TEXT UNIQUE NOT NULL, birthdate TEXT NOT NULL, verified_phone TEXT NOT NULL); CREATE TABLE IF NOT EXISTS signup_verifications (hash TEXT PRIMARY KEY, email TEXT NOT NULL, phone TEXT NOT NULL, expires INTEGER NOT NULL, verified INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0)');
 const limits=new Map();
 const enabled=()=>/^AC[a-f0-9]{32}$/i.test(env.TWILIO_ACCOUNT_SID||'')&&/^VA[a-f0-9]{32}$/i.test(env.TWILIO_VERIFY_SERVICE_SID||'')&&!!env.TWILIO_AUTH_TOKEN;
 function limit(key,max,ms){const stamp=now();for(const [k,v]of limits)if(v.until<=stamp)limits.delete(k);const r=limits.get(key)||{n:0,until:stamp+ms};limits.set(key,r);if(++r.n>max){const e=Error('محاولات كثيرة. انتظر قليلاً قبل إعادة المحاولة.');e.status=429;throw e;}}
 function available(handle){return validHandle(handle)&&!db.prepare('SELECT user_id FROM account_details WHERE handle=?').get(handle);}
 async function provider(resource,fields){
  const response=await fetcher('https://verify.twilio.com/v2/Services/'+env.TWILIO_VERIFY_SERVICE_SID+'/'+resource,{method:'POST',signal:AbortSignal.timeout(15000),headers:{Authorization:'Basic '+Buffer.from(env.TWILIO_ACCOUNT_SID+':'+env.TWILIO_AUTH_TOKEN).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(fields)});
  if(!response.ok)throw Error('تعذرت خدمة التحقق بالجوال. حاول لاحقًا.');return response.json();
 }
 async function handle(path,payload,ip){
  db.prepare('DELETE FROM signup_verifications WHERE expires<=?').run(now());
  limit('ip:'+ip,30,900000);
  if(path==='/api/auth/check-username')return {available:available(String(payload.handle||'').trim().toLowerCase())};
  if(!enabled()){const e=Error('خدمة الرسائل النصية غير مفعّلة. يمكنك التسجيل بالبريد الإلكتروني.');e.status=503;throw e;}
  if(path==='/api/auth/send-otp'){
   const phone=normalizePhone(payload.phone),email=emailValue(payload.email);
   if(!phone||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('أدخل البريد ورقم الجوال بصيغة صحيحة.');
   limit('send:'+ip,5,900000);limit('phone:'+phone,3,900000);limit('total',100,86400000);
   const result=await provider('Verifications',{To:phone,Channel:'sms'});if(result.status!=='pending')throw Error('تعذر بدء التحقق.');
   const challenge=randomBytes(32).toString('hex');db.prepare('INSERT INTO signup_verifications (hash,email,phone,expires) VALUES (?,?,?,?)').run(digest(challenge),email,phone,now()+600000);
   return {challenge,retryAfter:60,message:'أُرسل رمز التحقق إلى رقمك.'};
  }
  const record=typeof payload.challenge==='string'&&/^[a-f0-9]{64}$/.test(payload.challenge)?db.prepare('SELECT * FROM signup_verifications WHERE hash=?').get(digest(payload.challenge)):null;
  if(!record||record.expires<=now()||record.attempts>=5||!/^\d{4,10}$/.test(String(payload.code||'')))throw Error('الرمز أو طلب التحقق غير صالح؛ أعد إرسال الرمز.');
  db.prepare('UPDATE signup_verifications SET attempts=attempts+1 WHERE hash=?').run(record.hash);
  const result=await provider('VerificationCheck',{To:record.phone,Code:String(payload.code)});
  if(result.status!=='approved')return {valid:false,error:'الرمز غير صحيح.'};
  db.prepare('UPDATE signup_verifications SET verified=1 WHERE hash=?').run(record.hash);return {valid:true};
 }
 function prepare(payload,email){
  if(payload===undefined)return null;
  if(!payload||typeof payload!=='object'||Array.isArray(payload))throw Error('بيانات التسجيل غير صالحة.');
  const handle=String(payload.handle||'').trim().toLowerCase(),fullName=String(payload.fullName||'').trim(),birthdate=String(payload.birthdate||''),phone=payload.phone?normalizePhone(payload.phone):'';
  if(!available(handle)||fullName.length<2||fullName.length>80||(payload.phone&&!phone))throw Error('تحقق من الاسم واسم المستخدم ورقم الجوال.');
  if(birthdate&&(!/^\d{4}-\d{2}-\d{2}$/.test(birthdate)||birthdate<'1900-01-01'||birthdate>new Date(now()).toISOString().slice(0,10)||Number.isNaN(Date.parse(birthdate))||new Date(birthdate).toISOString().slice(0,10)!==birthdate))throw Error('تاريخ الميلاد غير صالح.');
  const record=phone&&enabled()&&typeof payload.challenge==='string'?db.prepare('SELECT * FROM signup_verifications WHERE hash=? AND email=? AND phone=? AND verified=1 AND expires>?').get(digest(payload.challenge),emailValue(email),phone,now()):null;
  if(phone&&enabled()&&!record)throw Error('تحقق من رقم الجوال قبل إنشاء الحساب.');
  return {handle,fullName,birthdate,phone,verifiedPhone:record?phone:'',challengeHash:record?.hash};
 }
 function save(userId,details){
  if(!details)return;
  if(details.challengeHash&&!db.prepare('DELETE FROM signup_verifications WHERE hash=? AND verified=1 AND expires>?').run(details.challengeHash,now()).changes)throw Error('انتهت صلاحية التحقق؛ أعد المحاولة.');
  db.prepare('INSERT INTO account_details VALUES (?,?,?,?)').run(userId,details.handle,details.birthdate,details.verifiedPhone);
 }
 return {enabled,available,handle,prepare,save,loginEmail:handle=>db.prepare('SELECT users.username FROM users JOIN account_details ON users.id=account_details.user_id WHERE account_details.handle=?').get(handle)?.username};
}
