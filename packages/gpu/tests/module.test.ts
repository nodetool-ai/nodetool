import { describe, it, expect } from "vitest";
import * as d from "typegpu/data";
import { defineModule, moduleKey } from "../src/module.js";
import { passthroughV1 } from "../src/shaders/_canary/passthrough/v1/module.js";

describe("defineModule", () => {
  it("rejects an empty id", () => {
    expect(() =>
      defineModule({
        id: "",
        version: 1,
        surface: "internal",
        category: "color",
        linearity: "linear-in-rgb",
        params: d.struct({ x: d.f32 }),
        paramDefaults: { x: 0 },
        layout: { entries: {} } as never,
        wgsl: "",
        io: {
          inputs: {},
          output: {
            colorSpace: "linear",
            alpha: "premultiplied",
            format: "rgba8unorm",
            dimensions: "host-specified"
          },
          rod: "explicit"
        }
      })
    ).toThrow(/id is required/);
  });

  it("rejects a non-positive version", () => {
    expect(() =>
      defineModule({
        id: "color.invert",
        version: 0,
        surface: "internal",
        category: "color",
        linearity: "linear-in-rgb",
        params: d.struct({ x: d.f32 }),
        paramDefaults: { x: 0 },
        layout: { entries: {} } as never,
        wgsl: "",
        io: {
          inputs: {},
          output: {
            colorSpace: "linear",
            alpha: "premultiplied",
            format: "rgba8unorm",
            dimensions: "host-specified"
          },
          rod: "explicit"
        }
      })
    ).toThrow(/positive integer/);
  });
});

describe("moduleKey", () => {
  it("renders (id, version) as a stable string", () => {
    expect(moduleKey("color.hsb", 2)).toBe("color.hsb@2");
  });
});

describe("passthrough canary", () => {
  it("has the expected identity and contract", () => {
    expect(passthroughV1.id).toBe("_canary.passthrough");
    expect(passthroughV1.version).toBe(1);
    expect(passthroughV1.surface).toBe("internal");
    expect(passthroughV1.kind).toBe("fragment");
    expect(passthroughV1.entryPoint).toBe("fs_main");
    expect(passthroughV1.io.inputs.source).toBeDefined();
    expect(passthroughV1.io.output.dimensions).toBe("same-as:source");
    expect(passthroughV1.io.rod).toBe("same-as:source");
  });

  it("resolves WGSL with the layout bindings injected", () => {
    const wgsl = passthroughV1.wgsl;
    // tgpu.resolve replaced `layout.$.*` references with generated bindings.
    expect(wgsl).not.toContain("layout.$");
    expect(wgsl).toContain("fn fs_main");
    expect(wgsl).toContain("texture_2d<f32>");
    expect(wgsl).toContain("sampler");
    expect(wgsl).toContain("var<uniform>");
  });

  it("defaults tint to white (identity copy)", () => {
    expect([
      passthroughV1.paramDefaults.tint.x,
      passthroughV1.paramDefaults.tint.y,
      passthroughV1.paramDefaults.tint.z,
      passthroughV1.paramDefaults.tint.w
    ]).toEqual([1, 1, 1, 1]);
  });
});
