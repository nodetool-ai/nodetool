import { WebGPUEffectsProcessor } from "./effectsProcessor";
import { blitShader, compositeShader } from "./shaders";
import {
  IDENTITY_TRANSFORM,
  buildTransformMatrix,
  containBaseScale
} from "./transform";
import type {
  CompositeLayer,
  CompositeSource,
  CompositorBlendMode,
  CompositorInitResult
} from "./types";

// WGSL: matrix(64) + opacity/radius/aspect/smoothness/blendMode (5×4=20)
// + vec3<u32> _pad which has 16-byte alignment, so it starts at offset 96
// and the struct size rounds up to 112.
const LAYER_UNIFORM_BYTES = 112;
const ACCUM_FORMAT: GPUTextureFormat = "rgba8unorm";

const BLEND_MODE_INDEX: Record<CompositorBlendMode, number> = {
  normal: 0,
  add: 1,
  multiply: 2,
  screen: 3,
  overlay: 4
};

interface SourceTexture {
  texture: GPUTexture;
  width: number;
  height: number;
  source: CompositeSource;
  lastUploadKey: string;
}

function isSourceReady(source: CompositeSource): boolean {
  if (source instanceof HTMLVideoElement) {
    return source.readyState >= 2;
  }
  if (source instanceof HTMLImageElement) {
    return source.complete && source.naturalWidth > 0;
  }
  return source.width > 0;
}

function sourceDimensions(source: CompositeSource): {
  width: number;
  height: number;
} {
  if (source instanceof HTMLVideoElement) {
    return {
      width: source.videoWidth || 0,
      height: source.videoHeight || 0
    };
  }
  if (source instanceof HTMLImageElement) {
    return {
      width: source.naturalWidth || 0,
      height: source.naturalHeight || 0
    };
  }
  return { width: source.width, height: source.height };
}

function uploadKey(source: CompositeSource): string {
  if (source instanceof HTMLVideoElement) {
    return `v:${source.currentTime}:${source.videoWidth}x${source.videoHeight}`;
  }
  if (source instanceof HTMLImageElement) {
    return `i:${source.src}:${source.naturalWidth}x${source.naturalHeight}`;
  }
  return `b:${source.width}x${source.height}`;
}

export class WebGPUCompositor {
  private device: GPUDevice | null = null;
  private context: GPUCanvasContext | null = null;
  private canvasFormat: GPUTextureFormat = "rgba8unorm";

  private layerUniformLayout: GPUBindGroupLayout | null = null;
  private layerTextureLayout: GPUBindGroupLayout | null = null;
  private accumTextureLayout: GPUBindGroupLayout | null = null;
  private blitTextureLayout: GPUBindGroupLayout | null = null;

  private layerPipeline: GPURenderPipeline | null = null;
  private blitPipeline: GPURenderPipeline | null = null;

  private sampler: GPUSampler | null = null;

  private canvasWidth = 0;
  private canvasHeight = 0;

  private accumA: GPUTexture | null = null;
  private accumB: GPUTexture | null = null;
  private accumIdx: 0 | 1 = 0;

  private sourceTextures = new Map<string, SourceTexture>();
  private uniformBuffers: GPUBuffer[] = [];
  private layers: CompositeLayer[] = [];
  private effects: WebGPUEffectsProcessor | null = null;

