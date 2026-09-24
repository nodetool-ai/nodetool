import { describe, expect, it } from "vitest";
import { applyCpuVisualEffects } from "../src/render/cpuVisualEffects.js";

describe("dither effect", () => {
  it("breaks dark 8-bit bands with deterministic, near-zero-mean noise", () => {
    const width = 64;
    const height = 16;
    const input = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        input[i] = input[i + 1] = input[i + 2] = 8 + Math.floor(x / 8);
        input[i + 3] = 255;
      }
    }
    const effect = { id: "grain", type: "stylize" as const, mode: "dither" as const, enabled: true, amount: 1, seed: 7 };
    const first = { data: new Uint8ClampedArray(input), width, height };
    const second = { data: new Uint8ClampedArray(input), width, height };
    applyCpuVisualEffects(first, [effect]);
    applyCpuVisualEffects(second, [effect]);
    expect(first.data).toEqual(second.data);
    let changed = 0;
    let delta = 0;
    const values = new Set<number>();
    for (let i = 0; i < input.length; i += 4) {
      const difference = first.data[i]! - input[i]!;
      if (difference !== 0) changed++;
      delta += difference;
      values.add(first.data[i]!);
    }
    expect(changed).toBeGreaterThan(width * height / 4);
    expect(values.size).toBeGreaterThan(8);
    expect(Math.abs(delta / (width * height))).toBeLessThan(0.1);
  });
});
