/**
 * Skew mode — edge drags shear the layer while keeping opposite edges parallel.
 *
 * Corner drags in skew mode fall back to standard scale (matches the pre-
 * registry behavior where `computeGestureTransform` only routed edge handles
 * into `computeSkewTransform`).
 */

import {
  isEdgeHandle,
  type TransformHandle
} from "../../tools/transform/handleGeometry";
import {
  computeScaleTransform,
  computeSkewTransform
} from "../../tools/transform/computeTransform";
import type { ModeDragInput, TransformModeHandler } from "./types";

const VISIBLE_HANDLES: readonly TransformHandle[] = [
  "top",
  "bottom",
  "left",
  "right"
];

export const SkewMode: TransformModeHandler = {
  id: "skew",
  label: "Skew",
  visibleInToolbar: true,
  visibleHandles: VISIBLE_HANDLES,
  supportsRotate: false,
  supportsPivot: false,
  rendersAsQuad: true,
  applyDrag(input: ModeDragInput) {
    if (isEdgeHandle(input.handle)) {
      return computeSkewTransform(
        input.dragStartCorners,
        input.handle,
        input.dragStart,
        input.cursor,
        input.rasterBounds,
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
