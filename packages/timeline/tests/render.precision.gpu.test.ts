import { describe, expect, it } from "vitest";
import { renderEffects } from "./renderEffectsGpu.js";

describe("effect precision and alpha", () => {
  it("bounds precision loss through inverse Levels adjustments", async () => {
    const data = new Uint8ClampedArray(256 * 4);
    for (let x = 0; x < 256; x++) data.set([x, x, x, 255], x * 4);
    const levels = {type: "levels" as const, enabled: true, inBlack: 0, inWhite: 1, outBlack: 0, outWhite: 1};
    const rendered = await renderEffects(256, 1, data, [{...levels, id: "square", gamma: 0.5}, {...levels, id: "root", gamma: 2}]);
    const values = Array.from({length: 256}, (_, x) => rendered[x * 4]!);
    const distinct = new Set(values).size;
    const maximumError = Math.max(...values.map((value, x) => Math.abs(value - x)));
    // Allow future precision improvements while catching a worse quantization floor.
    expect(distinct).toBeGreaterThanOrEqual(192);
    expect(maximumError).toBeLessThanOrEqual(11);
    expect(values.every((value, x) => x === 0 || value >= values[x - 1]!)).toBe(true);
  });

  it("keeps transparent source colors out of blurred edges over light and dark backgrounds", async () => {
    const clean = {width: 9, height: 1, data: new Uint8ClampedArray(36)};
    const hiddenRed = {width: 9, height: 1, data: new Uint8ClampedArray(36)};
    for (let x = 0; x < 9; x++) hiddenRed.data.set([255, 0, 0, 0], x * 4);
    clean.data.set([255, 255, 255, 128], 16);
    hiddenRed.data.set([255, 255, 255, 128], 16);
    const blur = { id: "blur", type: "blur" as const, enabled: true, radius: 2 };
    clean.data.set(await renderEffects(9, 1, clean.data, [blur]));
    hiddenRed.data.set(await renderEffects(9, 1, hiddenRed.data, [blur]));
    expect(hiddenRed.data).toEqual(clean.data);
    for (const background of [0, 255]) {
      for (let x = 0; x < 9; x++) {
        const alpha = clean.data[x * 4 + 3]! / 255;
        const expected = 255 * alpha + background * (1 - alpha);
        for (let c = 0; c < 3; c++) {
          const composite = clean.data[x * 4 + c]! * alpha + background * (1 - alpha);
          expect(Math.abs(composite - expected)).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});
