/**
 * Mesh Warp mode — distort an image using a customizable grid (corner
 * control points today; interior grid points will land with the dedicated
 * mesh editor). Matches Affinity's Mesh Warp Tool. The corner gesture
 * shares math with Deform (free-corner movement) but tags the resulting
 * quad as `mesh-warp` so the renderer can later switch to a true grid
 * bake without touching call sites.
 */

import { makeSingleQuadTransform } from "../../types";
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

export const MeshWarpMode: TransformModeHandler = {
  id: "mesh-warp",
  label: "Mesh Warp",
  tooltip:
    "Distort an image or image area using a customizable grid. Drag handles to apply mesh deformation.",
  // Hidden from the toolbar until the real Affinity-style Mesh Warp tool
  // (subdividable Bezier grid + Coons-patch sampling) ships. The current
  // 4-corner shim is kept so the registry stays exhaustive and existing
  // mesh-warp-tagged transforms still render.
  visibleInToolbar: false,
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
    const warped = computeDistortTransform(
      input.dragStartCorners,
      input.handle,
      input.dragStart,
      input.cursor,
      input.rasterBounds,
      input.modifiers.shift,
      input.dragStartTransform
    );
    if (warped.kind === "quad") {
      return makeSingleQuadTransform("mesh-warp", warped.quad);
    }
    return warped;
  }
};
