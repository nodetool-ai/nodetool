import {
  GpuFrameCompositor,
  type FrameAdjustment,
  type FrameLayer,
  type GpuSourceTexture
} from "@nodetool-ai/timeline/render";
import type {
  CompositeAdjustment,
  CompositeLayer,
  CompositePrecomposite,
  CompositeSource,
  CompositorInitResult,
  TimelineCompositor
} from "./types";
import {
  isCanvasSource,
  isSourceReady,
  isVideoFrameSource,
  shouldPresentFrame,
  sourceDimensions
} from "./source";
import { ExternalVideoCopier, canCopyVideoOnGpu } from "./externalVideoCopy";
import { MaskRasterizer } from "../maskRender";
import {
  logPreviewFailure,
  type PreviewFailureHandler
} from "../previewFailure";
import type { TimelinePreviewDiagnostic } from "./previewDiagnostics";
import { previewVideoFrameGeneration, previewVideoFrameMediaTime, previewVideoFrameReady } from "./videoFrameVersion";

interface SourceTexture extends GpuSourceTexture {
  source: CompositeSource;
  lastUploadKey: string;
  sourceUrl: string;
}

/**
 * Bumped for every canvas upload, so a canvas source never matches its own
 * previous key. A 3D session redraws into one canvas at one size, so a key
 * built from the size alone would mark the first frame current and every later
 * frame would be skipped — the model would freeze on its first pose.
 */
let canvasUploads = 0;

function uploadKey(source: CompositeSource): string {
  if (source instanceof HTMLVideoElement) {
    const version = previewVideoFrameGeneration(source) ?? source.currentTime;
    return `v:${videoSourceUrl(source)}:${version}:${source.videoWidth}x${source.videoHeight}`;
  }
  if (source instanceof HTMLImageElement) {
    return `i:${source.src}:${source.naturalWidth}x${source.naturalHeight}`;
  }
  // One upload per decoded frame. The texture entry is per layer, so the
  // timestamp alone tells two frames of one source apart.
  if (isVideoFrameSource(source)) {
    return `f:${source.timestamp}:${source.displayWidth}x${source.displayHeight}`;
  }
  if (isCanvasSource(source)) {
    canvasUploads += 1;
    return `c:${source.width}x${source.height}:${canvasUploads}`;
  }
  return `b:${source.width}x${source.height}`;
}

function videoSourceUrl(video: HTMLVideoElement): string {
  return video.src || video.currentSrc;
}

/**
 * Timeline preview compositor.
 *
 * Owns the canvas, the device and the source textures; everything about what a
 * frame *looks like* — placement, effects, masks, mattes, transitions, the
 * precomposite pass — is {@link GpuFrameCompositor} from
 * `@nodetool-ai/timeline/render`, the same object the server render drives. The
 * two hosts differ only where they must: pixels arrive here as `<video>`,
 * `VideoFrame`, `<img>` and `ImageBitmap`, video through an external texture
 * ({@link ExternalVideoCopier}) and the rest with
 * `copyExternalImageToTexture`, and the finished frame is blitted to a swap
 * chain instead of read back to a buffer.
 */
/** The format `GpuFrameCompositor` composites in and blits from. */
const PRESENT_FORMAT: GPUTextureFormat = "rgba8unorm";

export type { TimelinePreviewDiagnostic };

export class WebGPUCompositor implements TimelineCompositor {
  private disposed = false;
  private removeErrorListener: (() => void) | null = null;

  constructor(
    private readonly onFailure: PreviewFailureHandler = logPreviewFailure
  ) {}
  private device: GPUDevice | null = null;
  private context: GPUCanvasContext | null = null;
  private canvasFormat: GPUTextureFormat = PRESENT_FORMAT;

  private core: GpuFrameCompositor<CompositeSource> | null = null;

  private canvasWidth = 0;
  private canvasHeight = 0;
  /**
   * Whether `context` is configured with `device`. The context is claimed on
   * the first present rather than in {@link init}: React StrictMode mounts the
   * preview twice, so two instances race `init` on one canvas, and whichever
   * configured the context last won even when it was the one about to be
   * disposed. The survivor then blitted into a texture owned by a destroyed
   * device and every frame failed validation, leaving the preview black.
   * Only an instance that renders ever configures, and the disposed one never
   * renders.
   */
  private configured = false;

  private sourceTextures = new Map<string, SourceTexture>();
  private layers: CompositeLayer[] = [];
  private adjustments: CompositeAdjustment[] = [];
  private precomposites: CompositePrecomposite[] = [];
  private alpha = false;
  /** Shape masks rasterized to coverage bitmaps for the GPU mask pass. */
  private readonly masks = new MaskRasterizer();
  /** Copies video frames on the GPU; null where external textures are missing. */
  private videoCopier: ExternalVideoCopier | null = null;

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
    this.device = device;
    this.videoCopier = ExternalVideoCopier.supported(device)
      ? new ExternalVideoCopier(device)
      : null;
    const onError = (event: GPUUncapturedErrorEvent): void => {
      if (!this.disposed)
        this.onFailure({
          stage: "gpu-validation",
          error: new Error(event.error.message)
        });
    };
    device.addEventListener("uncapturederror", onError);
    this.removeErrorListener = () =>
      device.removeEventListener("uncapturederror", onError);
    void device.lost.then((info) => {
      if (!this.disposed) {
        this.onFailure({
          stage: "gpu-device-lost",
          error: new Error(`${info.reason}: ${info.message}`)
        });
      }
    });
    const context = canvas.getContext("webgpu");
    if (!context) {
      return { ok: false, reason: "Failed to get WebGPU canvas context" };
    }

