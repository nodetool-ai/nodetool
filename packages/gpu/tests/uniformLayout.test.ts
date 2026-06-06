import { describe, it, expect } from "vitest";
import { writeToArrayBuffer } from "typegpu";
import * as d from "typegpu/data";

/**
 * Locks the compositor retrofit: the TypeGPU `BlendUniforms` schema must pack
 * byte-identically to the hand-rolled `Float32Array` the compositor used
 * before Phase 1. Four contiguous vec4f = 64 bytes, same field order. If a
 * future schema edit perturbs the layout, this fails loud.
 */
const BlendUniforms = d.struct({
  params0: d.vec4f,
  invRow0: d.vec4f,
  invRow1: d.vec4f,
  params1: d.vec4f
});

describe("BlendUniforms layout", () => {
  it("is 64 bytes (4 × vec4f, no padding)", () => {
    expect(d.sizeOf(BlendUniforms)).toBe(64);
  });

  it("packs identically to the legacy Float32Array order", () => {
    const opacity = 0.5;
    const blendModeId = 7;
    const canvasW = 1920;
    const canvasH = 1080;
    const inv = { a: 1, b: 2, tx: 3, c: 4, d: 5, ty: 6 };
    const borderRadius = 0.25;
    const smoothness = 0.01;
    const filterMode = 1;

    const legacy = new Float32Array([
      opacity, blendModeId, canvasW, canvasH,
      inv.a, inv.b, inv.tx, 0,
      inv.c, inv.d, inv.ty, 0,
      borderRadius, smoothness, filterMode, 0
    ]);

    const packed = new ArrayBuffer(d.sizeOf(BlendUniforms));
    writeToArrayBuffer(packed, BlendUniforms, {
      params0: d.vec4f(opacity, blendModeId, canvasW, canvasH),
      invRow0: d.vec4f(inv.a, inv.b, inv.tx, 0),
      invRow1: d.vec4f(inv.c, inv.d, inv.ty, 0),
      params1: d.vec4f(borderRadius, smoothness, filterMode, 0)
    });

    expect(Array.from(new Float32Array(packed))).toEqual(Array.from(legacy));
  });
});
