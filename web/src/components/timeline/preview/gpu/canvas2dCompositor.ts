import { blendModeToCanvasOp } from "@nodetool-ai/gpu";
import {
  IDENTITY_TRANSFORM,
  buildTransformMatrix,
  clipMatrixToCanvasAffine,
  containBaseScale
} from "./transform";
import { isSourceReady, shouldPresentFrame, sourceDimensions } from "./source";
import type {
  CompositeLayer,
  CompositorInitResult,
  TimelineCompositor
} from "./types";
import type { ClipEffect, TrackEffect } from "@nodetool-ai/timeline";

/**
 * Canvas2D fallback for the timeline preview compositor.
 *
 * Drop-in for {@link WebGPUCompositor} when WebGPU is unavailable (older
 * browsers, locked-down environments, and headless CI where SwiftShader's
 * WebGPU fails to initialise) so the live preview and offline export still
 * composite — and documentation screenshots still capture real frames.
 *
 * It draws each layer's decoded source with the *same* placement math as the
 * GPU path: {@link buildTransformMatrix} produces the clip-space matrix and
 * {@link clipMatrixToCanvasAffine} converts it to the 2D affine handed to
 * `setTransform`. Opacity maps to `globalAlpha`, blend modes to
 * `globalCompositeOperation`, and border radius to a rounded-rect clip.
 * Color/blur effects are approximated with `ctx.filter`; the heavier GPU-only
 * effects (chroma key, vignette, sharpen) are skipped in the fallback.
 */
export class Canvas2DCompositor implements TimelineCompositor {
  private ctx: CanvasRenderingContext2D | null = null;
  private canvasWidth = 0;
  private canvasHeight = 0;
  private refWidth = 0;
  private refHeight = 0;
  private layers: CompositeLayer[] = [];

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
    this.layers = [...layers].sort((a, b) => a.zIndex - b.zIndex);
  }

  render(): void {
    const ctx = this.ctx;
    if (!ctx) return;

    // Decide drawable layers before clearing. A scene with layers but none
    // decoded yet (the incoming clip at a cut is still seeking) must hold the
    // last frame — clearing + drawing nothing would flash opaque black.
    const drawable = this.layers.filter((layer) => {
      if (!isSourceReady(layer.source)) return false;
      const { width, height } = sourceDimensions(layer.source);
      return width > 0 && height > 0;
    });
    if (!shouldPresentFrame(this.layers.length, drawable.length)) return;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.filter = "none";
    // Seed with opaque black to match the GPU compositor's clear.
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);

    for (const layer of drawable) {
      const { width, height } = sourceDimensions(layer.source);

      const transform = layer.transform ?? IDENTITY_TRANSFORM;
      const base = containBaseScale(
        width,
        height,
        this.canvasWidth,
        this.canvasHeight
      );
      const matrix = buildTransformMatrix(
        transform,
        base,
        this.refWidth || this.canvasWidth,
        this.refHeight || this.canvasHeight
      );
      const t = clipMatrixToCanvasAffine(
        matrix,
        width,
        height,
        this.canvasWidth,
        this.canvasHeight
      );

      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity));
      ctx.globalCompositeOperation = blendModeToCanvasOp(
        layer.blendMode
      ) as GlobalCompositeOperation;
      ctx.filter = filterForEffects(layer.effects, layer.trackEffects);
      ctx.setTransform(t.a, t.b, t.c, t.d, t.e, t.f);

      const radiusPx = layer.borderRadius ?? 0;
      if (radiusPx > 0) {
        const r = Math.min(radiusPx, width / 2, height / 2);
        clipRoundedRect(ctx, 0, 0, width, height, r);
      }

      try {
        ctx.drawImage(layer.source, 0, 0, width, height);
      } catch {
        // Source not yet usable (e.g. a video element mid-seek). Skip this
        // frame; the next render re-draws once it's ready.
      }
      ctx.restore();
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.filter = "none";
  }

  async flush(): Promise<void> {
    // Canvas2D draws synchronously; nothing to await.
  }

  dispose(): void {
    this.ctx = null;
    this.layers = [];
  }
}

/** Clip the current path to a rounded rectangle in the active transform space. */
function clipRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.clip();
}

/**
 * Memoize the built filter string per `(clipEffects, trackEffects)` array
 * identity. Both arrays are stable references on the clip/track until edited,
 * so a clip sitting still reuses its string across every frame instead of
 * rebuilding it per layer per frame. The outer WeakMap is keyed on the clip
 * effects array; the inner on the track effects array.
 */
const FILTER_NONE_KEY = Object.freeze([]) as readonly never[];
const filterCache = new WeakMap<
  object,
  WeakMap<object, string>
>();

function filterForEffects(
  clipEffects: ClipEffect[] | undefined,
  trackEffects: TrackEffect[] | undefined
): string {
  // Normalize undefined to a shared sentinel so both keys are always objects
  // the WeakMaps can hold.
  const clipKey = (clipEffects ?? FILTER_NONE_KEY) as object;
  const trackKey = (trackEffects ?? FILTER_NONE_KEY) as object;
  let inner = filterCache.get(clipKey);
  if (inner) {
    const hit = inner.get(trackKey);
    if (hit !== undefined) return hit;
  } else {
    inner = new WeakMap<object, string>();
    filterCache.set(clipKey, inner);
  }
  const result = computeFilterForEffects(clipEffects, trackEffects);
  inner.set(trackKey, result);
  return result;
}

/**
 * Approximate the clip + track color/blur effects with a CSS `filter` string.
 * This is a best-effort fallback — it covers the common brightness / contrast /
 * saturation / hue / blur adjustments and ignores the GPU-only effects.
 */
function computeFilterForEffects(
  clipEffects: ClipEffect[] | undefined,
  trackEffects: TrackEffect[] | undefined
): string {
  let brightness = 0;
  let contrast = 1;
  let saturation = 1;
  let hue = 0;
  let blur = 0;

  for (const e of clipEffects ?? []) {
    if (!e.enabled) continue;
    if (e.type === "color") {
      brightness += e.brightness ?? 0;
      contrast *= e.contrast ?? 1;
      saturation *= e.saturation ?? 1;
      hue += e.hue ?? 0;
    } else if (e.type === "blur") {
      blur += e.radius;
    }
  }
  for (const e of trackEffects ?? []) {
    if (!e.enabled) continue;
    if (e.type === "colorCorrection") {
      brightness += e.brightness;
      contrast *= e.contrast;
      saturation *= e.saturation;
      hue += e.hue;
    } else if (e.type === "videoBlur") {
      blur += e.radius;
    }
  }

  const parts: string[] = [];
  if (Math.abs(brightness) > 0.001) {
    parts.push(`brightness(${(1 + brightness).toFixed(3)})`);
  }
  if (Math.abs(contrast - 1) > 0.001) {
    parts.push(`contrast(${contrast.toFixed(3)})`);
  }
  if (Math.abs(saturation - 1) > 0.001) {
    parts.push(`saturate(${saturation.toFixed(3)})`);
  }
  if (Math.abs(hue) > 0.001) {
    parts.push(`hue-rotate(${hue.toFixed(2)}deg)`);
  }
  if (blur >= 0.5) {
    parts.push(`blur(${Math.min(40, blur).toFixed(2)}px)`);
  }
  return parts.length > 0 ? parts.join(" ") : "none";
}
