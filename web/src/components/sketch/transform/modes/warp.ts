/**
 * Warp mode — independent corner movement producing a free quad. Today
 * `mesh-warp` is an alias that renders with a different tag so the bake
 * path can later differentiate; the actual gesture math is shared until
 * the dedicated mesh-grid editor lands.
 */

import {
  cloneTransform,
  isQuadTransform,
  makeSingleQuadTransform
} from "../../types";
import {
  isCornerHandle,
  type TransformHandle
} from "../../tools/transform/handleGeometry";
import {
  computeScaleTransform,
  computeWarpTransform
} from "../../tools/transform/computeTransform";
import type { ModeDragInput, TransformModeHandler } from "./types";
import type { LayerTransform } from "../../types";

const VISIBLE_HANDLES: readonly TransformHandle[] = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right"
];

function applyWarpDrag(
  input: ModeDragInput,
  tag: "warp" | "mesh-warp"
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
  const warped = computeWarpTransform(
    input.dragStartCorners,
    input.handle,
    input.dragStart,
    input.cursor,
    input.rasterBounds,
    input.dragStartTransform
  );
  if (tag === "mesh-warp" && isQuadTransform(warped) && warped.kind === "quad") {
    return makeSingleQuadTransform("mesh-warp", warped.quad);
  }
  return cloneTransform(warped);
}

export const WarpMode: TransformModeHandler = {
  id: "warp",
  label: "Warp",
  tooltip:
    "Warp keeps each corner independently movable while using the shared quad rendering path.",
  visibleInToolbar: true,
  visibleHandles: VISIBLE_HANDLES,
  supportsRotate: false,
  supportsPivot: false,
  rendersAsQuad: true,
  applyDrag(input: ModeDragInput) {
    return applyWarpDrag(input, "warp");
  }
};

export const MeshWarpMode: TransformModeHandler = {
  id: "mesh-warp",
  label: "Mesh Warp",
  visibleInToolbar: false,
  visibleHandles: VISIBLE_HANDLES,
  supportsRotate: false,
  supportsPivot: false,
  rendersAsQuad: true,
  applyDrag(input: ModeDragInput) {
    return applyWarpDrag(input, "mesh-warp");
  }
};
