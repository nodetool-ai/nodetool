import {
  drawTimelineFrame,
  type Canvas2DLayer,
  type CompositeContext2D,
  type MaskScratch
} from "@nodetool-ai/timeline/render";
import { isSourceReady, shouldPresentFrame, sourceDimensions } from "./source";
import type {
  CompositeLayer,
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
 * — the same placement, opacity, blend, wipe and effect-filter rules the
 * server-side frame preview draws through. What stays here is what only a live
 * preview has: deciding which sources are decoded enough to draw, holding the
 * last frame rather than flashing black when they aren't, and vending the
 * scratch canvas a feathered wipe needs.
 */
export class Canvas2DCompositor implements TimelineCompositor {
  private ctx: CanvasRenderingContext2D | null = null;
  private canvasWidth = 0;
  private canvasHeight = 0;
  private refWidth = 0;
  private refHeight = 0;
  private layers: CompositeLayer[] = [];
  /** Scratch canvas for feathered wipe masks, reused across layers/frames. */
  private maskScratch: HTMLCanvasElement | null = null;

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

  resize(width: number, height: number): void {
    this.canvasWidth = width;
    this.canvasHeight = height;
  }

  setLayers(layers: CompositeLayer[]): void {
    this.layers = layers;
  }

  render(): void {
    const ctx = this.ctx;
    if (!ctx) return;

    // Decide drawable layers before clearing. A scene with layers but none
    // decoded yet (the incoming clip at a cut is still seeking) must hold the
    // last frame — clearing + drawing nothing would flash opaque black.
    const drawable: Canvas2DLayer<CompositeSource>[] = [];
    for (const layer of this.layers) {
      if (!isSourceReady(layer.source)) continue;
      const { width, height } = sourceDimensions(layer.source);
      if (width <= 0 || height <= 0) continue;
      drawable.push({ ...layer, sourceWidth: width, sourceHeight: height });
    }
    if (!shouldPresentFrame(this.layers.length, drawable.length)) return;

    drawTimelineFrame(
      ctx as CompositeContext2D<CompositeSource>,
      drawable,
      {
        canvasWidth: this.canvasWidth,
        canvasHeight: this.canvasHeight,
        refWidth: this.refWidth,
        refHeight: this.refHeight
      },
      { maskScratch: (width, height) => this.scratchFor(width, height) }
    );
  }

  /** The reused offscreen canvas a feathered wipe pre-masks its source on. */
  private scratchFor(
    width: number,
    height: number
  ): MaskScratch<CompositeSource> | null {
    let scratch = this.maskScratch;
    if (!scratch) {
      scratch = document.createElement("canvas");
      this.maskScratch = scratch;
    }
    if (scratch.width !== width || scratch.height !== height) {
      scratch.width = width;
      scratch.height = height;
    }
    const sctx = scratch.getContext("2d");
    if (!sctx) return null;
    return {
      ctx: sctx as CompositeContext2D<CompositeSource>,
      // A canvas element is a valid `drawImage` source.
      surface: scratch as unknown as CompositeSource
    };
  }

  async flush(): Promise<void> {
    // Canvas2D draws synchronously; nothing to await.
  }

  dispose(): void {
    this.ctx = null;
    this.layers = [];
    this.maskScratch = null;
  }
}
