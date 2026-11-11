import { describe, expect, it } from "vitest";
import { applyCpuLegacyEffects } from "../src/render/cpuLegacyEffects.js";

function brightSquare() {
  const width = 32, height = 32;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const bright = x >= 12 && x < 20 && y >= 12 && y < 20 ? 255 : 0;
      data.set([bright, bright, bright, 255], i);
    }
  }
  return {width, height, data};
}

describe("effect control sensitivity", () => {
  it("tints the glow halo while preserving the original image", () => {
    const red = brightSquare(), blue = brightSquare();
    const glow = {id: "glow", type: "glow" as const, enabled: true, radius: 8, intensity: 1};
    applyCpuLegacyEffects(red, [{...glow, color: "#ff0000"}]);
    applyCpuLegacyEffects(blue, [{...glow, color: "#0000ff"}]);
    const halo = (16 * 32 + 10) * 4;
    expect(red.data[halo]).toBeGreaterThan(0);
    expect(red.data[halo + 1]).toBe(0);
    expect(red.data[halo + 2]).toBe(0);
    expect(blue.data[halo]).toBe(0);
    expect(blue.data[halo + 2]).toBeGreaterThan(0);
    const center = (16 * 32 + 16) * 4;
    expect([...red.data.slice(center, center + 4)]).toEqual([255, 255, 255, 255]);
  });

  it("preserves source-colored glow when tint is absent or white", () => {
    const untinted = brightSquare(), white = brightSquare(), neutral = brightSquare();
    const original = neutral.data.slice();
    const glow = {id: "glow", type: "glow" as const, enabled: true, radius: 8, intensity: 1};
    applyCpuLegacyEffects(untinted, [glow]);
    applyCpuLegacyEffects(white, [{...glow, color: "#ffffff"}]);
    applyCpuLegacyEffects(neutral, [{...glow, intensity: 0, color: "#ff0000"}]);
    expect(white.data).toEqual(untinted.data);
    expect(neutral.data).toEqual(original);
  });
});
