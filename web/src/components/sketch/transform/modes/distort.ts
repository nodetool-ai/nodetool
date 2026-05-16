/**
 * Distort mode — independent corner drags producing a free 4-point quad.
 *
 * Edge handles are not part of the distort affordance; if an edge drag
 * arrives here (e.g. from a stale handle snapshot) we fall back to a
 * scale-style drag via the standard dispatcher in `TransformTool`.
 */

import {
  isCornerHandle,
  type TransformHandle
} from "../../tools/transform/handleGeometry";
import {
  computeDistortTransform,
  computeScaleTransform
} from "../../tools/transform/computeTransform";
import type { ModeDragInput, TransformModeHandler } from "./types";

const VISIBLE_HANDLES: readonly TransformHandle[] = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right"
];

export const DistortMode: TransformModeHandler = {
  id: "distort",
  label: "Deform",
  tooltip: "Warp your image using custom anchor points. Drag a corner to move it independently.",
  // Hidden from the toolbar until the real Affinity-style Deform tool
  // (arbitrary anchor points + moving-least-squares warp) ships. The
  // current 4-corner shim is kept for back-compat with already-deformed
  // layers and for the internal compute path.
  visibleInToolbar: false,
  visibleHandles: VISIBLE_HANDLES,
  supportsRotate: false,
  supportsPivot: false,
  rendersAsQuad: true,
  applyDrag(input: ModeDragInput) {
    if (isCornerHandle(input.handle)) {
      return computeDistortTransform(
        input.dragStartCorners,
        input.handle,
        input.dragStart,
        input.cursor,
        input.rasterBounds,
        input.modifiers.shift,
        input.dragStartTransform
      );
    }
    return computeScaleTransform(
      input.dragStartTransform,
      input.dragStart,
      input.cursor,
      input.center,
      input.rasterBounds,
      input.handle,
      input.modifiers.shift,
      input.modifiers.alt
    );
  }
};
