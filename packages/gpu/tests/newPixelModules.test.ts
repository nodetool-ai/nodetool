import { describe, it, expect } from "vitest";
import * as d from "typegpu/data";
import {
  colorGrayscaleV1,
  colorSolarizeV1,
  filtersConvolve3x3V1
} from "../src/shaders/index.js";

/**
 * Phase 4 add-ons used by the legacy `lib-image-*` workflow nodes after the
 * sharp→shader migration. Module-level unit tests: schema integrity, WGSL
 * resolution, IO contract.
 */
describe("color.grayscale@1", () => {
  it("is a fragment color module with the canonical mask slot", () => {
    expect(colorGrayscaleV1.id).toBe("color.grayscale");
    expect(colorGrayscaleV1.version).toBe(1);
    expect(colorGrayscaleV1.kind).toBe("fragment");
    expect(colorGrayscaleV1.category).toBe("color");
    expect(colorGrayscaleV1.io.inputs.source).toBeDefined();
    expect(colorGrayscaleV1.io.inputs.mask?.optional).toBe(true);
    expect(colorGrayscaleV1.io.output.dimensions).toBe("same-as:source");
  });

  it("default amount = 1 (full grayscale)", () => {
    expect(colorGrayscaleV1.paramDefaults.amount).toBe(1);
  });

  it("uses Rec.709 coefficients in the WGSL", () => {
    expect(colorGrayscaleV1.wgsl).toContain("0.2126");
    expect(colorGrayscaleV1.wgsl).toContain("0.7152");
    expect(colorGrayscaleV1.wgsl).toContain("0.0722");
  });

  it("WGSL resolves with no leftover `layout.$` placeholders", () => {
    expect(colorGrayscaleV1.wgsl).not.toContain("layout.$");
    expect(colorGrayscaleV1.wgsl).toContain("fn fs_main");
  });
});

describe("color.solarize@1", () => {
  it("is a fragment color module with the canonical mask slot", () => {
    expect(colorSolarizeV1.id).toBe("color.solarize");
    expect(colorSolarizeV1.version).toBe(1);
    expect(colorSolarizeV1.kind).toBe("fragment");
    expect(colorSolarizeV1.io.inputs.mask?.optional).toBe(true);
  });

  it("default threshold = 0.5 (mid-grey)", () => {
    expect(colorSolarizeV1.paramDefaults.threshold).toBe(0.5);
  });

  it("uses per-channel select against the threshold in WGSL", () => {
    // After the premultiplied-invariant fix the shader thresholds the
    // un-premultiplied `straight` color rather than `src.rgb` directly,
    // but the per-channel `select` shape is unchanged.
    expect(colorSolarizeV1.wgsl).toContain("select(straight.r, 1.0 - straight.r");
    expect(colorSolarizeV1.wgsl).toContain("select(straight.g, 1.0 - straight.g");
    expect(colorSolarizeV1.wgsl).toContain("select(straight.b, 1.0 - straight.b");
  });
});

describe("filters.convolve3x3@1", () => {
  it("is a fragment filters module with the canonical mask slot", () => {
    expect(filtersConvolve3x3V1.id).toBe("filters.convolve3x3");
    expect(filtersConvolve3x3V1.version).toBe(1);
    expect(filtersConvolve3x3V1.kind).toBe("fragment");
    expect(filtersConvolve3x3V1.category).toBe("filters");
    expect(filtersConvolve3x3V1.io.inputs.mask?.optional).toBe(true);
  });

  it("default kernel is identity (centre weight 1, divisor 1)", () => {
    const defaults = filtersConvolve3x3V1.paramDefaults as Record<
      string,
      ReturnType<typeof d.vec4f>
    >;
    expect(defaults.row1.y).toBe(1);
    expect(defaults.row2.w).toBe(1);
  });

  it("samples all nine neighbours in the WGSL", () => {
    for (const slot of ["s00", "s01", "s02", "s10", "s11", "s12", "s20", "s21", "s22"]) {
      expect(filtersConvolve3x3V1.wgsl).toContain(slot);
    }
  });

  it("divisor falls back to the kernel sum when declared = 0", () => {
    // The auto-divisor branch is what makes [-1,-1,-1, -1,8,-1, -1,-1,-1]
    // with divisor 0 behave the same as PIL's FIND_EDGES (no divisor).
    expect(filtersConvolve3x3V1.wgsl).toContain("kSum");
    expect(filtersConvolve3x3V1.wgsl).toContain("select(declared");
  });
});
