import { expect, it } from "vitest";
import { deflickerAnalysisMatches, deflickerCurve, deflickerStops } from "../src/render/clipAnalysis.js";
import { resolveAnimatedLayerProps } from "../src/render/sceneModel.js";
import type { ClipDeflickerEffect, TimelineClip } from "../src/types.js";

const clip: TimelineClip = {id: "c", trackId: "v", name: "Video", mediaType: "video", sourceType: "imported",
  status: "generated", locked: false, versions: [], startMs: 1000, durationMs: 1000, inPointMs: 100, currentAssetId: "source"};
const effect: ClipDeflickerEffect = {id: "d", type: "deflicker", enabled: true, analysis: {
  version: 1, source: {assetId: "source", mediaPath: ""}, rangeStartMs: 100, rangeEndMs: 1100,
  windowMs: 500, maxCorrection: 1, frameRate: 30,
  samples: [{timeMs: 100, stops: 1}, {timeMs: 140, stops: -1}, {timeMs: 250, stops: .5}]
}};

it("reduces alternating flicker without assuming playback order", () => {
  const samples = Array.from({length: 90}, (_, i) => ({timeMs: i * 1000 / 30, logLuma: -2 + (i % 2 ? .5 : -.5)}));
  const curve = deflickerCurve(samples, 500, 1);
  for (let i = 8; i < 82; i++) { expect(Math.abs(samples[i]!.logLuma + curve[i]!.stops + 2)).toBeLessThan(.05); }
  const forward = [1000, 1040, 1150].map(time => deflickerStops(clip, effect, time));
  expect([1150, 1040, 1000].map(time => deflickerStops(clip, effect, time))).toEqual(forward.toReversed());
  expect(deflickerStops(clip, effect, 1039)).toBe(1);
});
it("preserves nonlinear fades and isolates scene cuts", () => {
  const fade = Array.from({length: 60}, (_, i) => ({timeMs: i * 30, logLuma: -6 + 4 * (i / 59) ** 2}));
  expect(deflickerCurve(fade, 500, 1).every(sample => sample.stops === 0)).toBe(true);
  const cut = Array.from({length: 60}, (_, i) => ({timeMs: i * 30, logLuma: i < 30 ? -4 : -1, cut: i === 30}));
  expect(deflickerCurve(cut, 500, 1).every(sample => sample.stops === 0)).toBe(true);
  const noisyCut = cut.map((sample, i) => ({...sample, logLuma: sample.logLuma + (i % 2 ? .3 : -.3)}));
  const isolated = deflickerCurve(noisyCut, 500, 1);
  for (const index of [28, 29, 30, 31]) {
    expect(Math.abs(noisyCut[index]!.logLuma + isolated[index]!.stops - cut[index]!.logLuma)).toBeLessThan(.15);
  }
  const mixed = fade.map((sample, i) => ({...sample, logLuma: sample.logLuma + (i % 2 ? .5 : -.5)}));
  const corrected = deflickerCurve(mixed, 500, .25);
  expect(corrected.every(sample => Math.abs(sample.stops) <= .25)).toBe(true);
});
it("rejects stale source, interval and analysis settings, while strength stays interactive", () => {
  expect(deflickerAnalysisMatches(clip, effect)).toBe(true);
  expect(deflickerAnalysisMatches({...clip, currentAssetId: "replacement"}, effect)).toBe(false);
  expect(deflickerAnalysisMatches({...clip, inPointMs: 101}, effect)).toBe(false);
  expect(deflickerAnalysisMatches({...clip, durationMs: 500}, effect)).toBe(true);
  expect(deflickerAnalysisMatches(clip, {...effect, windowMs: 1000})).toBe(false);
  expect(deflickerStops(clip, {...effect, strength: .25}, 1000)).toBe(.25);
  expect(deflickerStops(clip, {...effect, analysis: undefined}, 1000)).toBe(0);
});
it("resolves source samples through remapping and the shared render scene", () => {
  const reversed = {...clip, timeRemap: {keyframes: [{t: 0, sourceMs: 1100}, {t: 1, sourceMs: 100}]}};
  expect(deflickerStops(reversed, effect, 2000)).toBe(1);
  const props = resolveAnimatedLayerProps({clip: {...clip, effects: [effect]}, opacity: 1}, 1040, {width: 64, height: 36, fps: 30});
  expect(props.effects).toEqual([{id: "d", type: "exposure", enabled: true, exposure: -1}]);
});
it("handles a long clip in linear time and leaves black frames unchanged", () => {
  const samples = Array.from({length: 18000}, (_, i) => ({timeMs: i * 1000 / 240, logLuma: i % 2 ? -10 : -12}));
  expect(deflickerCurve(samples, 2000, 3).every(sample => sample.stops === 0)).toBe(true);
});
