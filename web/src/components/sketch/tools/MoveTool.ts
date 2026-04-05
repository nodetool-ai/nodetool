/**
 * MoveTool – translates the active layer by dragging.
 *
 * Supports:
 *   - Ctrl+Alt click to duplicate-and-move
 *   - Alt click to auto-pick topmost non-transparent layer
 *   - setLayerTransformPreview for live compositing
 *   - clearLayerTransformPreview on release
 */

import type { ToolHandler, ToolContext, ToolPointerEvent, ToolDefinition } from "./types";
import type { Point, LayerTransform } from "../types";
import OpenWithIcon from "@mui/icons-material/OpenWith";
import {
  isLayerCompositeVisible,
  layerAllowsTransformWhilePixelLocked
} from "../types";
import { getLayerCompositeOffset } from "../painting";
import { hitTestLayerAtDocPoint } from "../painting/sampleDocument";
import { useSketchStore } from "../state/useSketchStore";
/** Convert a document-space rect to gizmo canvas pixel coordinates. */
function docRectToGizmo(
  docX: number,
  docY: number,
  docW: number,
  docH: number,
  canvasDocW: number,
  canvasDocH: number,
  zoom: number,
  pan: Point,
  containerW: number,
  containerH: number,
  dpr: number
): { x: number; y: number; w: number; h: number } {
  const toX = (dx: number) =>
    ((dx - canvasDocW / 2) * zoom + containerW / 2 + pan.x) * dpr;
  const toY = (dy: number) =>
    ((dy - canvasDocH / 2) * zoom + containerH / 2 + pan.y) * dpr;
  return {
    x: toX(docX),
    y: toY(docY),
    w: docW * zoom * dpr,
    h: docH * zoom * dpr
  };
}

/** Paint a dashed outline for off-canvas layer extents on the gizmo canvas. */
function paintOffCanvasGizmo(
  ctx: ToolContext,
  layerId: string,
  transform: LayerTransform
): void {
  const layer = ctx.doc.layers.find((l) => l.id === layerId);
  if (!layer) {
    return;
  }

  // Use the actual layer canvas dimensions when available so the gizmo
  // reflects the real raster footprint, not just the declared contentBounds
  // which may lag behind after moves or draws.
  const layerCanvas = ctx.layerCanvasesRef.current.get(layerId);
  const bounds = layer.contentBounds;
  const rasterW = layerCanvas && layerCanvas.width > 0 ? layerCanvas.width : (bounds.width ?? 0);
  const rasterH = layerCanvas && layerCanvas.height > 0 ? layerCanvas.height : (bounds.height ?? 0);
  const lx = (transform.x ?? 0) + (bounds.x ?? 0);
  const ly = (transform.y ?? 0) + (bounds.y ?? 0);
  const lw = rasterW;
  const lh = rasterH;

  const cw = ctx.doc.canvas.width;
  const ch = ctx.doc.canvas.height;

  // Only show gizmo when the layer visually extends outside the canvas
  const extendsOutside =
    lx < 0 || ly < 0 || lx + lw > cw || ly + lh > ch;
  if (!extendsOutside) {
    ctx.clearGizmo();
    return;
  }

  ctx.drawGizmo((gc, dpr, containerW, containerH) => {
    const r = docRectToGizmo(
      lx, ly, lw, lh,
      cw, ch,
      ctx.zoom, ctx.pan,
      containerW, containerH,
      dpr
    );

    gc.save();
    gc.strokeStyle = "rgba(255, 200, 0, 0.75)";
    gc.lineWidth = dpr;
    gc.setLineDash([4 * dpr, 3 * dpr]);
    gc.strokeRect(r.x, r.y, r.w, r.h);
    gc.setLineDash([]);
    gc.restore();
  });
}

export class MoveTool implements ToolHandler {
  readonly toolId = "move" as const;

  private moveStart: Point | null = null;
  private moveLayerStartTransform: LayerTransform = { x: 0, y: 0 };
  private movePreviewTransform: LayerTransform | null = null;
  private movePreviewLayerId: string | null = null;

  onActivate(ctx: ToolContext): void {
    this.refreshGizmo(ctx);
  }

  onDeactivate(ctx: ToolContext): void {
    ctx.clearGizmo();
  }