    this.context = context;
    // Not `getPreferredCanvasFormat()`: the shared core builds its blit
    // pipeline for its own accumulation format, and a render pass whose colour
    // attachment has another format (bgra8unorm on macOS and Windows) fails
    // validation on every present. Every WebGPU implementation accepts
    // rgba8unorm as a canvas format.
    this.canvasFormat = PRESENT_FORMAT;
    this.canvasWidth = canvas.width;
    this.canvasHeight = canvas.height;

    this.core = new GpuFrameCompositor<CompositeSource>(
      device,
      this.canvasWidth,
      this.canvasHeight,
      {
        label: "timeline-preview",
        upload: (id, source) => this.uploadSource(id, source),
        retainSources: (live) => this.pruneStale(live)
      }
    );

    return { ok: true };
  }

  /**
   * Set the sequence resolution used to interpret `transform.position` (and
   * rotation aspect). The live preview calls this because its canvas backing
   * size tracks the viewport/DPR, not the sequence.
   */
  setReferenceSize(width: number, height: number): void {
    this.core?.setReferenceSize(width, height);
  }

  setAlpha(alpha: boolean): void {
    this.alpha = alpha;
  }

  resize(width: number, height: number): void {
    if (width === this.canvasWidth && height === this.canvasHeight) return;
    this.canvasWidth = width;
    this.canvasHeight = height;
    // Setting canvas.width/height drops the configured swapchain. Reconfigure
    // on the next present so getCurrentTexture() matches the new backing store.
    this.configured = false;
    this.core?.resize(width, height);
  }

  private ensureConfigured(context: GPUCanvasContext, device: GPUDevice): void {
    if (this.configured) return;
    context.configure({
      device,
      format: this.canvasFormat,
      alphaMode: "premultiplied"
    });
    this.configured = true;
  }

  setLayers(
    layers: CompositeLayer[],
    precomposites: CompositePrecomposite[] = [],
    adjustments: CompositeAdjustment[] = []
  ): void {
    this.layers = layers;
    this.precomposites = precomposites;
    this.adjustments = adjustments;
  }

  private pruneStale(live: ReadonlySet<string>): void {
    for (const [id, entry] of this.sourceTextures) {
      if (live.has(id)) continue;
      entry.texture.destroy();
      this.sourceTextures.delete(id);
    }
  }

  /**
   * Upload one source's current pixels, reusing its texture across frames.
   *
   * Null means nothing is drawable for this layer yet — a video mid-seek, an
   * image still decoding — and the shared compositor leaves it out of the
   * frame, which is what {@link shouldPresentFrame} then reads.
   */
  private uploadSource(
    id: string,
    source: CompositeSource
  ): SourceTexture | null {
    if (!this.device) return null;
    // currentTime changes before decoding finishes. Keep the last texture until seeked.
    if (source instanceof HTMLVideoElement && (source.seeking || previewVideoFrameReady(source) === false)) {
      const previous = this.sourceTextures.get(id);
      return previous?.source === source && previous.sourceUrl === videoSourceUrl(source)
        ? previous
        : null;
    }
    const { width, height } = sourceDimensions(source);
    if (width === 0 || height === 0) {
      return this.sourceTextures.get(id) ?? null;
    }

    const key = uploadKey(source);
    let entry = this.sourceTextures.get(id);

    if (
      !entry ||
      entry.width !== width ||
      entry.height !== height
    ) {
      entry?.texture.destroy();
      const texture = this.device.createTexture({
        label: `preview-source-${id}`,
        size: { width, height },
        format: "rgba8unorm",
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_DST |
          GPUTextureUsage.COPY_SRC |
          GPUTextureUsage.RENDER_ATTACHMENT
      });
      entry = {
        texture,
        width,
        height,
        source,
        lastUploadKey: "",
        sourceUrl: ""
      };
      this.sourceTextures.set(id, entry);
    }

    if (entry.source !== source) {
      entry.source = source;
      entry.lastUploadKey = "";
    }

    if (entry.lastUploadKey !== key && isSourceReady(source)) {
      try {
        if (!this.copyVideoOnGpu(source, entry.texture)) {
          this.device.queue.copyExternalImageToTexture(
            { source, flipY: false },
            { texture: entry.texture, premultipliedAlpha: false },
            { width, height }
          );
        }
        entry.lastUploadKey = key;
        if (source instanceof HTMLVideoElement) entry.sourceUrl = videoSourceUrl(source);
        const sink =
          typeof window === "undefined"
            ? undefined
            : window.__nodetoolTimelinePerf;
        if (sink) {
          const event: TimelinePreviewDiagnostic = {
            kind: "source-upload",
            at: performance.now(),
            sourceId: id,
            width,
            height
          };
          if (source instanceof HTMLVideoElement) {
            event.mediaTime = previewVideoFrameMediaTime(source) ?? source.currentTime;
          } else if (isVideoFrameSource(source)) {
            event.mediaTime = source.timestamp / 1_000_000;
          }
          sink(event);
        }
      } catch (error) {
        throw new Error(`Preview texture upload failed for ${id}`, {
          cause: error
        });
      }
    }
    if (entry.lastUploadKey === "") return null;
    return entry;
  }

  /**
   * Copy a video source through an external texture. False when the source is
   * not a video, the device cannot import it, or the import fails, and the
   * caller then takes `copyExternalImageToTexture`.
   */
  private copyVideoOnGpu(source: CompositeSource, texture: GPUTexture): boolean {
    const copier = this.videoCopier;
    if (!copier) return false;
    if (!(source instanceof HTMLVideoElement) && !isVideoFrameSource(source)) return false;
    if (!canCopyVideoOnGpu(source)) return false;
    try {
      copier.copy(source, texture);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * A layer in the shape the shared compositor consumes. The only translation
   * is the shape mask: it is authored geometry here and coverage pixels there,
   * and this browser owns a canvas to rasterize it on.
   */
  private toFrameLayer(layer: CompositeLayer): FrameLayer<CompositeSource> {
    const shapeMask = layer.shapeMask
      ? this.masks.rasterize(layer.shapeMask, layer.source)
      : null;
    return {
      id: layer.id,
      source: layer.source,
      opacity: layer.opacity,
      blendMode: layer.blendMode,
      zIndex: layer.zIndex,
      transform: layer.transform,
      parentMatrix: layer.parentMatrix,
      precomposeGroupId: layer.precomposeGroupId,
      sourceWindow: layer.sourceWindow,
      borderRadius: layer.borderRadius,
      crop: layer.crop,
      mask: layer.mask,
      shapeMask: shapeMask ?? undefined,
      matte: layer.matte
        ? {
            mode: layer.matte.mode,
            invert: layer.matte.invert,
            layer: this.toFrameLayer(layer.matte.layer),
            strength: layer.matte.strength,
            featherPx: layer.matte.featherPx
          }
        : undefined,
      effects: layer.effects,
      trackEffects: layer.trackEffects,
      transition: layer.transition,
      stackOrder: layer.stackOrder
    };
  }

  render(): void {
    const device = this.device;
    const core = this.core;
    if (!device || !this.context || !core) {
      return;
    }

    // A layer whose matte source has no pixels yet draws nothing. It still
    // counts in `this.layers`, so a frame of nothing else holds the last one.
    const frameLayers = this.layers
      .filter((layer) => !layer.mattePending)
      .map((layer) => this.toFrameLayer(layer));
    const frameAdjustments: FrameAdjustment<CompositeSource>[] = this.adjustments.map((adjustment) => ({
      id: adjustment.id,
      zIndex: adjustment.zIndex,
      opacity: adjustment.opacity,
      effects: adjustment.effects,
      shapeMask: adjustment.mask && typeof OffscreenCanvas !== "undefined"
        ? this.masks.rasterize(adjustment.mask, new OffscreenCanvas(this.canvasWidth, this.canvasHeight)) ?? undefined
        : undefined,
      wipe: adjustment.wipe,
      precomposeGroupId: adjustment.precomposeGroupId
    }));
    const { texture, drawn } = core.composite(frameLayers, this.precomposites, {
      r: 0,
      g: 0,
      b: 0,
      a: this.alpha ? 0 : 1
    }, frameAdjustments);

    // Every active clip was mid-decode (e.g. the incoming clip at a cut is
    // still seeking). Skip the present so the swap chain keeps showing the last
    // frame instead of flashing the opaque-black seed. `getCurrentTexture()` is
    // never called, so nothing replaces what's on screen.
    if (!shouldPresentFrame(this.layers.length, drawn)) {
      return;
    }

    this.ensureConfigured(this.context, device);
    const encoder = device.createCommandEncoder({ label: "preview-present" });
    core.blit(encoder, texture, this.context.getCurrentTexture().createView());
    device.queue.submit([encoder.finish()]);
    const sink =
      typeof window === "undefined"
        ? undefined
        : window.__nodetoolTimelinePerf;
    if (sink) {
      sink({ kind: "compositor-submit", at: performance.now(), layerCount: this.layers.length, drawnLayers: drawn });
    }
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
    this.disposed = true;
    this.removeErrorListener?.();
    this.removeErrorListener = null;
    for (const entry of this.sourceTextures.values()) {
      entry.texture.destroy();
    }
    this.sourceTextures.clear();
    this.masks.dispose();
    this.videoCopier = null;
    this.core?.dispose();
    this.core = null;
    this.context = null;
    this.configured = false;
    this.device?.destroy();
    this.device = null;
  }
}
