import { expect, it } from "vitest";
import {
  denoiseSpatial,
  denoiseTemporal,
  denoiseSourceTimes
} from "../src/render/denoise.js";
import { applyCpuLegacyEffects } from "../src/render/cpuLegacyEffects.js";
import type { ClipDenoiseEffect, TimelineClip } from "../src/types.js";
const width = 32,
  height = 16;
const effect: ClipDenoiseEffect = {
  id: "d",
  type: "denoise",
  enabled: true,
  lumaStrength: 1,
  chromaStrength: 1,
  radius: 2
};
const frame = (seed: number, shift = 0, cut = false): Uint8ClampedArray => {
  const result = new Uint8ClampedArray(width * height * 4);
  let random = seed;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
      const value =
        (cut ? 220 : x - shift >= 16 ? 180 : 70) +
        (((random >>> 24) % 21) - 10);
      result.set([value, value, value, 255], (y * width + x) * 4);
    }
  return result;
};
const variance = (pixels: Uint8ClampedArray): number => {
  let sum = 0;
  for (let y = 2; y < height - 2; y++)
    for (let x = 2; x < 12; x++)
      sum += (pixels[(y * width + x) * 4]! - 70) ** 2;
  return sum;
};
it("reduces spatial noise without smearing the high-contrast edge", () => {
  const input = frame(1),
    output = input.slice();
  denoiseSpatial(input, output, width, height, effect);
  expect(variance(output)).toBeLessThan(variance(input) * 0.5);
  for (let y = 0; y < height; y++) {
    expect(output[(y * width + 15) * 4]).toBeLessThan(90);
    expect(output[(y * width + 16) * 4]).toBeGreaterThan(160);
  }
});
it("keeps luminance and chroma controls independent", () => {
  const input = frame(2),
    output = input.slice();
  denoiseSpatial(input, output, width, height, { ...effect, lumaStrength: 0 });
  expect(output).toEqual(input);
  const color = input.slice();
  for (let i = 0; i < color.length; i += 4) {
    color[i]! += i % 8 ? 10 : -10;
    color[i + 2]! += i % 8 ? -30 : 30;
  }
  denoiseSpatial(color, output, width, height, { ...effect, lumaStrength: 0 });
  let originalChroma = 0,
    filteredChroma = 0;
  for (let i = 0; i < color.length; i += 4) {
    originalChroma += Math.abs(color[i]! - color[i + 2]!);
    filteredChroma += Math.abs(output[i]! - output[i + 2]!);
  }
  expect(filteredChroma).toBeLessThan(originalChroma * 0.9);
});
it("preserves alpha and bypasses neutral settings byte-for-byte", () => {
  const input = frame(3);
  for (let i = 0; i < input.length; i += 4) {
    const a = i % 3 ? 128 : 0;
    for (let c = 0; c < 3; c++)
      input[i + c] = Math.round((input[i + c]! * a) / 255);
    input[i + 3] = a;
  }
  const output = input.slice();
  denoiseSpatial(input, output, width, height, {
    ...effect,
    lumaStrength: 0,
    chromaStrength: 0
  });
  expect(output).toEqual(input);
  denoiseSpatial(input, output, width, height, effect);
  for (let i = 3; i < input.length; i += 4) expect(output[i]).toBe(input[i]);
});
it("compensates moving edges, reduces noise, rejects cuts and is seek-order independent", () => {
  const current = frame(11),
    before = frame(12, -2),
    after = frame(13, 2),
    output = current.slice();
  denoiseTemporal(current, output, width, height, { before, after }, 1);
  expect(variance(output)).toBeLessThan(variance(current) * 0.85);
  for (let y = 2; y < height - 2; y++) {
    expect(output[(y * width + 15) * 4]).toBeLessThan(90);
    expect(output[(y * width + 16) * 4]).toBeGreaterThan(160);
  }
  const first = output.slice();
  denoiseTemporal(
    frame(9),
    output,
    width,
    height,
    { before: frame(8), after: frame(10) },
    1
  );
  denoiseTemporal(current, output, width, height, { before, after }, 1);
  expect(output).toEqual(first);
  denoiseTemporal(
    current,
    output,
    width,
    height,
    { before: frame(15, 0, true), after: frame(16, 0, true) },
    1
  );
  expect(output).toEqual(current);
});
it("requires temporal inputs and preserves zero-strength bypass", () => {
  const pixels = { width, height, data: frame(1) };
  expect(() =>
    applyCpuLegacyEffects(pixels, [{ ...effect, temporalStrength: 1 }])
  ).toThrow(/neighbor/i);
  const original = pixels.data.slice();
  applyCpuLegacyEffects(pixels, [
    { ...effect, lumaStrength: 0, chromaStrength: 0, temporalStrength: 0 }
  ]);
  expect(pixels.data).toEqual(original);
});
it("bounds source neighbors to trims, including reversed/remapped source windows", () => {
  const clip = {
    id: "c",
    startMs: 1000,
    durationMs: 1000,
    inPointMs: 200
  } as TimelineClip;
  expect(denoiseSourceTimes(clip, 200).before).toBe(200);
  expect(denoiseSourceTimes(clip, 1190).after).toBeCloseTo(1199.999);
  expect(denoiseSourceTimes(clip, 700).before).toBeCloseTo(700 - 1000 / 30);
});
