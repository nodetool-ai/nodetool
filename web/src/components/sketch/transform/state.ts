/**
 * TransformTool state machine — explicit discriminated union over the four
 * meaningful states of the transform interaction, replacing the previous
 * scattered booleans and nullable fields.
 *
 * States:
 *   - `idle`           — no target; gizmo hidden.
 *   - `armed`          — has target(s); gizmo painted; no gesture in flight.
 *   - `draggingPivot`  — pointer is dragging the pivot crosshair.
 *   - `draggingHandle` — pointer is dragging a corner/edge/scale/rotate/move
 *                        handle and a transform is being computed.
 *
 * Non-state collaborators (`PreviewSession`, `GizmoRedrawScheduler`,
 * `TransformTargetSet`) stay as separate fields on the tool. Hover (pure
 * visual feedback) stays as a separate field too, because it changes on
 * mouse motion even while `idle`/`armed` and would otherwise force a
 * state transition on every move event.
 *
 * Mid-transform adjustment undo/redo stacks (`AdjustmentStacks`) live for
 * the duration of the tool activation, not a single press-drag-release, so
 * they remain as a separate field on the tool. The interface is exported
 * here for type-locality.
 */

import type {
  LayerTransform,
  LayerContentBounds,
  AffineMatrix,
  Point
} from "../types";
import type { TransformHandle } from "../tools/transform/handleGeometry";

// ─── Targets ──────────────────────────────────────────────────────────────────

/**
 * Which layers the tool is currently armed on, plus the geometry snapshot
 * captured when arming. A custom pivot is part of the *armed target* (it
 * persists across gestures) rather than part of a gesture snapshot.
 */
export interface TransformTargets {
  /** 1 or more layer IDs in stack order. The first is the "primary". */
  readonly layerIds: readonly string[];
  /**
   * Tight content bounds (single) or union extents (multi), in raster space.
   * For the multi-target case this is `{ x:0, y:0, width, height }` because
   * the synthetic union transform places the origin at the union top-left.
   */
  readonly rasterBounds: LayerContentBounds;
  /** Transform captured when this target became active (used by cancel + undo). */
  readonly originalTransform: LayerTransform;
  /** Custom pivot in document space, or `null` for "use layer center". */
  readonly pivot: Point | null;
}

// ─── Gesture snapshots ────────────────────────────────────────────────────────

/** Captured baselines for projecting a union-gizmo gesture onto each layer. */
export interface MultiGestureBaselines {
  readonly baselineDocMatrices: ReadonlyMap<string, AffineMatrix>;
  readonly unionDocMatrixStart: AffineMatrix;
}

/** State carried by a corner/edge/scale/rotate/move drag (not pivot). */
export interface DragGestureSnapshot {
  /** Handle being dragged. Never `"pivot"`. */
  readonly handle: TransformHandle;
  /** Document-space pointer position at drag start. */
  readonly dragStart: Point;
  /** Transform captured at drag start (for relative computation). */
  readonly dragStartTransform: LayerTransform;
  /** Corner snapshot used by skew/distort/perspective/warp; null when not needed. */
  readonly dragStartCorners: readonly [Point, Point, Point, Point] | null;
  /** Document-space layer center at drag start (for scale/rotate). */
  readonly center: Point;
  /** Pivot position at drag start, when dragging `"move"` with a custom pivot. */
  readonly pivotAtMoveStart: Point | null;
  /** Per-layer baselines if this is a multi-layer gesture. */
  readonly multi: MultiGestureBaselines | null;
}

// ─── Adjustment undo/redo stacks ──────────────────────────────────────────────

/**
 * In-transform undo/redo stacks. Lifecycle-scoped to "tool is activated"
 * (cleared on activate/deactivate/syncActiveLayer), not gesture-scoped:
 * users can undo a completed handle drag while the transform tool is still
 * armed on the same layer.
 */
export interface AdjustmentStacks {
  undo: LayerTransform[];
  redo: LayerTransform[];
}

// ─── State union ──────────────────────────────────────────────────────────────

export type TransformToolState =
  | { readonly kind: "idle" }
  | { readonly kind: "armed"; readonly targets: TransformTargets }
  | {
      readonly kind: "draggingPivot";
      readonly targets: TransformTargets;
      readonly dragStart: Point;
      readonly dragStartTransform: LayerTransform;
    }
  | {
      readonly kind: "draggingHandle";
      readonly targets: TransformTargets;
      readonly gesture: DragGestureSnapshot;
    };

export const IDLE: TransformToolState = { kind: "idle" };

// ─── Type guards ──────────────────────────────────────────────────────────────

export function isIdle(s: TransformToolState): s is { kind: "idle" } {
  return s.kind === "idle";
}

export function hasTargets(
  s: TransformToolState
): s is Exclude<TransformToolState, { kind: "idle" }> {
  return s.kind !== "idle";
}

export function isDragging(
  s: TransformToolState
): s is Extract<
  TransformToolState,
  { kind: "draggingPivot" | "draggingHandle" }
> {
  return s.kind === "draggingPivot" || s.kind === "draggingHandle";
}

export function isDraggingHandle(
  s: TransformToolState
): s is Extract<TransformToolState, { kind: "draggingHandle" }> {
  return s.kind === "draggingHandle";
}

