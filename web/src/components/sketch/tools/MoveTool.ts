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
import { useSketchStore } from "../state/useSketchStore";

export class MoveTool implements ToolHandler {
  readonly toolId = "move" as const;

  private moveStart: Point | null = null;
  private moveLayerStartTransform: LayerTransform = { x: 0, y: 0 };
  private movePreviewTransform: LayerTransform | null = null;
  private movePreviewLayerId: string | null = null;

  onDown(ctx: ToolContext, event: ToolPointerEvent): boolean | void {
    const { doc } = ctx;
    let activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId);
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
      // Alt+click: auto-pick the topmost layer with non-transparent pixels
      const px = Math.floor(pt.x);
      const py = Math.floor(pt.y);
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
        const layerCtx = layerCanvas.getContext("2d");
        if (!layerCtx) {
          continue;
        }
        const compositeOffset = getLayerCompositeOffset(
          layer,
          { width: layerCanvas.width, height: layerCanvas.height },
          layerCanvas
        );
        const localX = px - compositeOffset.x;
        const localY = py - compositeOffset.y;
        if (
          localX >= 0 &&
          localX < layerCanvas.width &&
          localY >= 0 &&
          localY < layerCanvas.height
        ) {
          const pixel = layerCtx.getImageData(localX, localY, 1, 1).data;
          if (pixel[3] > 0) {
            ctx.onAutoPickLayer(layer.id);
            break;
          }
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
      // Live compositing preview (fast path, avoids full store update)
      ctx.setLayerTransformPreview?.(layer.id, previewTransform);
      // Also commit to the store so callers see updated transforms immediately
      if (ctx.onLayerTransformChange) {
        ctx.onLayerTransformChange(layer.id, previewTransform);
      }
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
  }
}

export const definition: ToolDefinition = {
  tool: "move",
  label: "Move",
  shortcut: "V",
  Icon: OpenWithIcon,
  group: "painting"
};
