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
    Math.min(viewportWidth / canvasWidth, viewportHeight / canvasHeight) *
    margin
  );
}

/**
 * Zoom and pan that fit the artboard into the part of the viewport nothing
 * covers. The tool bar floats over the top of the viewport (it takes no flex
 * height, so wrapping its settings never shifts the image), which means a
 * plain centre fit tucks the top of a tall document under it. `topInset` is
 * the bar's height: the fit uses the height below it and pans down by half
 * of it so the artboard is centred in the uncovered band. Falls back to the
 * whole viewport when the inset would leave no room.
 */
export function computeFitView(
  viewportWidth: number,
  viewportHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  topInset = 0
): { zoom: number; pan: Point } {
  const inset = topInset > 0 && topInset < viewportHeight * 0.5 ? topInset : 0;
  return {
    zoom: computeFitZoom(
      viewportWidth,
      viewportHeight - inset,
      canvasWidth,
      canvasHeight
    ),
    pan: { x: 0, y: inset / 2 }
  };
}
