import { colorBrightnessContrastV1, colorCubeLutV1, createDefaultRegistry, createExecutor, createGPUContextFromDevice, createRecipeRunner, filtersGlowV1, LabeledTexture } from "@nodetool-ai/gpu/pool";
import * as d from "typegpu/data";
import type { GameRendererEffect } from "../index.js";

interface EffectEncoding {
  readonly effects: readonly GameRendererEffect[];
  readonly source: LabeledTexture;
  readonly output: LabeledTexture;
  readonly encoder: GPUCommandEncoder;
  readonly effectContext: ReturnType<typeof createGPUContextFromDevice>;
  readonly effectExecutor: ReturnType<typeof createExecutor>;
  readonly effectRecipeRunner: ReturnType<typeof createRecipeRunner>;
  readonly effectRegistry: ReturnType<typeof createDefaultRegistry>;
  readonly srgbTarget: LabeledTexture | undefined;
  readonly lutTarget: LabeledTexture | undefined;
  readonly toSrgbPipeline: GPURenderPipeline;
  readonly toLinearPipeline: GPURenderPipeline;
  readonly getLutTexture: (id: string, size: number) => Promise<LabeledTexture>;
  readonly convertColor: (encoder: GPUCommandEncoder, source: LabeledTexture, output: LabeledTexture, pipeline: GPURenderPipeline) => void;
}

export async function encodeGameEffects(options: EffectEncoding): Promise<LabeledTexture> {
  let { source, output } = options;
  const { encoder } = options;
  source.markWritten();
  options.effectContext.uniformRing.beginSubmission();
  for (const effect of options.effects) {
    if (effect.kind === "brightnessContrast") {
      options.effectExecutor.encode({ ctx: options.effectContext, module: colorBrightnessContrastV1,
        encoder, inputs: { source }, output,
        params: { brightness: effect.brightness, contrast: effect.contrast },
        dispatch: { kind: "fragment" } });
    } else if (effect.kind === "bloom") {
      options.effectRecipeRunner.encode({ ctx: options.effectContext, module: filtersGlowV1,
        registry: options.effectRegistry, executor: options.effectExecutor, encoder, inputs: { source }, output,
        params: { threshold: effect.threshold, softness: effect.softness,
          radius: effect.radius, intensity: effect.intensity } });
    } else {
      const srgbSource = options.srgbTarget;
      const srgbOutput = options.lutTarget;
      if (!srgbSource || !srgbOutput) { throw new Error("LUT color targets are unavailable"); }
      const lut = await options.getLutTexture(effect.assetId, effect.size);
      options.convertColor(encoder, source, srgbSource, options.toSrgbPipeline);
      options.effectExecutor.encode({ ctx: options.effectContext, module: colorCubeLutV1,
        encoder, inputs: { source: srgbSource, lut }, output: srgbOutput,
        params: { size: effect.size, intensity: effect.intensity,
          domainMin: d.vec4f(...effect.domainMin, 0), domainMax: d.vec4f(...effect.domainMax, 0) },
        dispatch: { kind: "fragment" } });
      options.convertColor(encoder, srgbOutput, output, options.toLinearPipeline);
    }
    [source, output] = [output, source];
  }
  return source;
}

export const PRESENT_SHADER = `
override decodeInput: bool = false;
override encodeOutput: bool = true;
override cropScaleX: f32 = 1.0;
override cropScaleY: f32 = 1.0;
override cropOffsetX: f32 = 0.0;
override cropOffsetY: f32 = 0.0;
@group(0) @binding(0) var sourceSampler: sampler;
@group(0) @binding(1) var sourceTexture: texture_2d<f32>;
struct VertexOutput { @builtin(position) position: vec4f, @location(0) uv: vec2f };
@vertex fn vertexMain(@builtin(vertex_index) index: u32) -> VertexOutput {
  let positions = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var output: VertexOutput;
  output.position = vec4f(positions[index], 0.0, 1.0);
  output.uv = positions[index] * vec2f(0.5, -0.5) + vec2f(0.5, 0.5);
  return output;
}
@fragment fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  let uv = input.uv * vec2f(cropScaleX, cropScaleY) + vec2f(cropOffsetX, cropOffsetY);
  let premul = textureSample(sourceTexture, sourceSampler, uv);
  let straight = premul.rgb / max(premul.a, 1.0 / 255.0);
  let linear = select(straight / 12.92, pow((straight + 0.055) / 1.055, vec3f(2.4)),
    straight > vec3f(0.04045));
  let encoded = select(straight * 12.92, 1.055 * pow(straight, vec3f(1.0 / 2.4)) - 0.055,
    straight > vec3f(0.0031308));
  var converted = select(straight, linear, decodeInput);
  converted = select(converted, encoded, encodeOutput);
  return vec4f(clamp(converted, vec3f(0.0), vec3f(1.0)) * premul.a, premul.a);
}`;
