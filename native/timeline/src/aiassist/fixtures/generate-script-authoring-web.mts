import {useScriptStore, lineStatus, effectiveVoice} from '../../../../../web/src/stores/script/ScriptStore.ts';
import {paceSpeed} from '../../../../../packages/protocol/src/script-pace.ts';
import {writeFileSync} from 'node:fs';
Date.now=()=>1700000000000;
const voice={provider:'openai',model:'tts-1',voice:'alloy'};
const makeTake=(text:string,extra={})=>({id:'take',assetId:'asset',durationMs:1000,words:[],textSnapshot:text,voiceSnapshot:voice,createdAt:'date',...extra});
const document={custom:'preserved',cast:[{id:'alice',name:'Alice',color:'#112233',voice},{id:'bob',name:'Bob',voice:null}],setup:{pace:'slow'},sections:[
 {id:'first',title:'Intro',lines:[{id:'empty',text:'',takes:[]},{id:'spaces',text:' ',takes:[]}]},
 {id:'last',title:'',lines:[{id:'voiced',speakerId:'alice',text:'Hello',takes:[makeTake('Hello',{speedSnapshot:0.85})],currentTakeId:'take'}, {id:'stale',speakerId:'alice',text:'New words',takes:[makeTake('Old words')],currentTakeId:'take'}, {id:'bob-line',speakerId:'bob',text:'Words',takes:[]}]},
 {id:'empty-section',title:'Closing',lines:[]}
]};
const script={id:'script',name:'Demo script',updatedAt:'revision',projectId:'project',document};
const seed=(value:any)=>useScriptStore.getState().loadScript('script',{title:value.name,...value.document});
const current=(before:any)=>{const value=useScriptStore.getState().getScript('script')!;return {...before,document:{...before.document,sections:value.sections,cast:value.cast}}};
seed(script);
const newLineId=useScriptStore.getState().addLine('script');
const add={script,payload:{lineId:newLineId},expected:current(script)};
seed(script);useScriptStore.getState().patchLine('script','voiced',{text:'Revised'});
const patch={script,payload:{lineId:'voiced',text:'Revised'},expected:current(script)};
seed(script);useScriptStore.getState().removeLine('script','empty');
const remove={script,payload:{lineId:'empty'},expected:current(script)};
const noSections={...script,document:{...document,sections:[]}};
seed(noSections);const freshId=useScriptStore.getState().addLine('script');const addedEmpty=current(noSections);
const addEmpty={script:noSections,payload:{lineId:freshId,newSectionId:addedEmpty.document.sections[0].id},expected:addedEmpty};
const timeline={clips:[{id:'unrelated',scriptId:'other',scriptLineId:'voiced',startMs:1},{id:'clip-voiced',scriptId:'script',scriptLineId:'voiced',startMs:500},{id:'second-match',scriptId:'script',scriptLineId:'voiced',startMs:900}]};
const rows=[];
for(const section of document.sections){
 if(section.title) rows.push({kind:'section',id:section.id,title:section.title});
 for(let index=0;index<section.lines.length;index++){
  const line=section.lines[index] as any;const speaker=document.cast.find(s=>s.id===line.speakerId);const status=lineStatus(line,effectiveVoice(line,document.cast),paceSpeed(document.setup.pace as never)??null);const clip=timeline.clips.find(c=>c.scriptId===script.id&&c.scriptLineId===line.id);
  rows.push({...line,kind:'line',sectionId:section.id,showSpeaker:(index===0||section.lines[index-1].speakerId!==line.speakerId)&&!!speaker,speakerName:speaker?.name??'',...(speaker?.color&&{speakerColor:speaker.color}),status,canVoice:status!=='voiced'&&!!line.text.trim(),clipId:clip?.id??null,...(clip&&{clipStartMs:clip.startMs})});
 }
}
writeFileSync(new URL('./script-authoring-web.json',import.meta.url),JSON.stringify({add,patch,remove,addEmpty,rows:{script,timeline,expected:rows}},null,2)+'\n');
