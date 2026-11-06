import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const { resolveTimelineTarget } = await import(pathToFileURL(path.resolve(process.argv[2])));
const document = {tracks:[],clips:[],markers:[],mediaTracks:[{id:'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',clipId:'owner',sourceAssetId:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',kind:'point',status:'ready',name:'Existing track',sourceStartMs:0,sourceEndMs:1000,samples:[{sourceMs:0,x:.2,y:.3,unknownSample:73}],unknownTrack:42}],tempo:{bpm:95,offsetMs:32,unknownTempo:'retained'}};
const before = structuredClone(document);
const run = fs.mkdtempSync(path.join(os.tmpdir(),'tracking-reference-contract-'));
try {
  for (const [name,raw] of [['bare',document],['wrapped',{id:'sequence',document}]]) {
    const file = path.join(run,name+'.json'); fs.writeFileSync(file,JSON.stringify(raw));
    const resolved = await resolveTimelineTarget(file,{loadSequence:async()=>null});
    assert.deepEqual(resolved.document.mediaTracks,document.mediaTracks,name+' mediaTracks');
    assert.deepEqual(resolved.document.tempo,document.tempo,name+' tempo');
  }
  const resolved = await resolveTimelineTarget('sequence',{loadSequence:async()=>({id:'sequence',document})});
  assert.deepEqual(resolved.document.mediaTracks,document.mediaTracks);
  assert.deepEqual(resolved.document.tempo,document.tempo);
  assert.deepEqual(document,before);
} finally { fs.rmSync(run,{recursive:true,force:true}); }
