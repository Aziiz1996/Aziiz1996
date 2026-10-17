import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Capacitor } from '@capacitor/core';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { Mic, Send, Volume2 } from 'lucide-react';
import { useApp } from './store';
import { SectionHeader } from './ui';
import TeacherPage from './Teacher';

interface BrowserRecognition { lang:string;interimResults:boolean;continuous:boolean;onresult:((e:{results:ArrayLike<ArrayLike<{transcript:string}>>})=>void)|null;onerror:(()=>void)|null;onend:(()=>void)|null;start:()=>void;stop:()=>void;abort:()=>void; }
function ExpandedAssistant() {
 const {notify}=useApp();const [question,setQuestion]=useState('');const [answer,setAnswer]=useState('');const [sources,setSources]=useState<Array<{id:string;title:string}>>([]);
 const [listening,setListening]=useState(false);const [busy,setBusy]=useState(false);const [aiAvailable,setAiAvailable]=useState(false);const [useAI,setUseAI]=useState(false);const [mode,setMode]=useState('');const [answerKind,setAnswerKind]=useState('');
 const recognition=useRef<BrowserRecognition|null>(null);const request=useRef<AbortController|null>(null);const mounted=useRef(true);
 function stopReading(){if(Capacitor.isNativePlatform())void TextToSpeech.stop().catch(()=>{});else window.speechSynthesis?.cancel();}
 useEffect(()=>{mounted.current=true;const controller=new AbortController();fetch('/api/ai/status',{signal:controller.signal,cache:'no-store'}).then(r=>r.ok?r.json():null).then(v=>{if(mounted.current)setAiAvailable(!!v?.tutorEnabled);}).catch(()=>{});return()=>{mounted.current=false;controller.abort();request.current?.abort();recognition.current?.abort();if(Capacitor.isNativePlatform()){void SpeechRecognition.stop().catch(()=>{});void TextToSpeech.stop().catch(()=>{});}else window.speechSynthesis?.cancel();};},[]);
 async function listen(){
  stopReading();
  if(!Capacitor.isNativePlatform()){
   const surface=window as typeof window & {SpeechRecognition?:new()=>BrowserRecognition;webkitSpeechRecognition?:new()=>BrowserRecognition};const Constructor=surface.SpeechRecognition||surface.webkitSpeechRecognition;
   if(!Constructor||!window.isSecureContext){notify('التعرف على الصوت غير متاح في هذا المتصفح. افتح نسخة HTTPS في متصفح يدعم الصوت، أو اكتب سؤالك.');return;}
   try{recognition.current?.abort();const rec=new Constructor();recognition.current=rec;rec.lang='ar-SA';rec.interimResults=false;rec.continuous=false;rec.onresult=e=>{if(mounted.current)setQuestion(e.results[0]?.[0]?.transcript||'');};rec.onerror=()=>{if(mounted.current){setListening(false);notify('تعذر التقاط الصوت. تحقق من إذن الميكروفون أو اكتب سؤالك.');}};rec.onend=()=>{if(mounted.current)setListening(false);};rec.start();setListening(true);}catch{setListening(false);notify('تعذر تشغيل الميكروفون.');}return;
  }
  try{if(!(await SpeechRecognition.available()).available){notify('التعرف على الصوت غير متاح على هذا الجهاز.');return;}if((await SpeechRecognition.requestPermissions()).speechRecognition!=='granted'){notify('فعّل إذن الميكروفون والتعرف على الكلام من إعدادات الجهاز.');return;}setListening(true);const result=await SpeechRecognition.start({language:'ar-SA',maxResults:1,partialResults:false});if(mounted.current&&result.matches?.[0])setQuestion(result.matches[0]);}catch{if(mounted.current)notify('تعذر التقاط الصوت.');}finally{if(mounted.current)setListening(false);}
 }
 async function stopListening(){recognition.current?.stop();if(Capacitor.isNativePlatform())await SpeechRecognition.stop().catch(()=>{});setListening(false);}
 async function speak(){try{stopReading();if(Capacitor.isNativePlatform()){await TextToSpeech.speak({text:answer,lang:'ar-SA',rate:0.9});return;}if(!('speechSynthesis' in window)){notify('القراءة الصوتية غير متاحة هنا؛ الرد ظاهر كنص.');return;}const voice=window.speechSynthesis.getVoices().find(v=>v.lang.startsWith('ar'));let chunk='';const chunks:string[]=[];for(const word of answer.split(/\s+/)){if(chunk.length+word.length>220){chunks.push(chunk);chunk='';}chunk+=(chunk?' ':'')+word;}if(chunk)chunks.push(chunk);for(const text of chunks){const utterance=new SpeechSynthesisUtterance(text);utterance.lang='ar-SA';utterance.rate=0.9;if(voice)utterance.voice=voice;utterance.onerror=()=>notify('تعذرت القراءة الصوتية. تحقق من أصوات العربية في إعدادات جهازك.');window.speechSynthesis.speak(utterance);}}catch{notify('تعذرت القراءة الصوتية؛ الرد متاح كنص.');}}
 async function ask(event:FormEvent){event.preventDefault();if(!question.trim())return;setBusy(true);stopReading();request.current?.abort();const controller=new AbortController();request.current=controller;try{const response=await fetch('/api/ai/tutor',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:question.trim(),useAI}),signal:controller.signal});const value=await response.json();if(!response.ok)throw Error(value.error||'تعذر الرد.');if(mounted.current){setAnswer(value.answer);setSources(value.sources||[]);setMode(value.mode);setAnswerKind(value.kind||'');}}catch(e){if(mounted.current&&!controller.signal.aborted)notify(e instanceof Error?e.message:'تعذر الاتصال.');}finally{if(mounted.current)setBusy(false);}}
 return <div className="stack"><SectionHeader eyebrow="شرح مرتبط بمحاضراتك" title="شرح أوسع مع تيتشر لوجستيك" description="نراجع مقتطفات حسابك، ومع اختيارك نستخدم الشرح الذكي داخل دبلوم اللوجستيات." /><p className="notice">الوضع الأساسي يبحث في ملخصات حسابك ويعرض مقتطفات منها ومواعيد مهامك. التعرف على الكلام قد يستخدم خدمة المتصفح أو نظام الهاتف، ويبدأ عند ضغط الميكروفون والسماح له.</p><form className="card stack" onSubmit={ask}><label htmlFor="assistant-question">سؤالك</label><textarea id="assistant-question" rows={4} maxLength={4000} required value={question} onChange={e=>setQuestion(e.target.value)} placeholder="مثلاً: اشرح تحليل ABC أو مهارات المفاوض" /><label className="row"><input type="checkbox" checked={useAI} disabled={!aiAvailable||busy} onChange={e=>setUseAI(e.target.checked)} />استخدام الشرح الذكي عبر OpenAI</label><p className="field-hint">{aiAvailable?'عند اختياره، يُرسل سؤالك ومقتطفات مرتبطة به من ملخصاتك إلى OpenAI لإعداد شرح ومثال.':'خدمة الشرح الذكي لم تُفعّل على الخادم بعد. البحث في الملخصات والقراءة الصوتية متاحان.'}</p><div className="row"><button type="button" className="btn btn-secondary" disabled={listening||busy} onClick={()=>void listen()}><Mic size={18}/>{listening?'أستمع إليك…':'تحدث بالعربية'}</button>{listening&&<button type="button" className="btn btn-secondary" onClick={()=>void stopListening()}>إيقاف الاستماع</button>}<button className="btn btn-primary" disabled={busy||listening||!question.trim()}><Send size={18}/>{busy?'جارٍ إعداد الرد…':'إرسال السؤال'}</button></div></form>{answer&&<section className="card stack" aria-live="polite"><h2>{mode==='ai'?'شرح تعليمي واستنتاج داخل التخصص':answerKind==='refusal'?'حدود تخصصك':answerKind==='educational'?'شرح تعليمي داخل التخصص':'من ملخصاتك وبياناتك'}</h2><p className="preserve-lines">{answer}</p>{sources.length>0&&<p className="muted">المراجع داخل حسابك: {sources.map(s=>s.title).join('، ')}</p>}<div className="row"><button className="btn btn-secondary" onClick={()=>void speak()}><Volume2 size={18}/>اسمع الرد</button><button className="btn btn-secondary" onClick={stopReading}>إيقاف القراءة</button></div></section>}</div>;
}


export default function AssistantPage() {
 const [tab,setTab]=useState<'study'|'expanded'>('study');
 return <div className="page-content stack">
  <div className="logistics-mode-tabs" role="tablist" aria-label="وضع تيتشر لوجستيك">
   <button id="teacher-tab-study" role="tab" type="button" aria-selected={tab==='study'} aria-controls="teacher-mode-panel" className={tab==='study'?'active':''} onClick={()=>setTab('study')}>مراجعة وتدريب</button>
   <button id="teacher-tab-expanded" role="tab" type="button" aria-selected={tab==='expanded'} aria-controls="teacher-mode-panel" className={tab==='expanded'?'active':''} onClick={()=>setTab('expanded')}>شرح أوسع من محاضراتي</button>
  </div>
  <div id="teacher-mode-panel" role="tabpanel" aria-labelledby={tab==='study'?'teacher-tab-study':'teacher-tab-expanded'}>{tab==='study'?<TeacherPage />:<ExpandedAssistant />}</div>
 </div>;
}
