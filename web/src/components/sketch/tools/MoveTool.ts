/**
 * MoveTool – translates the active layer by dragging.
 *
 * Extracted from usePointerHandlers:
 *   handlePointerDown (~line 758-808)
 *   handlePointerMove (~line 1157-1172)
 *   handlePointerUp   (~line 1404-1407)
 */

import type { ToolHandler, ToolContext, ToolPointerEvent } from "./types";
import type { Point, LayerTransform } from "../types";

export class MoveTool implements ToolHandler {
  readonly toolId = "move" as const;

  private moveStart: Point | null = null;
  private moveLayerStartTransform: LayerTransform = { x: 0, y: 0 };

  onDown(ctx: ToolContext, event: ToolPointerEvent): boolean | void {
    const { doc } = ctx;
    const activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId);
    if (!activeLayer) {
      return false;
    }

    const pt = event.point;

    // Alt+click: auto-pick the topmost layer with non-transparent pixels
    if (event.nativeEvent.altKey && ctx.onAutoPickLayer) {
      const px = Math.floor(pt.x);
      const py = Math.floor(pt.y);
      for (let i = doc.layers.length - 1; i >= 0; i--) {
        const layer = doc.layers[i];
        if (!layer.visible || layer.locked) {
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
        const tx = layer.transform?.x ?? 0;
        const ty = layer.transform?.y ?? 0;
        const localX = px - tx;
        const localY = py - ty;
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

    this.moveStart = pt;
    this.moveLayerStartTransform = {
      x: activeLayer.transform?.x ?? 0,
      y: activeLayer.transform?.y ?? 0
    };
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
    const { doc } = ctx;
    const activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId);
    if (activeLayer && ctx.onLayerTransformChange) {
      ctx.onLayerTransformChange(activeLayer.id, {
        x: Math.round(this.moveLayerStartTransform.x + dx),
        y: Math.round(this.moveLayerStartTransform.y + dy)
      });
    }
  }

  onUp(ctx: ToolContext, _event?: ToolPointerEvent): void {
    this.moveStart = null;
    this.moveLayerStartTransform = { x: 0, y: 0 };

    const { doc } = ctx;
    const activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId);
    if (activeLayer) {
      ctx.onStrokeEnd(activeLayer.id, null);
    }
  }
}
