/**
 * Sketch Editor — ensureLayerRasterBounds
 *
 * Mutator that grows a layer's raster canvas so it covers `requiredBounds`
 * in layer-local space. Lives next to the canonical layer geometry helpers
 * because its inputs (`requiredBounds`) and outputs are layer-local raster
 * bounds — same coordinate system as `getRasterBounds`.
 */

import type { Layer, LayerContentBounds } from "../../types";
import type { ToolContext } from "../../tools/types";
import {
  getRasterBounds,
  setCanvasRasterBounds,
  unionLayerBounds
} from "./layerGeometry";

/**
 * Ensure the layer's raster canvas covers `requiredBounds`. Grows the canvas
 * (allocating a new one and copying the existing pixels) when needed and
 * stores the resulting raster bounds on the canvas via
 * `setCanvasRasterBounds`. Returns the resulting raster bounds in
 * layer-local space.
 */
export function ensureLayerRasterBounds(
  ctx: ToolContext,
  layer: Layer,
  requiredBounds: LayerContentBounds
): LayerContentBounds {
  const currentCanvas = ctx.getOrCreateLayerCanvas(layer.id);
  const currentBounds = getRasterBounds(layer, currentCanvas, {
    width: currentCanvas.width,
    height: currentCanvas.height
  });
  const nextBounds = unionLayerBounds(currentBounds, requiredBounds);

  if (
    nextBounds.x === currentBounds.x &&
    nextBounds.y === currentBounds.y &&
    nextBounds.width === currentBounds.width &&
    nextBounds.height === currentBounds.height
  ) {
    setCanvasRasterBounds(currentCanvas, currentBounds);
    return currentBounds;
  }

  const expandedCanvas = window.document.createElement("canvas");
  expandedCanvas.width = nextBounds.width;
  expandedCanvas.height = nextBounds.height;
  const expandedCtx = expandedCanvas.getContext("2d");
  if (!expandedCtx) {
    return currentBounds;
  }

  expandedCtx.drawImage(
    currentCanvas,
    currentBounds.x - nextBounds.x,
    currentBounds.y - nextBounds.y
  );
  setCanvasRasterBounds(expandedCanvas, nextBounds);
  ctx.layerCanvasesRef.current.set(layer.id, expandedCanvas);
  ctx.invalidateLayer?.(layer.id);
  return nextBounds;
}
