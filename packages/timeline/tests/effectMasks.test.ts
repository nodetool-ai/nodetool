import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { clipColorEffect, effectMask } from "@nodetool-ai/protocol/api-schemas/timeline.js";
import {
  createEffectMask,
  effectMaskCoverage,
  ellipseMaskVertices,
  isMaskedEffect,
  mixByEffectMaskCoverage
} from "../src/effectMasks.js";
import { applyCpuColorGrade } from "../src/render/cpuLegacyEffects.js";
import type { ClipColorEffect, EffectMask } from "../src/types.js";

const square: EffectMask = {
  id: "s",
  shape: "polygon",
  vertices: [{ x: 0.25, y: 0.25 }, { x: 0.75, y: 0.25 }, { x: 0.75, y: 0.75 }, { x: 0.25, y: 0.75 }]
};
const at = (c: Float32Array | null, w: number, x: number, y: number): number => c![y * w + x]!;

describe("effectMaskCoverage", () => {
  it("returns null without an active mask, so the effect applies everywhere", () => {
    expect(effectMaskCoverage(undefined, 8, 8)).toBeNull();
    expect(effectMaskCoverage([{ ...square, enabled: false }], 8, 8)).toBeNull();
  });

  it("covers the inside of a hard polygon only", () => {
    const c = effectMaskCoverage([square], 8, 8);
    expect(at(c, 8, 4, 4)).toBe(1);
    expect(at(c, 8, 0, 0)).toBe(0);
    expect(at(c, 8, 2, 2)).toBe(1);
    expect(at(c, 8, 6, 6)).toBe(0);
  });

  it("feathers linearly across the edge, centred on it", () => {
    const c = effectMaskCoverage([{ ...square, feather: 0.25 }], 64, 64)!;
    // Edge at x = 16, ramp 16 px wide: x = 16.5 sits 0.5 px inside.
    expect(at(c, 64, 16, 32)).toBeCloseTo(0.5 + 0.5 / 16, 5);
    expect(at(c, 64, 7, 32)).toBe(0);
    expect(at(c, 64, 32, 32)).toBe(1);
  });

  it("expands, inverts and scales by opacity", () => {
    expect(at(effectMaskCoverage([{ ...square, expansion: 0.25 }], 8, 8), 8, 1, 1)).toBe(1);
    expect(at(effectMaskCoverage([{ ...square, inverted: true }], 8, 8), 8, 0, 0)).toBe(1);
    expect(at(effectMaskCoverage([{ ...square, opacity: 0.5 }], 8, 8), 8, 4, 4)).toBeCloseTo(0.5, 6);
  });

  it("combines with add, subtract and intersect", () => {
    const left: EffectMask = { ...square, vertices: [{ x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 0.5, y: 1 }, { x: 0, y: 1 }] };
    const add = effectMaskCoverage([square, left], 8, 8);
    expect(at(add, 8, 0, 0)).toBe(1);
    const sub = effectMaskCoverage([square, { ...left, mode: "subtract" }], 8, 8);
    expect(at(sub, 8, 3, 4)).toBe(0);
    expect(at(sub, 8, 5, 4)).toBe(1);
    const both = effectMaskCoverage([square, { ...left, mode: "intersect" }], 8, 8);
    expect(at(both, 8, 3, 4)).toBe(1);
    expect(at(both, 8, 5, 4)).toBe(0);
    // A first subtract starts from full coverage.
    expect(at(effectMaskCoverage([{ ...square, mode: "subtract" }], 8, 8), 8, 0, 0)).toBe(1);
  });

  it("traces an ellipse with Bézier vertices", () => {
    const c = effectMaskCoverage([{ ...square, shape: "ellipse", vertices: ellipseMaskVertices(0.5, 0.5, 0.5, 0.25) }], 100, 100)!;
    expect(at(c, 100, 50, 50)).toBe(1);
    expect(at(c, 100, 5, 50)).toBe(1);
    expect(at(c, 100, 50, 20)).toBe(0);
    expect(at(c, 100, 15, 30)).toBe(0);
  });

  it("samples a window with an origin", () => {
    const full = effectMaskCoverage([{ ...square, feather: 0.1 }], 40, 20)!;
    const window = effectMaskCoverage([{ ...square, feather: 0.1 }], 40, 20, 10, 5, 12, 7)!;
    expect(window[2 * 10 + 3]).toBe(full[9 * 40 + 15]);
  });
});

describe("masked effects on the CPU path", () => {
  it("grades inside the mask and leaves the outside untouched", () => {
    const effect: ClipColorEffect = { id: "c", type: "color", enabled: true, brightness: 0.5, masks: [square] };
    expect(isMaskedEffect(effect)).toBe(true);
    const width = 8, height = 8;
    const data = new Uint8ClampedArray(width * height * 4).fill(100);
    const pixels = { width, height, data };
    const before = data.slice();
    applyCpuColorGrade(pixels, [effect]);
    mixByEffectMaskCoverage(before, data, effectMaskCoverage(effect.masks, width, height)!);
    expect(data[(4 * width + 4) * 4]).toBeGreaterThan(150);
    expect(data[0]).toBe(100);
  });
});

describe("schema", () => {
  it("keeps masks through the protocol schema and old effects stay valid", () => {
    const mask = createEffectMask("m", "ellipse");
    expect(effectMask.parse(mask)).toEqual(mask);
    const parsed = clipColorEffect.parse({ id: "c", type: "color", enabled: true, masks: [mask] });
    expect(parsed.masks).toEqual([mask]);
    expect(clipColorEffect.parse({ id: "c", type: "color", enabled: true }).masks).toBeUndefined();
  });
});

// The native port reads this fixture (tst_effectmasks). Regenerate with
// UPDATE_EFFECT_MASK_FIXTURE=1 after an intended change to the coverage math.
it("matches the coverage fixture shared with the native renderer", () => {
  const path = fileURLToPath(new URL("../../../native/timeline/src/preview/effects/fixtures/coverage/effect-mask-coverage.json", import.meta.url));
  const masks: EffectMask[] = [
    { id: "e", shape: "ellipse", vertices: ellipseMaskVertices(0.4, 0.5, 0.3, 0.35), feather: 0.15, opacity: 0.9 },
    { id: "p", shape: "polygon", vertices: [{ x: 0.5, y: 0.1 }, { x: 0.95, y: 0.4 }, { x: 0.7, y: 0.9 }], feather: 0.05, mode: "subtract", expansion: 0.02 },
    { id: "b", shape: "bezier", vertices: [{ x: 0.1, y: 0.1, outX: 0.2, outY: -0.1 }, { x: 0.4, y: 0.3, inX: 0.1, inY: -0.1 }, { x: 0.2, y: 0.45 }], inverted: true, mode: "intersect", feather: 0.1 }
  ];
  const coverage = Array.from(effectMaskCoverage(masks, 48, 32, 40, 28, 3, 2)!, (v) => Math.round(v * 1e6) / 1e6);
  const fixture = { masks, sourceWidth: 48, sourceHeight: 32, outWidth: 40, outHeight: 28, originX: 3, originY: 2, coverage };
  if (process.env.UPDATE_EFFECT_MASK_FIXTURE) fs.writeFileSync(path, `${JSON.stringify(fixture)}\n`);
  expect(JSON.parse(fs.readFileSync(path, "utf8"))).toEqual(fixture);
});
