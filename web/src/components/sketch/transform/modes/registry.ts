/**
 * Single registry of `TransformModeHandler`s — keyed by `TransformMode`.
 *
 * Adding a new mode is a one-file change: drop a `*Mode` handler here and
 * the toolbar / gizmo / tool dispatch all pick it up automatically.
 */

import type { TransformMode } from "../../types";
import type { TransformModeHandler } from "./types";
import { ScaleMode } from "./scale";
import { DistortMode } from "./distort";
import { SkewMode } from "./skew";
import {
  PerspectiveMode,
  PerspectiveDistortMode
} from "./perspective";
import { WarpMode, MeshWarpMode } from "./warp";

export const TRANSFORM_MODES: Record<TransformMode, TransformModeHandler> = {
  scale: ScaleMode,
  distort: DistortMode,
  skew: SkewMode,
  perspective: PerspectiveMode,
  "perspective-distort": PerspectiveDistortMode,
  "mesh-warp": MeshWarpMode,
  warp: WarpMode
};

export function getTransformMode(id: TransformMode): TransformModeHandler {
  return TRANSFORM_MODES[id];
}

/** Modes the user can pick from the toolbar (mesh-warp is hidden today). */
export function getToolbarTransformModes(): readonly TransformModeHandler[] {
  return (Object.values(TRANSFORM_MODES) as TransformModeHandler[]).filter(
    (m) => m.visibleInToolbar
  );
}
