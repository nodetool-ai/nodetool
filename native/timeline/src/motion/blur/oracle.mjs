import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { clipSteppedTime } from '../../../../../packages/timeline/dist/render/temporal.js';
import { layerShutterTime, motionBlurSampleTimes, resolveFrameMotionBlur, resolveMotionBlur } from '../../../../../packages/timeline/dist/render/motionBlur.js';

const output = execFileSync(process.argv[2], ['samples'], { encoding: 'utf8' });
const rows = [...output.matchAll(/SHUTTER (\{[^\n]+\})/g)].map((match) => JSON.parse(match[1]));
assert.equal(rows.length, 5);
for (const row of rows) {
  const expected = resolveMotionBlur(row.options);
  assert.equal(row.samples, expected.samplesPerFrame);
  assert.equal(row.angle, expected.shutterAngle);
  const times = motionBlurSampleTimes(1234, 1000 / 30, row.options);
  assert.equal(row.times.length, times.length);
  for (let i = 0; i < times.length; i++) assert.ok(Math.abs(row.times[i] - times[i]) < 1e-9);
  assert.throws(() => assert.deepEqual(row.times.map((time) => time + 1), times));
}

const frameOutput = execFileSync(process.argv[2], ['frameCases'], { encoding: 'utf8' });
const layer = frameOutput.match(/LAYER_TIME\s+([\d.]+)/);
assert(layer);
assert.equal(Number(layer[1]), layerShutterTime({ motionBlur: { samplesPerFrame: 8, shutterAngle: 90 } }, 1000, 0, 8, 40));

const repeatOutput = execFileSync(process.argv[2], ['repeatedWindow'], { encoding: 'utf8' });
const repeat = repeatOutput.match(/REPEAT_SHUTTER\s+(\d+)\s+([\d.]+)/);
assert(repeat);
const repeatExpected = resolveFrameMotionBlur([{ id: 'c', trackId: 'v', mediaType: 'shape', startMs: 0, durationMs: 100,
  repeater: { count: 2, timeStepMs: 1000, positionStep: { x: 0, y: 0 } }, motionBlur: { samplesPerFrame: 4, shutterAngle: 180 } }], undefined, 1000, 40,
  [{ id: 'v', visible: true }]);
assert.equal(Number(repeat[1]), repeatExpected.samplesPerFrame);
assert.equal(Number(repeat[2]), repeatExpected.shutterAngle);

const sceneOutput = execFileSync(process.argv[2], ['sceneTapClocks'], { encoding: 'utf8' });
const sceneRows = [...sceneOutput.matchAll(/SCENE_TIME\s+([\d.]+)\s+([\d.]+)/g)];
assert.equal(sceneRows.length, 2);
for (const row of sceneRows) {
  const fps = Number(row[1]);
  const expected = layerShutterTime({ motionBlur: { samplesPerFrame: 4, shutterAngle: 180 } }, 1000, 0, 4, 1000 / fps) - 1000;
  assert.ok(Math.abs(Number(row[2]) - expected) < 1e-4);
}

const stepped = sceneOutput.match(/STEPPED_SOURCE\s+([\d.]+)/);
assert(stepped);
const steppedClip = { startMs: 1000, steppedTime: { fps: 6 }, motionBlur: { samplesPerFrame: 4, shutterAngle: 180 } };
const steppedAt = layerShutterTime(steppedClip, 1050, 0, 4, 1000 / 30);
assert.equal(Number(stepped[1]), clipSteppedTime(steppedClip, steppedAt) - steppedClip.startMs);
