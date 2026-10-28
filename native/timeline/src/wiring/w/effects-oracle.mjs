// Run the actual TimelineStore action bodies with the real timeline defaults.
import { build, root } from './oracleTools.mjs';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const binary = path.resolve(process.argv[2]);
const source = readFileSync(path.join(root, 'web/src/stores/timeline/TimelineStore.ts'), 'utf8');
const start = source.indexOf('        addTrackEffect: (trackId, effect) =>');
const end = source.indexOf('        // ── Mixer', start);
assert(start >= 0 && end > start, 'TimelineStore effect actions were not found');
const outfile = path.join(path.dirname(binary), 'w-effects-oracle.mjs');
await build({stdin: {contents: `import {makeTrackEffect} from './packages/timeline/src/defaults.ts';
export {makeTrackEffect};
export function actions(initial) {
 let state = initial;
 const set = fn => {state = {...state, ...fn(state)}};
 const api = {${source.slice(start, end)}};
 return {api, read: () => state};
}`, loader: 'ts', resolveDir: root}, outfile, bundle: true, platform: 'node', format: 'esm'});
const ts = await import(pathToFileURL(outfile));
const cases = [];
const initial = {name:'Oracle', fps:30, width:640, height:360, durationMs:10000,
 tracks:[{id:'a', name:'Audio', type:'audio', index:0, effects:[]}, {id:'v',name:'Video',type:'video',index:1}], clips:[]};
const {api, read} = ts.actions(initial);
function step(name, payload, args) {
 const before = structuredClone(read());
 api[name](...args);
 cases.push({name, payload, before, after: structuredClone(read())});
}
for (const type of ['gain','eq3','filter','compressor','fable','colorCorrection','videoBlur','sharpen','vignette','chromaKey']) {
 const effect = {...ts.makeTrackEffect(type), id: type};
 step('addTrackEffect', {trackId:'a',effect}, ['a',effect]);
}
for (const type of ['gain','eq3','filter','compressor','fable','colorCorrection','videoBlur','sharpen','vignette','chromaKey']) {
 step('addTrackEffect', {trackId:'v',effect:type}, ['v',type]);
 cases.at(-1).generated = true;
}
for (const [effectId, patch] of [['gain',{gainDb:0}],['gain',{}],['gain',{gainDb:4}],['gain',{enabled:false}],['missing',{gainDb:2}],['eq3',{midFreq:1200,midQ:2}],['fable',{params:{'fx.eq.lo':2}}]]) {
 step('updateTrackEffect',{trackId:'a',effectId,patch},['a',effectId,patch]);
}
for (const [oldIndex,newIndex] of [[-1,0],[0,-1],[10,0],[0,10],[0,0],[0,9],[9,0],[4,2],[2,5],[0.5,1.5],[0.2,0.7],[-0.5,1],[1,9.9]]) {
 step('moveTrackEffect',{trackId:'a',oldIndex,newIndex},['a',oldIndex,newIndex]);
}
for (const trackId of ['missing','v','a']) {
 step('removeTrackEffect',{trackId,effectId:'gain'},[trackId,'gain']);
 step('updateTrackEffect',{trackId,effectId:'missing',patch:{enabled:true}},[trackId,'missing',{enabled:true}]);
 step('moveTrackEffect',{trackId,oldIndex:0,newIndex:1},[trackId,0,1]);
}
// The store guards a patch against the first match, then maps all matches.
// Keep that behavior even for malformed documents with duplicate IDs.
for (const action of ['updateTrackEffect','moveTrackEffect']) {
 const duplicate = {...initial, tracks:[
  {id:'a',type:'audio',effects:[{id:'shared',type:'gain',enabled:true,gainDb:0}]},
  {id:'a',type:'audio',effects:[{id:'shared',type:'gain',enabled:true,gainDb:4},{id:'second',type:'gain',enabled:true,gainDb:2}]}
 ]};
 for (const value of [0,2]) {
  const state = ts.actions(structuredClone(duplicate));
  const payload = action === 'updateTrackEffect' ? {trackId:'a',effectId:'shared',patch:{gainDb:value}} : {trackId:'a',oldIndex:0,newIndex:1};
  const before = structuredClone(state.read());
  if (action === 'updateTrackEffect') state.api[action]('a','shared',payload.patch);
  else state.api[action]('a',0,1);
  cases.push({name:action,payload,before,after:state.read()});
 }
}
{
 const state = ts.actions({...initial,tracks:[{id:'a',effects:[
  {id:'shared',type:'gain',gainDb:0},{id:'shared',type:'gain',gainDb:4}
 ]}]});
 const before = structuredClone(state.read());
 state.api.updateTrackEffect('a','shared',{gainDb:0});
 cases.push({name:'updateTrackEffect',payload:{trackId:'a',effectId:'shared',patch:{gainDb:0}},before,after:state.read()});
}
{
 const state = ts.actions({...initial,tracks:[{id:'a',effects:Array.from({length:10000},(_,i)=>({id:`large-${i}`,type:'gain',enabled:true,gainDb:i % 24}))}]});
 for (const [name,payload,args] of [
  ['moveTrackEffect',{trackId:'a',oldIndex:0,newIndex:9999},['a',0,9999]],
  ['removeTrackEffect',{trackId:'a',effectId:'large-5000'},['a','large-5000']]
 ]) {
  const before = structuredClone(state.read());
  state.api[name](...args);
  cases.push({name,payload,before,after:structuredClone(state.read())});
 }
}
const actual = JSON.parse(await new Promise((resolve,reject) => {
 const child = spawn(binary,['--effects-oracle'],{env:{...process.env,QT_QPA_PLATFORM:'offscreen',QT_QUICK_BACKEND:'software'}});
 const chunks = [];
 child.stdout.on('data',chunk => chunks.push(chunk));
 child.stderr.on('data',chunk => process.stderr.write(chunk));
 child.on('error',reject);
 child.on('close',code => code === 0 ? resolve(Buffer.concat(chunks).toString('utf8')) : reject(new Error(`Native oracle exited ${code}`)));
 child.stdin.on('error',reject);
 child.stdin.end(JSON.stringify(cases));
}));
assert(cases.length > 0 && actual.length === cases.length);
for (let i=0;i<cases.length;++i) {
 if (cases[i].generated) {
  const added = actual[i].tracks[1].effects.at(-1);
  assert.match(added.id, /^[0-9a-f]{32}$/);
  added.id = cases[i].after.tracks[1].effects.at(-1).id;
 }
 assert.deepEqual(actual[i],cases[i].after,`${i}: ${cases[i].name}`);
}
console.log(`PASS ${cases.length} native/TimelineStore effect action comparisons`);
