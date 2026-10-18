export const speechEnabled=(env=process.env)=>!!env.AZURE_SPEECH_KEY&&/^[a-z0-9]{2,30}$/.test(env.AZURE_SPEECH_REGION||'');
const escapeXML=value=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]));
export async function synthesizeSpeech(text,{env=process.env,fetcher=fetch}={}){
 if(typeof text!=='string'||!text.trim()||text.length>4000||/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text))throw Error('speech-input');
 if(!speechEnabled(env))throw Error('speech-unconfigured');
 const response=await fetcher('https://'+env.AZURE_SPEECH_REGION+'.tts.speech.microsoft.com/cognitiveservices/v1',{method:'POST',signal:AbortSignal.timeout(20000),headers:{'Ocp-Apim-Subscription-Key':env.AZURE_SPEECH_KEY,'Content-Type':'application/ssml+xml','X-Microsoft-OutputFormat':'audio-16khz-32kbitrate-mono-mp3','User-Agent':'AzLogistics'},body:'<speak version="1.0" xml:lang="ar-SA"><voice name="ar-SA-HamedNeural"><prosody rate="0%">'+escapeXML(text)+'</prosody></voice></speak>'});
 if(!response.ok)throw Error('speech-provider');const bytes=Buffer.from(await response.arrayBuffer());if(!bytes.length||bytes.length>4_000_000)throw Error('speech-provider');return bytes;
}
