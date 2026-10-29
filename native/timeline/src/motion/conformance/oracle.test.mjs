import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as scene from '@nodetool-ai/timeline/scene';
import { cropRectPx } from '@nodetool-ai/timeline';
import { loadExample } from '../shipped/oracle.mjs';

const root = path.resolve(import.meta.dirname, '../../../../..');
const relative = 'native/timeline/scripts/plan-conformance.mjs';
const original = fs.readFileSync(path.join(root, relative), 'utf8');
const source = original;
const start = source.indexOf('function oraclePlan(doc, timeMs, cache) {');
const end = source.indexOf('\nfunction compareFixture(', start);
assert(start >= 0 && end > start, 'must inspect the actual plan oracle function');
const dependencies = { ...scene, cropRectPx };
const oraclePlan = Function(...Object.keys(dependencies), `${source.slice(start, end)}; return oraclePlan;`)(...Object.values(dependencies));

function matrix(document, id, timeMs = 0) {
  const result = oraclePlan(document, timeMs, scene.createAnimationCompileCache());
  const layer = result.layers.find(item => item.clipId === id);
  assert(layer, `must inspect drawn layer ${id}`);
  return layer.matrix;
}

test('complete Voltra crop matrix uses the same kept picture as web drawing', () => {
  const { document } = loadExample('voltra');
  const before = JSON.stringify(document);
  for (const [id, time, expected] of [['S2_i41', 4967, 0.24], ['S4_i13', 14460, 0.2159375]]) {
    const actual = matrix(document, id, time)[0];
    assert(Math.abs(actual - expected) < 1e-6, `${id}: cropped web scale ${expected}, oracle ${actual}`);
  }
  assert.equal(JSON.stringify(document), before);
});

test('crop fitting preserves rounding, degenerate fallback, and uncropped layers', () => {
  const { document } = loadExample('voltra');
  const clip = structuredClone(document.clips.find(item => item.id === 'S2_i41'));
  Object.assign(clip, { id: 'crop', startMs: 0, durationMs: 1000, width: 1001, height: 703 });
  delete clip.parentId;
  delete clip.animations;
  clip.transform = scene.IDENTITY_TRANSFORM;
  const fixture = { ...document, clips: [clip] };
  for (const crop of [undefined, { left: 0.1, right: 0.2, top: 0.2, bottom: 0.1 },
    { left: 0.6, right: 0.4, top: 0, bottom: 0 }, { left: 0, right: 0, top: 0, bottom: 0 }]) {
    clip.crop = crop;
    const kept = cropRectPx(crop, 1001, 703);
    const expected = scene.buildTransformMatrix(scene.IDENTITY_TRANSFORM,
      scene.containBaseScale(kept.width, kept.height, document.width, document.height), document.width, document.height);
    assert.deepEqual(matrix(fixture, 'crop'), [...expected]);
  }
});
