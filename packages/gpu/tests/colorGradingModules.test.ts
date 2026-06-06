import { describe, it, expect } from "vitest";
import { createDefaultRegistry } from "../src/pool.js";
import {
  colorColorBalanceV1,
  colorExposureToneV1,
  colorLiftGammaGainV1,
  colorCdlV1,
  colorCurvesV1,
  colorHslAdjustV1,
  colorSplitToningV1,
  colorFilmLookV1
} from "../src/shaders/index.js";
import type { ShaderModule } from "../src/module.js";

/**
 * Module-level contract tests for the per-pixel color-grading shaders backing
 * the `lib.image.color_grading.*` workflow nodes after their sharp→shader
 * migration. Schema integrity, WGSL resolution, the premultiplied-alpha
 * handshake, and registry wiring. The runtime `rgb <= a` invariant is covered
 * by `premulInvariant.test.ts`; per-node pixel-change behaviour by the
 * `image-nodes` regression suite.
 */

const MODULES: ReadonlyArray<{ id: string; module: ShaderModule }> = [
  { id: "color.colorBalance", module: colorColorBalanceV1 },
  { id: "color.exposureTone", module: colorExposureToneV1 },
  { id: "color.liftGammaGain", module: colorLiftGammaGainV1 },
  { id: "color.cdl", module: colorCdlV1 },
  { id: "color.curves", module: colorCurvesV1 },
  { id: "color.hslAdjust", module: colorHslAdjustV1 },
  { id: "color.splitToning", module: colorSplitToningV1 },
  { id: "color.filmLook", module: colorFilmLookV1 }
];

describe("color-grading shader modules", () => {
  for (const { id, module } of MODULES) {
    describe(`${id}@1`, () => {
      it("is an internal fragment color module with the canonical mask slot", () => {
        expect(module.id).toBe(id);
        expect(module.version).toBe(1);
        expect(module.kind).toBe("fragment");
        expect(module.category).toBe("color");
        // Internal so it does not widen the frozen published surface.
        expect(module.surface).toBe("internal");
        expect(module.io.inputs.source).toBeDefined();
        expect(module.io.inputs.mask?.optional).toBe(true);
        expect(module.io.output.dimensions).toBe("same-as:source");
        expect(module.io.output.alpha).toBe("premultiplied");
      });

      it("is classified nonlinear-in-rgb and shows the unpremul handshake", () => {
        expect(module.linearity).toBe("nonlinear-in-rgb");
        // Each shader un-premultiplies before its nonlinear RGB math.
        expect(module.wgsl).toContain("src.rgb / safeA");
        // ...and re-premultiplies on store.
        expect(module.wgsl).toContain("* src.a, src.a)");
      });

      it("WGSL resolves with no leftover layout placeholders", () => {
        expect(module.wgsl).not.toContain("layout.$");
        expect(module.wgsl).toContain("fn fs_main");
      });

      it("is preloaded in the default registry", () => {
        const registry = createDefaultRegistry();
        expect(registry.has({ id, version: 1 })).toBe(true);
      });
    });
  }

  it("exposureTone collapses to passthrough at default params", () => {
    expect(colorExposureToneV1.paramDefaults).toMatchObject({
      exposure: 0,
      contrast: 0,
      highlights: 0,
      shadows: 0,
      whites: 0,
      blacks: 0
    });
  });

  it("cdl / liftGammaGain default to identity transforms", () => {
    expect(colorCdlV1.paramDefaults.slopeR).toBe(1);
    expect(colorCdlV1.paramDefaults.offsetR).toBe(0);
    expect(colorCdlV1.paramDefaults.powerR).toBe(1);
    expect(colorLiftGammaGainV1.paramDefaults.gammaMaster).toBe(1);
    expect(colorLiftGammaGainV1.paramDefaults.gainMaster).toBe(1);
    expect(colorLiftGammaGainV1.paramDefaults.liftMaster).toBe(0);
  });

  it("color modules using Rec.709 luma carry the canonical coefficients", () => {
    for (const m of [colorExposureToneV1, colorCdlV1, colorSplitToningV1, colorFilmLookV1]) {
      expect(m.wgsl).toContain("0.2126");
      expect(m.wgsl).toContain("0.7152");
      expect(m.wgsl).toContain("0.0722");
    }
  });

  it("hslAdjust exposes the range-gating params", () => {
    expect(colorHslAdjustV1.paramDefaults).toMatchObject({
      rangeLo: 0,
      rangeHi: 1,
      useRange: 0
    });
    expect(colorHslAdjustV1.wgsl).toContain("rgb2hsv");
    expect(colorHslAdjustV1.wgsl).toContain("hsv2rgb");
  });
});
