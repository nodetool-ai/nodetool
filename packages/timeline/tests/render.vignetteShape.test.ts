import { describe, expect, it } from "vitest";
import { applyCpuLegacyEffects } from "../src/render/cpuLegacyEffects.js";

const vignette = {id: "v", type: "vignette" as const, enabled: true, amount: 0.5, radius: 0.9, softness: 0.5};
function white(width: number, height: number) {
  return {width, height, data: new Uint8ClampedArray(width * height * 4).fill(255)};
}
function red(pixels: ReturnType<typeof white>, x: number, y: number) {
  return pixels.data[(y * pixels.width + x) * 4]!;
}

describe("vignette geometry", () => {
  it("feathers the soft oval through the frame corners", () => {
    const pixels = white(256, 128);
    applyCpuLegacyEffects(pixels, [{...vignette, radius: 1.5, softness: 1}]);
    expect(red(pixels, 128, 64)).toBe(255);
    expect(red(pixels, 0, 64)).toBeGreaterThan(188);
    expect(red(pixels, 0, 64)).toBeLessThan(195);
    expect(red(pixels, 0, 0)).toBeGreaterThan(127);
    expect(red(pixels, 0, 0)).toBeLessThan(140);
    expect(red(pixels, 0, 32)).toBeGreaterThan(red(pixels, 0, 0));
  });
  it("moves the clear center without changing the size of the image", () => {
    const pixels = white(64, 32);
    const shifted = {...vignette, centerX: 0.25, centerY: 0.5};
    applyCpuLegacyEffects(pixels, [shifted]);
    expect(red(pixels, 16, 16)).toBe(255);
    expect(red(pixels, 32, 16)).toBeLessThan(245);
  });

  it.each([[256, 128], [128, 256]])("uses equal pixel distances for a circular vignette on %i×%i", (width, height) => {
    const pixels = white(width, height);
    const circular = {...vignette, roundness: 1};
    applyCpuLegacyEffects(pixels, [circular]);
    const horizontal = red(pixels, width / 2 + 40, height / 2);
    const vertical = red(pixels, width / 2, height / 2 + 40);
    expect(Math.abs(horizontal - vertical)).toBeLessThanOrEqual(1);
    expect(horizontal).toBeLessThan(240);
  });

  it("preserves the legacy oval and the neutral amount", () => {
    const legacy = white(64, 32), explicit = white(64, 32), neutral = white(64, 32);
    applyCpuLegacyEffects(legacy, [vignette]);
    applyCpuLegacyEffects(explicit, [{...vignette, centerX: 0.5, centerY: 0.5, roundness: 0}]);
    applyCpuLegacyEffects(neutral, [{...vignette, amount: 0, centerX: 0, centerY: 1, roundness: 1}]);
    expect(explicit.data).toEqual(legacy.data);
    expect(neutral.data.every(value => value === 255)).toBe(true);
  });
});
