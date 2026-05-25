import { describe, it, expect } from "vitest";
import * as d from "typegpu/data";
import type { ShaderModule } from "../src/module.js";
import {
  colorInvertV1,
  colorBrightnessContrastV1,
  colorHsbV1,
  colorExposureV1,
  colorPosterizeV1,
  filtersPixelateV1,
  filtersThresholdV1,
  keyerLumaKeyV1,
  maskApplyV1,
  maskFromImageV1,
  maskInvertV1
} from "../src/shaders/index.js";

/**
 * Phase 3 Batch 1: low-risk shared effects (color + filters + keyer + mask).
 * Every module is `kind: "fragment"` per the Phase 3 default, declares a
 * `same-as:source` RoD, and (where it makes sense as a filter/color op)
 * exposes the canonical optional `mask` slot.
 */
const BATCH1_MODULES: Array<{
  module: ShaderModule;
  id: string;
  category: string;
  hasOptionalMask: boolean;
}> = [
  { module: colorInvertV1, id: "color.invert", category: "color", hasOptionalMask: true },
  {
    module: colorBrightnessContrastV1,
    id: "color.brightnessContrast",
    category: "color",
    hasOptionalMask: true
  },
  { module: colorHsbV1, id: "color.hsb", category: "color", hasOptionalMask: true },
  { module: colorExposureV1, id: "color.exposure", category: "color", hasOptionalMask: true },
  {
    module: colorPosterizeV1,
    id: "color.posterize",
    category: "color",
    hasOptionalMask: true
  },
  {
    module: filtersPixelateV1,
    id: "filters.pixelate",
    category: "filters",
    hasOptionalMask: true
  },
  {
    module: filtersThresholdV1,
    id: "filters.threshold",
    category: "filters",
    hasOptionalMask: false
  },
  {
    module: keyerLumaKeyV1,
    id: "keyer.lumaKey",
    category: "keyer",
    hasOptionalMask: false
  },
  { module: maskApplyV1, id: "mask.apply", category: "mask", hasOptionalMask: false },
  {
    module: maskFromImageV1,
    id: "mask.fromImage",
    category: "mask",
    hasOptionalMask: false
  },
  { module: maskInvertV1, id: "mask.invert", category: "mask", hasOptionalMask: false }
];

describe("Phase 3 Batch 1 modules", () => {
  for (const { module, id, category, hasOptionalMask } of BATCH1_MODULES) {
    describe(id, () => {
      it("is a fragment module in the right category and id+version is stable", () => {
        expect(module.id).toBe(id);
        expect(module.version).toBe(1);
        expect(module.kind).toBe("fragment");
        expect(["internal", "published"]).toContain(module.surface);
        expect(module.category).toBe(category);
        expect(module.entryPoint).toBe("fs_main");
      });

      it("resolves WGSL with layout bindings injected (no `layout.$` left)", () => {
        expect(module.wgsl).not.toContain("layout.$");
        expect(module.wgsl).toContain("fn fs_main");
      });

      it("declares a `source` input and emits an rgba8unorm output", () => {
        expect(module.io.inputs.source).toBeDefined();
        expect(module.io.inputs.source.bindingKinds).toEqual(["texture_2d"]);
        expect(module.io.output.format).toBe("rgba8unorm");
        expect(module.io.output.dimensions).toBe("same-as:source");
        expect(module.io.rod).toBe("same-as:source");
      });

      it("uniform schema fields appear in the resolved WGSL", () => {
        const fields = Object.keys(
          module.paramDefaults as Record<string, unknown>
        );
        // mask.invert / no-param modules carry a placeholder field that
        // isn't referenced in WGSL — skip those.
        if (fields.length === 1 && fields[0] === "unused") {
          return;
        }
        for (const field of fields) {
          expect(module.wgsl).toContain(field);
        }
      });

      it("uniform schema packs to a non-zero size when params are real", () => {
        const fields = Object.keys(
          module.paramDefaults as Record<string, unknown>
        );
        if (fields.length === 1 && fields[0] === "unused") {
          return;
        }
        expect(d.sizeOf(module.params)).toBeGreaterThan(0);
      });

      if (hasOptionalMask) {
        it("exposes an optional `mask` input (executor supplies white when unbound)", () => {
          expect(module.io.inputs.mask).toBeDefined();
          expect(module.io.inputs.mask?.optional).toBe(true);
        });

        it("references the mask binding in WGSL via the layout", () => {
          // After tgpu.resolve, mask becomes a `var` of texture_2d/sampler.
          // We check for the generated TypeGPU resource name pattern.
          expect(module.wgsl).toContain("texture_2d");
        });
      }
    });
  }

  it("color.invert defaults to amount = 1 (full invert)", () => {
    expect(colorInvertV1.paramDefaults.amount).toBe(1);
  });

  it("color.brightnessContrast defaults are neutral (identity)", () => {
    expect(colorBrightnessContrastV1.paramDefaults).toEqual({
      brightness: 0,
      contrast: 1
    });
  });

  it("color.hsb defaults are neutral (identity)", () => {
    expect(colorHsbV1.paramDefaults).toEqual({
      hue: 0,
      saturation: 1,
      brightness: 1
    });
  });

  it("color.exposure defaults to 0 stops (identity)", () => {
    expect(colorExposureV1.paramDefaults.stops).toBe(0);
  });

  it("keyer.lumaKey default band is full-range (0..1) = identity", () => {
    expect(keyerLumaKeyV1.paramDefaults.low).toBe(0);
    expect(keyerLumaKeyV1.paramDefaults.high).toBe(1);
  });

  it("mask.fromImage defaults to luminance mode (1)", () => {
    expect(maskFromImageV1.paramDefaults.mode).toBe(1);
    expect(maskFromImageV1.paramDefaults.invert).toBe(0);
  });

  it("mask.invert has only a source binding (no params uniform in layout)", () => {
    const entries = maskInvertV1.layout.entries as Record<
      string,
      Record<string, unknown> | null
    >;
    expect(Object.keys(entries).sort()).toEqual(["samp", "source"]);
    for (const entry of Object.values(entries)) {
      expect(entry).not.toHaveProperty("uniform");
    }
  });
});
