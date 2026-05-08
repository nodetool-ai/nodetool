import { WebGPUEffectsProcessor } from "./effectsProcessor";
import { borderRadiusShader, transformShader } from "./shaders";
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

const TRANSFORM_UNIFORM_BYTES = 96;
const BORDER_RADIUS_UNIFORM_BYTES = 96;

const BLEND_MODES: CompositorBlendMode[] = [
  "normal",
  "add",
  "multiply",
  "screen",
  "overlay"
];

function blendStateFor(mode: CompositorBlendMode): GPUBlendState {
  switch (mode) {
    case "add":
      return {
        color: { srcFactor: "src-alpha", dstFactor: "one", operation: "add" },
        alpha: { srcFactor: "one", dstFactor: "one", operation: "add" }
      };
    case "multiply":
      return {
        color: { srcFactor: "dst", dstFactor: "zero", operation: "add" },
        alpha: {
          srcFactor: "one",
          dstFactor: "one-minus-src-alpha",
          operation: "add"
        }
      };
    case "screen":
      return {
        color: {
          srcFactor: "one",
          dstFactor: "one-minus-src",
          operation: "add"
        },
        alpha: { srcFactor: "one", dstFactor: "one", operation: "add" }
      };
    case "normal":
    case "overlay":
    default:
      return {
        color: {
          srcFactor: "src-alpha",
          dstFactor: "one-minus-src-alpha",
          operation: "add"
        },
        alpha: {
          srcFactor: "one",
          dstFactor: "one-minus-src-alpha",
          operation: "add"
        }
      };
  }
}

interface SourceTexture {
  texture: GPUTexture;
  width: number;
  height: number;
  source: CompositeSource;
  lastUploadKey: string;
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

function isSourceReady(source: CompositeSource): boolean {
  if (source instanceof HTMLVideoElement) {
    // HAVE_CURRENT_DATA = 2 — the current frame is decoded.
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

interface PipelinePair {
  plain: GPURenderPipeline;
  rounded: GPURenderPipeline;
}

export class WebGPUCompositor {
  private device: GPUDevice | null = null;
  private context: GPUCanvasContext | null = null;
  private canvasFormat: GPUTextureFormat = "rgba8unorm";

  private uniformLayout: GPUBindGroupLayout | null = null;
  private textureLayout: GPUBindGroupLayout | null = null;
  private sampler: GPUSampler | null = null;
  private pipelines = new Map<CompositorBlendMode, PipelinePair>();

  private canvasWidth = 0;
  private canvasHeight = 0;

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

    this.uniformLayout = device.createBindGroupLayout({
      label: "preview-uniform-layout",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" }
        }
      ]
    });
    this.textureLayout = device.createBindGroupLayout({
      label: "preview-texture-layout",
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

    const transformModule = device.createShaderModule({
      label: "preview-transform",
      code: transformShader
    });
    const borderRadiusModule = device.createShaderModule({
      label: "preview-border-radius",
      code: borderRadiusShader
    });
    const pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [this.uniformLayout, this.textureLayout]
    });

    for (const mode of BLEND_MODES) {
      const blend = blendStateFor(mode);
      const plain = device.createRenderPipeline({
        label: `preview-pipeline-${mode}`,
        layout: pipelineLayout,
        vertex: { module: transformModule, entryPoint: "vs" },
        fragment: {
          module: transformModule,
          entryPoint: "fs",
          targets: [{ format: this.canvasFormat, blend }]
        },
        primitive: { topology: "triangle-list" }
      });
      const rounded = device.createRenderPipeline({
        label: `preview-pipeline-rounded-${mode}`,
        layout: pipelineLayout,
        vertex: { module: borderRadiusModule, entryPoint: "vs" },
        fragment: {
          module: borderRadiusModule,
          entryPoint: "fs",
          targets: [{ format: this.canvasFormat, blend }]
        },
        primitive: { topology: "triangle-list" }
      });
      this.pipelines.set(mode, { plain, rounded });
    }

    this.effects = new WebGPUEffectsProcessor(device);

    return { ok: true };
  }

