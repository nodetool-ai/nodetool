import { describe, it, expect } from "vitest";
import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../src/module.js";
import { resolveVariant } from "../src/executor.js";
import { createLabeledTexture } from "../src/texture.js";
import { LabeledTexture } from "../src/texture.js";

/**
 * Variant resolution lookup logic — pure, doesn't touch a `GPUDevice`. The
 * Executor only calls `resolveVariant` to pick which `(layout, wgsl, ...)` to
 * bind against; tests exercise the selection rules without acquiring a device.
 */

const Params = d.struct({ amount: d.f32 });

const primaryLayout = tgpu.bindGroupLayout({
  params: { uniform: Params },
  source: { texture: "float" },
  samp: { sampler: "filtering" }
});

const externalLayout = tgpu.bindGroupLayout({
  params: { uniform: Params },
  source: { externalTexture: {} },
  samp: { sampler: "filtering" }
});

const passthroughWithVariant = defineModule({
  id: "_test.variantedPassthrough",
  version: 1,
  surface: "internal",
  category: "_canary",
  linearity: "linear-in-rgb",
  kind: "fragment",
  params: Params,
  paramDefaults: { amount: 1 },
  layout: primaryLayout,
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
  return textureSample(layout.$.source, layout.$.samp, uv) * layout.$.params.amount;
}
`,
  variants: [
    {
      name: "external",
      bindingKinds: { source: "texture_external" },
      requires: { textureExternal: true },
      layout: externalLayout,
      rawWgsl: true,
      samplers: {
        samp: {
          magFilter: "linear",
          minFilter: "linear",
          addressModeU: "clamp-to-edge",
          addressModeV: "clamp-to-edge"
        }
      },
      // Raw WGSL: bypasses tgpu.resolve since typegpu can't currently inline
      // texture_external bindings. The variant's `@group/@binding` decls match
      // the typed layout's order (params, source, sampler).
      wgsl: /* wgsl */ `
struct VariantParams { amount: f32 };
@group(0) @binding(0) var<uniform> params: VariantParams;
@group(0) @binding(1) var srcExternal: texture_external;
@group(0) @binding(2) var samp: sampler;
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  return textureSampleBaseClampToEdge(srcExternal, samp, uv) * params.amount;
}
`
    }
  ],
  io: {
    inputs: {
      source: {
        colorSpace: "linear",
        alpha: "premultiplied",
        bindingKinds: ["texture_2d", "texture_external"]
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

// A minimal stand-in LabeledTexture with the right `meta.bindingKind`. The
// resolver only reads metadata, so we don't need a real GPUTexture.
function fakeLabeled(bindingKind: "texture_2d" | "texture_external"): LabeledTexture {
  return new LabeledTexture({} as GPUTexture, {
    label: "fake",
    format: "rgba8unorm",
    width: 1,
    height: 1,
    meta: { colorSpace: "linear", alpha: "premultiplied", bindingKind }
  });
}

describe("resolveVariant", () => {
  it("returns the module's primary when no variants are declared", () => {
    const Plain = d.struct({ x: d.f32 });
    const plainLayout = tgpu.bindGroupLayout({
      params: { uniform: Plain },
      source: { texture: "float" },
      samp: { sampler: "filtering" }
    });
    const plain = defineModule({
      id: "_test.noVariant",
      version: 1,
      surface: "internal",
      category: "_canary",
      linearity: "linear-in-rgb",
      kind: "fragment",
      params: Plain,
      paramDefaults: { x: 0 },
      layout: plainLayout,
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
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f { return vec4f(layout.$.params.x); }
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
    const resolved = resolveVariant(
      plain,
      { source: fakeLabeled("texture_2d") },
      { textureExternal: false, f16Storage: false }
    );
    expect(resolved.variant).toBeUndefined();
    expect(resolved.layout).toBe(plain.layout);
  });

  it("picks the external variant when source is texture_external and capability is present", () => {
    const resolved = resolveVariant(
      passthroughWithVariant,
      { source: fakeLabeled("texture_external") },
      { textureExternal: true, f16Storage: false }
    );
    expect(resolved.variant).toBe("external");
    expect(resolved.layout).toBe(externalLayout);
  });

  it("falls back to primary when the variant's required capability is absent", () => {
    const resolved = resolveVariant(
      passthroughWithVariant,
      { source: fakeLabeled("texture_external") },
      { textureExternal: false, f16Storage: false }
    );
    expect(resolved.variant).toBeUndefined();
    expect(resolved.layout).toBe(passthroughWithVariant.layout);
  });

  it("uses primary when source is texture_2d (variant binding kind doesn't match)", () => {
    const resolved = resolveVariant(
      passthroughWithVariant,
      { source: fakeLabeled("texture_2d") },
      { textureExternal: true, f16Storage: false }
    );
    expect(resolved.variant).toBeUndefined();
    expect(resolved.layout).toBe(passthroughWithVariant.layout);
  });

  it("variant carries its own WGSL distinct from the primary", () => {
    // Primary path runs tgpu.resolve and replaces `layout.$.*` references.
    expect(passthroughWithVariant.wgsl).not.toContain("layout.$");
    // External variant opts out of resolve (`rawWgsl: true`) because
    // typegpu can't inline external textures; the WGSL is passed through.
    const variantWgsl = passthroughWithVariant.variants?.[0].wgsl ?? "";
    expect(variantWgsl).toContain("texture_external");
    expect(variantWgsl).toContain("textureSampleBaseClampToEdge");
  });
});
