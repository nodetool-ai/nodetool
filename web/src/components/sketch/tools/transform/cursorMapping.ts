/**
 * cursorMapping – CSS cursor logic for transform handles.
 *
 * Extracted from TransformTool.ts so the tool file owns interaction flow,
 * not presentation policy.
 *
 * @module tools/transform/cursorMapping
 */

import type { TransformHandle } from "./handleGeometry";

const ROTATE_CURSOR_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">' +
  '<path d="M14 8a6 6 0 1 1-5.2 7.79" fill="none" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round"/>' +
  '<path d="M14 8a6 6 0 1 1-5.2 7.79" fill="none" stroke="#212121" stroke-width="1.75" stroke-linecap="round"/>' +
  '<path d="M14 6l3.5 6h-7z" fill="#ffffff" stroke="#212121" stroke-width="1" stroke-linejoin="round"/>' +
  "</svg>";

/** Curved-arrow cursor for rotate (dedicated handle + outside-box zone); hotspot centered. */
export const ROTATE_CURSOR_CSS =
  `url("data:image/svg+xml,${encodeURIComponent(ROTATE_CURSOR_SVG)}") 14 14, grab`;

/**
 * CSS cursor for a given transform handle, accounting for layer rotation.
 *
 * Scale handles are mapped to directional resize cursors that rotate with
 * the layer. The rotation handle and outside-box rotate zone use
 * {@link ROTATE_CURSOR_CSS}. The move area shows "move".
 */
export function cursorForHandle(
  handle: TransformHandle | null,
  rotation: number
): string {
  if (!handle) {
    return "default";
  }
  if (handle === "move") {
    return "move";
  }
  if (handle === "rotate") {
    return ROTATE_CURSOR_CSS;
  }
  if (handle === "pivot") {
    return "crosshair";
  }
  // For scale handles, pick a directional resize cursor rotated by the layer rotation
  const baseDeg: Partial<Record<TransformHandle, number>> = {
    top: 0,
    "top-right": 45,
    right: 90,
    "bottom-right": 135,
    bottom: 180,
    "bottom-left": 225,
    left: 270,
    "top-left": 315
  };
  const base = baseDeg[handle] ?? 0;
  // Normalize the total angle into a cursor bucket (8 directions, 45° each)
  const totalDeg =
    ((base + (rotation * 180) / Math.PI) % 360 + 360) % 360;
  const bucket = Math.round(totalDeg / 45) % 4;
  const cursors = ["ns-resize", "nesw-resize", "ew-resize", "nwse-resize"];
  return cursors[bucket];
}
