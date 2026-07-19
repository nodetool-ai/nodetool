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
  CompositeSource,
  CompositorInitResult,
  TimelineCompositor
} from "./types";
import type {
  AnimationSampleMask,
  ClipEffect,
  TrackEffect
} from "@nodetool-ai/timeline";

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

      // Wipe mask, in the layer's own source-pixel space (rotates with the
      // layer, same as the GPU shader's quad-space mask). Hard edges are a
      // rect clip; feathered edges pre-mask the source on a scratch canvas
      // with a destination-in gradient approximating the shader's smoothstep.
      const mask = layer.mask;
      const feathered = mask !== undefined && mask.softness > 0;
      if (mask && !feathered) {
        clipWipeRect(ctx, width, height, mask);
      }

      try {
        const source = feathered
          ? this.maskSource(layer.source, width, height, mask)
          : layer.source;
        if (source) ctx.drawImage(source, 0, 0, width, height);
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

  /**
   * Copy `source` onto the scratch canvas and knock out the hidden side of the
   * wipe with a `destination-in` linear gradient. Returns null when a 2D
   * context is unavailable. The gradient's stops sample the same
   * `1 - smoothstep(e - s, e, c)` profile the WebGPU shader evaluates
   * per-fragment, with the same front position `e = progress * (1 + s)`, so
   * both backends show the same visible fraction at the same progress.
   */
  private maskSource(
    source: CompositeSource,
    width: number,
    height: number,
    mask: AnimationSampleMask
  ): HTMLCanvasElement | null {
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

    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.globalCompositeOperation = "source-over";
    sctx.clearRect(0, 0, width, height);
    sctx.drawImage(source, 0, 0, width, height);

    const s = mask.softness;
    const e = mask.progress * (1 + s);
    // Gradient runs along the wipe axis from c = e - s (fully visible) to
    // c = e (fully hidden), where c is the normalized distance from the
    // reveal edge. Regions outside the band clamp to the nearest stop.
    const from = axisPoint(mask.direction, e - s, width, height);
    const to = axisPoint(mask.direction, e, width, height);
    const gradient = sctx.createLinearGradient(from.x, from.y, to.x, to.y);
    // 5 stops approximate the shader's smoothstep feather.
    for (const f of [0, 0.25, 0.5, 0.75, 1]) {
      const alpha = 1 - (3 * f * f - 2 * f * f * f);
      gradient.addColorStop(f, `rgba(0,0,0,${alpha})`);
    }
    sctx.globalCompositeOperation = "destination-in";
    sctx.fillStyle = gradient;
    sctx.fillRect(0, 0, width, height);
    sctx.globalCompositeOperation = "source-over";
    return scratch;
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

/**
 * The source-pixel point at normalized distance `c` from a wipe's reveal edge,
 * along the wipe axis.
 */
function axisPoint(
  direction: AnimationSampleMask["direction"],
  c: number,
  width: number,
  height: number
): { x: number; y: number } {
  switch (direction) {
    case "left":
      return { x: c * width, y: 0 };
    case "right":
      return { x: (1 - c) * width, y: 0 };
    case "up":
      return { x: 0, y: c * height };
    case "down":
      return { x: 0, y: (1 - c) * height };
  }
}

/**
 * Clip to a hard-edged wipe's visible region: the rect within normalized
 * distance `progress` of the reveal edge, in source-pixel space (so it
 * composes with the active layer transform and any rounded-rect clip).
 */
function clipWipeRect(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  mask: AnimationSampleMask
): void {
  const p = Math.max(0, Math.min(1, mask.progress));
  ctx.beginPath();
  switch (mask.direction) {
    case "left":
      ctx.rect(0, 0, p * width, height);
      break;
    case "right":
      ctx.rect((1 - p) * width, 0, p * width, height);
      break;
    case "up":
      ctx.rect(0, 0, width, p * height);
      break;
    case "down":
      ctx.rect(0, (1 - p) * height, width, p * height);
      break;
  }
  ctx.clip();
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
