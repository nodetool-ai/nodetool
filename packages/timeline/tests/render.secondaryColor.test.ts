import { expect, it } from "vitest";
import { ImageData } from "@napi-rs/canvas";
import { applyCpuLegacyEffects } from "../src/render/cpuLegacyEffects.js";
import { hslToRgb, rgbToHsl, secondaryCoverage, secondaryCurveTransfer, secondaryRgb } from "../src/render/secondaryColor.js";
import type { ClipSecondaryColorEffect } from "../src/types.js";

const base: ClipSecondaryColorEffect = {id: "secondary", type: "secondaryColor", enabled: true};
it("selects across red's hue seam and feathers only outside the hue core", () => {
  const effect = {...base, hueWidth: 20, hueSoftness: 20};
  expect(secondaryCoverage([359 / 360, 1, 0.5], effect)).toBe(1);
  expect(secondaryCoverage([1 / 360, 1, 0.5], effect)).toBe(1);
  expect(secondaryCoverage([30 / 360, 1, 0.5], effect)).toBeCloseTo(0.5);
  expect(secondaryCoverage([40 / 360, 1, 0.5], effect)).toBeCloseTo(0);
  expect(secondaryCoverage([0, 0, 0.5], effect)).toBe(0);
});
it("intersects soft saturation and lightness ranges without altering alpha", () => {
  const effect = {...base, saturationMin: 0.5, lightnessMax: 0.5, rangeSoftness: 0.2, hueShift: 120};
  expect(secondaryCoverage([0, 0.4, 0.6], effect)).toBeCloseTo(0.25);
  expect(secondaryCoverage([0, 0.5, 0.5], {...effect, saturationMin: 0.8, saturationMax: 0.2})).toBe(0);
  const pixels = new ImageData(new Uint8ClampedArray([255, 0, 0, 128, 0, 0, 255, 255]), 2, 1);
  applyCpuLegacyEffects(pixels, [{...base, hueWidth: 20, hueShift: 120}]);
  expect([...pixels.data]).toEqual([0, 255, 0, 128, 0, 0, 255, 255]);
});
it("bypasses neutral and disabled effects exactly, including hidden RGB", () => {
  const pixels = new ImageData(new Uint8ClampedArray([17, 93, 201, 1, 255, 0, 0, 0]), 2, 1);
  const original = pixels.data.slice();
  applyCpuLegacyEffects(pixels, [base, {...base, enabled: false, hueShift: 120}]);
  expect(pixels.data).toEqual(original);
});
it("wraps sparse hue curves continuously with a neutral saturation curve", () => {
  const effect = {...base, hueCurve: [{x: 0.2, y: 0.3}, {x: 0.8, y: 0.7}]};
  const table = secondaryCurveTransfer(effect);
  expect(table[0]).toEqual(table[255]);
  expect(table[0]?.[0]).toBeCloseTo(0.5);
  expect(table[0]?.[1]).toBe(0.5);
  const left = secondaryRgb(hslToRgb(0.999, 0.8, 0.4), effect, table);
  const right = secondaryRgb(hslToRgb(0.001, 0.8, 0.4), effect, table);
  expect(Math.max(...left.map((v, i) => Math.abs(v - (right[i] ?? 0))))).toBeLessThan(0.02);
});
it("applies hue versus hue and hue versus saturation independently", () => {
  const hue = {...base, hueCurve: [{x: 0, y: 5 / 6}]};
  const mapped = secondaryRgb([1, 0, 0], hue, secondaryCurveTransfer(hue));
  expect(mapped[0]).toBeCloseTo(0); expect(mapped[1]).toBeCloseTo(1); expect(mapped[2]).toBeCloseTo(0);
  const saturation = {...base, saturationCurve: [{x: 0, y: 0.25}]};
  expect(secondaryRgb([1, 0, 0], saturation, secondaryCurveTransfer(saturation))).toEqual([0.75, 0.25, 0.25]);
  expect(rgbToHsl([0, 0, 1])).toEqual([2 / 3, 1, 0.5]);
});
