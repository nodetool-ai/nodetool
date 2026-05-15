/**
 * composite – Display compositing and layer drawing helpers.
 *
 * Pure-ish functions that composite document layers to a target context,
 * including display-only chrome (checkerboard, border) and per-layer
 * transform / opacity / blend-mode handling.
 */

import type {
  SketchDocument,
  LayerEffect
} from "../../types";
import {
  getAncestorGroupOpacityProduct,
  isLayerCompositeVisible
} from "../../types";
import { blendModeToComposite, drawCheckerboard } from "../../drawingUtils";
import { getLayerCompositeOffset } from "../../painting/layerBounds";
import type { ActiveStrokeInfo, DirtyRect, ResolvedLayerBitmap } from "../types";
import { drawImageToQuad, drawImageToDualQuad } from "./quadTransform";

// ─── Type alias for the FX evaluator callback ───────────────────────────────

export type EvaluateLayerEffectsFn = (
  layerId: string,
  source: HTMLCanvasElement,
  effects: LayerEffect[]
) => ResolvedLayerBitmap;

// ─── Transform-aware drawing ─────────────────────────────────────────────────

/**
 * Draw a source canvas into the target context, applying any scale/rotation
 * from the layer transform. When a matrix is available it is used directly;
 * otherwise falls back to decomposed values.
 */
export function drawWithTransform(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  compositeOffset: { x: number; y: number },
  layer: {
    transform: {
      x?: number;
      y?: number;
      scaleX?: number;
      scaleY?: number;
      rotation?: number;
      matrix?: [number, number, number, number, number, number];
      mode?:
        | "distort"
        | "skew"
        | "perspective"
        | "warp"
        | "perspective-dual"
        | "perspective-distort"
        | "mesh-warp";
      quad?: Array<{ x: number; y: number }>;
      secondaryQuad?: Array<{ x: number; y: number }>;
    };
  }
): void {
  if (
    layer.transform.mode === "perspective-dual" &&
    layer.transform.quad &&
    layer.transform.secondaryQuad
  ) {
    drawImageToDualQuad(
      ctx,
      source,
      layer.transform.quad.map((point) => ({ x: point.x, y: point.y })) as [
        { x: number; y: number },
        { x: number; y: number },
        { x: number; y: number },
        { x: number; y: number }
      ],
      layer.transform.secondaryQuad.map((point) => ({
        x: point.x,
        y: point.y
      })) as [
        { x: number; y: number },
        { x: number; y: number },
        { x: number; y: number },
        { x: number; y: number }
      ]
    );
    return;
  }
  if (
    (layer.transform.mode === "perspective" ||
      layer.transform.mode === "warp" ||
      layer.transform.mode === "perspective-distort" ||
      layer.transform.mode === "mesh-warp" ||
      layer.transform.mode === "distort") &&
    layer.transform.quad
  ) {
    drawImageToQuad(
      ctx,
      source,
      layer.transform.quad.map((point) => ({ x: point.x, y: point.y })) as [
        { x: number; y: number },
        { x: number; y: number },
        { x: number; y: number },
        { x: number; y: number }
      ]
    );
    return;
  }
  if (layer.transform.matrix && layer.transform.mode) {
    const [a, b, c, d, e, f] = layer.transform.matrix;
    const originX = compositeOffset.x - (layer.transform.x ?? 0);
    const originY = compositeOffset.y - (layer.transform.y ?? 0);
    ctx.setTransform(a, b, c, d, e, f);
    ctx.drawImage(source, originX, originY);
    return;
  }
  const sx = layer.transform.scaleX ?? 1;
  const sy = layer.transform.scaleY ?? 1;
  const rot = layer.transform.rotation ?? 0;

  if (sx !== 1 || sy !== 1 || rot !== 0) {
    const cx = compositeOffset.x + source.width / 2;
    const cy = compositeOffset.y + source.height / 2;
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.scale(sx, sy);
    ctx.drawImage(source, -source.width / 2, -source.height / 2);
  } else {
    ctx.drawImage(source, compositeOffset.x, compositeOffset.y);
  }
}

