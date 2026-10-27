// Real web offline render. No alignment, rescaling, or skipped samples.
// Absolute tolerance: 1e-6 for every case.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';
import * as webAudio from 'node-web-audio-api';
import { sampleParam, rampAt, error, interleaved, pan, biquad } from './dsp-reference.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../../..');
const binary = path.resolve(process.argv[2]);
const work = path.join(path.dirname(binary), 'p2-oracle', String(process.pid));
fs.mkdirSync(work, { recursive: true });
Object.assign(globalThis, webAudio);

// Only out-of-scope MIDI/worklet/browser host imports are stubbed. The render,
// graph, effect nodes, fades, clip selection and IR generator are real web code.
await build({
  entryPoints: [path.join(root, 'web/src/components/timeline/render/renderAudio.ts')],
  outfile: path.join(work, 'web-render.mjs'), bundle: true, platform: 'node', format: 'esm',
  alias: { '@nodetool-ai/timeline': path.join(root, 'packages/timeline/src/index.ts') },
  plugins: [{ name: 'no-instruments', setup(b) {
    b.onResolve({ filter: /(?:fableFxUnit|samplerAudio|vstRender|registerFablesynthDevices|liveDevice)$/ }, args =>
      ({ path: args.path, namespace: 'out-of-scope' }));
    b.onLoad({ filter: /.*/, namespace: 'out-of-scope' }, () => ({ contents: `
      export const liveDeviceFactory = () => undefined;
      export const usesFableFx = () => false;
      export const preloadFableFx = async () => {};
      export const buildFableFxNodes = () => { throw Error('fable out of scope'); };
      export const disposeFableFxNodes = () => {};
      export const getSamplerAudio = () => { throw Error('MIDI out of scope'); };
      export const renderVstBuffer = () => { throw Error('VST out of scope'); };
    ` }));
  } }]
});
await build({entryPoints:[path.join(root,'packages/timeline/src/automation.ts')],outfile:path.join(work,'automation.mjs'),bundle:true,platform:'node',format:'esm'});
const { automationBreakpoints } = await import(pathToFileURL(path.join(work,'automation.mjs')));
const { renderTimelineAudio } = await import(pathToFileURL(path.join(work, 'web-render.mjs')));

function wav(samples, rate) {
  const out = Buffer.alloc(44 + samples.length * 4);
  out.write('RIFF'); out.writeUInt32LE(out.length - 8, 4); out.write('WAVEfmt ', 8);
  out.writeUInt32LE(16, 16); out.writeUInt16LE(3, 20); out.writeUInt16LE(2, 22);
  out.writeUInt32LE(rate, 24); out.writeUInt32LE(rate * 8, 28);
  out.writeUInt16LE(8, 32); out.writeUInt16LE(32, 34);
  out.write('data', 36); out.writeUInt32LE(samples.length * 4, 40);
  for (let i = 0; i < samples.length; ++i) { out.writeFloatLE(samples[i], 44 + 4 * i); }
  return out;
}

const rate=48000;
const source=new Float32Array(rate*2);
for(let i=0;i<rate;i++) {
 source[2*i]=.25*Math.sin(i*2*Math.PI*227/rate);
 source[2*i+1]=.19*Math.cos(i*2*Math.PI*733/rate);
}
const audio=wav(source,rate);
const mediaPath=path.join(work,'source.wav'); fs.writeFileSync(mediaPath,audio);
globalThis.fetch=async url=>{if(url!=='p2:source')throw Error(`Unexpected fetch ${url}`);return new Response(audio);};
const points=(a,b,easing='linear')=>[{timeMs:0,value:a},{timeMs:500,value:b,easing},{timeMs:850,value:a}];
const lane=(target,ps,enabled=true)=>({id:'lane',target,points:ps,enabled});
const mixer=param=>({kind:'mixer',param});
const device=(id,param)=>({kind:'device',deviceId:id,param});
const cases=[
 {name:'volume',lanes:[lane(mixer('volumeDb'),points(-24,3))]},
 {name:'pan',lanes:[lane(mixer('pan'),points(-1,1))]},
 {name:'eased',lanes:[lane(mixer('volumeDb'),points(-30,0,'easeInOut'))]},
 {name:'hold',lanes:[lane(mixer('volumeDb'),points(-20,0,'hold'))]},
 {name:'disabled',lanes:[lane(mixer('volumeDb'),points(-20,6),false)]},
 {name:'gain-insert',effects:[{id:'gain',type:'gain',enabled:true,gainDb:0}],lanes:[lane(device('gain','gainDb'),points(-18,3,'easeOut'))]},
 {name:'filter-insert',effects:[{id:'filter',type:'filter',enabled:true,mode:'lowpass',frequency:1000,q:1}],lanes:[lane(device('filter','frequency'),points(200,4000,'easeIn'))]},
 {name:'combined',effects:[{id:'gain',type:'gain',enabled:true,gainDb:0}],lanes:[lane(mixer('volumeDb'),points(-12,0)),lane(mixer('pan'),points(-.7,.8)),lane(device('gain','gainDb'),points(-6,3))]},
 {name:'picture-ignored',trackType:'video',lanes:[lane(mixer('volumeDb'),points(-20,6))]},
];
let compared=0,passed=true;