  async init(canvas: HTMLCanvasElement): Promise<CompositorInitResult> {
    if (typeof navigator === "undefined" || !navigator.gpu) {
      return { ok: false, reason: "WebGPU not supported in this browser" };
    }
    const adapter = await navigator.gpu.requestAdapter({
      powerPreference: "high-performance"
    });
    if (!adapter) {
      return { ok: false, reason: "No WebGPU adapter available" };
    }
    const device = await adapter.requestDevice();
    const context = canvas.getContext("webgpu");
    if (!context) {
      return { ok: false, reason: "Failed to get WebGPU canvas context" };
    }

    this.device = device;
    this.context = context;
    this.canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    this.canvasWidth = canvas.width;
    this.canvasHeight = canvas.height;

    context.configure({
      device,
      format: this.canvasFormat,
      alphaMode: "premultiplied"
    });

    this.layerUniformLayout = device.createBindGroupLayout({
      label: "preview-layer-uniforms",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" }
        }
      ]
    });
    this.layerTextureLayout = device.createBindGroupLayout({
      label: "preview-layer-texture",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: "filtering" }
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: "float" }
        }
      ]
    });
    this.accumTextureLayout = device.createBindGroupLayout({
      label: "preview-accum-texture",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: "filtering" }
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: "float" }
        }
      ]
    });
    this.blitTextureLayout = device.createBindGroupLayout({
      label: "preview-blit-texture",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: "filtering" }
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: "float" }
        }
      ]
    });

    this.sampler = device.createSampler({
      label: "preview-sampler",
      magFilter: "linear",
      minFilter: "linear",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge"
    });

    const compositeModule = device.createShaderModule({
      label: "preview-composite",
      code: compositeShader
    });
    const layerPipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [
        this.layerUniformLayout,
        this.layerTextureLayout,
        this.accumTextureLayout
      ]
    });
    // Single layer pipeline — blend math runs in the fragment shader,
    // so no fixed-function blend state.
    this.layerPipeline = device.createRenderPipeline({
      label: "preview-layer-pipeline",
      layout: layerPipelineLayout,
      vertex: { module: compositeModule, entryPoint: "vs" },
      fragment: {
        module: compositeModule,
        entryPoint: "fs",
        targets: [{ format: ACCUM_FORMAT }]
      },
      primitive: { topology: "triangle-list" }
    });

    const blitModule = device.createShaderModule({
      label: "preview-blit",
      code: blitShader
    });
    this.blitPipeline = device.createRenderPipeline({
      label: "preview-blit-pipeline",
      layout: device.createPipelineLayout({
        bindGroupLayouts: [this.blitTextureLayout]
      }),
      vertex: { module: blitModule, entryPoint: "vs" },
      fragment: {
        module: blitModule,
        entryPoint: "fs",
        targets: [{ format: this.canvasFormat }]
      },
      primitive: { topology: "triangle-list" }
    });

    this.effects = new WebGPUEffectsProcessor(device);
    this.allocateAccumTextures();

    return { ok: true };
  }

  resize(width: number, height: number): void {
    if (width === this.canvasWidth && height === this.canvasHeight) return;
    this.canvasWidth = width;
    this.canvasHeight = height;
    this.allocateAccumTextures();
  }

  private allocateAccumTextures(): void {
    if (!this.device || this.canvasWidth === 0 || this.canvasHeight === 0) return;
    this.accumA?.destroy();
    this.accumB?.destroy();
    const make = (label: string): GPUTexture =>
      this.device!.createTexture({
        label,
        size: { width: this.canvasWidth, height: this.canvasHeight },
        format: ACCUM_FORMAT,
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.RENDER_ATTACHMENT |
          GPUTextureUsage.COPY_SRC |
          GPUTextureUsage.COPY_DST
      });
    this.accumA = make("preview-accum-a");
    this.accumB = make("preview-accum-b");
    this.accumIdx = 0;
  }

  setLayers(layers: CompositeLayer[]): void {
    this.layers = [...layers].sort((a, b) => a.zIndex - b.zIndex);
    this.pruneStale();
  }

  private pruneStale(): void {
    const liveIds = new Set(this.layers.map((l) => l.id));
    for (const [id, entry] of this.sourceTextures) {
      if (!liveIds.has(id)) {
        entry.texture.destroy();
        this.sourceTextures.delete(id);
      }
    }
    this.effects?.retainOnly(liveIds);
  }

  private uploadSource(layer: CompositeLayer): SourceTexture | null {
    if (!this.device) return null;
    const { width, height } = sourceDimensions(layer.source);
    if (width === 0 || height === 0) {
      return this.sourceTextures.get(layer.id) ?? null;
    }

    const key = uploadKey(layer.source);
    let entry = this.sourceTextures.get(layer.id);

    if (
      !entry ||
      entry.width !== width ||
      entry.height !== height ||
      entry.source !== layer.source
    ) {
      entry?.texture.destroy();
      const texture = this.device.createTexture({
        label: `preview-source-${layer.id}`,
        size: { width, height },
        format: "rgba8unorm",
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_DST |
          GPUTextureUsage.COPY_SRC |
          GPUTextureUsage.RENDER_ATTACHMENT
      });
      entry = { texture, width, height, source: layer.source, lastUploadKey: "" };
      this.sourceTextures.set(layer.id, entry);
    }

    if (entry.lastUploadKey !== key && isSourceReady(layer.source)) {
      try {
        this.device.queue.copyExternalImageToTexture(
          { source: layer.source, flipY: false },
          { texture: entry.texture, premultipliedAlpha: false },
          { width, height }
        );
        entry.lastUploadKey = key;
      } catch {
        // Browser claimed readyState >= 2 but the GPU side resource is
        // gone (Chrome scrub race). Keep the previous texture.
      }
    }
    if (entry.lastUploadKey === "") return null;
    return entry;
  }

  private getUniformBuffer(index: number): GPUBuffer {
    if (!this.device) {
      throw new Error("Compositor not initialized");
    }
    let buffer = this.uniformBuffers[index];
    if (!buffer) {
      buffer = this.device.createBuffer({
        label: `preview-layer-uniforms-${index}`,
        size: LAYER_UNIFORM_BYTES,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
      });
      this.uniformBuffers[index] = buffer;
    }
    return buffer;
  }

  render(): void {
    if (
      !this.device ||
      !this.context ||
      !this.sampler ||
      !this.layerUniformLayout ||
      !this.layerTextureLayout ||
      !this.accumTextureLayout ||
      !this.blitTextureLayout ||
      !this.layerPipeline ||
      !this.blitPipeline ||
      !this.accumA ||
      !this.accumB
    ) {
      return;
    }

    const device = this.device;
    const sampler = this.sampler;

    // 1. Clear the starting accumulation to opaque black.
    this.accumIdx = 0;
    {
      const encoder = device.createCommandEncoder({ label: "preview-clear" });
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: this.accumA.createView(),
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            loadOp: "clear",
            storeOp: "store"
          }
        ]
      });
      pass.end();
      device.queue.submit([encoder.finish()]);
    }

    let drawn = 0;
    for (const layer of this.layers) {
      const src = this.uploadSource(layer);
      if (!src) continue;

      const clipEffectsList = layer.effects ?? [];
      const trackEffectsList = layer.trackEffects ?? [];
      const hasAnyEffects =
        clipEffectsList.length > 0 || trackEffectsList.length > 0;
      const processedTexture =
        hasAnyEffects && this.effects
          ? this.effects.process(
              layer.id,
              src.texture,
              src.width,
              src.height,
              clipEffectsList,
              trackEffectsList
            )
          : src.texture;

      const transform = layer.transform ?? IDENTITY_TRANSFORM;
      const base = containBaseScale(
        src.width,
        src.height,
        this.canvasWidth,
        this.canvasHeight
      );
      const matrix = buildTransformMatrix(
        transform,
        base,
        this.canvasWidth,
        this.canvasHeight
      );

      const radiusPx = layer.borderRadius ?? 0;
      const radiusNormalized =
        radiusPx > 0 && src.width > 0 && src.height > 0
          ? Math.min(0.5, radiusPx / Math.min(src.width, src.height))
          : 0;
      const aspect = src.height === 0 ? 1 : src.width / src.height;
      const blendIndex = BLEND_MODE_INDEX[layer.blendMode] ?? 0;

      const uniformBuffer = this.getUniformBuffer(drawn);
      const data = new ArrayBuffer(LAYER_UNIFORM_BYTES);
      const f = new Float32Array(data);
      const u = new Uint32Array(data);
      f.set(matrix, 0);
      f[16] = layer.opacity;
      f[17] = radiusNormalized;
      f[18] = aspect;
      f[19] = 0.01; // smoothness band for SDF
      u[20] = blendIndex;
      device.queue.writeBuffer(uniformBuffer, 0, data);

      const accumIn = this.accumIdx === 0 ? this.accumA : this.accumB;
      const accumOut = this.accumIdx === 0 ? this.accumB : this.accumA;

      // Seed the next ping-pong target with the current accumulation, so
      // pixels outside the layer's transformed quad keep their previous
      // value. Compositing math (which needs to read accumIn) happens in
      // the layer fragment shader and writes accumOut.
      const encoder = device.createCommandEncoder({
        label: `preview-layer-${drawn}`
      });
      encoder.copyTextureToTexture(
        { texture: accumIn },
        { texture: accumOut },
        { width: this.canvasWidth, height: this.canvasHeight }
      );

      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: accumOut.createView(),
            loadOp: "load",
            storeOp: "store"
          }
        ]
      });
      pass.setPipeline(this.layerPipeline);
      pass.setBindGroup(
        0,
        device.createBindGroup({
          layout: this.layerUniformLayout,
          entries: [{ binding: 0, resource: { buffer: uniformBuffer } }]
        })
      );
      pass.setBindGroup(
        1,
        device.createBindGroup({
          layout: this.layerTextureLayout,
          entries: [
            { binding: 0, resource: sampler },
            { binding: 1, resource: processedTexture.createView() }
          ]
        })
      );
      pass.setBindGroup(
        2,
        device.createBindGroup({
          layout: this.accumTextureLayout,
          entries: [
            { binding: 0, resource: sampler },
            { binding: 1, resource: accumIn.createView() }
          ]
        })
      );
      pass.draw(6);
      pass.end();
      device.queue.submit([encoder.finish()]);

      this.accumIdx = (1 - this.accumIdx) as 0 | 1;
      drawn++;
    }

    // 2. Final blit: present the latest accumulation to the swapchain.
    const finalAccum = this.accumIdx === 0 ? this.accumA : this.accumB;
    const presentEncoder = device.createCommandEncoder({
      label: "preview-present"
    });
    const presentPass = presentEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.context.getCurrentTexture().createView(),
          loadOp: "clear",
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          storeOp: "store"
        }
      ]
    });
    presentPass.setPipeline(this.blitPipeline);
    presentPass.setBindGroup(
      0,
      device.createBindGroup({
        layout: this.blitTextureLayout,
        entries: [
          { binding: 0, resource: sampler },
          { binding: 1, resource: finalAccum.createView() }
        ]
      })
    );
    presentPass.draw(6);
    presentPass.end();
    device.queue.submit([presentEncoder.finish()]);
  }

  dispose(): void {
    for (const entry of this.sourceTextures.values()) {
      entry.texture.destroy();
    }
    this.sourceTextures.clear();
    for (const buffer of this.uniformBuffers) {
      buffer.destroy();
    }
    this.uniformBuffers = [];
    this.accumA?.destroy();
    this.accumB?.destroy();
    this.accumA = null;
    this.accumB = null;
    this.layerPipeline = null;
    this.blitPipeline = null;
    this.effects?.dispose();
    this.effects = null;
    this.sampler = null;
    this.layerUniformLayout = null;
    this.layerTextureLayout = null;
    this.accumTextureLayout = null;
    this.blitTextureLayout = null;
    this.context = null;
    this.device?.destroy();
    this.device = null;
  }
}
