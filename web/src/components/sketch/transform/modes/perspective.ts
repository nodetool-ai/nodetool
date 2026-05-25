/**
 * Perspective mode — four-point projective transform. Drag a corner; the
 * opposite edge mirrors via axis projection. Matches Affinity's
 * Perspective Tool.
 */

import {
  isCornerHandle,
  type TransformHandle
} from "../../tools/transform/handleGeometry";
import {
  computePerspectiveTransform,
  computeScaleTransform
} from "../../tools/transform/computeTransform";
import type { ModeDragInput, TransformModeHandler } from "./types";

const VISIBLE_HANDLES: readonly TransformHandle[] = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right"
];

export const PerspectiveMode: TransformModeHandler = {
  id: "perspective",
  label: "Perspective",
  tooltip:
    "Perform a four-point perspective transformation. Drag handles to apply perspective; Shift to constrain.",
  visibleInToolbar: true,
  visibleHandles: VISIBLE_HANDLES,
  supportsRotate: false,
  supportsPivot: false,
  rendersAsQuad: true,
  applyDrag(input: ModeDragInput) {
    if (!isCornerHandle(input.handle)) {
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
    return computePerspectiveTransform(
      input.dragStartCorners,
      input.handle,
      input.dragStart,
      input.cursor,
      input.rasterBounds,
      input.dragStartTransform
    );
  }
};
