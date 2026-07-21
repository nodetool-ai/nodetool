import type { CSSProperties } from "react";
import type { Point } from "./types";

export function canvasTransformStyle(pan: Point, zoom: number): CSSProperties {
  return {
    transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
    transformOrigin: "center center",
    imageRendering: "pixelated"
  };
}

/**
 * Zoom factor that fits the whole artboard inside the viewport, keeping the
 * aspect ratio and leaving a small gutter (`margin`, default 90%). Returns 1
 * when any dimension is unknown or non-positive, so callers can fall back to
 * 100%. The result is not clamped — the store's `setZoom` applies the min/max.
 */
export function computeFitZoom(
  viewportWidth: number,
  viewportHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  margin = 0.9
): number {
  if (
    viewportWidth <= 0 ||
    viewportHeight <= 0 ||
    canvasWidth <= 0 ||
    canvasHeight <= 0
  ) {
    return 1;
  }
  return (
    Math.min(viewportWidth / canvasWidth, viewportHeight / canvasHeight) * margin
  );
}
