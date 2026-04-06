/**
 * cursorMapping – CSS cursor logic for transform handles.
 *
 * Extracted from TransformTool.ts so the tool file owns interaction flow,
 * not presentation policy.
 *
 * @module tools/transform/cursorMapping
 */

import type { TransformHandle } from "./handleGeometry";

/**
 * CSS cursor for a given transform handle, accounting for layer rotation.
 *
 * Scale handles are mapped to directional resize cursors that rotate with
 * the layer. The rotation handle shows "grab" and the move area shows "move".
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
    return "grab";
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
