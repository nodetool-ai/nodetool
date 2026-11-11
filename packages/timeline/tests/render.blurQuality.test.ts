import { expect, it } from "vitest";
import { applyCpuGaussianBlur } from "../src/render/cpuLegacyEffects.js";

it.each([20, 40, 64, 128])("samples a continuous Gaussian at radius %i", radius => {
  const width = 512, center = width / 2;
  const data = new Uint8ClampedArray(width * 4);
  for (let x = 0; x < width; x++) data.set([x === center ? 255 : 0, 0, 0, 255], x * 4);
  applyCpuGaussianBlur({width, height: 1, data}, radius);
  const sigma = radius / 3;
  const weights = Array.from({length: radius * 2 + 1}, (_, i) => Math.exp(-((i - radius) ** 2) / (2 * sigma ** 2)));
  const total = weights.reduce((sum, value) => sum + value, 0);
  for (let offset = -radius; offset <= radius; offset++) {
    const expected = Math.round(255 * weights[offset + radius]! / total);
    expect(Math.abs(data[(center + offset) * 4]! - expected)).toBeLessThanOrEqual(1);
    if (Math.abs(offset) < radius / 2) expect(data[(center + offset) * 4]).toBeGreaterThan(0);
  }
  expect(data.filter((_, index) => index % 4 === 3).every(value => value === 255)).toBe(true);
});

it("removes alternating bright lines instead of aliasing them at radius 40", () => {
  const width = 256, data = new Uint8ClampedArray(width * 4);
  for (let x = 0; x < width; x++) data.set([x % 2 * 255, 0, 0, 255], x * 4);
  applyCpuGaussianBlur({width, height: 1, data}, 40);
  for (let x = 64; x < 192; x++) expect(Math.abs(data[x * 4]! - 127.5)).toBeLessThanOrEqual(1);
});

it("uses the same 256-pixel limit as native rendering", () => {
  const width = 1024, data = new Uint8ClampedArray(width * 4);
  for (let x = 0; x < width; x++) { data.set([x < 512 ? 0 : 255, 0, 0, 255], x * 4); }
  const limited = {width, height: 1, data: data.slice()}, oversized = {width, height: 1, data: data.slice()};
  applyCpuGaussianBlur(limited, 256); applyCpuGaussianBlur(oversized, 512);
  expect(oversized.data).toEqual(limited.data);
});
