import { describe, it, expect } from "vitest";
import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../src/module.js";
import { createExecutor } from "../src/executor.js";
import { LabeledTexture, type LabeledTextureMeta } from "../src/texture.js";
import type { GPUContext } from "../src/context.js";

/**
 * Executor input-validation — bindingKind still throws loudly; alpha is
 * checked-and-auto-bridged through `alpha/convert/*` (covered by the GPU
 * tests in `alphaConvert.test.ts`). The CPU-side cases that *throw* run
 * without a device.
 */

const Params = d.struct({ x: d.f32 });

const layout = tgpu.bindGroupLayout({
  params: { uniform: Params },
  source: { texture: "float" },
  samp: { sampler: "filtering" }
});

const linearPremul = defineModule({
  id: "_test.linearPremul",
  version: 1,
  surface: "internal",
  category: "_canary",
  kind: "fragment",
  params: Params,
  paramDefaults: { x: 0 },
  layout,
  samplers: {
    samp: {
      magFilter: "linear",
      minFilter: "linear",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge"
    }
  },
  wgsl: /* wgsl */ `
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  return textureSample(layout.$.source, layout.$.samp, uv) * layout.$.params.x;
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
});

function fakeLabeled(meta: LabeledTextureMeta): LabeledTexture {
  return new LabeledTexture({} as GPUTexture, {
    label: "fake",
    format: "rgba8unorm",
    width: 1,
    height: 1,
    meta
  });
}

// Validation runs before any ctx use, so a stub explodes only if a *passing*
// case wrongly reaches encodeFragment/encodeCompute (which it shouldn't in
// these throw-cases).
const STUB_CTX = {} as GPUContext;

describe("Executor input validation (CPU)", () => {
  const executor = createExecutor();

  it("throws on bindingKind mismatch", () => {
    const source = fakeLabeled({
      colorSpace: "linear",
      alpha: "premultiplied",
      bindingKind: "texture_external"
    });
    const output = fakeLabeled({
      colorSpace: "linear",
      alpha: "premultiplied",
      bindingKind: "texture_2d"
    });
    expect(() =>
      executor.encode({
        ctx: STUB_CTX,
        module: linearPremul,
        encoder: {} as GPUCommandEncoder,
        inputs: { source },
        output,
        params: { x: 0 },
        dispatch: { kind: "fragment" }
      })
    ).toThrow(/binding kind "texture_external"/);
  });

  it("throws on missing required input", () => {
    const output = fakeLabeled({
      colorSpace: "linear",
      alpha: "premultiplied",
      bindingKind: "texture_2d"
    });
    expect(() =>
      executor.encode({
        ctx: STUB_CTX,
        module: linearPremul,
        encoder: {} as GPUCommandEncoder,
        inputs: {},
        output,
        params: { x: 0 },
        dispatch: { kind: "fragment" }
      })
    ).toThrow(/missing required input "source"/);
  });
});
