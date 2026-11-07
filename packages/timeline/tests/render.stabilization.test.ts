import { expect, it } from "vitest";
import { stabilizationAffine, stabilizationAnalysisMatches, stabilizationCurve, stabilizationMatrix, stabilizeImage } from "../src/render/stabilization.js";
import { resolveAnalysisEffects } from "../src/render/clipAnalysis.js";
import { applyCpuLegacyEffects } from "../src/render/cpuLegacyEffects.js";
import type { ClipStabilizeEffect, TimelineClip } from "../src/types.js";

const clip: TimelineClip = {id: "c", trackId: "v", name: "Video", mediaType: "video", sourceType: "imported",
  status: "generated", locked: false, versions: [], startMs: 1000, durationMs: 1000, inPointMs: 100, currentAssetId: "source"};
const effect: ClipStabilizeEffect = {id: "s", type: "stabilize", enabled: true, analysis: {
  version: 1, kind: "stabilize", source: {assetId: "source", mediaPath: ""}, rangeStartMs: 100, rangeEndMs: 1100,
  windowMs: 500, frameRate: 30, width: 256, height: 512, requiredZoom: 1.3, trackedFrames: 1,
  samples: [{timeMs: 100, x: .07, y: .03, angle: .1, scale: 1.02}, {timeMs: 140, x: -.04, y: 0, angle: 0, scale: 1}]
}};
const neutral = [1, 0, 0, 0, 1, 0];
it("preserves intentional pans and isolates camera cuts while reducing jitter", () => {
  const pan = Array.from({length: 90}, (_, i) => ({timeMs: i * 1000 / 30, x: i * .001, y: 0, angle: 0, logScale: 0, cut: i === 45}));
  const steady = stabilizationCurve(pan, 500, .75);
  expect(steady.requiredZoom).toBe(1); expect(steady.samples.every(sample => sample.x === 0)).toBe(true);
  const jitter = stabilizationCurve(pan.map((point, i) => ({...point, x: point.x + (i % 2 ? .01 : -.01)})), 500, .75);
  expect(jitter.requiredZoom).toBeGreaterThan(1.01);
  for (let i = 8; i < 37; i++) { expect(Math.abs(jitter.samples[i]!.x + (i % 2 ? .01 : -.01))).toBeLessThan(.002); }
  const cut = pan.map((point, i) => ({...point, x: i < 45 ? 0 : 10}));
  expect(stabilizationCurve(cut, 500, .75).requiredZoom).toBe(1);
});
it("handles the full bounded analysis interval without accumulating a false pan correction", () => {
  const path=Array.from({length:18000},(_,i)=>({timeMs:i*1000/30,x:i*.001,y:0,angle:0,logScale:0}));
  const curve=stabilizationCurve(path,500,.75); expect(curve.samples).toHaveLength(18000);
  expect(Math.max(...curve.samples.map(sample=>Math.abs(sample.x)))).toBeLessThan(.00001);
});
it("does not turn rotation jitter into translation after a long pan", () => {
  const path=Array.from({length:90},(_,i)=>({timeMs:i*1000/30,x:i*.001,y:0,angle:i%2 ? .02 : -.02,logScale:0}));
  const shifted=path.map(p=>({...p,x:p.x+20*Math.cos(p.angle)-10*Math.sin(p.angle),y:20*Math.sin(p.angle)+10*Math.cos(p.angle)}));
  const first=stabilizationCurve(path,500,.75),second=stabilizationCurve(shifted,500,.75);
  for (let i=8;i<82;i++) {
    expect(second.samples[i]!.x).toBeCloseTo(first.samples[i]!.x,7);
    expect(second.samples[i]!.y).toBeCloseTo(first.samples[i]!.y,7);
  }
});
it("maps source time deterministically in reverse order and holds between samples", () => {
  const first = stabilizationMatrix(clip, effect, 1000), second = stabilizationMatrix(clip, effect, 1040);
  expect(first).not.toEqual(second); expect(stabilizationMatrix(clip, effect, 1039)).toEqual(first);
  expect(stabilizationMatrix(clip, effect, 1040)).toEqual(second); expect(stabilizationMatrix(clip, effect, 1000)).toEqual(first);
  expect(resolveAnalysisEffects(clip, [effect], 1000)).toEqual([{id: "s", type: "stabilize", enabled: true, _matrix: first}]);
});
it("bounds portrait and cropped output without changing zoom frame by frame", () => {
  for (const maxZoom of [1, 1.05, 1.1, 1.5]) { for (const time of [1000, 1040]) {
    const matrix = stabilizationMatrix({...clip, crop: {left: .2, top: .1, right: .1, bottom: .15}}, {...effect, maxZoom}, time);
    for (const x of [0, 1]) { for (const y of [0, 1]) {
      const u = matrix[0] * x + matrix[1] * y + matrix[2], v = matrix[3] * x + matrix[4] * y + matrix[5];
      expect(u).toBeGreaterThanOrEqual(-1e-8); expect(u).toBeLessThanOrEqual(1 + 1e-8);
      expect(v).toBeGreaterThanOrEqual(-1e-8); expect(v).toBeLessThanOrEqual(1 + 1e-8);
    } }
  } }
  const sample = {timeMs: 0, x: 0, y: 0, angle: Math.PI / 2, scale: 1};
  const portrait = stabilizationAffine(sample, 2, 1, 1);
  expect(portrait[1]).toBeCloseTo(2); expect(portrait[3]).toBeCloseTo(-.5);
});
it("bypasses stale or absent analysis and zero strength", () => {
  expect(stabilizationAnalysisMatches(clip, effect)).toBe(true);
  for (const changed of [{...clip, currentAssetId: "new"}, {...clip, durationMs: 2000}]) {
    expect(stabilizationMatrix(changed, effect, 1000)).toEqual(neutral);
  }
  for (const changed of [{...effect, strength: 0}, {...effect, windowMs: 1000}, {...effect, analysis: undefined}]) {
    expect(stabilizationMatrix(clip, changed, 1000)).toEqual(neutral);
  }
});
it("reconstructs integer translations exactly and keeps premultiplied alpha valid", () => {
  const source = new Uint8ClampedArray(8 * 4 * 4);
  for (let i = 0; i < 32; i++) { source.set([i * 3, i * 2, i, 128], i * 4); }
  const target = source.slice(); stabilizeImage(source, target, 8, 4, [1, 0, 1 / 8, 0, 1, 0]);
  for (let y = 0; y < 4; y++) { for (let x = 0; x < 7; x++) {
    expect(target.slice((y * 8 + x) * 4, (y * 8 + x + 1) * 4)).toEqual(source.slice((y * 8 + x + 1) * 4, (y * 8 + x + 2) * 4));
  } }
  stabilizeImage(source, target, 8, 4, [.91, .02, .03, -.02, .91, .06]);
  for (let i = 0; i < target.length; i += 4) { expect(Math.max(...target.slice(i, i + 3))).toBeLessThanOrEqual(target[i + 3]!); }
  const pixels = {data: source.slice(), width: 8, height: 4}; applyCpuLegacyEffects(pixels, [effect]); expect(pixels.data).toEqual(source);
});
