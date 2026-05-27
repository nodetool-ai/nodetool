/**
 * Item 3 of the shader-pool invariant enforcement plan: load-time WGSL
 * linearity validator. Tests the rules directly against the pure function and
 * also via `defineModule` to confirm the throw path is wired up.
 */
import { describe, it, expect } from "vitest";
import * as d from "typegpu/data";
import tgpu from "typegpu";
import { defineModule } from "../src/module.js";
import { validateWgslLinearity } from "../src/validate/wgslLinearity.js";
import type { InputContract } from "../src/types.js";

const PREMUL: InputContract = {
  colorSpace: "linear",
  alpha: "premultiplied",
  bindingKinds: ["texture_2d"]
};
const STRAIGHT: InputContract = {
  colorSpace: "linear",
  alpha: "straight",
  bindingKinds: ["texture_2d"]
};

describe("validateWgslLinearity (unit)", () => {
  it("flags linear-in-rgb with a nonlinear op on .rgb (pow)", () => {
    const wgsl = `
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let src = textureSample(source, samp, uv);
  let processed = pow(src.rgb, vec3f(2.2));
  return vec4f(processed, src.a);
}
`;
    const res = validateWgslLinearity({
      id: "test.lin",
      linearity: "linear-in-rgb",
      wgsl,
      inputs: { source: PREMUL }
    });
    expect(res.ok).toBe(false);
    expect(res.violations.join("\n")).toMatch(/nonlinear op/);
    expect(res.violations.join("\n")).toMatch(/pow/);
  });

  it("flags nonlinear-in-rgb that uses .rgb on a premul sample without unpremul", () => {
    const wgsl = `
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let src = textureSample(source, samp, uv);
  let inverted = vec3f(1.0) - src.rgb;
  return vec4f(inverted, src.a);
}
`;
    const res = validateWgslLinearity({
      id: "test.nonlin.bad",
      linearity: "nonlinear-in-rgb",
      wgsl,
      inputs: { source: PREMUL }
    });
    expect(res.ok).toBe(false);
    expect(res.violations.join("\n")).toMatch(/no `unpremul`/);
  });

  it("passes nonlinear-in-rgb that contains an `unpremul` token", () => {
    const wgsl = `
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let src = textureSample(source, samp, uv);
  let unpremulRgb = src.rgb / max(src.a, 0.0001); // explicit unpremul handshake
  let inverted = vec3f(1.0) - unpremulRgb;
  return vec4f(inverted * src.a, src.a);
}
`;
    const res = validateWgslLinearity({
      id: "test.nonlin.good",
      linearity: "nonlinear-in-rgb",
      wgsl,
      inputs: { source: PREMUL }
    });
    expect(res.ok).toBe(true);
  });

  it("passes nonlinear-in-rgb whose inputs are all `straight`", () => {
    const wgsl = `
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let src = textureSample(source, samp, uv);
  return vec4f(pow(src.rgb, vec3f(2.2)), src.a);
}
`;
    const res = validateWgslLinearity({
      id: "test.nonlin.straight",
      linearity: "nonlinear-in-rgb",
      wgsl,
      inputs: { source: STRAIGHT }
    });
    expect(res.ok).toBe(true);
  });

  it("passes alpha-only that returns vec4f(0,0,0,1-a)", () => {
    const wgsl = `
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let src = textureSample(source, samp, uv);
  return vec4f(0.0, 0.0, 0.0, 1.0 - src.a);
}
`;
    const res = validateWgslLinearity({
      id: "test.alpha.good",
      linearity: "alpha-only",
      wgsl,
      inputs: { source: PREMUL }
    });
    expect(res.ok).toBe(true);
  });

  it("flags alpha-only that returns vec4f(src.rgb, 1.0)", () => {
    const wgsl = `
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let src = textureSample(source, samp, uv);
  return vec4f(src.rgb, 1.0);
}
`;
    const res = validateWgslLinearity({
      id: "test.alpha.bad",
      linearity: "alpha-only",
      wgsl,
      inputs: { source: PREMUL }
    });
    expect(res.ok).toBe(false);
    expect(res.violations.join("\n")).toMatch(/non-zero RGB/);
  });

  it("suppresses a flagged line with `// premul: ok`", () => {
    const wgsl = `
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let src = textureSample(source, samp, uv);
  let processed = pow(src.rgb, vec3f(2.2)); // premul: ok
  return vec4f(processed, src.a);
}
`;
    const res = validateWgslLinearity({
      id: "test.suppressed",
      linearity: "linear-in-rgb",
      wgsl,
      inputs: { source: PREMUL }
    });
    expect(res.ok).toBe(true);
  });

  it("env flag `off` disables the validator even on a violating module", () => {
    const env = (
      globalThis as { process?: { env?: Record<string, string | undefined> } }
    ).process?.env;
    const prev = env?.NODETOOL_GPU_VALIDATE;
    if (env) env.NODETOOL_GPU_VALIDATE = "off";
    try {
      const wgsl = `
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let src = textureSample(source, samp, uv);
  return vec4f(pow(src.rgb, vec3f(2.2)), src.a);
}
`;
      const res = validateWgslLinearity({
        id: "test.envoff",
        linearity: "linear-in-rgb",
        wgsl,
        inputs: { source: PREMUL }
      });
      expect(res.ok).toBe(true);
    } finally {
      if (env) {
        if (prev === undefined) delete env.NODETOOL_GPU_VALIDATE;
        else env.NODETOOL_GPU_VALIDATE = prev;
      }
    }
  });

  it("skips validation for `source` linearity", () => {
    const wgsl = `
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  return vec4f(pow(uv.x, 2.2), 0.0, 0.0, 1.0);
}
`;
    const res = validateWgslLinearity({
      id: "test.src",
      linearity: "source",
      wgsl,
      inputs: {}
    });
    expect(res.ok).toBe(true);
  });
});

describe("defineModule throws on linearity violation", () => {
  it("rejects a linear-in-rgb module that applies pow() to .rgb", () => {
    const Params = d.struct({ x: d.f32 });
    const layout = tgpu.bindGroupLayout({
      params: { uniform: Params },
      source: { texture: "float" },
      samp: { sampler: "filtering" }
    });
    expect(() =>
      defineModule({
        id: "test.bad.linear",
        version: 1,
        surface: "internal",
        category: "color",
        linearity: "linear-in-rgb",
        params: Params,
        paramDefaults: { x: 0 },
        layout,
        wgsl: `
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let src = textureSample(layout.$.source, layout.$.samp, uv);
  return vec4f(pow(src.rgb, vec3f(2.2)), src.a);
}
`,
        io: {
          inputs: {
            source: {
              colorSpace: "linear",
              alpha: "premultiplied",
              bindingKinds: ["texture_2d"]
            }
          },
          output: {
            colorSpace: "linear",
            alpha: "premultiplied",
            format: "rgba8unorm",
            dimensions: "same-as:source"
          },
          rod: "same-as:source"
        }
      })
    ).toThrow(/premul-invariant validation failed/);
  });
});
