import { expect, it } from "vitest";
import { applyCpuLegacyEffects } from "../src/render/cpuLegacyEffects.js";

function edge() {
  const width = 64, height = 16, data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const value = x < 32 ? 100 : 160;
    data.set([value, value, value, 255], (y * width + x) * 4);
  }
  return {width, height, data};
}
const sharpen = {id: "s", type: "sharpen" as const, enabled: true, amount: 1, radius: 1};
it("widens the sharpening halo when only radius changes", () => {
  const narrow = edge(), wide = edge();
  applyCpuLegacyEffects(narrow, [sharpen]);
  applyCpuLegacyEffects(wide, [{...sharpen, radius: 8}]);
  expect(narrow.data[(8 * 64 + 35) * 4]).toBe(160);
  expect(wide.data[(8 * 64 + 35) * 4]).toBeGreaterThan(160);
  expect(wide.data[(8 * 64 + 28) * 4]).toBeLessThan(100);
  expect(wide.data[(8 * 64 + 8) * 4]).toBe(100);
});
it.each([{amount: 0}, {radius: 0}, {threshold: 1}, {enabled: false}])("keeps a neutral sharpen unchanged: %o", patch => {
  const pixels = edge(), original = pixels.data.slice();
  applyCpuLegacyEffects(pixels, [{...sharpen, radius: 8, ...patch}]);
  expect(pixels.data).toEqual(original);
});