// ─── Single-layer drawing ────────────────────────────────────────────────────

/** Draw a single layer into a context, respecting opacity, blend mode, and effects. */
export function drawLayerToContext(
  ctx: CanvasRenderingContext2D,
  doc: SketchDocument,
  layerId: string,
  layerCanvases: Map<string, HTMLCanvasElement>,
  evaluateLayerEffects: EvaluateLayerEffectsFn,
  includeOpacity = true
): void {
  const layer = doc.layers.find((l) => l.id === layerId);
  const layerCanvas = layerCanvases.get(layerId);
  if (!layer || !layerCanvas) {
    return;
  }

  // Apply non-destructive effects (same pipeline as compositeToDisplay)
  let drawCanvas: HTMLCanvasElement = layerCanvas;
  if (layer.effects.length > 0 && layer.effects.some((e) => e.enabled)) {
    drawCanvas = evaluateLayerEffects(layer.id, layerCanvas, layer.effects).surface;
  }

  ctx.save();
  if (includeOpacity) {
    const opacityScale = getAncestorGroupOpacityProduct(
      doc.layers,
      layer,
      null
    );
    ctx.globalAlpha = layer.opacity * opacityScale;
    ctx.globalCompositeOperation = blendModeToComposite(
      layer.blendMode || "normal"
    );
  }
  const compositeOffset = getLayerCompositeOffset(
    layer,
    {
      width: drawCanvas.width,
      height: drawCanvas.height
    },
    layerCanvas
  );
  drawWithTransform(ctx, drawCanvas, compositeOffset, layer);
  ctx.restore();
}

// ─── Document composite (content only) ───────────────────────────────────────

export interface StrokeTempState {
  strokeTempCanvas: HTMLCanvasElement | null;
}

/** Options for {@link renderDocumentComposite}. */
export interface RenderDocumentCompositeOptions {
  /**
   * When true, mask-type layers are drawn like raster layers (editor preview).
   * Export/flatten paths omit this so flattened output does not paint mask pixels
   * as a separate layer.
   * @default false
   */
  includeMaskLayers?: boolean;
}

/**
 * Render document pixels only: visibility, opacity, blend modes, transforms,
 * effects, and optional active-stroke preview. This excludes display-only
 * chrome such as the checkerboard background and canvas border.
 */
