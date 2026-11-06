import { ImageData } from "@napi-rs/canvas";
import { expect, it } from "vitest";
import { applyCpuLegacyEffects } from "../src/render/cpuLegacyEffects.js";
import type { ClipDebandEffect } from "../src/types.js";

const effect: ClipDebandEffect = {id: "d", type: "deband", enabled: true, strength: 1, range: 16, threshold: 0.04, dither: 1};
function banded(): ImageData {
  const data = new Uint8ClampedArray(256 * 16 * 4);
  for (let y = 0; y < 16; y++) { for (let x = 0; x < 256; x++) {
    const value = Math.floor(x / 16) * 4;
    data.set([value, value, value, 255], (y * 256 + x) * 4);
  } }
  return new ImageData(data, 256, 16);
}
it("reconstructs intermediate dark-ramp levels and remains deterministic", () => {
  const first = banded(), second = banded();
  applyCpuLegacyEffects(first, [effect]); applyCpuLegacyEffects(second, [effect]);
  expect(first.data).toEqual(second.data);
  const levels = new Set(Array.from({length: 4096}, (_, i) => first.data[i * 4]));
  expect(levels.size).toBeGreaterThan(40);
  const withoutDither = banded(); applyCpuLegacyEffects(withoutDither, [{...effect, dither: 0}]);
  expect(first.data).not.toEqual(withoutDither.data);
  for (let i = 0; i < first.data.length; i += 4) {
    expect(first.data[i]).toBe(first.data[i + 1]); expect(first.data[i]).toBe(first.data[i + 2]);
    expect(first.data[i + 3]).toBe(255);
  }
});
it("preserves hard edges and neutral or disabled settings", () => {
  const source = banded();
  for (let i = 0; i < source.data.length; i += 4) { const v = i % (256 * 4) < 128 * 4 ? 0 : 255; source.data.set([v, v, v, 255], i); }
  const original = source.data.slice();
  applyCpuLegacyEffects(source, [effect]); expect(source.data).toEqual(original);
  const neutral = banded(), before = neutral.data.slice();
  applyCpuLegacyEffects(neutral, [{...effect, strength: 0}, {...effect, enabled: false}]);
  expect(neutral.data).toEqual(before);
});
it("preserves alpha and excludes hidden color from its neighborhood", () => {
  const pixels = new ImageData(new Uint8ClampedArray([255, 0, 0, 0, 255, 255, 255, 128, 255, 255, 255, 255]), 3, 1);
  applyCpuLegacyEffects(pixels, [effect]);
  expect([...pixels.data]).toEqual([0, 0, 0, 0, 255, 255, 255, 128, 255, 255, 255, 255]);
});
