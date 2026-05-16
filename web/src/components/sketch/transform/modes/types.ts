/**
 * Transform mode handler interface.
 *
 * Each `TransformMode` (the user's toolbar selection) is represented by a
 * single handler object that bundles together:
 *   - UI metadata (label, which handles to show, rotate/pivot affordances)
 *   - The drag math for corner/edge gestures in that mode
 *
 * Move and rotate gestures are universal across modes and are NOT routed
 * through mode handlers — see `TransformTool.computeStandardDrag`.
 *
 * @module transform/modes/types
 */

import type {
  Point,
  LayerTransform,
  LayerContentBounds,
  TransformMode
} from "../../types";
import type { TransformHandle } from "../../tools/transform/handleGeometry";

export interface TransformModifiers {
  ctrlOrMeta: boolean;
  shift: boolean;
  alt: boolean;
}

export interface ModeDragInput {
  /** Snapshot of the four corners at drag start (document space). */
  dragStartCorners: [Point, Point, Point, Point];
  /** The transform value at drag start. */
  dragStartTransform: LayerTransform;
  /** Pointer position at drag start (document space). */
  dragStart: Point;
  /** Current pointer position (document space). */
  cursor: Point;
  /** Document-space layer center at drag start (used by scale/rotate). */
  center: Point;
  /** Layer-local raster bounds. */
  rasterBounds: LayerContentBounds;
  /** Which handle is being dragged. */
  handle: TransformHandle;
  /** Modifier-key state for this drag frame. */
  modifiers: TransformModifiers;
  /** Original layer center when rotating around a custom pivot. */
  layerCenter?: Point;
}

export interface TransformModeHandler {
  /** Stable id matching `TransformMode`. */
  id: TransformMode;
  /** Display label for the toolbar button. */
  label: string;
  /** Optional tooltip describing the mode (toolbar hover). */
  tooltip?: string;
  /** Whether the toolbar should surface this mode as a user-pickable button. */
  visibleInToolbar: boolean;
  /** Which handles the gizmo paints (excluding move/pivot which are universal). */
  visibleHandles: ReadonlyArray<TransformHandle>;
  /** Whether the rotate ring + outside-box rotate margin is active. */
  supportsRotate: boolean;
  /** Whether the user can drag the pivot dot. */
  supportsPivot: boolean;
  /**
   * Whether dragging a corner/edge in this mode produces a quad-kind
   * transform. Informational; the actual draw/bake path switches on
   * `transform.kind`, not on the active mode.
   */
  rendersAsQuad: boolean;
  /**
   * Apply a corner / edge / scale-handle drag in this mode.
   * Move and rotate gestures are universal — handled outside the mode handler.
   */
  applyDrag(input: ModeDragInput): LayerTransform;
}
