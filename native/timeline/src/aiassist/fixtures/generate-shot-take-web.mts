import {applyShotTakeToClip} from '../../../../../packages/timeline/src/shotLink.ts';
import {writeFileSync} from 'node:fs';
const base={id:'clip',trackId:'video',mediaType:'video',storyboardBoardId:'board',storyboardShotId:'shot',storyboardElementId:'$source',currentAssetId:'old',activeTakeId:'old-version',startMs:7000,durationMs:2000,inPointMs:1000,outPointMs:5000,speedMultiplier:2,status:'generated',versions:[{id:'new-version',assetId:'new'}],timeRemap:{points:[{timeMs:0,sourceMs:1000},{timeMs:2000,sourceMs:5000}]},opacity:0.7};
const inputs=[
 ['fits',base,6000],
 ['slides',{...base,inPointMs:3000,outPointMs:7000},5000],
 ['shrinks',{...base,durationMs:4000},3001],
 ['baked',{...base,durationMs:4000,speedBaked:true},3000],
 ['unknown',{...base,versions:[]},undefined],
 ['zero-length',base,0],
 ['already-selected',{...base,currentAssetId:'new',activeTakeId:'stale'},1000],
 ['locked',{...base,locked:true},1000],
 ['slow-floor',{...base,speedMultiplier:0,inPointMs:5},0.001]
] as const;
const cases=inputs.map(([name,clip,durationMs])=>{
 const timeline={id:'timeline',tracks:[{id:'video',type:'video'}],clips:[clip],markers:[{id:'marker',timeMs:2}]};
 const take={assetId:'new',...(durationMs!==undefined&&{durationMs})};
 return {name,timeline,payload:{boardId:'board',shotId:'shot',...take},expected:{...timeline,clips:[applyShotTakeToClip(clip as never,take)]}};
});
writeFileSync(new URL('./shot-take-web.json',import.meta.url),JSON.stringify({cases},null,2)+'\n');