  resize(width: number, height: number): void {
    this.canvasWidth = width;
    this.canvasHeight = height;
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

  /**
   * Allocates / reuses a source GPU texture for the layer and copies its
   * current pixels into it. If the source isn't ready right now (e.g. a
   * `<video>` mid-seek with `readyState < HAVE_CURRENT_DATA`) the texture
   * is left unchanged and we return the previous entry — keeps the last
   * good frame on screen instead of flashing to black during a scrub.
   * Returns null only if there's no texture to fall back on yet.
   */
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
        // The browser claimed the frame was ready (readyState >= 2) but its
        // GPU-side resource is gone — happens transiently during seeks in
        // Chrome ("doesn't have back resource"). Keep the previous texture
        // and try again on the next render.
      }
    }
    // If we couldn't upload yet AND have never uploaded for this entry,
    // there's nothing to draw — skip the layer this frame.
    if (entry.lastUploadKey === "") {
      return null;
    }
    return entry;
  }

  private getUniformBuffer(index: number, size: number): GPUBuffer {
    if (!this.device) {
      throw new Error("Compositor not initialized");
    }
    let buffer = this.uniformBuffers[index];
    if (!buffer) {
      buffer = this.device.createBuffer({
        label: `preview-layer-uniforms-${index}`,
        size: Math.max(size, TRANSFORM_UNIFORM_BYTES),
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
      !this.uniformLayout ||
      !this.textureLayout
    ) {
      return;
    }

    const view = this.context.getCurrentTexture().createView();
    const encoder = this.device.createCommandEncoder({ label: "preview-frame" });
    const pass = encoder.beginRenderPass({
      label: "preview-pass",
      colorAttachments: [
        {
          view,
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: "clear",
          storeOp: "store"
        }
      ]
    });

    let drawn = 0;
    for (const layer of this.layers) {
      const src = this.uploadSource(layer);
      if (!src) continue;

      // Run effects pre-pass if any. Effects uses its own command encoder
      // and submits before we record this draw — so the result is ready.
      const effectsList = layer.effects ?? [];
      const processedTexture =
        effectsList.length > 0 && this.effects
          ? this.effects.process(layer.id, src.texture, src.width, src.height, effectsList)
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
      const useRadius = radiusNormalized > 0.001;
      const aspect = src.height === 0 ? 1 : src.width / src.height;

      const uniformBuffer = this.getUniformBuffer(
        drawn,
        useRadius ? BORDER_RADIUS_UNIFORM_BYTES : TRANSFORM_UNIFORM_BYTES
      );
      // Both pipelines use 96-byte buffers but the tail layout differs.
      const data = new Float32Array(24);
      data.set(matrix, 0);
      data[16] = layer.opacity;
      if (useRadius) {
        data[17] = radiusNormalized;
        data[18] = aspect;
        data[19] = 0.01; // smoothness — small, anti-alias band
      }
      this.device.queue.writeBuffer(uniformBuffer, 0, data.buffer, 0, data.byteLength);

      const uniformBindGroup = this.device.createBindGroup({
        layout: this.uniformLayout,
        entries: [{ binding: 0, resource: { buffer: uniformBuffer } }]
      });
      const textureBindGroup = this.device.createBindGroup({
        layout: this.textureLayout,
        entries: [
          { binding: 0, resource: this.sampler },
          { binding: 1, resource: processedTexture.createView() }
        ]
      });

      const pair =
        this.pipelines.get(layer.blendMode) ?? this.pipelines.get("normal");
      if (!pair) continue;
      const pipeline = useRadius ? pair.rounded : pair.plain;

      pass.setPipeline(pipeline);
      pass.setBindGroup(0, uniformBindGroup);
      pass.setBindGroup(1, textureBindGroup);
      pass.draw(6);
      drawn++;
    }

    pass.end();
    this.device.queue.submit([encoder.finish()]);
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
    this.pipelines.clear();
    this.effects?.dispose();
    this.effects = null;
    this.sampler = null;
    this.uniformLayout = null;
    this.textureLayout = null;
    this.context = null;
    this.device?.destroy();
    this.device = null;
  }
}
