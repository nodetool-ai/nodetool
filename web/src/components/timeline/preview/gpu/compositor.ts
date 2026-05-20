import { blendModeGpuId } from "@nodetool-ai/compositor";
import {
  WebGPULayerCompositor,
  forwardClipMatrixToInverseAffine
} from "@nodetool-ai/compositor/webgpu";
import { WebGPUEffectsProcessor } from "./effectsProcessor";
import {
  IDENTITY_TRANSFORM,
  buildTransformMatrix,
  containBaseScale
} from "./transform";
import type {
  CompositeLayer,
  CompositeSource,
  CompositorInitResult
} from "./types";

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

/**
 * Timeline preview compositor.
 *
 * Owns the canvas/device, uploads clip sources (video / image / bitmap) to
 * GPU textures, runs the per-clip + track effects pre-pass, then hands the
 * resulting textures to the shared {@link WebGPULayerCompositor} for the
 * actual layer blending. Linear sampling keeps scaled video crisp; the
 * affine placement comes from {@link buildTransformMatrix}, converted to the
 * compositor's inverse-affine form.
 */
export class WebGPUCompositor {
  private device: GPUDevice | null = null;
  private context: GPUCanvasContext | null = null;
  private canvasFormat: GPUTextureFormat = "rgba8unorm";

  private core: WebGPULayerCompositor | null = null;

  private canvasWidth = 0;
  private canvasHeight = 0;

  private sourceTextures = new Map<string, SourceTexture>();
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

    this.core = new WebGPULayerCompositor(
      device,
      this.canvasFormat,
      "linear",
      "timeline-preview"
    );
    this.core.ensureSize(this.canvasWidth, this.canvasHeight);
    this.effects = new WebGPUEffectsProcessor(device);

    return { ok: true };
  }

  resize(width: number, height: number): void {
    if (width === this.canvasWidth && height === this.canvasHeight) return;
    this.canvasWidth = width;
    this.canvasHeight = height;
    this.core?.ensureSize(width, height);
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

  render(): void {
    if (!this.device || !this.context || !this.core) {
      return;
    }
    const readStart = this.core.textureA;
    const writeStart = this.core.textureB;
    if (!readStart || !writeStart) {
      return;
    }

    const device = this.device;
    const encoder = device.createCommandEncoder({ label: "preview-frame" });

    // Seed the accumulation with opaque black.
    let readTex = readStart;
    let writeTex = writeStart;
    {
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: readTex.createView(),
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            loadOp: "clear",
            storeOp: "store"
          }
        ]
      });
      pass.end();
    }

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
      const invAffine = forwardClipMatrixToInverseAffine(
        matrix,
        src.width,
        src.height,
        this.canvasWidth,
        this.canvasHeight
      );

      const radiusPx = layer.borderRadius ?? 0;
      const radiusNormalized =
        radiusPx > 0 && src.width > 0 && src.height > 0
          ? Math.min(0.5, radiusPx / Math.min(src.width, src.height))
          : 0;

      this.core.renderBlendPass(encoder, readTex, writeTex, {
        source: processedTexture,
        opacity: layer.opacity,
        blendModeId: blendModeGpuId(layer.blendMode),
        canvasW: this.canvasWidth,
        canvasH: this.canvasHeight,
        invAffine,
        borderRadius: radiusNormalized
      });

      const tmp = readTex;
      readTex = writeTex;
      writeTex = tmp;
    }

    this.core.blit(
      encoder,
      readTex,
      this.context.getCurrentTexture().createView()
    );
    device.queue.submit([encoder.finish()]);
  }

  dispose(): void {
    for (const entry of this.sourceTextures.values()) {
      entry.texture.destroy();
    }
    this.sourceTextures.clear();
    this.core?.dispose();
    this.core = null;
    this.effects?.dispose();
    this.effects = null;
    this.context = null;
    this.device?.destroy();
    this.device = null;
  }
}
