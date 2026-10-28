// Compare with the actual TypeScript, without copied expectations. Relative
// numeric tolerance 1e-9 covers the existing native cubic-bezier evaluator.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../../..');
const bin=path.resolve(process.argv[2]);
const out=path.join(path.dirname(bin),'p2-functions.mjs');
await build({entryPoints:[path.join(root,'packages/timeline/src/automation.ts')],outfile:out,bundle:true,platform:'node',format:'esm'});
const web=await import(pathToFileURL(out));
let seed=32781;
const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0; return seed/4294967296;};
const req=[],expected=[];
function add(fn,args){req.push([fn,args]); expected.push(web[fn](...args));}
for(const kind of ['mixer','device','clip']) {
 const target={kind,param:'volumeDb',deviceId:'fx',property:'opacity'};
 add('automationTargetKey',[target]);
 for(const type of ['audio','midi','video','overlay','subtitle','chord']) for(const effects of [[],[{id:'fx'}]]) add('trackAcceptsAutomationTarget',[{type,effects},target]);
}
add('trackAcceptsAutomationTarget',[{type:'midi'},{kind:'device',deviceId:'instrument',param:'cutoff'}]);
const easings=['linear','hold','easeIn','easeOut','easeInOut','unknown','cubic-bezier(0.2,0.7,0.8,0.4)'];
for(let c=0;c<200;++c) {
 let t=0;
 const points=Array.from({length:c%9},(_,i)=>({timeMs:t+=c%7===0?0:rand()*1000,value:rand()*80-60,...(i%3?{easing:easings[c%easings.length]}:{})}));
 for(const time of [-10,0,10,rand()*t,t,t+10]) add('automationValueAt',[points,time,19]);
 for(const from of [-10,0,rand()*t,t,t+5]) for(const subdivideLinear of [false,true]) add('automationBreakpoints',[points,from,{maxStepMs:c%3===0?-2:c%3===1?10:200,subdivideLinear}]);
 add('addAutomationPoint',[points,{timeMs:-3,value:9,easing:'linear'}]);
 add('addAutomationPoint',[points,{timeMs:points[0]?.timeMs??0,value:8}]);
 add('addAutomationPoint',[points,{timeMs:(points[0]?.timeMs??0)+.499,value:8}]);
 for(const index of [-1,0,points.length-1,points.length]) {
  add('moveAutomationPoint',[points,index,rand()*t,rand()*10]);
  add('setAutomationPointEasing',[points,index,c%2?'hold':'linear']);
 }
 add('removeAutomationPoints',[points,[-1,0,2,2,100]]);
 add('automationPointsInRange',[points,10,t/2]);
}
const actual=JSON.parse(execFileSync(bin,['--json'],{input:JSON.stringify(req),encoding:'utf8',maxBuffer:64*1024*1024}));
if(process.argv.includes('--bad-input')) actual[0]='wrong-target';
function equal(a,b) {
 if(typeof b==='number') return typeof a==='number'&&Number.isFinite(a)&&Math.abs(a-b)<=1e-9*Math.max(1,Math.abs(b));
 if(b&&typeof b==='object') return a&&typeof a==='object'&&Object.keys(a).length===Object.keys(b).length&&Object.keys(b).every(k=>equal(a[k],b[k]));
 return a===b;
}
if(!req.length||actual.length!==expected.length) throw Error('Empty or incomplete comparison');
for(let i=0;i<req.length;++i) if(!equal(actual[i],expected[i])) throw Error(`${JSON.stringify(req[i])}: native=${JSON.stringify(actual[i])} web=${JSON.stringify(expected[i])}`);
console.log(`PASS ${req.length} automation.ts comparisons (relative tolerance 1e-9)`);
