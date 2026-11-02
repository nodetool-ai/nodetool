import { expect, it } from "vitest";
import { applyCpuLegacyEffects } from "../src/render/cpuLegacyEffects.js";

const identity = [{x: 0, y: 0}, {x: 1, y: 1}];
function grade(value: number, curves: {master?: typeof identity; r?: typeof identity}) {
  const pixels = {width: 1, height: 1, data: new Uint8ClampedArray([value, value, value, 255])};
  applyCpuLegacyEffects(pixels, [{id: "c", type: "curves", enabled: true, master: identity, ...curves}]);
  return [...pixels.data];
}
it("renders a red quarter-tone bend while leaving green and blue alone", () => {
  const result = grade(64, {r: [{x: 0, y: 0}, {x: 0.25, y: 0.4}, {x: 0.5, y: 0.5}, {x: 1, y: 1}]});
  expect(result[0]).toBeGreaterThanOrEqual(101); expect(result[0]).toBeLessThanOrEqual(103);
  expect(result.slice(1)).toEqual([64, 64, 255]);
});
it("preserves lifted black, lowered white and non-monotonic curves", () => {
  const master = [{x: 0, y: 0.2}, {x: 0.5, y: 0.8}, {x: 1, y: 0.3}];
  expect(Math.abs(grade(0, {master})[0]! - 51)).toBeLessThanOrEqual(1);
  expect(Math.abs(grade(255, {master})[0]! - 77)).toBeLessThanOrEqual(1);
  expect(grade(128, {master})[0]).toBeGreaterThan(200);
});
it("applies master before the channel curve and holds values past endpoints", () => {
  const master = [{x: 0.2, y: 0.3}, {x: 0.8, y: 0.7}];
  const r = [{x: 0, y: 1}, {x: 1, y: 0}];
  expect(Math.abs(grade(0, {master, r})[0]! - 179)).toBeLessThanOrEqual(1);
  expect(Math.abs(grade(255, {master, r})[0]! - 77)).toBeLessThanOrEqual(1);
});
