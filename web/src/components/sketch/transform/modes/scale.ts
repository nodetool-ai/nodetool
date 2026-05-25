/**
 * Scale mode — Photoshop-style free transform.
 *
 * 4 corners + 4 edge midpoints, with a rotate ring and draggable pivot.
 * Modifier-driven promotion to skew / perspective is handled by
 * `resolveTransformGestureMode` in `computeTransform.ts`; this handler is
 * only invoked when the resolved mode is `scale`.
 */

import type { TransformHandle } from "../../tools/transform/handleGeometry";
import { computeScaleTransform } from "../../tools/transform/computeTransform";
import type { ModeDragInput, TransformModeHandler } from "./types";

const VISIBLE_HANDLES: readonly TransformHandle[] = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
  "top",
  "bottom",
  "left",
  "right"
];

export const ScaleMode: TransformModeHandler = {
  id: "scale",
  label: "Scale",
  visibleInToolbar: true,
  visibleHandles: VISIBLE_HANDLES,
  supportsRotate: true,
  supportsPivot: true,
  rendersAsQuad: false,
  applyDrag(input: ModeDragInput) {
    return computeScaleTransform(
      input.dragStartTransform,
      input.dragStart,
      input.cursor,
      input.center,
      input.rasterBounds,
      input.handle,
      input.modifiers.shift,
      input.modifiers.alt || input.modifiers.ctrlOrMeta
    );
  }
};
