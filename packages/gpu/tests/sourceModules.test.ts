import { describe, it, expect } from "vitest";
import type { ShaderModule } from "../src/module.js";
import {
  sourcesSolidV1,
  sourcesLinearGradientV1,
  sourcesCheckerboardV1,
  sourcesRadialGradientV1,
  sourcesAngularGradientV1,
  sourcesDiamondGradientV1
} from "../src/shaders/index.js";

/**
 * Phase 3 Batch 2: zero-input source modules. Every source declares no
 * inputs, `host-specified` output dimensions, and `rod: "explicit"` —
 * the host picks the size, the module fills it.
 */
const SOURCE_MODULES: Array<{ module: ShaderModule; id: string }> = [
  { module: sourcesSolidV1, id: "sources.solid" },
  { module: sourcesLinearGradientV1, id: "sources.linearGradient" },
  { module: sourcesCheckerboardV1, id: "sources.checkerboard" },
  { module: sourcesRadialGradientV1, id: "sources.radialGradient" },
  { module: sourcesAngularGradientV1, id: "sources.angularGradient" },
  { module: sourcesDiamondGradientV1, id: "sources.diamondGradient" }
];

describe("Phase 3 Batch 2 source modules", () => {
  for (const { module, id } of SOURCE_MODULES) {
    describe(id, () => {
      it("is a fragment source in the right category", () => {
        expect(module.id).toBe(id);
        expect(module.version).toBe(1);
        expect(module.kind).toBe("fragment");
        expect(module.surface).toBe("internal");
        expect(module.category).toBe("sources");
      });

      it("declares no inputs and host-specified output dimensions", () => {
        expect(Object.keys(module.io.inputs)).toEqual([]);
        expect(module.io.output.dimensions).toBe("host-specified");
        expect(module.io.rod).toBe("explicit");
      });

      it("output format is rgba8unorm, linear+premultiplied", () => {
        expect(module.io.output.format).toBe("rgba8unorm");
        expect(module.io.output.colorSpace).toBe("linear");
        expect(module.io.output.alpha).toBe("premultiplied");
      });

      it("layout has a params uniform but no texture/sampler bindings", () => {
        const entries = module.layout.entries as Record<
          string,
          Record<string, unknown> | null
        >;
        const kinds = Object.values(entries)
          .filter((e): e is Record<string, unknown> => !!e)
          .map((e) => Object.keys(e)[0]);
        expect(kinds).toEqual(["uniform"]);
      });
    });
  }

  it("sources.solid defaults to opaque black", () => {
    const { color } = sourcesSolidV1.paramDefaults;
    expect([color.x, color.y, color.z, color.w]).toEqual([0, 0, 0, 1]);
  });

  it("sources.linearGradient defaults to black→white at 0°, midpoint 0.5", () => {
    expect(sourcesLinearGradientV1.paramDefaults.angle).toBe(0);
    expect(sourcesLinearGradientV1.paramDefaults.midpoint).toBe(0.5);
  });

  it("sources.checkerboard default cell size is 16 pixels", () => {
    expect(sourcesCheckerboardV1.paramDefaults.cellSize).toBe(16);
  });

  it("sources.radialGradient default radius is 0.5", () => {
    expect(sourcesRadialGradientV1.paramDefaults.radius).toBe(0.5);
  });

  it("sources.angularGradient default rotation is 0 radians", () => {
    expect(sourcesAngularGradientV1.paramDefaults.rotation).toBe(0);
  });

  it("sources.diamondGradient default radius is 0.5", () => {
    expect(sourcesDiamondGradientV1.paramDefaults.radius).toBe(0.5);
  });
});
