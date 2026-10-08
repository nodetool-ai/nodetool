/**
 * Ruler math — tick spacing and the document↔screen mapping the rulers and
 * guides share with the canvas (`docToScreen` in `tools/transform`).
 */

import type { Point } from "../types";

/** Major tick spacing candidates in document pixels. */
const MAJOR_STEPS = [
  1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000
];

/** Minimum on-screen distance (CSS px) between labelled major ticks. */
const MIN_MAJOR_SPACING_PX = 56;
/** Minimum on-screen distance (CSS px) between minor ticks. */
const MIN_MINOR_SPACING_PX = 5;

export interface RulerTickSpacing {
  /** Document pixels between labelled ticks. */
  major: number;
  /** Document pixels between unlabelled ticks; equals `major` when none fit. */
  minor: number;
}

export function rulerTickSpacing(zoom: number): RulerTickSpacing {
  const safeZoom = zoom > 0 ? zoom : 1;
  const major =
    MAJOR_STEPS.find((step) => step * safeZoom >= MIN_MAJOR_SPACING_PX) ??
    MAJOR_STEPS[MAJOR_STEPS.length - 1]!;
  for (const divisions of [10, 5, 4, 2]) {
    const minor = major / divisions;
    if (Number.isInteger(minor) && minor * safeZoom >= MIN_MINOR_SPACING_PX) {
      return { major, minor };
    }
  }
  return { major, minor: major };
}

/** Viewport (CSS px, relative to the canvas region) of a document coordinate on one axis. */
export function docToViewport(
  doc: number,
  docSize: number,
  viewportSize: number,
  zoom: number,
  pan: number
): number {
  return (doc - docSize / 2) * zoom + viewportSize / 2 + pan;
}

/** Document coordinate of a viewport position on one axis (inverse of {@link docToViewport}). */
export function viewportToDoc(
  viewport: number,
  docSize: number,
  viewportSize: number,
  zoom: number,
  pan: number
): number {
  return (viewport - viewportSize / 2 - pan) / zoom + docSize / 2;
}

/** Document point under a viewport point. */
export function viewportPointToDoc(
  point: Point,
  doc: { width: number; height: number },
  viewport: { width: number; height: number },
  zoom: number,
  pan: Point
): Point {
  return {
    x: viewportToDoc(point.x, doc.width, viewport.width, zoom, pan.x),
    y: viewportToDoc(point.y, doc.height, viewport.height, zoom, pan.y)
  };
}