  private refreshGizmo(ctx: ToolContext): void {
    const { doc } = ctx;
    const activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId);
    if (!activeLayer) {
      ctx.clearGizmo();
      return;
    }
    const previewTransform = this.movePreviewTransform ?? activeLayer.transform;
    paintOffCanvasGizmo(ctx, activeLayer.id, previewTransform);
  }

  onDown(ctx: ToolContext, event: ToolPointerEvent): boolean | void {
    const { doc } = ctx;
    const activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId);
    if (!activeLayer) {
      return false;
    }
    if (
      activeLayer.locked &&
      !layerAllowsTransformWhilePixelLocked(activeLayer)
    ) {
      return false;
    }

    const pt = event.point;
    let moveTargetLayer = activeLayer;

    // Ctrl+Alt: duplicate layer then move the duplicate
    if ((event.nativeEvent.ctrlKey || event.nativeEvent.metaKey) && event.nativeEvent.altKey) {
      useSketchStore.getState().duplicateLayer(activeLayer.id);
      const freshDoc = useSketchStore.getState().document;
      const dup = freshDoc.layers.find((l) => l.id === freshDoc.activeLayerId);
      if (dup) {
        moveTargetLayer = dup;
      }
    } else if (event.nativeEvent.altKey && ctx.onAutoPickLayer) {
      // Alt+click: auto-pick topmost non-transparent layer (affine-aware)
      for (let i = doc.layers.length - 1; i >= 0; i--) {
        const layer = doc.layers[i];
        const skipForHit =
          !isLayerCompositeVisible(doc.layers, layer, null) ||
          (layer.locked && !layer.imageReference);
        if (skipForHit) {
          continue;
        }
        const layerCanvas = ctx.layerCanvasesRef.current.get(layer.id);
        if (!layerCanvas) {
          continue;
        }
        if (hitTestLayerAtDocPoint(layer, layerCanvas, pt)) {
          ctx.onAutoPickLayer(layer.id);
          break;
        }
      }
    }

    // Ensure the layer canvas exists so the compositing pipeline can render
    // the layer while it is being dragged.
    ctx.getOrCreateLayerCanvas(moveTargetLayer.id);

    this.moveStart = pt;
    this.moveLayerStartTransform = {
      x: moveTargetLayer.transform?.x ?? 0,
      y: moveTargetLayer.transform?.y ?? 0
    };
    this.movePreviewTransform = {
      x: moveTargetLayer.transform?.x ?? 0,
      y: moveTargetLayer.transform?.y ?? 0
    };
    this.movePreviewLayerId = moveTargetLayer.id;
    ctx.clearLayerTransformPreview?.(moveTargetLayer.id);
    ctx.onStrokeStart();
    return true;
  }

  onMove(ctx: ToolContext, event: ToolPointerEvent, _coalescedPoints?: ToolPointerEvent[]): void {
    if (!this.moveStart) {
      return;
    }
    const pt = event.point;
    const dx = pt.x - this.moveStart.x;
    const dy = pt.y - this.moveStart.y;
    const previewId = this.movePreviewLayerId;
    // Read freshest doc from the store in case a duplicate just occurred.
    // Fall back to ctx.doc when the store document doesn't contain the target layer
    // (e.g. in unit tests where the store isn't populated).
    const storeDoc = useSketchStore.getState().document;
    const layer =
      previewId != null
        ? (storeDoc.layers.find((l) => l.id === previewId) ??
           ctx.doc.layers.find((l) => l.id === previewId))
        : null;
    if (layer) {
      const previewTransform = {
        x: Math.round(this.moveLayerStartTransform.x + dx),
        y: Math.round(this.moveLayerStartTransform.y + dy)
      };
      this.movePreviewTransform = previewTransform;
      this.movePreviewLayerId = layer.id;
      // Live compositing preview — fast path that avoids a store update + React
      // re-render on every pointer-move event. The transform is committed to the
      // store once on pointer-up via onLayerTransformChange.
      ctx.setLayerTransformPreview?.(layer.id, previewTransform);
      this.refreshGizmo(ctx);
    }
  }

  onUp(ctx: ToolContext, _event?: ToolPointerEvent): void {
    const previewLayerId = this.movePreviewLayerId;
    const previewTransform = this.movePreviewTransform;
    if (previewLayerId && previewTransform && ctx.onLayerTransformChange) {
      ctx.onLayerTransformChange(previewLayerId, previewTransform);
    }
    ctx.clearLayerTransformPreview?.(previewLayerId ?? undefined);

    this.moveStart = null;
    this.moveLayerStartTransform = { x: 0, y: 0 };
    this.movePreviewTransform = null;
    this.movePreviewLayerId = null;

    if (previewLayerId) {
      ctx.onStrokeEnd(previewLayerId, null, undefined, {
        syncDocumentFromCanvas: false
      });
    }
    this.refreshGizmo(ctx);
  }
}

export const definition: ToolDefinition = {
  tool: "move",
  label: "Move",
  shortcut: "V",
  Icon: OpenWithIcon,
  group: "painting"
};
