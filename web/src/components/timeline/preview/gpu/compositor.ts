import {
  GpuFrameCompositor,
  type FrameLayer,
  type GpuSourceTexture
} from "@nodetool-ai/timeline/render";
import type {
  CompositeLayer,
  CompositePrecomposite,
  CompositeSource,
  CompositorInitResult,
  TimelineCompositor
} from "./types";
import { isSourceReady, shouldPresentFrame, sourceDimensions } from "./source";
import { MaskRasterizer } from "../maskRender";

interface SourceTexture extends GpuSourceTexture {
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
 * Owns the canvas, the device and the source textures; everything about what a
 * frame *looks like* — placement, effects, masks, mattes, transitions, the
 * precomposite pass — is {@link GpuFrameCompositor} from
 * `@nodetool-ai/timeline/render`, the same object the server render drives. The
 * two hosts differ only where they must: pixels arrive here as `<video>`,
 * `<img>` and `ImageBitmap` and are uploaded with
 * `copyExternalImageToTexture`, and the finished frame is blitted to a swap
 * chain instead of read back to a buffer.
 */
export class WebGPUCompositor implements TimelineCompositor {
  private device: GPUDevice | null = null;
  private context: GPUCanvasContext | null = null;
  private canvasFormat: GPUTextureFormat = "rgba8unorm";

  private core: GpuFrameCompositor<CompositeSource> | null = null;

  private canvasWidth = 0;
  private canvasHeight = 0;

  private sourceTextures = new Map<string, SourceTexture>();
  private layers: CompositeLayer[] = [];
  private precomposites: CompositePrecomposite[] = [];
  private alpha = false;
  /** Shape masks rasterized to coverage bitmaps for the GPU mask pass. */
  private readonly masks = new MaskRasterizer();

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
    // so the next getCurrentTexture() matches the new backing store.
    if (this.context && this.device) {
      this.context.configure({
        device: this.device,
        format: this.canvasFormat,
        alphaMode: "premultiplied"
      });
    }
    this.core?.resize(width, height);
  }

  setLayers(
    layers: CompositeLayer[],
    precomposites: CompositePrecomposite[] = []
  ): void {
    this.layers = layers;
    this.precomposites = precomposites;
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
    const { width, height } = sourceDimensions(source);
    if (width === 0 || height === 0) {
      return this.sourceTextures.get(id) ?? null;
    }

    const key = uploadKey(source);
    let entry = this.sourceTextures.get(id);

    if (
      !entry ||
      entry.width !== width ||
      entry.height !== height ||
      entry.source !== source
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
        lastUploadKey: ""
      };
      this.sourceTextures.set(id, entry);
    }

    if (entry.lastUploadKey !== key && isSourceReady(source)) {
      try {
        this.device.queue.copyExternalImageToTexture(
          { source, flipY: false },
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
      borderRadius: layer.borderRadius,
      mask: layer.mask,
      shapeMask: shapeMask ?? undefined,
      matte: layer.matte
        ? {
            mode: layer.matte.mode,
            invert: layer.matte.invert,
            layer: this.toFrameLayer(layer.matte.layer)
          }
        : undefined,
      effects: layer.effects,
      trackEffects: layer.trackEffects,
      transition: layer.transition
    };
  }

  render(): void {
    const device = this.device;
    const core = this.core;
    if (!device || !this.context || !core) {
      return;
    }

    const frameLayers = this.layers.map((layer) => this.toFrameLayer(layer));
    const { texture, drawn } = core.composite(frameLayers, this.precomposites, {
      r: 0,
      g: 0,
      b: 0,
      a: this.alpha ? 0 : 1
    });

    // Every active clip was mid-decode (e.g. the incoming clip at a cut is
    // still seeking). Skip the present so the swap chain keeps showing the last
    // frame instead of flashing the opaque-black seed. `getCurrentTexture()` is
    // never called, so nothing replaces what's on screen.
    if (!shouldPresentFrame(this.layers.length, drawn)) {
      return;
    }

    const encoder = device.createCommandEncoder({ label: "preview-present" });
    core.blit(encoder, texture, this.context.getCurrentTexture().createView());
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
    this.masks.dispose();
    this.core?.dispose();
    this.core = null;
    this.context = null;
    this.device?.destroy();
    this.device = null;
  }
}
