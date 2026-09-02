import {
  drawTimelineFrame,
  unsupportedEffectTypes,
  type Canvas2DLayer,
  type CompositeContext2D,
  type CompositeSurface
} from "@nodetool-ai/timeline/render";
import { toCanvas2DLayer } from "../compositeLayers";
import { isSourceReady, shouldPresentFrame, sourceDimensions } from "./source";
import type {
  CompositeLayer,
  CompositePrecomposite,
  CompositeSource,
  CompositorInitResult,
  TimelineCompositor
} from "./types";

/**
 * Canvas2D fallback for the timeline preview compositor.
 *
 * Drop-in for {@link WebGPUCompositor} when WebGPU is unavailable (older
 * browsers, locked-down environments, and headless CI where SwiftShader's
 * WebGPU fails to initialise) so the live preview and offline export still
 * composite — and documentation screenshots still capture real frames.
 *
 * The drawing itself is `drawTimelineFrame` from `@nodetool-ai/timeline/render`
 * — the same placement, opacity, blend, wipe, mask, matte, transition and
 * precomposite rules the server-side frame preview draws through. What stays
 * here is what only a live preview has: deciding which sources are decoded
 * enough to draw, holding the last frame rather than flashing black when they
 * aren't, and vending the offscreen surfaces those rules compose on.
 */
export class Canvas2DCompositor implements TimelineCompositor {
  private ctx: CanvasRenderingContext2D | null = null;
  private canvasWidth = 0;
  private canvasHeight = 0;
  private refWidth = 0;
  private refHeight = 0;
  private layers: CompositeLayer[] = [];
  private precomposites: CompositePrecomposite[] = [];
  private alpha = false;
  /** Scratch canvas for feathered wipe masks, reused across layers/frames. */
  private maskScratch: HTMLCanvasElement | null = null;
  /**
   * Surfaces handed out one at a time within a frame: a nested group holds its
   * own until the group above has drawn it, and a feathered mask and the layer
   * it cuts are live at the same moment, so none of these can be the single
   * reused wipe scratch. Pooled across frames, reset at the top of each.
   */
  private readonly surfacePool: HTMLCanvasElement[] = [];
  private surfacesTaken = 0;
  /** Effect types already reported as undrawable, so the warning fires once. */
  private readonly reportedUnsupported = new Set<string>();

  async init(canvas: HTMLCanvasElement): Promise<CompositorInitResult> {
    // A canvas can only ever vend one context type. If WebGPU init already
    // claimed it (e.g. `getContext("webgpu")` succeeded but later configure
    // failed), the 2D request returns null and the fallback can't reuse it.
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return { ok: false, reason: "Failed to get 2D canvas context" };
    }
    this.ctx = ctx;
    this.canvasWidth = canvas.width;
    this.canvasHeight = canvas.height;
    return { ok: true };
  }

  setReferenceSize(width: number, height: number): void {
    this.refWidth = width;
    this.refHeight = height;
  }

  setAlpha(alpha: boolean): void {
    this.alpha = alpha;
  }

  resize(width: number, height: number): void {
    this.canvasWidth = width;
    this.canvasHeight = height;
  }

  setLayers(
    layers: CompositeLayer[],
    precomposites: CompositePrecomposite[] = []
  ): void {
    this.layers = layers;
    this.precomposites = precomposites;
  }

  render(): void {
    const ctx = this.ctx;
    if (!ctx) return;

    // Decide drawable layers before clearing. A scene with layers but none
    // decoded yet (the incoming clip at a cut is still seeking) must hold the
    // last frame — clearing + drawing nothing would flash opaque black.
    const drawable: Canvas2DLayer<CompositeSource>[] = [];
    for (const layer of this.layers) {
      const drawn = toCanvas2DLayer(layer, measureSource);
      if (drawn) drawable.push(drawn);
    }
    if (!shouldPresentFrame(this.layers.length, drawable.length)) return;

    this.reportUnsupportedEffects(drawable);
    this.surfacesTaken = 0;
    drawTimelineFrame(
      ctx as CompositeContext2D<CompositeSource>,
      drawable,
      {
        canvasWidth: this.canvasWidth,
        canvasHeight: this.canvasHeight,
        refWidth: this.refWidth,
        refHeight: this.refHeight
      },
      {
        maskScratch: (width, height) => this.scratchFor(width, height),
        precomposites: this.precomposites,
        precompositeSurface: (width, height) => this.takeSurface(width, height),
        maskSurface: (width, height) => this.takeSurface(width, height),
        matteSurface: (width, height) => this.takeSurface(width, height),
        alpha: this.alpha
      }
    );
  }

  /**
   * Say which effects this frame asked for and this backend cannot draw (I7).
   *
   * The GPU backend runs the whole shader catalog; Canvas 2D has no filter for
   * a key, a tone curve or a three-way grade. Showing a different picture
   * without saying so is the failure mode — there is no inspector surface for
   * this on a fallback backend, so the console is where it goes, once per type.
   */
  private reportUnsupportedEffects(
    layers: readonly Canvas2DLayer<CompositeSource>[]
  ): void {
    const dropped = unsupportedEffectTypes([
      ...layers,
      ...this.precomposites
    ]).filter((type) => !this.reportedUnsupported.has(type));
    if (dropped.length === 0) return;
    for (const type of dropped) this.reportedUnsupported.add(type);
    console.warn(
      `Timeline preview is running on the Canvas 2D backend, which cannot draw these effects: ${dropped.join(", ")}. The exported video will differ.`
    );
  }

  /** The reused offscreen canvas a feathered wipe pre-masks its source on. */
  private scratchFor(
    width: number,
    height: number
  ): CompositeSurface<CompositeSource> | null {
    let scratch = this.maskScratch;
    if (!scratch) {
      scratch = document.createElement("canvas");
      this.maskScratch = scratch;
    }
    if (scratch.width !== width || scratch.height !== height) {
      scratch.width = width;
      scratch.height = height;
    }
    return asSurface(scratch);
  }

  /**
   * The next unused surface of this frame. Distinct per call, because the
   * callers that ask for one hold it while another is drawn onto.
   */
  private takeSurface(
    width: number,
    height: number
  ): CompositeSurface<CompositeSource> | null {
    const index = this.surfacesTaken++;
    let surface = this.surfacePool[index];
    if (!surface) {
      surface = document.createElement("canvas");
      this.surfacePool[index] = surface;
    }
    if (surface.width !== width || surface.height !== height) {
      surface.width = width;
      surface.height = height;
    }
    return asSurface(surface);
  }

  async flush(): Promise<void> {
    // Canvas2D draws synchronously; nothing to await.
  }

  dispose(): void {
    this.ctx = null;
    this.layers = [];
    this.precomposites = [];
    this.maskScratch = null;
    this.surfacePool.length = 0;
    this.reportedUnsupported.clear();
  }
}

/** A source's pixel size, or null while it is still decoding. */
function measureSource(
  source: CompositeSource
): { width: number; height: number } | null {
  return isSourceReady(source) ? sourceDimensions(source) : null;
}

/** A canvas as the context-plus-source pair the compositing rules draw through. */
function asSurface(
  canvas: HTMLCanvasElement
): CompositeSurface<CompositeSource> | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  return {
    ctx: ctx as CompositeContext2D<CompositeSource>,
    // SAFETY: a canvas element is a valid `drawImage` source, which is the
    // only thing the compositing rules do with a surface.
    surface: canvas as unknown as CompositeSource
  };
}
