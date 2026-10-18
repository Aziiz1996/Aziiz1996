export const tutorProvider=(env=process.env)=>env.ANTHROPIC_API_KEY?'anthropic':env.OPENAI_API_KEY?'openai':null;
export async function generateTutorReply(instructions,input,history=[],{env=process.env,fetcher=fetch}={}) {
 const provider=tutorProvider(env);if(!provider)throw Error('tutor-unconfigured');
 const previous=history.slice(-8).filter(m=>['user','assistant'].includes(m.role)&&typeof m.content==='string').map(m=>({role:m.role,content:m.content.slice(0,1500)}));
 const messages=[...previous,{role:'user',content:JSON.stringify(input)}];
 const response=await fetcher(provider==='anthropic'?'https://api.anthropic.com/v1/messages':'https://api.openai.com/v1/responses',{
  method:'POST',signal:AbortSignal.timeout(30000),headers:provider==='anthropic'?{'x-api-key':env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01','Content-Type':'application/json'}:{Authorization:'Bearer '+env.OPENAI_API_KEY,'Content-Type':'application/json'},
  body:JSON.stringify(provider==='anthropic'?{model:env.ANTHROPIC_TUTOR_MODEL||'claude-sonnet-4-5',max_tokens:1000,system:instructions,messages}:{model:env.OPENAI_TUTOR_MODEL||env.OPENAI_SUMMARY_MODEL||'gpt-4.1-mini',store:false,max_output_tokens:1000,instructions,input:messages})
 });
 if(!response.ok)throw Error('tutor-provider');const result=await response.json();
 const answer=(provider==='anthropic'?(result.content||[]).filter(c=>c.type==='text').map(c=>c.text):(result.output||[]).flatMap(o=>o.type==='message'?(o.content||[]).filter(c=>c.type==='output_text').map(c=>c.text):[])).join('\n').trim();
 if(!answer)throw Error('tutor-empty');return answer.slice(0,12000);
}

export function createTutorMemory({now=Date.now}={}){
 const entries=new Map(),busy=new Map();
 return {
  begin(id){for(const [key,value]of entries)if(value.expires<=now())entries.delete(key);if(busy.has(id))return null;const ticket=[...(entries.get(id)?.messages||[])];busy.set(id,ticket);return ticket;},
  finish(id,question,answer,ticket=busy.get(id)){if(!ticket||busy.get(id)!==ticket)return;if(question&&answer){if(entries.size>=1000)entries.delete(entries.keys().next().value);entries.set(id,{expires:now()+1800000,messages:[...(entries.get(id)?.messages||[]),{role:'user',content:question.slice(0,1500)},{role:'assistant',content:answer.slice(0,1500)}].slice(-8)});}busy.delete(id);},
  clear(id){entries.delete(id);busy.delete(id);}
 };
}