export function renderDocumentComposite(
  ctx: CanvasRenderingContext2D,
  doc: SketchDocument,
  isolatedLayerId: string | null | undefined,
  activeStroke: ActiveStrokeInfo | null,
  layerCanvases: Map<string, HTMLCanvasElement>,
  evaluateLayerEffects: EvaluateLayerEffectsFn,
  strokeState: StrokeTempState,
  options?: RenderDocumentCompositeOptions
): StrokeTempState {
  const includeMaskLayers = options?.includeMaskLayers ?? false;
  let { strokeTempCanvas } = strokeState;

  for (const layer of doc.layers) {
    if (layer.type === "group") {
      continue;
    }
    if (layer.type === "mask" && !includeMaskLayers) {
      continue;
    }
    if (!isLayerCompositeVisible(doc.layers, layer, isolatedLayerId)) {
      continue;
    }
    if (isolatedLayerId && layer.id !== isolatedLayerId) {
      continue;
    }
    const layerCanvas = layerCanvases.get(layer.id);
    if (!layerCanvas) {
      continue;
    }

    let drawCanvas = layerCanvas;
    if (layer.effects.length > 0 && layer.effects.some((e) => e.enabled)) {
      drawCanvas = evaluateLayerEffects(
        layer.id,
        layerCanvas,
        layer.effects
      ).surface;
    }

    const opacityScale = getAncestorGroupOpacityProduct(
      doc.layers,
      layer,
      isolatedLayerId
    );
    const hasActiveStroke = activeStroke && activeStroke.layerId === layer.id;
    const compositeOffset = getLayerCompositeOffset(
      layer,
      {
        width: drawCanvas.width,
        height: drawCanvas.height
      },
      layerCanvas
    );

    if (hasActiveStroke) {
      let tempCanvas = strokeTempCanvas;
      if (
        !tempCanvas ||
        tempCanvas.width !== drawCanvas.width ||
        tempCanvas.height !== drawCanvas.height
      ) {
        tempCanvas = window.document.createElement("canvas");
        tempCanvas.width = drawCanvas.width;
        tempCanvas.height = drawCanvas.height;
        strokeTempCanvas = tempCanvas;
      }
      const tempCtx = tempCanvas.getContext("2d");
      if (tempCtx) {
        tempCtx.setTransform(1, 0, 0, 1, 0, 0);
        tempCtx.globalAlpha = 1;
        tempCtx.globalCompositeOperation = "source-over";
        tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
        tempCtx.drawImage(drawCanvas, 0, 0);
        tempCtx.save();
        tempCtx.globalAlpha = activeStroke.opacity;
        tempCtx.globalCompositeOperation = activeStroke.compositeOp;
        tempCtx.drawImage(activeStroke.buffer, 0, 0);
        tempCtx.restore();

        ctx.save();
        ctx.globalAlpha = layer.opacity * opacityScale;
        ctx.globalCompositeOperation = blendModeToComposite(
          layer.blendMode || "normal"
        );
        drawWithTransform(ctx, tempCanvas, compositeOffset, layer);
        ctx.restore();
      }
    } else {
      ctx.save();
      ctx.globalAlpha = layer.opacity * opacityScale;
      ctx.globalCompositeOperation = blendModeToComposite(
        layer.blendMode || "normal"
      );
      drawWithTransform(ctx, drawCanvas, compositeOffset, layer);
      ctx.restore();
    }
  }

  return { strokeTempCanvas };
}

// ─── Display compositing (with chrome) ───────────────────────────────────────

/**
 * Composite all visible layers onto the target canvas including display chrome
 * (checkerboard, border).
 */
export function compositeToDisplayCanvas(
  targetCanvas: HTMLCanvasElement,
  doc: SketchDocument,
  isolatedLayerId: string | null | undefined,
  activeStroke: ActiveStrokeInfo | null,
  zoom: number,
  layerCanvases: Map<string, HTMLCanvasElement>,
  evaluateLayerEffects: EvaluateLayerEffectsFn,
  strokeState: StrokeTempState,
  dirtyRect?: DirtyRect | null
): StrokeTempState {
  const ctx = targetCanvas.getContext("2d");
  if (!ctx) {
    return strokeState;
  }

  const fullW = targetCanvas.width;
  const fullH = targetCanvas.height;
  const useClip = !!dirtyRect;

  if (useClip) {
    const pad = 2;
    const rx = Math.max(0, Math.floor(dirtyRect.x - pad));
    const ry = Math.max(0, Math.floor(dirtyRect.y - pad));
    const rw = Math.min(fullW - rx, Math.ceil(dirtyRect.w + pad * 2));
    const rh = Math.min(fullH - ry, Math.ceil(dirtyRect.h + pad * 2));

    ctx.save();
    ctx.beginPath();
    ctx.rect(rx, ry, rw, rh);
    ctx.clip();
    ctx.clearRect(rx, ry, rw, rh);
    drawCheckerboard(ctx, fullW, fullH, zoom);
  } else {
    ctx.clearRect(0, 0, fullW, fullH);
    drawCheckerboard(ctx, fullW, fullH, zoom);
  }

  const nextStrokeState = renderDocumentComposite(
    ctx,
    doc,
    isolatedLayerId,
    activeStroke,
    layerCanvases,
    evaluateLayerEffects,
    strokeState,
    { includeMaskLayers: true }
  );

  if (useClip) {
    ctx.restore();
  }

  // Draw a subtle border around the canvas to show its boundaries
  if (!useClip && typeof ctx.strokeRect === "function") {
    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, fullW - 1, fullH - 1);
    ctx.restore();
  }

  return nextStrokeState;
}
