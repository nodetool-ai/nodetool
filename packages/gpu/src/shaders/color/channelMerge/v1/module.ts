/**
 * `color.channelMerge@1` — merge RGB from `source` with a single-channel alpha
 * lifted from a second texture.
 *
 * `alphaChannel` selects which channel of the `alpha` input drives output
 * alpha (`0` R, `1` G, `2` B, `3` A, `4` luma). The RGB of `source` is
 * carried straight through; the result is then re-premultiplied with the new
 * alpha so downstream consumers see the pool's canonical premultiplied form.
 *
 * Pairs with `color.channelSplit` (extract a channel as grayscale) and
 * `mask.fromImage` (extract a coverage mask) — together they form the
 * minimum-viable "swap an image's alpha for another image's channel"
 * pipeline.
 */

import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

export const ChannelMergeParams = d.struct({
  alphaChannel: d.f32
});

const layout = tgpu.bindGroupLayout({
  params: { uniform: ChannelMergeParams },
  source: { texture: "float" },
  alpha: { texture: "float" },
  samp: { sampler: "filtering" }
});

const samplerDescriptor: GPUSamplerDescriptor = {
  magFilter: "linear",
  minFilter: "linear",
  addressModeU: "clamp-to-edge",
  addressModeV: "clamp-to-edge"
};

export const colorChannelMergeV1 = defineModule({
  id: "color.channelMerge",
  version: 1,
  surface: "internal",
  category: "color",
  kind: "fragment",
  params: ChannelMergeParams,
  paramDefaults: { alphaChannel: 3 },
  paramUi: {
    alphaChannel: {
      min: 0,
      max: 4,
      step: 1,
      label: "Alpha source",
      notes: "0 R / 1 G / 2 B / 3 A / 4 luma"
    }
  },
  layout,
  samplers: { samp: samplerDescriptor },
  wgsl: /* wgsl */ `
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let src = textureSample(layout.$.source, layout.$.samp, uv);
  let alphaSrc = textureSample(layout.$.alpha, layout.$.samp, uv);
  let mode = i32(round(layout.$.params.alphaChannel));
  var newA: f32 = 0.0;
  if (mode == 0) {
    newA = alphaSrc.r;
  } else if (mode == 1) {
    newA = alphaSrc.g;
  } else if (mode == 2) {
    newA = alphaSrc.b;
  } else if (mode == 3) {
    newA = alphaSrc.a;
  } else {
    newA = dot(alphaSrc.rgb, vec3f(0.299, 0.587, 0.114));
  }
  newA = clamp(newA, 0.0, 1.0);
  // Un-premultiply source RGB by its own alpha, then re-premultiply with the
  // new alpha so downstream consumers see canonical premultiplied output.
  let safeA = max(src.a, 0.0001);
  let straightRgb = src.rgb / safeA;
  return vec4f(straightRgb * newA, newA);
}
`,
  io: {
    inputs: {
      source: {
        colorSpace: "linear",
        alpha: "premultiplied",
        bindingKinds: ["texture_2d"]
      },
      alpha: {
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
