import { blendModeGpuId } from "@nodetool-ai/gpu";
import {
  WebGPULayerCompositor,
  forwardClipMatrixToInverseAffine
} from "@nodetool-ai/gpu/webgpu";
import { WebGPUEffectsProcessor } from "./effectsProcessor";
import {
  IDENTITY_TRANSFORM,
  buildTransformMatrix,
  containBaseScale
} from "./transform";
import type {
  CompositeLayer,
  CompositeSource,
  CompositorInitResult,
  TimelineCompositor
} from "./types";
import type { AnimationSampleMask, WipeDirection } from "@nodetool-ai/timeline";

/** Shader edge codes (see `BLEND_COMPOSITE_FRAGMENT` params2). */
const WIPE_EDGE: Record<WipeDirection, 1 | 2 | 3 | 4> = {
  left: 1,
  right: 2,
  up: 3, // reveal from the layer's top edge
  down: 4 // reveal from the layer's bottom edge
};

function wipeParams(
  mask: AnimationSampleMask | undefined
):
  | { edge: 1 | 2 | 3 | 4; progress: number; softness: number }
  | undefined {
  if (!mask) return undefined;
  return {
    edge: WIPE_EDGE[mask.direction],
    progress: mask.progress,
    softness: mask.softness
  };
}
import { isSourceReady, shouldPresentFrame, sourceDimensions } from "./source";

interface SourceTexture {
  texture: GPUTexture;
  width: number;
  height: number;
  source: CompositeSource;
  lastUploadKey: string;
}

function uploadKey(source: CompositeSource): string {
  if (source instanceof HTMLVideoElement) {
    // `currentTime` updates as soon as a seek starts, before the target frame
    // is decoded. Stamping the new time while `seeking` is true would mark a
    // stale frame as current and skip the real upload on `seeked` — so use a
    // distinct key during the seek; the post-`seeked` render re-uploads.
    const time = source.seeking ? "seeking" : String(source.currentTime);
    return `v:${time}:${source.videoWidth}x${source.videoHeight}`;
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
export class WebGPUCompositor implements TimelineCompositor {
  private device: GPUDevice | null = null;
  private context: GPUCanvasContext | null = null;
  private canvasFormat: GPUTextureFormat = "rgba8unorm";

  private core: WebGPULayerCompositor | null = null;

  private canvasWidth = 0;
  private canvasHeight = 0;
  /** Reference (sequence) resolution that `transform.position` is stored in.
   *  Falls back to the canvas size when unset — the offline renderer's canvas
   *  is the sequence resolution, so it never needs to set this explicitly. */
  private refWidth = 0;
  private refHeight = 0;

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

  /**
   * Set the sequence resolution used to interpret `transform.position` (and
   * rotation aspect). The live preview calls this because its canvas backing
   * size tracks the viewport/DPR, not the sequence.
   */
  setReferenceSize(width: number, height: number): void {
    this.refWidth = width;
    this.refHeight = height;
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

    this.core.beginFrame();
    let drawnCount = 0;
    for (const layer of this.layers) {
      const src = this.uploadSource(layer);
      if (!src) continue;
      drawnCount++;

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
        this.refWidth || this.canvasWidth,
        this.refHeight || this.canvasHeight
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
        borderRadius: radiusNormalized,
        wipe: wipeParams(layer.mask)
      });

      const tmp = readTex;
      readTex = writeTex;
      writeTex = tmp;
    }

    // Every active clip was mid-decode (e.g. the incoming clip at a cut is
    // still seeking). Skip the present so the swap chain keeps showing the last
    // frame instead of flashing the opaque-black seed. `getCurrentTexture()` is
    // never called, so nothing replaces what's on screen.
    if (!shouldPresentFrame(this.layers.length, drawnCount)) {
      return;
    }

    this.core.blit(
      encoder,
      readTex,
      this.context.getCurrentTexture().createView()
    );
    device.queue.submit([encoder.finish()]);
  }

  /**
   * Resolve once all submitted GPU work has completed. The offline renderer
   * awaits this after {@link render} so the canvas pixels are final before a
   * frame is captured for encoding.
   */
  async flush(): Promise<void> {
    await this.device?.queue.onSubmittedWorkDone();
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
