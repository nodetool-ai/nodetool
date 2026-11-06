import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { compareStills, requireEditedDocuments, validateDocument } from "./check-inspector.mjs";

test("golden check rejects identical edits, mismatches and missing images", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "d6-golden-"));
  try {
    const base = path.join(directory,"base.png");
    const edited = path.join(directory,"edited.png");
    execFileSync("ffmpeg",["-v","error","-f","lavfi","-i","color=black:s=64x64","-frames:v","1",base]);
    execFileSync("ffmpeg",["-v","error","-f","lavfi","-i","color=white:s=64x64","-frames:v","1",edited]);
    assert.throws(() => compareStills(base,base,base),/edited preview must differ/);
    assert.throws(() => compareStills(base,edited,base),/export comparison/);
    assert.throws(() => compareStills(base,path.join(directory,"missing.png"),edited),/Missing still/);
    assert.equal(compareStills(base,edited,edited).pass,true);
  } finally { fs.rmSync(directory,{recursive:true,force:true}); }
});

test("golden check requires all UI snapshots and an actual edit at each stage", () => {
  const documents = Object.fromEntries(["base","color","curves","effects","group"].map(name => [name,{clips:[{id:"picture",effects:[]}]}]));
  assert.throws(() => requireEditedDocuments({}),/Missing UI document/);
  assert.throws(() => requireEditedDocuments(documents),/unchanged/);
});

test("export documents must carry the web track flags and curve point shape", () => {
  const document = {id:"d6",projectId:"native-prototype",name:"D6",width:640,height:360,fps:30,durationMs:1000,
    createdAt:"2026-01-01T00:00:00Z",updatedAt:"2026-01-01T00:00:00Z",markers:[],
    tracks:[{id:"v",name:"Video",type:"video",index:0,visible:true,locked:false}],
    clips:[{id:"c",name:"Picture",trackId:"v",mediaType:"image",sourceType:"imported",status:"generated",locked:false,versions:[],startMs:0,durationMs:1000,
      effects:[{id:"curve",type:"curves",enabled:true,master:[{x:0,y:0},{x:1,y:1}]}]}]};
  assert.doesNotThrow(() => validateDocument(document,"valid"));
  const badTrack = structuredClone(document); delete badTrack.tracks[0].visible;
  assert.throws(() => validateDocument(badTrack,"invalid"),/visible/);
  const badCurve = structuredClone(document); delete badCurve.clips[0].effects[0].master[0].y;
  assert.throws(() => validateDocument(badCurve,"invalid"),/master/);
});
