import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clipSourceMsAt, cropRectPx, renderableReframe, resolveReframeCrop } from '@nodetool-ai/timeline';
import comparator, { cropComparisonCounts, resetCropComparisonCounts } from '../../../scripts/conformance/plan/crop.mjs';

const document = { width: 640, height: 360 };
const centeredClip = {
  width: 640, height: 360, startMs: 100, durationMs: 1000, inPointMs: 200,
  reframe: { mode: 'center', keyframes: [{ sourceMs: 0, x: .5, y: .5, zoom: 2 }] }
};

function webRect(clip, timeMs, canvas = document, track) {
  const reframe = renderableReframe(clip, track);
  const crop = resolveReframeCrop(reframe, clipSourceMsAt(clip, timeMs), {
    width: reframe.sourceWidth ?? clip.width ?? canvas.width,
    height: reframe.sourceHeight ?? clip.height ?? canvas.height
  }, canvas, track);
  const width = clip.width ?? canvas.width;
  const height = clip.height ?? canvas.height;
  const rect = cropRectPx(crop ?? clip.crop, width, height);
  return [rect.x / width, rect.y / height, rect.width / width, rect.height / height];
}

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
  assert.deepEqual(cropComparisonCounts(), { compared: 5 });
});

test('compares a centered 2x reframe against the web crop and rejects incorrect native rectangles', () => {
  resetCropComparisonCounts();
  const expected = webRect(centeredClip, 300);
  assert.deepEqual(expected, [.25, .25, .5, .5]);
  for (const actual of [[0, 0, 1, 1], [1, 1, 0, 0]]) {
    assert.deepEqual(comparator.layer({ clip: centeredClip, document, timeMs: 300, web: {}, native: { sourceRect: actual } }),
      expected.map((value, i) => `sourceRect[${i}] web ${value} native ${actual[i]}`));
  }
  assert.deepEqual(cropComparisonCounts(), { compared: 2 });
});

test('accepts a native rectangle matching the resolved reframe crop', () => {
  resetCropComparisonCounts();
  assert.deepEqual(comparator.layer({ clip: centeredClip, document, timeMs: 300, web: {},
    native: { sourceRect: webRect(centeredClip, 300) } }), []);
  assert.deepEqual(cropComparisonCounts(), { compared: 1 });
});

test('compares stale automatic framing as center mode while preserving manual zoom', () => {
  resetCropComparisonCounts();
  const clip = { ...centeredClip, currentAssetId: 'current', reframe: {
    ...centeredClip.reframe, mode: 'auto', sourceAssetId: 'stale',
    samples: [{ sourceMs: 0, x: .9, y: .1 }]
  } };
  assert.equal(renderableReframe(clip).mode, 'center');
  const expected = webRect(clip, 300);
  assert.deepEqual(expected, [.25, .25, .5, .5]);
  const context = { clip, document, timeMs: 300, web: {}, native: { sourceRect: expected } };
  assert.deepEqual(comparator.layer(context), []);
  assert.equal(comparator.layer({ ...context, native: { sourceRect: [0, 0, 1, 1] } }).length, 4);
  assert.deepEqual(cropComparisonCounts(), { compared: 2 });
});

test('resolves the selected media track at source time using reframe source dimensions', () => {
  resetCropComparisonCounts();
  const clip = { ...centeredClip, currentAssetId: 'current', speedMultiplier: 2,
    reframe: { mode: 'track', trackId: 'subject', sourceWidth: 1280, sourceHeight: 360 } };
  const track = { id: 'subject', clipId: 'c', sourceAssetId: 'current', kind: 'point', status: 'ready',
    sourceStartMs: 0, sourceEndMs: 800,
    samples: [{ sourceMs: 0, x: .25, y: .5 }, { sourceMs: 800, x: .75, y: .5 }] };
  const canvas = { ...document, mediaTracks: [{ ...track, id: 'other', samples: [] }, track] };
  assert.equal(clipSourceMsAt(clip, 300), 600);
  const expected = webRect(clip, 300, canvas, track);
  assert.deepEqual(expected, [.375, 0, .5, 1]);
  const context = { clip, document: canvas, timeMs: 300, web: {}, native: { sourceRect: expected } };
  assert.deepEqual(comparator.layer(context), []);
  assert.ok(comparator.layer({ ...context, native: { sourceRect: [0, 0, 1, 1] } }).length > 0);
  assert.deepEqual(cropComparisonCounts(), { compared: 2 });
});

test('falls back to the static crop when reframe dimensions cannot resolve a crop', () => {
  resetCropComparisonCounts();
  const clip = { ...centeredClip, crop: { left: .1, right: .2, top: .05, bottom: .15 },
    reframe: { ...centeredClip.reframe, sourceWidth: 0 } };
  const expected = webRect(clip, 300);
  assert.deepEqual(expected, [.1, .05, .7, .8]);
  const context = { clip, document, timeMs: 300, web: {}, native: { sourceRect: expected } };
  assert.deepEqual(comparator.layer(context), []);
  assert.ok(comparator.layer({ ...context, native: { sourceRect: [0, 0, 1, 1] } }).length > 0);
  assert.deepEqual(cropComparisonCounts(), { compared: 2 });
});
