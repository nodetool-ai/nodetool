import { colorBrightnessContrastV1, colorCubeLutV1, createDefaultRegistry, createExecutor, createGPUContextFromDevice,
  createLabeledTexture, createRecipeRunner, filtersGlowV1 } from "@nodetool-ai/gpu/pool";
import { createNodeGPUDevice } from "@nodetool-ai/gpu/node";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import * as d from "typegpu/data";
import type { GameRendererEffect } from "./index.js";

const CONVERSION_SHADER = `
override encodeOutput: bool = true;
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
  let premul = textureSample(sourceTexture, sourceSampler, input.uv);
  let straight = premul.rgb / max(premul.a, 1.0 / 255.0);
  let linear = select(straight / 12.92, pow((straight + 0.055) / 1.055, vec3f(2.4)),
    straight > vec3f(0.04045));
  let encoded = select(straight * 12.92, 1.055 * pow(straight, vec3f(1.0 / 2.4)) - 0.055,
    straight > vec3f(0.0031308));
  let converted = select(linear, encoded, encodeOutput);
  return vec4f(clamp(converted, vec3f(0.0), vec3f(1.0)) * premul.a, premul.a);
}`;

function toLinear(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function toSrgb(value: number): number {
  return value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
}

/** Runs browser GPU effect modules on a straight-alpha sRGB Canvas2D capture. */
export async function applyGpuEffects(rgba: Uint8ClampedArray, width: number, height: number,
  effects: readonly GameRendererEffect[], resolveAsset?: (assetId: string) => Promise<Uint8Array | null>,
  onDiagnostic?: (message: string) => void): Promise<Uint8ClampedArray> {
  const device = await createNodeGPUDevice();
  device.pushErrorScope("validation");
  let validationScopeOpen = true;
  const ctx = createGPUContextFromDevice(device);
  const executor = createExecutor();
  const runner = createRecipeRunner();
  const registry = createDefaultRegistry();
  const usage = GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC;
  const source = createLabeledTexture(device, { width, height, format: "rgba8unorm", usage, label: "game-capture-source" });
  const target = createLabeledTexture(device, { width, height, format: "rgba8unorm", usage, label: "game-capture-target" });
  const srgbSource = effects.some((effect) => effect.kind === "lut") ? createLabeledTexture(device, {
    width, height, format: "rgba8unorm", usage, label: "game-capture-srgb-source", meta: { colorSpace: "srgb" } }) : undefined;
  const srgbTarget = effects.some((effect) => effect.kind === "lut") ? createLabeledTexture(device, {
    width, height, format: "rgba8unorm", usage, label: "game-capture-srgb-target", meta: { colorSpace: "srgb" } }) : undefined;
  const lutTextures: GPUTexture[] = [];
  const module = device.createShaderModule({ code: CONVERSION_SHADER });
  const layout = device.createBindGroupLayout({ entries: [
    { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
    { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } }
  ] });
  const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [layout] });
  const pipeline = (encodeOutput: boolean): GPURenderPipeline => device.createRenderPipeline({
    layout: pipelineLayout,
    vertex: { module, entryPoint: "vertexMain" },
    fragment: { module, entryPoint: "fragmentMain", constants: { encodeOutput: encodeOutput ? 1 : 0 }, targets: [{ format: "rgba8unorm" }] },
    primitive: { topology: "triangle-list" }
  });
  const toSrgbPipeline = pipeline(true);
  const toLinearPipeline = pipeline(false);
  const sampler = device.createSampler({ magFilter: "nearest", minFilter: "nearest" });
  const convert = (encoder: GPUCommandEncoder, input: GPUTexture, output: GPUTexture, conversion: GPURenderPipeline): void => {
    const group = device.createBindGroup({ layout, entries: [
      { binding: 0, resource: sampler }, { binding: 1, resource: input.createView() }
    ] });
    const pass = encoder.beginRenderPass({ colorAttachments: [{ view: output.createView(), loadOp: "clear", storeOp: "store",
      clearValue: { r: 0, g: 0, b: 0, a: 0 } }] });
    pass.setPipeline(conversion);
    pass.setBindGroup(0, group);
    pass.draw(3);
    pass.end();
  };
  const bytesPerRow = Math.ceil(width * 4 / 256) * 256;
  const readback = device.createBuffer({ size: bytesPerRow * height, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  try {
    const linear = new Uint8Array(width * height * 4);
    for (let index = 0; index < rgba.length; index += 4) {
      const alpha = (rgba[index + 3] ?? 0) / 255;
      linear[index] = Math.round(toLinear((rgba[index] ?? 0) / 255) * alpha * 255);
      linear[index + 1] = Math.round(toLinear((rgba[index + 1] ?? 0) / 255) * alpha * 255);
      linear[index + 2] = Math.round(toLinear((rgba[index + 2] ?? 0) / 255) * alpha * 255);
      linear[index + 3] = rgba[index + 3] ?? 0;
    }
    device.queue.writeTexture({ texture: source.texture }, linear, { bytesPerRow: width * 4 }, [width, height]);
    const encoder = device.createCommandEncoder();
    let input = source;
    let output = target;
    ctx.uniformRing.beginSubmission();
    for (const effect of effects) {
      if (effect.kind === "brightnessContrast") {
        executor.encode({ ctx, module: colorBrightnessContrastV1, encoder, inputs: { source: input }, output,
          params: { brightness: effect.brightness, contrast: effect.contrast }, dispatch: { kind: "fragment" } });
      } else if (effect.kind === "bloom") {
        runner.encode({ ctx, module: filtersGlowV1, registry, executor, encoder, inputs: { source: input }, output,
          params: { threshold: effect.threshold, softness: effect.softness, radius: effect.radius, intensity: effect.intensity } });
      } else {
        if (!srgbSource || !srgbTarget) throw new Error("LUT capture targets are missing");
        let lutPixels: Uint8ClampedArray;
        let lutWidth: number;
        let lutHeight: number;
        try {
          const bytes = await resolveAsset?.(effect.assetId);
          if (!bytes) throw new Error(`LUT ${effect.assetId} is missing`);
          const image = await loadImage(Buffer.from(bytes));
          if (image.width !== effect.size * effect.size || image.height !== effect.size) {
            throw new Error(`LUT ${effect.assetId} has invalid dimensions`);
          }
          const canvas = createCanvas(image.width, image.height);
          const context = canvas.getContext("2d");
          context.drawImage(image, 0, 0);
          lutPixels = context.getImageData(0, 0, image.width, image.height).data;
          for (let index = 3; index < lutPixels.length; index += 4) {
            if (lutPixels[index] !== 255) throw new Error(`LUT ${effect.assetId} must be opaque`);
          }
          lutWidth = image.width;
          lutHeight = image.height;
        } catch (error) {
          if (effect.required) throw error;
          onDiagnostic?.(`Optional LUT ${effect.assetId} omitted: ${error instanceof Error ? error.message : String(error)}`);
          continue;
        }
        const lut = createLabeledTexture(device, { width: lutWidth, height: lutHeight, format: "rgba8unorm",
          usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST, label: `game-capture-lut-${effect.assetId}`,
          meta: { colorSpace: "srgb" } });
        lutTextures.push(lut.texture);
        device.queue.writeTexture({ texture: lut.texture }, lutPixels, { bytesPerRow: lutWidth * 4 }, [lutWidth, lutHeight]);
        convert(encoder, input.texture, srgbSource.texture, toSrgbPipeline);
        srgbSource.markWritten();
        executor.encode({ ctx, module: colorCubeLutV1, encoder, inputs: { source: srgbSource, lut }, output: srgbTarget,
          params: { size: effect.size, intensity: effect.intensity,
            domainMin: d.vec4f(...effect.domainMin, 0), domainMax: d.vec4f(...effect.domainMax, 0) },
          dispatch: { kind: "fragment" } });
        convert(encoder, srgbTarget.texture, output.texture, toLinearPipeline);
        output.markWritten();
      }
      [input, output] = [output, input];
    }
    encoder.copyTextureToBuffer({ texture: input.texture }, { buffer: readback, bytesPerRow }, [width, height]);
    device.queue.submit([encoder.finish()]);
    await readback.mapAsync(GPUMapMode.READ);
    const validationError = await device.popErrorScope();
    validationScopeOpen = false;
    if (validationError) {
      throw new Error(`GPU capture failed: ${validationError.message}`);
    }
    const mapped = new Uint8Array(readback.getMappedRange());
    const result = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        const offset = y * bytesPerRow + x * 4;
        const alpha = (mapped[offset + 3] ?? 0) / 255;
        for (let channel = 0; channel < 3; channel += 1) {
          const straight = alpha > 0 ? (mapped[offset + channel] ?? 0) / 255 / alpha : 0;
          result[index + channel] = Math.round(Math.max(0, Math.min(1, toSrgb(straight))) * 255);
        }
        result[index + 3] = mapped[offset + 3] ?? 0;
      }
    }
    return result;
  } finally {
    if (validationScopeOpen) {
      await device.popErrorScope();
    }
    readback.unmap();
    readback.destroy();
    source.destroy();
    target.destroy();
    srgbSource?.destroy();
    srgbTarget?.destroy();
    for (const texture of lutTextures) texture.destroy();
    ctx.scratch.dispose();
    ctx.uniformRing.dispose();
    ctx.root.destroy();
    device.destroy();
  }
}
