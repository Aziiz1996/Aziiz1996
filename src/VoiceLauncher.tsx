import { useEffect, useState } from 'react';
import { ArrowUp, Mic } from 'lucide-react';
import { Modal } from './ui';
import { ExpandedAssistant } from './Assistant';

export default function VoiceLauncher(){
 const [open,setOpen]=useState(false),[scrolled,setScrolled]=useState(false);
 useEffect(()=>{const update=()=>setScrolled(window.scrollY>300);window.addEventListener('scroll',update,{passive:true});return()=>window.removeEventListener('scroll',update);},[]);
 return <><div className="voice-launcher">{scrolled&&<button type="button" className="icon-button" aria-label="العودة إلى أعلى الصفحة" onClick={()=>window.scrollTo({top:0,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'})}><ArrowUp size={22}/></button>}<button type="button" className="voice-launcher-button" aria-label="فتح المساعد الصوتي تيتشر لوجستيك" aria-haspopup="dialog" aria-expanded={open} onClick={()=>setOpen(true)}><Mic size={24}/><span>تيتشر لوجستيك</span></button></div>{open&&<Modal title="المساعد الصوتي تيتشر لوجستيك" onClose={()=>setOpen(false)}><ExpandedAssistant/></Modal>}</>;
}
