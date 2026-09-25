import { describe, expect, it } from "vitest";
import { alphaBounds, applyCpuColorGrade, applyCpuGaussianBlur } from "../src/render/cpuLegacyEffects.js";

function sparseSurface(width: number, height: number, x0: number, y0: number) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = y0; y < y0 + 12; y++) {
    for (let x = x0; x < x0 + 12; x++) {
      const i = (y * width + x) * 4;
      data[i] = 255;
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

describe("sparse CPU blur", () => {
  it("preserves the same pixels when a layer is embedded in a larger transparent surface", () => {
    const small = sparseSurface(48, 48, 18, 18);
    const large = sparseSurface(96, 96, 42, 42);
    applyCpuGaussianBlur(small, 2.3);
    applyCpuGaussianBlur(large, 2.3);
    for (let y = 0; y < 48; y++) {
      for (let x = 0; x < 48; x++) {
        const actual = large.data.slice(((y + 24) * 96 + x + 24) * 4, ((y + 24) * 96 + x + 24) * 4 + 4);
        const expected = small.data.slice((y * 48 + x) * 4, (y * 48 + x) * 4 + 4);
        expect(actual).toEqual(expected);
      }
    }
  });

  it("reuses content bounds across color grade and blur without changing pixels", () => {
    const withSharedBounds = sparseSurface(96, 96, 42, 42);
    const withIndependentBounds = sparseSurface(96, 96, 42, 42);
    const effects = [{ id: "grade", type: "color" as const, enabled: true, brightness: 0.2, contrast: 1.3 }];
    const bounds = alphaBounds(withSharedBounds);
    applyCpuColorGrade(withSharedBounds, effects, bounds);
    applyCpuGaussianBlur(withSharedBounds, 2.3, bounds);
    applyCpuColorGrade(withIndependentBounds, effects);
    applyCpuGaussianBlur(withIndependentBounds, 2.3);
    expect(withSharedBounds.data).toEqual(withIndependentBounds.data);
  });
});
