/**
 * resolvedOutput – Non-destructive layer effects evaluation (CPU / Canvas2D path).
 *
 * Evaluates the effect stack on a single layer using CSS `ctx.filter`.
 * Returns a `ResolvedLayerBitmap` containing the output surface and
 * working-space / dynamic-range metadata.
 */

import { layerEffectsFilter } from "@nodetool-ai/image-editor/render.js";

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
  effects: LayerEffect[] | null,
  fxCache: Map<string, { key: string; canvas: HTMLCanvasElement }>,
  fxTempCanvas: HTMLCanvasElement | null
) {
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

  // The CSS filter chain is shared with the headless renderer.
  const filter = layerEffectsFilter(effects);

  if (filter === null) {
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
  ctx.filter = filter;
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
