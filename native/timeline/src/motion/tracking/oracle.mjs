import { resolveAnimatedLayerProps } from '../../../../../packages/timeline/dist/render/sceneModel.js';
import { applySmoothingToSample } from '../../../../../packages/timeline/dist/mediaTrack.js';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const samples = [{sourceMs:0,x:.2,y:.3},{sourceMs:1000,x:.8,y:.9},{sourceMs:2000,x:.4}];
const output = execFileSync(process.argv[2], ['interpolationAndSmoothing'], {encoding:'utf8'});
const results = [...output.matchAll(/TRACK_SAMPLE (\{[^\n]+\})/g)].map(match => JSON.parse(match[1]));
assert.equal(results.length, 32);
for (const {time, smoothing, sample} of results) {
  const expected = applySmoothingToSample({samples}, time, smoothing);
  for (const key of ['x','y']) {
    if (expected[key] === undefined) assert.equal(sample[key], undefined);
    else assert.ok(Math.abs(sample[key] - expected[key]) < 1e-12);
  }
}
assert.throws(() => assert.ok(Math.abs(results[0].sample.x + 1 - samples[0].x) < 1e-12));

const sceneOutput = execFileSync(process.argv[2], ['sceneIntegration'], {encoding:'utf8'});
const scenes = [...sceneOutput.matchAll(/TRACK_SCENE (\{[^\n]+\})/g)].map(match => JSON.parse(match[1]));
assert.equal(scenes.length, 3);
const transform = {position:{x:10,y:20},scale:{x:2,y:3},rotation:0,anchor:{x:.5,y:.5}};
const clip = {id:'follower',startMs:1000,durationMs:4000,transform,trackBinding:{trackId:'track',mode:'position_scale',scale:1.5}};
const owner = {id:'owner',startMs:1000,durationMs:4000,inPointMs:200,speedMultiplier:2,currentAssetId:'asset'};
const tracking = {clips:[owner,clip],mediaTracks:[{id:'track',clipId:'owner',sourceAssetId:'asset',status:'ready',samples}]};
for (const row of scenes) {
  const expected = resolveAnimatedLayerProps({clip,transform,opacity:1},row.time,{width:row.width,height:row.height},undefined,tracking).transform;
  for (const [key,value] of Object.entries({x:expected.position.x,y:expected.position.y,sx:expected.scale.x,sy:expected.scale.y})) {
    assert.ok(Math.abs(row[key]-value)<1e-8, key);
  }
}
