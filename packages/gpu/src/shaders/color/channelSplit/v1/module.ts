/**
 * `color.channelSplit@1` — output a single channel of the source as
 * opaque grayscale RGB.
 *
 * `mode = 0` red, `1` green, `2` blue, `3` alpha, `4` luminance
 * (`0.299R + 0.587G + 0.114B`). The selected value is broadcast to all three
 * output RGB channels and the alpha is forced to `1.0`, so the result is a
 * standard grayscale visualization safe to chain into any RGBA consumer.
 * Pairs with `color.channelMerge` to build per-channel pipelines.
 */

import tgpu from "typegpu";
import * as d from "typegpu/data";
import { defineModule } from "../../../../module.js";

export const ChannelSplitParams = d.struct({
  mode: d.f32
});

const layout = tgpu.bindGroupLayout({
  params: { uniform: ChannelSplitParams },
  source: { texture: "float" },
  samp: { sampler: "filtering" }
});

const samplerDescriptor: GPUSamplerDescriptor = {
  magFilter: "linear",
  minFilter: "linear",
  addressModeU: "clamp-to-edge",
  addressModeV: "clamp-to-edge"
};

export const colorChannelSplitV1 = defineModule({
  id: "color.channelSplit",
  version: 1,
  surface: "internal",
  category: "color",
  linearity: "nonlinear-in-rgb",
  kind: "fragment",
  params: ChannelSplitParams,
  paramDefaults: { mode: 0 },
  paramUi: {
    mode: {
      min: 0,
      max: 4,
      step: 1,
      label: "Channel",
      notes: "0 R / 1 G / 2 B / 3 A / 4 luma"
    }
  },
  layout,
  samplers: { samp: samplerDescriptor },
  wgsl: /* wgsl */ `
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let src = textureSample(layout.$.source, layout.$.samp, uv);
  // Un-premultiply so the reported channel/luma reflects the underlying
  // straight colour. Reading premultiplied rgb directly under-reports every
  // channel on partial-alpha pixels (e.g. a 50%-transparent mid-grey reads at
  // half its true value).
  let straight = src.rgb / max(src.a, 1.0 / 255.0);
  let mode = i32(round(layout.$.params.mode));
  var v: f32 = 0.0;
  if (mode == 0) {
    v = straight.r;
  } else if (mode == 1) {
    v = straight.g;
  } else if (mode == 2) {
    v = straight.b;
  } else if (mode == 3) {
    v = src.a;
  } else {
    v = dot(straight, vec3f(0.299, 0.587, 0.114));
  }
  return vec4f(v, v, v, 1.0);
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
