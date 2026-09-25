import { describe, expect, it } from "vitest";
import { clipEffect } from "@nodetool-ai/protocol/api-schemas/timeline.js";
import { parseCubeLut, sampleCubeLut } from "../src/render/cubeLut.js";

const INVERT_CUBE = [
  'TITLE "Invert"',
  "LUT_3D_SIZE 2",
  "DOMAIN_MIN 0 0 0",
  "DOMAIN_MAX 1 1 1",
  "1 1 1", "0 1 1", "1 0 1", "0 0 1",
  "1 1 0", "0 1 0", "1 0 0", "0 0 0"
].join("\n");

describe("3D .cube LUT", () => {
  it("interpolates the red-fastest table and survives protocol parsing", () => {
    const effect = clipEffect.parse({ id: "grade", type: "lut", enabled: true, cube: INVERT_CUBE, intensity: 0.75 });
    expect(effect.type).toBe("lut");
    const lut = parseCubeLut(INVERT_CUBE);
    expect(sampleCubeLut(lut, [0, 0.5, 1])).toEqual([1, 0.5, 0]);
    const graded = sampleCubeLut(lut, [0.2, 0.4, 0.6]);
    expect(graded[0]).toBeCloseTo(0.8);
    expect(graded[1]).toBeCloseTo(0.6);
    expect(graded[2]).toBeCloseTo(0.4);
  });

  it("rejects incomplete tables and degenerate domains", () => {
    expect(() => parseCubeLut("LUT_3D_SIZE 2\n0 0 0")).toThrow(/requires 8/);
    expect(() => parseCubeLut(INVERT_CUBE.replace("DOMAIN_MAX 1 1 1", "DOMAIN_MAX 0 1 1"))).toThrow(/domain maximum/);
  });
});