for(const test of cases) {
 const doc={name:test.name,fps:30,width:64,height:64,durationMs:1100,
 tracks:[{id:'track',name:'Audio',type:test.trackType??'audio',index:0,visible:true,locked:false,effects:test.effects??[],automation:test.lanes}],
 clips:[{id:'clip',trackId:'track',mediaType:test.trackType==='video'?'video':'audio',status:'generated',startMs:0,durationMs:1000,inPointMs:0,currentAssetId:'source',mediaPath}],master:{volumeDb:0}};
 const ref=await renderTimelineAudio({...doc,sampleRate:rate,resolveUrl:async()=>'p2:source'});
 if(!ref)throw Error('Empty web render');
 const actualWeb=interleaved(ref);
 if(['pan','combined','filter-insert'].includes(test.name)) {
  const controlDoc=structuredClone(doc);
  // This control follows the entire real clip/fade/gain path up to the panner or filter.
  controlDoc.tracks[0].automation=controlDoc.tracks[0].automation.filter(l=>l.target.param!=='pan'&&l.target.param!=='frequency');
  if(test.name==='filter-insert')controlDoc.tracks[0].effects=[];
  const input=interleaved(await renderTimelineAudio({...controlDoc,sampleRate:rate,resolveUrl:async()=>'p2:source'}));
  const driving=test.lanes.find(l=>l.target.param===(test.name==='filter-insert'?'frequency':'pan'));
  const bps=automationBreakpoints(driving.points,0,{maxStepMs:10,subdivideLinear:test.name==='filter-insert'});
  const values=await sampleParam(bps,ref.length);
  let nativeValues;
  if(test.name!=='filter-insert') {
   nativeValues=JSON.parse(execFileSync(path.join(path.dirname(binary),'tst_automation'),['--json'],{
    input:JSON.stringify([['panSamples',[driving.points,ref.length,rate]]]),encoding:'utf8',maxBuffer:16*1024*1024,timeout:15000}))[0];
   if(nativeValues.length!==values.length)throw Error('Incomplete ParameterSource comparison');
  }
  let paramError=0;
  for(let i=0;i<values.length;i++)paramError=Math.max(paramError,Math.abs(values[i]-(nativeValues?nativeValues[i]:rampAt(bps,i*1000/rate))));
  const alternative=test.name==='filter-insert'?biquad(input,values):pan(input,values,true);
  if(process.argv.includes('--bad-reference'))alternative[500]+=0.01;
  const referenceError=error(alternative,actualWeb);
  const proved=paramError<=(test.name==='filter-insert'?2.5e-4:0) && referenceError.max<=1e-6;
  console.log(`${proved?'PASS':'FAIL'} ${test.name} independent proof: param=${paramError} reference=${referenceError.max}`);
  passed&&=proved;
 }
 if(process.argv.includes('--disable-native'))doc.tracks[0].automation=[];
 const fixture=path.join(work,test.name+'.json'), output=path.join(work,test.name+'.f32');
 fs.writeFileSync(fixture,JSON.stringify(doc));
 execFileSync(binary,[fixture,output,String(rate)],{env:{...process.env,QT_QPA_PLATFORM:'offscreen'},timeout:15000});
 const bytes=fs.readFileSync(output),channels=[ref.getChannelData(0),ref.getChannelData(1)];
 if(bytes.length!==ref.length*8)throw Error('Length mismatch');
 let max=0,frame=0,energy=0;
 for(let i=0;i<ref.length;i++)for(let c=0;c<2;c++) {
  const a=bytes.readFloatLE((2*i+c)*4),b=channels[c][i];
  if(!Number.isFinite(a)||!Number.isFinite(b))throw Error('Non-finite sample');
  if(Math.abs(a-b)>max){max=Math.abs(a-b);frame=i;}
  energy+=b*b;
 }
 const tolerance=1e-6;
 const pass=max<=tolerance&&energy>0;
 console.log(`${pass?'PASS':'FAIL'} ${test.name}: max=${max} frame=${frame} tolerance=${tolerance}`);
 passed&&=pass; compared+=energy;
}
if(!(compared>0))throw Error('Empty comparison');
process.exitCode=passed?0:1;
