import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { buildStoryboardTimeline, buildLinkedTimeline, frameSizeForAspect } from '@nodetool-ai/timeline';
import { mergeIntoSequence, stampBoardProvenance } from '../../../../web/src/lib/assembledSequenceMerge.ts';
const executable = process.argv[2];
if (!executable) throw new Error('Pass the native storyboard assembly oracle executable.');
function normalize(doc) {
  const ids = new Map();
  doc.tracks.forEach((track, index) => ids.set(track.id, `track${index}`));
  doc.clips.forEach((clip, index) => ids.set(clip.id, `clip${index}`));
  for (const clip of doc.clips) if (clip.linkId && !ids.has(clip.linkId)) ids.set(clip.linkId, `link${ids.size}`);
  return JSON.parse(JSON.stringify(doc), (key, value) => ['id','trackId','linkId'].includes(key) ? ids.get(value) ?? value : value);
}
const clipShot = (id, index, seconds = 3) => ({id, index, slug:id, duration_seconds:2, clip:{asset_id:`asset-${id}`, duration:seconds}});
const cases = [
  {shots:[clipShot('a',0), clipShot('b',1,5)], screenplay:{narration:' Hello ',music_prompt:' Score '}},
  {shots:[{id:'still', index:0, keyframe:{asset_id:'image'},duration_seconds:2}, {id:'missing',index:1}]},
  {shots:[clipShot('cover',0,8),{id:'slice',index:1,covered_by:{shot_id:'cover',start_seconds:3,end_seconds:6}}]},
  {shots:[{...clipShot('a',0),production:{media_strategy:'still_motion_graphics'},keyframe:{asset_id:'still'}}]},
  {shots:[{id:'graphics',index:0,duration_seconds:2,graphics:{mode:'graphics_first'}}]},
  {shots:[{...clipShot('a',0,5),script_line_ids:['line']}],screenplay:{script_id:'script',music_prompt:'score'}, linked:true},
];
for (const board of cases) {
  const script = {id:'script',document:{cast:[{id:'speaker',name:'Ada',voice:{provider:'p',model:'m',voice:'v'}}],sections:[{id:'section',lines:[{id:'line',text:'Hello',speakerId:'speaker',pauseAfterMs:100,currentTakeId:'take',takes:[{id:'take',assetId:'speech',durationMs:1200,words:[{word:'Hello',startMs:0,endMs:1200}]}]}]}]}};
  const existing = {id:'sequence',tracks:[{id:'foreign',name:'Imported',type:'video',index:0}],clips:[{id:'foreignClip',trackId:'foreign',startMs:9000,durationMs:1000,mediaType:'image'}],storyboardMaterializations:[]};
  const response = {id:'board',document:board};
  const request = {existing,board:response, ...(board.linked?{script}: {})};
  const native = spawnSync(executable, [], {input:JSON.stringify(request),encoding:'utf8'});
  assert.equal(native.status,0,native.stderr);
  const actual = JSON.parse(native.stdout);
  const input = {boardId:'board',shots:board.shots,narration:board.screenplay?.narration,musicPrompt:board.screenplay?.music_prompt};
  const built = board.linked ? buildLinkedTimeline({...input,script:{scriptId:script.id,...script.document}}) : buildStoryboardTimeline(input);
  built.clips = stampBoardProvenance(built.clips,'board');
  const merged = mergeIntoSequence(built,existing,{boardId:'board',scriptId:board.linked?'script':undefined});
  const expected = {...existing,...merged,...frameSizeForAspect(board.aspectRatio),durationMs:merged.clips.reduce((end,c)=>Math.max(end,c.startMs+c.durationMs),built.durationMs)};
  assert.deepEqual(normalize(actual.document),normalize(expected));
  assert.deepEqual(actual.skippedShotIds,built.skippedShotIds);
  assert.deepEqual(actual.skippedLineIds,built.skippedLineIds??[]);
  assert.deepEqual(actual.trimmedShots,built.trimmedShots);
  assert.deepEqual(actual.retimedShots,built.retimedShots);
}
console.log(`${cases.length} storyboard assembly differential cases passed`);
