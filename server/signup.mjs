import { randomBytes, createHash } from 'node:crypto';
import { createOtpLimits } from './otp-limits.mjs';
import { twilioProvider } from './twilio-verify.mjs';

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

 const columns = new Set(db.prepare('PRAGMA table_info(signup_verifications)').all().map(column => column.name));
 if (!columns.has('sid')) db.exec('ALTER TABLE signup_verifications ADD COLUMN sid TEXT');
 if (!columns.has('state')) db.exec("ALTER TABLE signup_verifications ADD COLUMN state TEXT NOT NULL DEFAULT 'pending'");
 db.exec('CREATE TABLE IF NOT EXISTS signup_used_sids (sid TEXT PRIMARY KEY, expires INTEGER NOT NULL)');
 const enabled=()=>/^AC[a-f0-9]{32}$/i.test(env.TWILIO_ACCOUNT_SID||'')&&/^VA[a-f0-9]{32}$/i.test(env.TWILIO_VERIFY_SERVICE_SID||'')&&!!env.TWILIO_AUTH_TOKEN;
 const reserve = createOtpLimits(db, env.TWILIO_AUTH_TOKEN, now);
 const daily = Number(env.TWILIO_DAILY_SEND_LIMIT || 100);
 if (!Number.isSafeInteger(daily) || daily < 1) throw Error('Invalid TWILIO_DAILY_SEND_LIMIT');
 const provider = enabled() ? twilioProvider({ accountSid:env.TWILIO_ACCOUNT_SID, authToken:env.TWILIO_AUTH_TOKEN, serviceSid:env.TWILIO_VERIFY_SERVICE_SID }, fetcher) : null;
 function available(handle){return validHandle(handle)&&!db.prepare('SELECT user_id FROM account_details WHERE handle=?').get(handle);}
 async function handle(path,payload,ip){
  if(!payload||typeof payload!=='object'||Array.isArray(payload))throw Error('بيانات التحقق غير صالحة.');
  db.prepare('DELETE FROM signup_verifications WHERE expires<=?').run(now());
  db.prepare('DELETE FROM signup_used_sids WHERE expires<=?').run(now());
  reserve([['request:'+ip,60,900000]]);
  if(path==='/api/auth/check-username')return {available:available(String(payload.handle||'').trim().toLowerCase())};
  if(!enabled()){const e=Error('خدمة الرسائل النصية غير مفعّلة. يمكنك التسجيل بالبريد الإلكتروني.');e.status=503;throw e;}
  if(path==='/api/auth/send-otp'){
   const phone=normalizePhone(payload.phone),email=emailValue(payload.email);
   if(!phone||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||payload.consent!==true)throw Error('أدخل البريد والجوال ووافق على رسالة التحقق.');
   reserve([['send-cooldown:'+phone,1,60000],['send:'+ip,5,900000],['phone:'+phone,3,900000],['total',daily,86400000]]);
   let sid;
   try { sid=await provider.send(phone); } catch(error) { throw Object.assign(Error('تعذرت خدمة الرسائل. انتظر وحاول لاحقًا.'),{status:error.status||503,retryAfter:60}); }
   const challenge=randomBytes(32).toString('hex');db.prepare('INSERT INTO signup_verifications (hash,email,phone,expires,sid) VALUES (?,?,?,?,?)').run(digest(challenge),email,phone,now()+600000,sid);
   return {challenge,retryAfter:60,message:'قُبل طلب إرسال الرمز. أدخله عند وصول الرسالة.'};
  }
  const record=typeof payload.challenge==='string'&&/^[a-f0-9]{64}$/.test(payload.challenge)?db.prepare('SELECT * FROM signup_verifications WHERE hash=?').get(digest(payload.challenge)):null;
  if(!record||!record.sid||record.state!=='pending'||record.expires<=now()||record.attempts>=5||typeof payload.code!=='string'||!/^\d{4,10}$/.test(payload.code))throw Error('الرمز أو طلب التحقق غير صالح؛ أعد إرسال الرمز.');
  reserve([['check:'+ip,30,900000],['check-phone:'+record.phone,10,600000]]);
  if(!db.prepare("UPDATE signup_verifications SET attempts=attempts+1,state='checking' WHERE hash=? AND state='pending' AND attempts<5").run(record.hash).changes)throw Error('طلب التحقق قيد المعالجة.');
  let status;
  try { status=await provider.check(record.sid,payload.code); }
  catch(error){db.prepare("UPDATE signup_verifications SET state='pending' WHERE hash=?").run(record.hash);throw Object.assign(Error('تعذر التحقق من الرمز. حاول لاحقًا.'),{status:error.status||503,retryAfter:60});}
  if(status!=='approved') {db.prepare("UPDATE signup_verifications SET state=? WHERE hash=?").run(status==='pending'?'pending':'used',record.hash);return {valid:false,error:'الرمز غير صحيح أو انتهت صلاحيته.'};}
  if(record.expires<=now())throw Error('انتهت صلاحية التحقق؛ أعد المحاولة.');
  db.exec('BEGIN IMMEDIATE');
  try {
   if(db.prepare('SELECT sid FROM signup_used_sids WHERE sid=?').get(record.sid))throw Error('سبق استخدام طلب التحقق.');
   db.prepare('INSERT INTO signup_used_sids VALUES (?,?)').run(record.sid,now()+86400000);
   db.prepare("UPDATE signup_verifications SET verified=1,state='verified' WHERE hash=?").run(record.hash);
   db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
  return {valid:true};
 }
 function prepare(payload,email){
  if(payload===undefined)return null;
  if(!payload||typeof payload!=='object'||Array.isArray(payload))throw Error('بيانات التسجيل غير صالحة.');
  const handle=String(payload.handle||'').trim().toLowerCase(),fullName=String(payload.fullName||'').trim(),birthdate=String(payload.birthdate||''),phone=payload.phone?normalizePhone(payload.phone):'';
  if(!available(handle)||fullName.length<2||fullName.length>80||(payload.phone&&!phone))throw Error('تحقق من الاسم واسم المستخدم ورقم الجوال.');
  if(birthdate&&(!/^\d{4}-\d{2}-\d{2}$/.test(birthdate)||birthdate<'1900-01-01'||birthdate>new Date(now()).toISOString().slice(0,10)||Number.isNaN(Date.parse(birthdate))||new Date(birthdate).toISOString().slice(0,10)!==birthdate))throw Error('تاريخ الميلاد غير صالح.');
  const record=phone&&enabled()&&typeof payload.challenge==='string'?db.prepare("SELECT * FROM signup_verifications WHERE hash=? AND email=? AND phone=? AND verified=1 AND sid IS NOT NULL AND state='verified' AND expires>?").get(digest(payload.challenge),emailValue(email),phone,now()):null;
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
