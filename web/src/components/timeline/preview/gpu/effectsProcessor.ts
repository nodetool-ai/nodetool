import type { ClipEffect, ClipColorEffect } from "@nodetool-ai/timeline";
import { blurComputeShader, effectsComputeShader } from "./shaders";

interface AggregatedColor {
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  temperature: number;
  tint: number;
  shadows: number;
  highlights: number;
}

const NEUTRAL_COLOR: AggregatedColor = {
  brightness: 0,
  contrast: 1,
  saturation: 1,
  hue: 0,
  temperature: 0,
  tint: 0,
  shadows: 0,
  highlights: 0
};

const COLOR_UNIFORM_BYTES = 32;
const BLUR_UNIFORM_BYTES = 16;
const DIMS_UNIFORM_BYTES = 16;

interface IntermediatePool {
  width: number;
  height: number;
  textures: [GPUTexture, GPUTexture];
  dimsBuffer: GPUBuffer;
  /** Currently holds the latest pixel state (input to next pass). */
  currentIndex: 0 | 1;
}

/**
 * GPU pre-pass for per-clip color grading and Gaussian blur. Caller passes
 * a source GPU texture + ClipEffect[] and gets back a texture (either the
 * original if no effects apply, or a processed intermediate). Intermediate
 * textures are pooled by layer id + source dimensions so we don't reallocate
 * every frame.
 */
export class WebGPUEffectsProcessor {
  private device: GPUDevice;

  private effectsPipeline: GPUComputePipeline;
  private blurPipeline: GPUComputePipeline;
  private bindGroupLayout: GPUBindGroupLayout;

  private colorBuffer: GPUBuffer;
  private blurBuffer: GPUBuffer;

  private pools = new Map<string, IntermediatePool>();

