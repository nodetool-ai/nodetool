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
import { PerspectiveMode } from "./perspective";
import { MeshWarpMode } from "./warp";

/**
 * After Affinity-parity consolidation the user-facing modes are:
 *   - `scale` (Move/Scale; Ctrl+edge auto-promotes to skew)
 *   - `perspective` (Perspective)
 *   - `mesh-warp` (Mesh Warp)
 *   - `distort` (Deform)
 *
 * `skew` is kept in the registry because `resolveTransformGestureMode`
 * promotes Ctrl+edge scale gestures to it, but it is hidden from the
 * toolbar (`visibleInToolbar: false`).
 */
export const TRANSFORM_MODES: Record<TransformMode, TransformModeHandler> = {
  scale: ScaleMode,
  distort: DistortMode,
  skew: SkewMode,
  perspective: PerspectiveMode,
  "mesh-warp": MeshWarpMode
};

/**
 * Map legacy mode IDs persisted before the Affinity-parity consolidation
 * onto their current equivalents.
 */
const LEGACY_MODE_ALIASES: Readonly<Record<string, TransformMode>> = {
  warp: "distort",
  "perspective-distort": "perspective",
  "perspective-dual": "perspective"
};

export function getTransformMode(id: TransformMode | string): TransformModeHandler {
  const direct = (TRANSFORM_MODES as Record<string, TransformModeHandler>)[id];
  if (direct) {
    return direct;
  }
  const aliased = LEGACY_MODE_ALIASES[id];
  if (aliased) {
    return TRANSFORM_MODES[aliased];
  }
  // Unknown / corrupt persisted value — fall back to scale so the gizmo
  // renders instead of crashing the React tree.
  return TRANSFORM_MODES.scale;
}

/** Modes the user can pick from the toolbar (mesh-warp is hidden today). */
export function getToolbarTransformModes(): readonly TransformModeHandler[] {
  return (Object.values(TRANSFORM_MODES) as TransformModeHandler[]).filter(
    (m) => m.visibleInToolbar
  );
}
