/**
 * Pure data needed to render the transform gizmo as React/SVG. Produced by
 * `TransformTool.getGizmoSnapshot()` and consumed by `<TransformGizmo />`.
 *
 * The snapshot lives entirely in **document space** — zoom/pan/container size
 * are read separately by the React component from Zustand and applied at
 * render time. This keeps the snapshot stable across viewport changes and
 * lets `useSyncExternalStore` bail out on `===` when the underlying state
 * has not mutated.
 *
 * @module transform/gizmo/TransformGizmoSnapshot
 */

import type { LayerTransform, LayerContentBounds, Point } from "../../types";
import type { TransformHandle } from "../../tools/transform/handleGeometry";

export interface TransformGizmoSnapshot {
  /** Document-space transform to display (preview during drag, otherwise stored). */
  readonly transform: LayerTransform;
  /** Layer-local raster bounds the transform is anchored to. */
  readonly rasterBounds: LayerContentBounds;
  /** Custom pivot in document space, or `null` for "use box center". */
  readonly pivot: Point | null;
  /** Active or hovered handle to highlight. */
  readonly highlight: TransformHandle | null;
}