  constructor(device: GPUDevice) {
    this.device = device;

    this.bindGroupLayout = device.createBindGroupLayout({
      label: "preview-effects-layout",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          texture: { sampleType: "float" }
        },
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          storageTexture: { access: "write-only", format: "rgba8unorm" }
        },
        {
          binding: 2,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "uniform" }
        },
        {
          binding: 3,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "uniform" }
        }
      ]
    });
    const layout = device.createPipelineLayout({
      bindGroupLayouts: [this.bindGroupLayout]
    });
    this.effectsPipeline = device.createComputePipeline({
      label: "preview-color-effects",
      layout,
      compute: {
        module: device.createShaderModule({ code: effectsComputeShader }),
        entryPoint: "main"
      }
    });
    this.blurPipeline = device.createComputePipeline({
      label: "preview-blur",
      layout,
      compute: {
        module: device.createShaderModule({ code: blurComputeShader }),
        entryPoint: "main"
      }
    });

    this.colorBuffer = device.createBuffer({
      label: "preview-color-uniforms",
      size: COLOR_UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    this.blurBuffer = device.createBuffer({
      label: "preview-blur-uniforms",
      size: BLUR_UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
  }

  /** Returns a compatible bind group layout for callers that need it. */
  getBindGroupLayout(): GPUBindGroupLayout {
    return this.bindGroupLayout;
  }

  /**
   * Run the effects chain on `source` and return a GPU texture with the
   * processed pixels. If no effects are enabled, returns `source` itself
   * (caller should not destroy it on the assumption it's owned).
   */
  process(
    poolKey: string,
    source: GPUTexture,
    width: number,
    height: number,
    effects: ClipEffect[]
  ): GPUTexture {
    const enabled = effects.filter((e) => e.enabled);
    if (enabled.length === 0) return source;

    const color = aggregateColor(enabled);
    const blur = enabled.find((e): e is ClipEffect & { type: "blur" } =>
      e.type === "blur"
    );
    const colorActive = isColorActive(color);
    const blurActive = blur != null && blur.radius >= 0.5;
    if (!colorActive && !blurActive) return source;

    const pool = this.getPool(poolKey, width, height);
    const encoder = this.device.createCommandEncoder({
      label: `preview-effects-${poolKey}`
    });

    // Seed: copy source → textures[0]
    encoder.copyTextureToTexture(
      { texture: source },
      { texture: pool.textures[0] },
      { width, height }
    );
    pool.currentIndex = 0;

    if (colorActive) {
      this.writeColor(color);
      this.dispatch(encoder, pool, this.effectsPipeline);
    }
    if (blurActive && blur) {
      // Horizontal then vertical pass.
      this.writeBlur(blur.radius, blur.sigma ?? blur.radius / 3, 1, 0);
      this.dispatch(encoder, pool, this.blurPipeline);
      this.writeBlur(blur.radius, blur.sigma ?? blur.radius / 3, 0, 1);
      this.dispatch(encoder, pool, this.blurPipeline);
    }

    this.device.queue.submit([encoder.finish()]);
    return pool.textures[pool.currentIndex];
  }

  private writeColor(c: AggregatedColor): void {
    const data = new Float32Array([
      c.brightness,
      c.contrast,
      c.saturation,
      c.hue,
      c.temperature,
      c.tint,
      c.shadows,
      c.highlights
    ]);
    this.device.queue.writeBuffer(this.colorBuffer, 0, data.buffer, 0, data.byteLength);
  }

  private writeBlur(radius: number, sigma: number, dx: number, dy: number): void {
    const data = new Float32Array([radius, sigma, dx, dy]);
    this.device.queue.writeBuffer(this.blurBuffer, 0, data.buffer, 0, data.byteLength);
  }

  private dispatch(
    encoder: GPUCommandEncoder,
    pool: IntermediatePool,
    pipeline: GPUComputePipeline
  ): void {
    const inIdx = pool.currentIndex;
    const outIdx = (1 - inIdx) as 0 | 1;
    const uniformBuffer =
      pipeline === this.effectsPipeline ? this.colorBuffer : this.blurBuffer;

    const bindGroup = this.device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: pool.textures[inIdx].createView() },
        { binding: 1, resource: pool.textures[outIdx].createView() },
        { binding: 2, resource: { buffer: uniformBuffer } },
        { binding: 3, resource: { buffer: pool.dimsBuffer } }
      ]
    });

    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(
      Math.ceil(pool.width / 16),
      Math.ceil(pool.height / 16),
      1
    );
    pass.end();

    pool.currentIndex = outIdx;
  }

  private getPool(key: string, width: number, height: number): IntermediatePool {
    const existing = this.pools.get(key);
    if (existing && existing.width === width && existing.height === height) {
      return existing;
    }
    if (existing) {
      existing.textures[0].destroy();
      existing.textures[1].destroy();
      existing.dimsBuffer.destroy();
    }
    const make = (label: string) =>
      this.device.createTexture({
        label,
        size: { width, height },
        format: "rgba8unorm",
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.STORAGE_BINDING |
          GPUTextureUsage.COPY_SRC |
          GPUTextureUsage.COPY_DST
      });
    const dimsBuffer = this.device.createBuffer({
      label: `preview-effects-dims-${key}`,
      size: DIMS_UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    const dims = new Uint32Array([width, height, 0, 0]);
    this.device.queue.writeBuffer(dimsBuffer, 0, dims.buffer, 0, dims.byteLength);
    const pool: IntermediatePool = {
      width,
      height,
      textures: [make(`preview-effects-${key}-a`), make(`preview-effects-${key}-b`)],
      dimsBuffer,
      currentIndex: 0
    };
    this.pools.set(key, pool);
    return pool;
  }

  releasePool(key: string): void {
    const pool = this.pools.get(key);
    if (!pool) return;
    pool.textures[0].destroy();
    pool.textures[1].destroy();
    pool.dimsBuffer.destroy();
    this.pools.delete(key);
  }

  retainOnly(keys: Iterable<string>): void {
    const keep = new Set(keys);
    for (const key of [...this.pools.keys()]) {
      if (!keep.has(key)) this.releasePool(key);
    }
  }

  dispose(): void {
    for (const pool of this.pools.values()) {
      pool.textures[0].destroy();
      pool.textures[1].destroy();
      pool.dimsBuffer.destroy();
    }
    this.pools.clear();
    this.colorBuffer.destroy();
    this.blurBuffer.destroy();
  }
}

function aggregateColor(effects: ClipEffect[]): AggregatedColor {
  const out: AggregatedColor = { ...NEUTRAL_COLOR };
  for (const e of effects) {
    if (e.type !== "color") continue;
    const c = e as ClipColorEffect;
    out.brightness += c.brightness ?? 0;
    out.contrast *= c.contrast ?? 1;
    out.saturation *= c.saturation ?? 1;
    out.hue += c.hue ?? 0;
    out.temperature += c.temperature ?? 0;
    out.tint += c.tint ?? 0;
    out.shadows += c.shadows ?? 0;
    out.highlights += c.highlights ?? 0;
  }
  out.brightness = clamp(out.brightness, -1, 1);
  out.contrast = clamp(out.contrast, 0, 4);
  out.saturation = clamp(out.saturation, 0, 4);
  out.hue = ((out.hue % 360) + 540) % 360 - 180;
  out.temperature = clamp(out.temperature, -1, 1);
  out.tint = clamp(out.tint, -1, 1);
  out.shadows = clamp(out.shadows, -1, 1);
  out.highlights = clamp(out.highlights, -1, 1);
  return out;
}

function isColorActive(c: AggregatedColor): boolean {
  return (
    Math.abs(c.brightness) > 0.001 ||
    Math.abs(c.contrast - 1) > 0.001 ||
    Math.abs(c.saturation - 1) > 0.001 ||
    Math.abs(c.hue) > 0.001 ||
    Math.abs(c.temperature) > 0.001 ||
    Math.abs(c.tint) > 0.001 ||
    Math.abs(c.shadows) > 0.001 ||
    Math.abs(c.highlights) > 0.001
  );
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
