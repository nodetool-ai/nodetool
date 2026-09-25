import { describe, expect, it } from "vitest";
import { applyCpuVisualEffects } from "../src/render/cpuVisualEffects.js";

describe("radial and zoom blur geometry", () => {
  it("spins around the centre for radial blur and radiates for zoom blur", () => {
    const width = 64;
    const height = 64;
    const source = new Uint8ClampedArray(width * height * 4);
    const index = (32 * width + 48) * 4;
    source.set([255, 255, 255, 255], index);
    const radial = { data: new Uint8ClampedArray(source), width, height };
    const zoom = { data: new Uint8ClampedArray(source), width, height };
    applyCpuVisualEffects(radial, [{ id: "spin", type: "stylize", mode: "radialBlur", enabled: true, amount: 3 }]);
    applyCpuVisualEffects(zoom, [{ id: "zoom", type: "stylize", mode: "zoomBlur", enabled: true, amount: 3 }]);
    const alpha = (pixels: Uint8ClampedArray, x: number, y: number): number => pixels[(y * width + x) * 4 + 3]!;
    expect(alpha(radial.data, 48, 28)).toBeGreaterThan(alpha(zoom.data, 48, 28));
    expect(alpha(zoom.data, 44, 32)).toBeGreaterThan(alpha(radial.data, 44, 32));
  });
});
