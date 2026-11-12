import { expect, it } from "vitest";
import { exposeRgb } from "../src/render/exposure.js";
import { applyCpuLegacyEffects } from "../src/render/cpuLegacyEffects.js";
import { trackEffectsAsClipEffects } from "../src/render/trackEffects.js";
import { makeTrackEffect } from "../src/defaults.js";

it("doubles linear light rather than the encoded gray value", () => {
  const value = exposeRgb([0.5, 0.5, 0.5], 1)[0];
  expect(value).toBeCloseTo(0.685836, 5);
  expect(exposeRgb([0.5, 0.5, 0.5], -1)[0]).toBeCloseTo(0.360780, 5);
});
it("keeps an overexposed highlight ramp distinguishable through the shoulder", () => {
  const values = [0.7, 0.8, 0.9, 1].map(x => exposeRgb([x, x, x], 1, 1)[0]);
  expect(values.every(x => x < 1)).toBe(true);
  for (let i = 1; i < values.length; i++) { expect(values[i]).toBeGreaterThan(values[i - 1]!); }
  expect(exposeRgb([1, 0.5, 0], 1, 1)[2]).toBe(0);
});
it("leaves neutral pixels unchanged and whites leave shadows alone", () => {
  expect(exposeRgb([0.1, 0.4, 0.9])).toEqual([expect.closeTo(0.1), expect.closeTo(0.4), expect.closeTo(0.9)]);
  expect(exposeRgb([0.2, 0.2, 0.2], 0, 0, 1)[0]).toBeCloseTo(0.2);
  expect(exposeRgb([0.9, 0.9, 0.9], 0, 0, -1)[0]).toBeLessThan(0.8);
});
it("dispatches the CPU effect, preserves alpha and ignores disabled effects", () => {
  const pixels = {width: 2, height: 1, data: new Uint8ClampedArray([128, 128, 128, 255, 64, 64, 64, 128])};
  const source = pixels.data.slice();
  applyCpuLegacyEffects(pixels, [{id: "e", type: "exposure", enabled: true}]);
  expect(pixels.data).toEqual(source);
  applyCpuLegacyEffects(pixels, [{id: "e", type: "exposure", enabled: false, exposure: 1}]);
  expect(pixels.data).toEqual(source);
  applyCpuLegacyEffects(pixels, [{id: "e", type: "exposure", enabled: true, exposure: 1}]);
  expect(Math.abs(pixels.data[0]! - 176)).toBeLessThanOrEqual(1);
  expect(pixels.data[3]).toBe(255); expect(pixels.data[7]).toBe(128);
});
it("extracts optional track exposure without adding a pass to old tracks", () => {
  const track = makeTrackEffect("colorCorrection");
  if (track.type !== "colorCorrection") { throw new Error("Expected color correction"); }
  expect(trackEffectsAsClipEffects([track]).map(e => e.type)).toEqual(["color"]);
  const converted = trackEffectsAsClipEffects([{...track, exposure: 1, rolloff: 0.5, whites: -1}]);
  expect(converted[0]).toMatchObject({type: "exposure", exposure: 1, rolloff: 0.5, whites: -1});
});
it("blacks lifts or crushes the black point and leaves white alone", () => {
  expect(exposeRgb([0, 0, 0], 0, 0, 0, 1)[0]).toBeCloseTo(0.15);
  expect(exposeRgb([0, 0, 0], 0, 0, 0, -1)[0]).toBeCloseTo(-0.15);
  expect(exposeRgb([1, 1, 1], 0, 0, 0, 1)[0]).toBeCloseTo(1);
  expect(exposeRgb([0.5, 0.5, 0.5], 0, 0, 0, 1)[0]).toBeCloseTo(0.5 + 0.15 * 0.125);
  expect(exposeRgb([0.5, 0.5, 0.5], 0, 0, 0, 5)[0]).toBeCloseTo(0.5 + 0.15 * 0.125);
  const pixels = {width: 1, height: 1, data: new Uint8ClampedArray([0, 0, 0, 255])};
  applyCpuLegacyEffects(pixels, [{id: "e", type: "exposure", enabled: true, blacks: 1}]);
  expect(pixels.data[0]).toBe(38);
});
