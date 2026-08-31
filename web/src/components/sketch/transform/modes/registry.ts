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
 * Toolbar modes: `scale` (Move/Scale; Ctrl+edge auto-promotes to skew),
 * `perspective`, and `distort` (Deform).
 *
 * `skew` is kept in the registry because `resolveTransformGestureMode`
 * promotes Ctrl+edge scale gestures to it, and `mesh-warp` because
 * documents saved with that tag still have to render. Neither is
 * user-pickable (`visibleInToolbar: false`).
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
const LEGACY_MODE_ALIASES: Readonly<Partial<Record<string, TransformMode>>> = {
  warp: "distort",
  "perspective-distort": "perspective",
  "perspective-dual": "perspective"
};

export function getTransformMode(id: TransformMode | string): TransformModeHandler {
  // Partial: `id` can be any string (including a stale persisted one), so the
  // lookup really can miss — the fallbacks below depend on it.
  const byId: Readonly<Partial<Record<string, TransformModeHandler>>> =
    TRANSFORM_MODES;
  const direct = byId[id];
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

/** Modes the user can pick from the toolbar (skew and mesh-warp are not). */
export function getToolbarTransformModes(): readonly TransformModeHandler[] {
  return Object.values(TRANSFORM_MODES).filter((m) => m.visibleInToolbar);
}
