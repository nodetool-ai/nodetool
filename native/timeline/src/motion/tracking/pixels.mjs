import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareReferenceCli, cleanupReferenceCli, importReference } from './reference.mjs';
import { assertImportedTreatments } from '../pixels/oracle.mjs';
import { comparePairs, measure } from '../../render2d/check-example-stills.mjs';

const binary = path.resolve(process.argv[2]);
const hash = createHash('sha256').update(fs.readFileSync(binary)).digest('hex');
const run = fs.mkdtempSync(path.join(process.env.TMPDIR ?? os.tmpdir(), 'motion-tracking-'));
fs.symlinkSync(fileURLToPath(new URL('../../../../../node_modules',import.meta.url)),path.join(run,'node_modules'),'dir');
const cli = prepareReferenceCli(run);
const transform = {position:{x:0,y:0},scale:{x:1,y:1},rotation:0,anchor:{x:.5,y:.5}};
const base = {createdAt:'1970-01-01T00:00:00.000Z',updatedAt:'1970-01-01T00:00:00.000Z',id:'tracking',projectId:'native-prototype',name:'tracking',fps:30,width:640,height:360,durationMs:1000,
  markers:[],tracks:[{id:'v',type:'video',name:'Video',index:0,visible:true,locked:false}],
  clips:[{id:'owner',trackId:'v',mediaType:'shape',name:'Owner',startMs:0,durationMs:1000,inPointMs:100,speedMultiplier:2,currentAssetId:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    opacity:0,transform,shapeStyle:{kind:'rect',fill:'#000000',x:.45,y:.45,width:.1,height:.1}},
    {id:'follower',trackId:'v',mediaType:'shape',name:'Follower',startMs:0,durationMs:1000,opacity:1,transform,
      shapeStyle:{kind:'rect',fill:'#ff8800',x:.45,y:.45,width:.1,height:.1},
      trackBinding:{trackId:'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',mode:'position_scale',scale:1.3,smoothing:.3,offset:{x:11,y:-7}}}],
  mediaTracks:[{id:'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',clipId:'owner',sourceAssetId:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',kind:'point',status:'ready',name:'Existing track',sourceStartMs:0,sourceEndMs:2000,
    samples:[{sourceMs:0,x:.2,y:.3},{sourceMs:1000,x:.8,y:.6},{sourceMs:2000,x:.5,y:.8}]}]};
base.clips.push({id:'import-source',trackId:'v',mediaType:'image',name:'Import source',startMs:0,durationMs:1000,opacity:0,transform,mediaPath:fileURLToPath(new URL('../../preview/effects/fixtures/source-pattern.png',import.meta.url))});
for (const clip of base.clips) Object.assign(clip,{sourceType:'imported',status:'generated',locked:false,versions:[]});
const rows = [];
try {
for (const mode of ['position','position_scale']) {
  const document = structuredClone(base);
  document.clips[1].trackBinding.mode = mode;
  if (mode === 'position_scale') document.clips[1].steppedTime = {fps:6};
  const directory = path.join(run,mode); fs.mkdirSync(directory);
  const input = path.join(directory,'input'); fs.mkdirSync(input);
  const file = path.join(input,'tracking.json'); const original = JSON.stringify(document); fs.writeFileSync(file,original);
  const web = path.join(directory,'web');
  importReference(file,[21,0,12],web,directory,cli);
  assertImportedTreatments(document,JSON.parse(fs.readFileSync(path.join(web,'tracking.imported.json'),'utf8')));
  const native = path.join(directory,'native');
  execFileSync(binary,[file,'--stills',native,'--still-frames','21,0,12','--decode','sw'],{timeout:180000,stdio:'pipe'});
  assert.equal(fs.readFileSync(file,'utf8'),original);
  const comparison = comparePairs([21,0,12],path.join(web,'stills'),native,40);
  assert(comparison.pass,`${mode}: ${JSON.stringify(comparison)}`);
  for (const frame of [21,0,12]) {
    const fresh = path.join(directory,`fresh-${frame}`);
    execFileSync(binary,[file,'--stills',fresh,'--still-frames',String(frame),'--decode','sw'],{timeout:180000,stdio:'pipe'});
    const png = `frame_${String(frame).padStart(6,'0')}.png`;
    assert.deepEqual(fs.readFileSync(path.join(native,png)),fs.readFileSync(path.join(fresh,png)));
  }
  for (const directory of [native,path.join(web,'stills')]) assert(measure(path.join(directory,'frame_000000.png'),path.join(directory,'frame_000021.png')) < 60,'track must change visible pixels');
  rows.push({mode,comparison});
}
assert.equal(rows.length,2);
assert.equal(createHash('sha256').update(fs.readFileSync(binary)).digest('hex'),hash);
fs.writeFileSync(path.join(run,'report.json'),JSON.stringify({hash,rows},null,2));
console.log(JSON.stringify({run,hash,rows}));

} finally { cleanupReferenceCli(cli); }
