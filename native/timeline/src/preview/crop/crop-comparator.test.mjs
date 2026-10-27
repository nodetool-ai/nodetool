import assert from 'node:assert/strict';
import { test } from 'node:test';
import comparator, { cropComparisonCounts, resetCropComparisonCounts } from '../../../scripts/conformance/plan/crop.mjs';

test('compares snapped crops, defaults and degenerate crops and detects changed UVs', () => {
  resetCropComparisonCounts();
  const document = { width: 640, height: 360 };
  const clip = { width: 101, height: 99, crop: { left: .1, right: .2, top: .05, bottom: .15 } };
  const context = { clip, document, web: {}, native: { sourceRect: [10 / 101, 4 / 99, 71 / 101, 79 / 99] } };
  assert.deepEqual(comparator.layer(context), []);
  assert.ok(comparator.layer({ ...context, native: {} }).some(diff => diff.includes('sourceRect')));
  assert.deepEqual(comparator.layer({ ...context, clip: {}, native: {} }), []);
  assert.deepEqual(comparator.layer({ ...context, clip: { ...clip, crop: { left: .8, right: .2, top: 0, bottom: 0 } }, native: {} }), []);
  assert.deepEqual(comparator.layer({ ...context, web: { clip: { ...clip, crop: undefined } }, native: {} }), []);
  assert.deepEqual(cropComparisonCounts(), { compared: 5, skippedReframes: 0 });
});

test('counts and skips every present reframe including stale automatic framing', () => {
  resetCropComparisonCounts();
  for (const reframe of [{ mode: 'center' }, { mode: 'auto', sourceAssetId: 'stale' }]) {
    assert.deepEqual(comparator.layer({ clip: { reframe }, web: {}, native: { sourceRect: [1, 1, 0, 0] }, document: {} }), []);
  }
  assert.deepEqual(cropComparisonCounts(), { compared: 0, skippedReframes: 2 });
});
