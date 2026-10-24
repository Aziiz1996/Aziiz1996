'use strict';
const http=require('node:http'),fs=require('node:fs'),zlib=require('node:zlib'),crypto=require('node:crypto');
const {BOOK_KEY,READER_PASSWORD}=process.env;
if(!BOOK_KEY||!READER_PASSWORD)throw Error('Reader secrets are required');
const bytes=fs.readFileSync(__dirname+'/reader.enc');
const key=Buffer.from(BOOK_KEY,'hex');if(key.length!==32)throw Error('Invalid key');
const decipher=crypto.createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));decipher.setAuthTag(bytes.subarray(12,28));
const data=JSON.parse(zlib.gunzipSync(Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()])).toString());
const assets=new Map(Object.entries(data).map(([url,a])=>{const body=Buffer.from(a.bytes,'base64');return[url,{body,type:a.type,gzip:a.type.startsWith('text/')?zlib.gzipSync(body):null}]}));
const digest=t=>crypto.createHash('sha256').update(t).digest();
const secret=crypto.createHash('sha256').update(key).update('reader-session').digest();
const sign=t=>crypto.createHmac('sha256',secret).update(t).digest('base64url');
function valid(req){const token=/(?:^|;\s*)reader=([^;]+)/.exec(req.headers.cookie||'')?.[1];if(!token)return false;const [expires,mac]=token.split('.');if(!expires||!mac||Number(expires)<Date.now())return false;return crypto.timingSafeEqual(digest(mac),digest(sign(expires)));}
const form=`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>أحببتها حتى خسرت نفسي</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#071923;color:#fff3de;font-family:serif;padding:24px}main{width:min(100%,430px);padding:36px 25px;border:1px solid #a78b4d66;background:#0c2230}h1{font-weight:normal;font-size:34px;line-height:1.7;margin:0 0 18px}p{color:#cfbea0;font-size:18px;line-height:1.8}label{display:block;margin-bottom:10px}input,button{width:100%;padding:14px;font-size:18px;border-radius:4px}input{background:#f8f2e8;border:1px solid #dac18a;color:#102130}button{margin-top:16px;border:0;background:#e2c17b;color:#102130;font-weight:bold;cursor:pointer}.error{color:#ffb8a5}</style><main><h1>أحببتها<br>حتى خسرت نفسي</h1><p>رواية عبدالعزيز · النسخة المصوّرة</p>ERROR<form action="/login" method="post"><label for="password">كلمة مرور القراءة</label><input id="password" name="password" type="password" required autocomplete="current-password"><button>افتح الرواية</button></form></main></html>`;
const attempts=new Map();
const server=http.createServer((req,res)=>{
res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Robots-Tag','noindex, nofollow, noarchive');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
const path=new URL(req.url,'http://local').pathname;
function sendHtml(status,body,headers={}){const bytes=Buffer.isBuffer(body)?body:Buffer.from(body);res.writeHead(status,{'Content-Type':'text/html; charset=utf-8','Content-Disposition':'inline','Content-Length':bytes.length,...headers});res.end(req.method==='HEAD'?undefined:bytes)}
function loginError(message){return form.replace('ERROR','<p class="error">'+message+'</p><p><a href="/" style="color:#e2c17b">العودة إلى صفحة الدخول</a></p>')}
if(path==='/healthz'){res.writeHead(200,{'Content-Type':'text/plain'});return res.end('ok')}
if(path==='/robots.txt'){res.writeHead(200,{'Content-Type':'text/plain'});return res.end('User-agent: *\nDisallow: /\n')}
if(path==='/login'&&req.method==='POST'){
 const origin=req.headers.origin;if(origin&&origin!=='null'){try{const postedOrigin=new URL(origin);const publicOrigin='https://abdulaziz-novel-reader.onrender.com';const directOrigin=`${req.socket.encrypted?'https':'http'}://${req.headers.host}`;if(postedOrigin.origin!==publicOrigin&&postedOrigin.origin!==directOrigin){return sendHtml(403,loginError('تعذّر تأكيد صفحة الدخول. افتح الرابط مباشرة ثم حاول مجددًا.'))}}catch{return sendHtml(403,loginError('تعذّر تأكيد صفحة الدخول. افتح الرابط مباشرة ثم حاول مجددًا.'))}}
 let text='';req.on('data',chunk=>{text+=chunk;if(text.length>2048)req.destroy()});req.on('end',()=>{
 const ip=req.headers['x-forwarded-for']?.split(',')[0].trim()||req.socket.remoteAddress;const now=Date.now();let a=attempts.get(ip);if(!a||now-a.start>900000){a={start:now,n:0};attempts.set(ip,a)}
 if(attempts.size>2000)for(const [k,v]of attempts)if(now-v.start>900000)attempts.delete(k);
 if(++a.n>15){res.writeHead(429,{'Content-Type':'text/plain;charset=utf-8','Retry-After':'900'});return res.end('محاولات كثيرة. حاول بعد قليل.')}
 const password=new URLSearchParams(text).get('password')||'';
 if(!crypto.timingSafeEqual(digest(password),digest(READER_PASSWORD))){res.writeHead(401,{'Content-Type':'text/html;charset=utf-8'});return res.end(form.replace('ERROR','<p class="error">كلمة المرور غير صحيحة.</p>'))}
 attempts.delete(ip);const expires=String(Date.now()+7*86400000);return sendHtml(200,assets.get('/').body,{'Set-Cookie':`reader=${expires}.${sign(expires)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800`});
 });return;
}
if(!valid(req)){res.writeHead(200,{'Content-Type':'text/html;charset=utf-8'});return res.end(form.replace('ERROR',''))}
if(req.method!=='GET'&&req.method!=='HEAD'){return sendHtml(405,loginError('هذه الطريقة غير متاحة. ارجع إلى المكتبة.'))}
const asset=assets.get(path==='/login'?'/':path);if(!asset){return sendHtml(404,'<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>الصفحة غير موجودة</title><body style="background:#081b27;color:#fff3de;font:22px sans-serif;padding:40px"><p>هذه الصفحة غير موجودة.</p><a href="/" style="color:#e6c581">افتح مكتبة الرواية</a></body></html>')}
res.setHeader('Content-Type',asset.type);const gzip=asset.gzip&&/\bgzip\b/.test(req.headers['accept-encoding']||'');if(gzip){res.setHeader('Content-Encoding','gzip');res.setHeader('Vary','Accept-Encoding')}res.writeHead(200);res.end(req.method==='HEAD'?undefined:gzip?asset.gzip:asset.body);
});server.listen(Number(process.env.PORT)||10000,'0.0.0.0',()=>console.log('Private novel reader ready'));
process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
