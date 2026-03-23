import type { SketchDocument, Layer, LayerContentBounds, Point } from "../types";
import type { ToolContext } from "../tools/types";

type LayerLike = {
  contentBounds?: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  };
  transform?: { x?: number; y?: number };
};

type LayerRasterCanvas = HTMLCanvasElement & {
  __nodetoolRasterBounds?: LayerContentBounds;
};

function sanitizeDimension(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value! > 0 ? Math.round(value!) : fallback;
}

export function getLayerRasterBounds(
  layer: LayerLike,
  fallbackSize?: { width: number; height: number }
): LayerContentBounds {
  const fallbackWidth = fallbackSize?.width ?? 1;
  const fallbackHeight = fallbackSize?.height ?? 1;
  return {
    x: Math.round(layer.contentBounds?.x ?? 0),
    y: Math.round(layer.contentBounds?.y ?? 0),
    width: sanitizeDimension(layer.contentBounds?.width, fallbackWidth),
    height: sanitizeDimension(layer.contentBounds?.height, fallbackHeight)
  };
}

export function getCanvasRasterBounds(
  canvas: HTMLCanvasElement | null | undefined
): LayerContentBounds | null {
  return (canvas as LayerRasterCanvas | null | undefined)?.__nodetoolRasterBounds ?? null;
}

export function setCanvasRasterBounds(
  canvas: HTMLCanvasElement,
  bounds: LayerContentBounds
): void {
  (canvas as LayerRasterCanvas).__nodetoolRasterBounds = bounds;
}

export function getEffectiveLayerRasterBounds(
  layer: LayerLike,
  canvas?: HTMLCanvasElement | null,
  fallbackSize?: { width: number; height: number }
): LayerContentBounds {
  const canvasBounds = getCanvasRasterBounds(canvas);
  if (canvasBounds) {
    return canvasBounds;
  }
  const size = canvas
    ? { width: canvas.width, height: canvas.height }
    : fallbackSize;
  return getLayerRasterBounds(layer, size);
}

export function getLayerCompositeOffset(
  layer: LayerLike,
  fallbackSize?: { width: number; height: number },
  canvas?: HTMLCanvasElement | null
): Point {
  const bounds = getEffectiveLayerRasterBounds(layer, canvas, fallbackSize);
  return {
    x: (layer.transform?.x ?? 0) + bounds.x,
    y: (layer.transform?.y ?? 0) + bounds.y
  };
}

export function getDocumentViewportLayerBounds(
  layer: Layer,
  doc: SketchDocument
): LayerContentBounds {
  return {
    x: -(layer.transform?.x ?? 0),
    y: -(layer.transform?.y ?? 0),
    width: doc.canvas.width,
    height: doc.canvas.height
  };
}

export function unionLayerBounds(
  a: LayerContentBounds,
  b: LayerContentBounds
): LayerContentBounds {
  const minX = Math.min(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxX = Math.max(a.x + a.width, b.x + b.width);
  const maxY = Math.max(a.y + a.height, b.y + b.height);
  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY)
  };
}

export function ensureLayerRasterBounds(
  ctx: ToolContext,
  layer: Layer,
  requiredBounds: LayerContentBounds
): LayerContentBounds {
  const currentCanvas = ctx.getOrCreateLayerCanvas(layer.id);
  const currentBounds = getEffectiveLayerRasterBounds(layer, currentCanvas, {
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
