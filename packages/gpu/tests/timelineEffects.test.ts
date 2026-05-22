import { describe, it, expect } from "vitest";
import * as d from "typegpu/data";
import type { ShaderModule } from "../src/module.js";
import {
  colorGradeV1,
  blurGaussianV1,
  sharpenUnsharpMaskV1,
  vignetteV1,
  chromaKeyV1
} from "../src/shaders/index.js";

/**
 * Phase 2 migrated timeline compute effects. Locks the registry metadata and
 * the schema ↔ WGSL struct consistency the plan's CI check calls for: every
 * TypeGPU param field name must appear in the resolved WGSL (TypeGPU generates
 * the `*Params` struct from the schema, so a drift would mean a hand-edit).
 */
const MODULES: Array<{
  module: ShaderModule;
  id: string;
  category: string;
  uniformBytes: number;
}> = [
  { module: colorGradeV1, id: "color.grade", category: "color", uniformBytes: 32 },
  {
    module: blurGaussianV1,
    id: "filters.blur.gaussian",
    category: "filters",
    uniformBytes: 16
  },
  {
    module: sharpenUnsharpMaskV1,
    id: "filters.sharpen.unsharpMask",
    category: "filters",
    uniformBytes: 8
  },
  { module: vignetteV1, id: "filters.vignette", category: "filters", uniformBytes: 12 },
  { module: chromaKeyV1, id: "keyer.chromaKey", category: "keyer", uniformBytes: 32 }
];

describe("timeline compute effects", () => {
  for (const { module, id, category, uniformBytes } of MODULES) {
    describe(id, () => {
      it("is an internal compute module in the right category", () => {
        expect(module.id).toBe(id);
        expect(module.version).toBe(1);
        expect(module.kind).toBe("compute");
        expect(module.surface).toBe("internal");
        expect(module.category).toBe(category);
        expect(module.entryPoint).toBe("main");
        expect(module.wgsl.length).toBeGreaterThan(0);
      });

      it("declares a single `source` texture input and a same-size output", () => {
        expect(Object.keys(module.io.inputs)).toEqual(["source"]);
        expect(module.io.inputs.source.bindingKinds).toEqual(["texture_2d"]);
        expect(module.io.output.format).toBe("rgba8unorm");
        expect(module.io.output.dimensions).toBe("same-as:source");
        expect(module.io.rod).toBe("same-as:source");
      });

      it("packs its uniform to the expected size", () => {
        expect(d.sizeOf(module.params)).toBe(uniformBytes);
      });

      it("every schema field appears in the resolved WGSL", () => {
        const fields = Object.keys(
          (module.params as unknown as { propTypes: Record<string, unknown> })
            .propTypes
        );
        expect(fields.length).toBeGreaterThan(0);
        for (const field of fields) {
          expect(module.wgsl).toContain(field);
        }
      });

      it("binds an input texture, a storage-texture output, and a uniform", () => {
        const entries = Object.values(module.layout.entries);
        expect(entries.some((e) => e && "texture" in e)).toBe(true);
        expect(entries.some((e) => e && "storageTexture" in e)).toBe(true);
        expect(entries.some((e) => e && "uniform" in e)).toBe(true);
      });

      it("layout texture-binding keys match io.inputs keys", () => {
        // The Executor binds inputs by layout-entry name, so every declared
        // io.input must have a same-named texture binding in the layout (and
        // there must be no extra texture bindings the caller can't supply).
        const layoutEntries = module.layout.entries as Record<
          string,
          Record<string, unknown> | null
        >;
        const textureKeys = Object.entries(layoutEntries)
          .filter(([, e]) => e && "texture" in e)
          .map(([name]) => name);
        expect(textureKeys.sort()).toEqual(Object.keys(module.io.inputs).sort());
      });
    });
  }

  it("paramDefaults are neutral (identity) for each effect", () => {
    expect(colorGradeV1.paramDefaults).toMatchObject({
      brightness: 0,
      contrast: 1,
      saturation: 1
    });
    expect(blurGaussianV1.paramDefaults.radius).toBe(0);
    expect(sharpenUnsharpMaskV1.paramDefaults.amount).toBe(0);
    expect(vignetteV1.paramDefaults.intensity).toBe(0);
    expect(chromaKeyV1.paramDefaults.tolerance).toBe(0);
  });
});
