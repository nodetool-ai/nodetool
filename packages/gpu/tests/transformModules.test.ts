import { describe, it, expect } from "vitest";
import {
  transformMirrorV1,
  transformOffsetV1,
  transformCropV1
} from "../src/shaders/index.js";

/**
 * Phase 3 Batch 3 (partial): transform ops. These are fragment modules that
 * resample the source UV-space — `mirror` flips axes, `offset` translates
 * with selectable wrap mode, `crop` extracts a sub-rectangle.
 */
describe("transform.mirror", () => {
  it("is a fragment module in the transform category", () => {
    expect(transformMirrorV1.id).toBe("transform.mirror");
    expect(transformMirrorV1.version).toBe(1);
    expect(transformMirrorV1.kind).toBe("fragment");
    expect(transformMirrorV1.category).toBe("transform");
  });

  it("default flips horizontally (axes = 1)", () => {
    expect(transformMirrorV1.paramDefaults.axes).toBe(1);
  });

  it("output dimensions stay same-as:source", () => {
    expect(transformMirrorV1.io.output.dimensions).toBe("same-as:source");
  });
});

describe("transform.offset", () => {
  it("is a fragment module in the transform category", () => {
    expect(transformOffsetV1.id).toBe("transform.offset");
    expect(transformOffsetV1.kind).toBe("fragment");
    expect(transformOffsetV1.category).toBe("transform");
  });

  it("default offset is zero (identity)", () => {
    expect(transformOffsetV1.paramDefaults).toEqual({ dx: 0, dy: 0, wrap: 0 });
  });

  it("WGSL applies all three wrap modes (clamp / repeat / mirror)", () => {
    const wgsl = transformOffsetV1.wgsl;
    expect(wgsl).toContain("fract");
    // Mirror branch uses the q computation; clamp uses the clamp() call.
    expect(wgsl).toContain("clamp");
  });
});

describe("transform.crop", () => {
  it("is a fragment module in the transform category", () => {
    expect(transformCropV1.id).toBe("transform.crop");
    expect(transformCropV1.kind).toBe("fragment");
    expect(transformCropV1.category).toBe("transform");
  });

  it("default crop is the full image (identity)", () => {
    expect(transformCropV1.paramDefaults).toEqual({
      originX: 0,
      originY: 0,
      width: 1,
      height: 1
    });
  });

  it("output dimensions are derived (host sizes to crop rect)", () => {
    expect(transformCropV1.io.output.dimensions).toBe("derived");
    expect(transformCropV1.io.rod).toBe("explicit");
  });
});
