/**
 * resolvedOutput – Non-destructive layer effects evaluation (CPU / Canvas2D path).
 *
 * Evaluates the effect stack on a single layer using CSS `ctx.filter`.
 * Returns a `ResolvedLayerBitmap` containing the output surface and
 * working-space / dynamic-range metadata.
 */

import type { LayerEffect } from "../../types";
import type { ResolvedLayerBitmap } from "../types";

/** SDR / sRGB — all current CSS-filter effects stay in this space. */
const SDR_SRGB: Pick<ResolvedLayerBitmap, "workingSpace" | "dynamicRange"> = {
  workingSpace: "srgb",
  dynamicRange: "sdr"
};

/**
 * Evaluate non-destructive effects for one layer using Canvas2D CSS filters.
 *
 * @returns The resolved output and an (optionally updated) fxTempCanvas that
 *   the caller should persist for reuse across frames.
 */
export function evaluateLayerEffectsCPU(
  layerId: string,
  source: HTMLCanvasElement,
  effects: LayerEffect[],
  fxCache: Map<string, { key: string; canvas: HTMLCanvasElement }>,
  fxTempCanvas: HTMLCanvasElement | null
): { result: ResolvedLayerBitmap; fxTempCanvas: HTMLCanvasElement | null } {
  if (!effects || effects.length === 0 || effects.every((e) => !e.enabled)) {
    fxCache.delete(layerId);
    return { result: { surface: source, ...SDR_SRGB }, fxTempCanvas };
  }

  // ── FX cache: skip recomputation if source + params haven't changed ──
  const cacheKey = JSON.stringify(effects);
  const cached = fxCache.get(layerId);
  if (
    cached &&
    cached.key === cacheKey &&
    cached.canvas.width === source.width &&
    cached.canvas.height === source.height
  ) {
    return { result: { surface: cached.canvas, ...SDR_SRGB }, fxTempCanvas };
  }

  // Build a composite CSS filter string from all enabled effects.
  const filterParts: string[] = [];

  for (const effect of effects) {
    if (!effect.enabled) {
      continue;
    }
    switch (effect.type) {
      case "brightness_contrast": {
        const { brightness, contrast } = effect.params;
        if (brightness !== 0) {
          filterParts.push(`brightness(${1 + brightness})`);
        }
        if (contrast !== 0) {
          filterParts.push(`contrast(${1 + contrast})`);
        }
        break;
      }
      case "hue_saturation": {
        const { hueDegrees, saturation, lightness } = effect.params;
        if (hueDegrees !== 0) {
          filterParts.push(`hue-rotate(${hueDegrees}deg)`);
        }
        if (saturation !== 0) {
          filterParts.push(`saturate(${1 + saturation})`);
        }
        if (lightness !== 0) {
          filterParts.push(`brightness(${1 + lightness})`);
        }
        break;
      }
      case "exposure": {
        const { exposureStops } = effect.params;
        if (exposureStops !== 0) {
          filterParts.push(`brightness(${Math.pow(2, exposureStops)})`);
        }
        break;
      }
      case "curves":
      case "tonemap":
      case "bloom":
        // These effect types require shader-backed implementation.
        if (process.env.NODE_ENV !== "production") {
          throw new Error(
            `[Canvas2DRuntime] Effect type "${effect.type}" is not yet implemented ` +
            `in the Canvas2D path. A shader-backed implementation is required. ` +
            `Remove this effect from the layer or implement the evaluation path.`
          );
        }
        break;
      default: {
        // Exhaustive check: every LayerEffectType must have a case above.
        const _exhaustive: never = effect;
        if (process.env.NODE_ENV !== "production") {
          console.error(
            `[Canvas2DRuntime] Unknown effect type: ${(_exhaustive as { type: string }).type}`
          );
        }
      }
    }
  }

  if (filterParts.length === 0) {
    fxCache.delete(layerId);
    return { result: { surface: source, ...SDR_SRGB }, fxTempCanvas };
  }

  // Apply the filter chain to a temporary canvas
  let temp = fxTempCanvas;
  if (
    !temp ||
    temp.width !== source.width ||
    temp.height !== source.height
  ) {
    temp = window.document.createElement("canvas");
    temp.width = source.width;
    temp.height = source.height;
    fxTempCanvas = temp;
  }
  const ctx = temp.getContext("2d");
  if (!ctx) {
    return { result: { surface: source, ...SDR_SRGB }, fxTempCanvas };
  }

  ctx.clearRect(0, 0, temp.width, temp.height);
  ctx.filter = filterParts.join(" ");
  ctx.drawImage(source, 0, 0);
  ctx.filter = "none";

  // Cache the result — clone into a dedicated canvas so the shared fxTempCanvas
  // can be reused for other layers without overwriting the cached result.
  let cacheCanvas = cached?.canvas;
  if (
    !cacheCanvas ||
    cacheCanvas.width !== temp.width ||
    cacheCanvas.height !== temp.height
  ) {
    cacheCanvas = window.document.createElement("canvas");
    cacheCanvas.width = temp.width;
    cacheCanvas.height = temp.height;
  }
  const cacheCtx = cacheCanvas.getContext("2d");
  if (cacheCtx) {
    cacheCtx.clearRect(0, 0, cacheCanvas.width, cacheCanvas.height);
    cacheCtx.drawImage(temp, 0, 0);
    fxCache.set(layerId, { key: cacheKey, canvas: cacheCanvas });
  }

  return { result: { surface: temp, ...SDR_SRGB }, fxTempCanvas };
}
