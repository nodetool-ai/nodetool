import { expect, it } from "vitest";
import { applyCpuLegacyEffects } from "../src/render/cpuLegacyEffects.js";
import { hueSatCurvesNeutral, hueSatCurvesRgb, hueSatCurvesTransfer } from "../src/render/hueSatCurves.js";
import { hslToRgb, rgbToHsl } from "../src/render/secondaryColor.js";
import type { ClipHueSatCurvesEffect } from "../src/types.js";

const base: ClipHueSatCurvesEffect = {id: "h", type: "hueSatCurves", enabled: true};
const flat = (y: number) => [{x: 0, y}, {x: 1, y}];

it("is neutral without curves and with flat curves at 0.5", () => {
  expect(hueSatCurvesNeutral(base)).toBe(true);
  expect(hueSatCurvesNeutral({...base, hueVsSat: flat(0.5), satVsSat: flat(0.5)})).toBe(true);
  expect(hueSatCurvesNeutral({...base, lumaVsSat: flat(0.25)})).toBe(false);
  const table = hueSatCurvesTransfer(base);
  expect(table).toHaveLength(512);
  const rgb: [number, number, number] = [0.8, 0.3, 0.1];
  hueSatCurvesRgb(rgb, table).forEach((v, i) => expect(v).toBeCloseTo(rgb[i]!, 6));
  const pixels = {width: 1, height: 1, data: new Uint8ClampedArray([200, 80, 30, 255])};
  applyCpuLegacyEffects(pixels, [base]);
  expect([...pixels.data]).toEqual([200, 80, 30, 255]);
});

it("hue vs sat desaturates only the hues its curve lowers", () => {
  // Zero at red, neutral from yellow on.
  const effect = {...base, hueVsSat: [{x: 0, y: 0}, {x: 1 / 6, y: 0.5}, {x: 5 / 6, y: 0.5}, {x: 1, y: 0}]};
  const table = hueSatCurvesTransfer(effect);
  expect(rgbToHsl(hueSatCurvesRgb(hslToRgb(0, 0.8, 0.5), table))[1]).toBeCloseTo(0, 3);
  expect(rgbToHsl(hueSatCurvesRgb(hslToRgb(0.5, 0.8, 0.5), table))[1]).toBeCloseTo(0.8, 3);
});

it("hue vs hue rotates by the curve's offset in turns, wrapping through red", () => {
  const table = hueSatCurvesTransfer({...base, hueVsHue: flat(0.5 + 1 / 3)});
  expect(rgbToHsl(hueSatCurvesRgb([1, 0, 0], table))[0]).toBeCloseTo(1 / 3, 3);
  expect(rgbToHsl(hueSatCurvesRgb([0, 0, 1], table))[0]).toBeCloseTo(0, 3);
});

it("hue vs luma moves lightness by saturation, so gray stays put", () => {
  const table = hueSatCurvesTransfer({...base, hueVsLuma: flat(0.7)});
  expect(rgbToHsl(hueSatCurvesRgb(hslToRgb(0.6, 1, 0.4), table))[2]).toBeCloseTo(0.6, 3);
  hueSatCurvesRgb([0.4, 0.4, 0.4], table).forEach(v => expect(v).toBeCloseTo(0.4, 6));
});

it("luma vs sat and sat vs sat read lightness and saturation inputs", () => {
  const luma = hueSatCurvesTransfer({...base, lumaVsSat: [{x: 0, y: 0.5}, {x: 0.5, y: 0.5}, {x: 1, y: 0}]});
  expect(rgbToHsl(hueSatCurvesRgb(hslToRgb(0.3, 0.6, 0.3), luma))[1]).toBeCloseTo(0.6, 3);
  expect(rgbToHsl(hueSatCurvesRgb(hslToRgb(0.3, 0.6, 0.75), luma))[1]).toBeCloseTo(0.3, 2);
  const sat = hueSatCurvesTransfer({...base, satVsSat: [{x: 0, y: 0.5}, {x: 1, y: 1}]});
  expect(rgbToHsl(hueSatCurvesRgb(hslToRgb(0.3, 0.4, 0.5), sat))[1]).toBeCloseTo(0.4 * 1.4, 2);
});
