import { describe, it, expect } from "vitest";
import * as d from "typegpu/data";
import type { ShaderModule } from "../src/module.js";
import {
  transformPadV1,
  transformTileV1,
  transformResizeV1,
  transformRotate90V1,
  transformAffineV1,
  transformCornerPinV1,
  transformPolarRemapV1,
  transformDisplaceV1,
  transformSpherizeV1
} from "../src/shaders/index.js";

/**
 * Phase 3 Batch 3 (follow-up): the remaining transform ops added after the
 * initial `mirror`/`offset`/`crop` triple — pad, tile, resize, rotate90,
 * affine, cornerPin, polarRemap, displace, spherize. Every module is
 * `kind: "fragment"`, in the `transform` category, and declares a `source`
 * input bound as `texture_2d`.
 */
const TRANSFORM_MODULES: Array<{
  module: ShaderModule;
  id: string;
  /** "same-as:source" | "derived" | "host-specified" */
  dimensions: string;
  /** Number of declared inputs (most are 1; displace is 2). */
  inputCount: number;
}> = [
  { module: transformPadV1, id: "transform.pad", dimensions: "derived", inputCount: 1 },
  {
    module: transformTileV1,
    id: "transform.tile",
    dimensions: "same-as:source",
    inputCount: 1
  },
  {
    module: transformResizeV1,
    id: "transform.resize",
    dimensions: "host-specified",
    inputCount: 1
  },
  {
    module: transformRotate90V1,
    id: "transform.rotate90",
    dimensions: "derived",
    inputCount: 1
  },
  {
    module: transformAffineV1,
    id: "transform.affine",
    dimensions: "host-specified",
    inputCount: 1
  },
  {
    module: transformCornerPinV1,
    id: "transform.cornerPin",
    dimensions: "same-as:source",
    inputCount: 1
  },
  {
    module: transformPolarRemapV1,
    id: "transform.polarRemap",
    dimensions: "same-as:source",
    inputCount: 1
  },
  {
    module: transformDisplaceV1,
    id: "transform.displace",
    dimensions: "same-as:source",
    inputCount: 2
  },
  {
    module: transformSpherizeV1,
    id: "transform.spherize",
    dimensions: "same-as:source",
    inputCount: 1
  }
];

describe("Phase 3 Batch 3 transform modules", () => {
  for (const { module, id, dimensions, inputCount } of TRANSFORM_MODULES) {
    describe(id, () => {
      it("is a fragment module in the transform category at version 1", () => {
        expect(module.id).toBe(id);
        expect(module.version).toBe(1);
        expect(module.kind).toBe("fragment");
        expect(module.surface).toBe("internal");
        expect(module.category).toBe("transform");
        expect(module.entryPoint).toBe("fs_main");
      });

      it("resolves WGSL with layout bindings injected (no `layout.$` left)", () => {
        expect(module.wgsl).not.toContain("layout.$");
        expect(module.wgsl).toContain("fn fs_main");
      });

      it(`declares ${inputCount} input(s) and emits an rgba8unorm output`, () => {
        const inputs = Object.keys(module.io.inputs);
        expect(inputs.length).toBe(inputCount);
        expect(module.io.inputs.source).toBeDefined();
        expect(module.io.inputs.source.bindingKinds).toEqual(["texture_2d"]);
        expect(module.io.output.format).toBe("rgba8unorm");
      });

      it(`output dimensions are ${dimensions}`, () => {
        expect(module.io.output.dimensions).toBe(dimensions);
      });

      it("uniform schema fields appear in the resolved WGSL", () => {
        const fields = Object.keys(
          module.paramDefaults as Record<string, unknown>
        );
        for (const field of fields) {
          expect(module.wgsl).toContain(field);
        }
      });

      it("uniform schema packs to a non-zero size", () => {
        expect(d.sizeOf(module.params)).toBeGreaterThan(0);
      });
    });
  }

  it("transform.pad default has zero padding (identity)", () => {
    expect(transformPadV1.paramDefaults.left).toBe(0);
    expect(transformPadV1.paramDefaults.top).toBe(0);
    expect(transformPadV1.paramDefaults.right).toBe(0);
    expect(transformPadV1.paramDefaults.bottom).toBe(0);
  });

  it("transform.tile default tiles 2×2 with repeat wrap", () => {
    expect(transformTileV1.paramDefaults.tilesX).toBe(2);
    expect(transformTileV1.paramDefaults.tilesY).toBe(2);
    expect(transformTileV1.paramDefaults.wrap).toBe(1);
  });

  it("transform.resize default is bilinear (mode = 1)", () => {
    expect(transformResizeV1.paramDefaults.mode).toBe(1);
  });

  it("transform.resize WGSL implements all three modes", () => {
    expect(transformResizeV1.wgsl).toContain("sampleBicubic");
    expect(transformResizeV1.wgsl).toContain("snapped");
  });

  it("transform.rotate90 default is 90° CW (turns = 1)", () => {
    expect(transformRotate90V1.paramDefaults.turns).toBe(1);
  });

  it("transform.rotate90 uses a nearest-filter sampler (no lerp on quarter turns)", () => {
    const sampler = transformRotate90V1.samplers.samp;
    expect(sampler.magFilter).toBe("nearest");
    expect(sampler.minFilter).toBe("nearest");
  });

  it("transform.affine default is identity", () => {
    expect(transformAffineV1.paramDefaults).toEqual({
      m00: 1,
      m01: 0,
      tx: 0,
      m10: 0,
      m11: 1,
      ty: 0
    });
  });

  it("transform.cornerPin default is identity homography", () => {
    expect(transformCornerPinV1.paramDefaults).toEqual({
      h00: 1,
      h01: 0,
      h02: 0,
      h10: 0,
      h11: 1,
      h12: 0,
      h20: 0,
      h21: 0
    });
  });

  it("transform.polarRemap default is rect→polar (mode = 0)", () => {
    expect(transformPolarRemapV1.paramDefaults.mode).toBe(0);
  });

  it("transform.displace exposes a `displacement` input", () => {
    expect(transformDisplaceV1.io.inputs.displacement).toBeDefined();
    expect(transformDisplaceV1.io.inputs.displacement.bindingKinds).toEqual([
      "texture_2d"
    ]);
  });

  it("transform.spherize default amount is +0.5 (gentle bulge)", () => {
    expect(transformSpherizeV1.paramDefaults.amount).toBe(0.5);
  });
});
