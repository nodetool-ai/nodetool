import {reflowGenerated, voiceoverTrackId, transcriptEndMs, rippleDeleteRange} from '../../../../../web/src/stores/timeline/transcriptOps.ts';
import {makeClip, makeTrack} from '../../../../../packages/timeline/src/defaults.ts';
import {writeFileSync} from 'node:fs';
const clips = [
 {id:'one',trackId:'voice',bindingKind:'text-to-audio',mediaType:'audio',sourceType:'generated',startMs:200,durationMs:1000,prompt:'First',status:'generated',currentAssetId:'old'},
 {id:'recording',trackId:'voice',mediaType:'audio',sourceType:'imported',startMs:1800,durationMs:700,caption:{words:[{word:'recording',startMs:0,endMs:700}]}},
 {id:'two',trackId:'voice',bindingKind:'text-to-audio',mediaType:'audio',sourceType:'generated',startMs:2800,durationMs:0,prompt:'Second',status:'draft'},
 {id:'music',trackId:'music',mediaType:'audio',sourceType:'imported',startMs:0,durationMs:15000}
] as never[];
const timeline={id:'timeline',tracks:[{id:'voice',name:'Voiceover',type:'audio',index:0,visible:true,locked:false},{id:'music',name:'Music',type:'audio',index:1,visible:true,locked:false}],clips,durationMs:15000,custom:'preserved'};
const cases = [
 {name:'placeholder',timeline,payload:{},expected:{...timeline,...reflowGenerated(clips)}},
 {name:'reorder',timeline,payload:{orderedClipIds:['two','one']},expected:{...timeline,...reflowGenerated(clips,['two','one'])}},
 {name:'duration',timeline:{...timeline,clips:clips.map((clip:any)=>clip.id==='one'?{...clip,durationMs:2000}:clip)},payload:{previousDurations:{one:1000}},expected:{...timeline,...reflowGenerated(clips.map((clip:any)=>clip.id==='one'?{...clip,durationMs:2000}:clip),undefined,new Map([['one',1000]]))}}
];
const payload={id:'new-beat',text:' Appended words ',provider:'openai',model:'tts-1',voice:'alloy'};
const fresh=makeClip({id:payload.id,paragraphId:payload.id,name:payload.text.slice(0,30).trim()||'Voiceover',trackId:voiceoverTrackId(clips,timeline.tracks),startMs:transcriptEndMs(clips),durationMs:3000,mediaType:'audio',sourceType:'generated',bindingKind:'text-to-audio',prompt:payload.text,provider:payload.provider,model:payload.model,voice:payload.voice,status:'draft'});
const added={timeline,payload,expected:{...timeline,...reflowGenerated([...clips,fresh])}};
const deleted={timeline,payload:{clipIds:['recording']},expected:{...timeline,...rippleDeleteRange(clips,1800,2500)}};
let generated = 0; const originalIds = new Set(clips.map((clip:any)=>clip.id));
for(const clip of deleted.expected.clips) { if(!originalIds.has(clip.id)) clip.id = 'generated-'+generated++; }
writeFileSync(new URL('./beats-web.json',import.meta.url),JSON.stringify({cases,added,deleted},null,2)+'\n');
