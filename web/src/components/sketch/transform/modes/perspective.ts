/**
 * Perspective mode — projective transform from a unit rect. Includes
 * `PerspectiveDistortMode` which shares the gesture math but tags the
 * resulting quad differently so a later commit can straighten the layer.
 */

import {
  makeSingleQuadTransform
} from "../../types";
import {
  isCornerHandle,
  type TransformHandle
} from "../../tools/transform/handleGeometry";
import {
  computePerspectiveTransform,
  computeScaleTransform
} from "../../tools/transform/computeTransform";
import type { ModeDragInput, TransformModeHandler } from "./types";
import type { LayerTransform } from "../../types";

const VISIBLE_HANDLES: readonly TransformHandle[] = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right"
];

function applyPerspectiveDrag(
  input: ModeDragInput,
  tag: "perspective" | "perspective-distort"
): LayerTransform {
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
  const single = computePerspectiveTransform(
    input.dragStartCorners,
    input.handle,
    input.dragStart,
    input.cursor,
    input.rasterBounds,
    input.dragStartTransform
  );
  if (tag === "perspective-distort" && single.kind === "quad") {
    return makeSingleQuadTransform("perspective-distort", single.quad);
  }
  return single;
}

export const PerspectiveMode: TransformModeHandler = {
  id: "perspective",
  label: "Persp 1",
  tooltip:
    "Single-plane perspective. Drag a corner to skew one quad while the opposite edge follows.",
  visibleInToolbar: true,
  visibleHandles: VISIBLE_HANDLES,
  supportsRotate: false,
  supportsPivot: false,
  rendersAsQuad: true,
  applyDrag(input: ModeDragInput) {
    return applyPerspectiveDrag(input, "perspective");
  }
};

export const PerspectiveDistortMode: TransformModeHandler = {
  id: "perspective-distort",
  label: "Distort 4-pt",
  tooltip:
    "Perspective Distort (preview): drag the four corners to a quad that should be rectangular; on commit the layer is straightened.",
  visibleInToolbar: true,
  visibleHandles: VISIBLE_HANDLES,
  supportsRotate: false,
  supportsPivot: false,
  rendersAsQuad: true,
  applyDrag(input: ModeDragInput) {
    return applyPerspectiveDrag(input, "perspective-distort");
  }
};
