/**
 * TransformTool – scale, rotate, translate the active layer with live preview.
 *
 * Handle layout:
 *   - 4 corner handles: proportional scale (drag to resize)
 *   - 4 edge midpoint handles: axis-constrained scale
 *   - rotation handle: above top-center, drag to rotate
 *   - center area: drag to translate
 *
 * The transform is "live" – it updates the LayerTransform in the store as
 * the user drags. Commit (Enter / button) or cancel (Escape / button) from
 * the top bar.
 *
 * Modifiers:
 *   - Shift: constrain proportions (scale) or snap angle (rotate)
 *   - Auto-select retargets the layer only on clicks outside the gizmo that are
 *     not in the outside-box rotate band — never while scaling, rotating, moving,
 *     or dragging the pivot.
 *   - Alt: scale from center (keep center fixed)
 *
 * The gizmo is drawn on a dedicated screen-resolution canvas (`gizmoCanvasRef`)
 * so it is not clipped by the document-stack overflow and appears crisp at any zoom.
 *
 * Preview lifecycle uses the shared `PreviewSession` contract so
 * compositing, gizmo drawing, transform UI, and top-bar numbers all
 * read one live preview source. See `previewSession.ts`.
 *
 * Transform-targeting flow:
 *   - An optional auto-select toggle (`TransformSettings.autoSelect`) targets the
 *     topmost layer at the click point only when the click is outside the gizmo
 *     and outside the rotate band — not during move/scale/rotate/pivot drags.
 *   - With layers-panel multi-select (2+ layers) or a selected/active **group**,
 *     targets expand to all eligible raster/mask descendants and share one union
 *     gizmo; a single document-space affine delta applies to every target layer.
 *     Advanced per-layer modes (distort/skew/perspective/warp) are excluded from
 *     multi-target sets.
 *   - Auto-pick under the pointer is disabled while multiple targets are active.
 *
 * State model:
 *   The tool's interaction state is a discriminated union (`TransformToolState`
 *   in `../transform/state.ts`): `idle`, `armed`, `draggingPivot`, `draggingHandle`.
 *   Each pointer event narrows on `state.kind` instead of consulting scattered
 *   booleans, eliminating the "active handle but no drag start" / "session
 *   active but no target" / "stale activeHandle blocking next drag" class of
 *   illegal-state bugs.
 *
 * Responsibilities are split across dedicated modules:
 *   - Gizmo paint/layout: `transform/transformGizmoPainter.ts`
 *   - Hover hit-test / cursor: `transform/transformHoverPolicy.ts`
 *   - Geometry computation: `transform/computeTransform.ts`
 *   - Shared primitives: `gizmo/gizmoPrimitives.ts`
 *   - Target set management: `transformTargetSet.ts`
 *
 * This file owns only interaction orchestration (pointer events, lifecycle,
 * undo/redo stacks, preview management).
 */

import type { ToolHandler, ToolContext, ToolPointerEvent, ToolDefinition } from "./types";
import type {
  Point,
  LayerTransform,
  LayerContentBounds,
  Layer,
  TransformMode
} from "../types";
import {
  IDENTITY_AFFINE,
  cloneTransform,
  isAffineTransform,
  isQuadTransform,
  layerAllowsTransformWhilePixelLocked,
  makeAffineTransform
} from "../types";
import AspectRatioIcon from "@mui/icons-material/AspectRatio";
import {
  computeTransformedCorners,
  computeTransformedExtents,
  computeTransformedCenter,
  getVisualBounds
} from "../transform/geometry/layerGeometry";
import {
  type TransformHandle,
  hitTestHandles,
  isInRotateZone,
  hitTestPivot,
  snapPivotToAnchor,
  computeMoveTransform,
  computeRotateTransform,
  resolveTransformGestureMode
} from "./transform";
import { getTransformMode } from "../transform/modes";
import type { TransformGizmoSnapshot } from "../transform/gizmo/TransformGizmoSnapshot";
import { createPreviewSession, type PreviewSession } from "./previewSession";
import {
  TransformTargetSet,
  pickTopmostTransformableLayer,
  countTransformTargetsHitAtDocPoint,
  resolveTransformTargetLayerIds,
  type TransformTargetEntry
} from "./transformTargetSet";
import {
  affineInvert,
  affineMultiply,
  layerTransformFromDocAffine,
  rasterSpaceToDocAffine,
  unionOfDocumentExtents
} from "./transform/multiLayerTransformMath";
import { useSketchStore } from "../state/useSketchStore";
import { cursorForHandle } from "./transform/cursorMapping";
import {
  IDLE,
  hasTargets,
  isDragging,
  isDraggingHandle,
  type AdjustmentStacks,
  type DragGestureSnapshot,
  type TransformTargets,
  type TransformToolState
} from "../transform/state";

// ─── Module-level helpers (pure) ──────────────────────────────────────────────

function getCurrentCorners(
  transform: LayerTransform,
  rasterBounds: LayerContentBounds
): [Point, Point, Point, Point] {
  return computeTransformedCorners(transform, rasterBounds);
}

/**
 * Effective pivot in document space: custom pivot when set, layer center
 * otherwise.
 */
function getEffectivePivot(
  transform: LayerTransform,
  rasterBounds: LayerContentBounds,
  customPivot: Point | null
): Point {
  return customPivot ?? computeTransformedCenter(transform, rasterBounds);
}

// ─── TransformTool class ──────────────────────────────────────────────────────

export { type TransformHandle } from "./transform/handleGeometry";

export class TransformTool implements ToolHandler {
  readonly toolId = "transform" as const;

  /** Shared preview session — single source of truth for preview state. */
  private readonly session: PreviewSession = createPreviewSession();
  /** Current transform target (separate from raw panel multi-select expansion). */
  private readonly targetSet = new TransformTargetSet();

  /** External-store subscribers (React `useSyncExternalStore` listeners). */
  private readonly gizmoListeners = new Set<() => void>();
  /**
   * Most recent snapshot. Cached so {@link getGizmoSnapshot} returns a
   * referentially-stable value across React renders that don't affect the
   * gizmo. Cleared by {@link notifyGizmoChange}, lazily rebuilt on read.
   */
  private cachedGizmoSnapshot: TransformGizmoSnapshot | null = null;
  /** Whether {@link cachedGizmoSnapshot} reflects current state. */
  private gizmoSnapshotValid = false;
  /**
   * Last seen `ToolContext` — captured by every entry point that calls
   * `notifyGizmoChange`. Required because `getGizmoSnapshot()` is invoked
   * from React with no `ctx` available; the snapshot needs `ctx.doc` to
   * resolve the live transform when the tool is armed but idle.
   */
  private lastCtx: ToolContext | null = null;
  /**
   * Optional override applied to the next snapshot build — used by `onUp`
   * so the gizmo can render at the freshly-committed transform before
   * `ctx.doc` updates on the next React render.
   */
  private pendingOverrideTransform: LayerTransform | null = null;

  /** Single explicit interaction state — replaces 14 scattered fields. */
  private state: TransformToolState = IDLE;

  /**
   * Visual hover state. Pure feedback, lives outside `state` because it
   * changes on every mouse move (including while `idle`/`armed`) and would
   * otherwise force a state transition for every pixel of cursor motion.
   */
  private hoveredHandle: TransformHandle | null = null;

  /**
   * In-transform undo/redo stacks. Lifecycle-scoped to "tool activation"
   * (cleared on activate / deactivate / sync-active-layer-while-idle),
   * not gesture-scoped: a user can `Cmd+Z` to undo a completed handle drag
   * while the transform tool is still armed on the layer.
   */
  private adjustments: AdjustmentStacks = { undo: [], redo: [] };

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  onActivate(ctx: ToolContext): void {
    this.session.clear(ctx);
    this.targetSet.clear();
    this.hoveredHandle = null;
    this.adjustments = { undo: [], redo: [] };
    this.state = this.resolveTargets(ctx, null);
    this.notifyGizmoChange(ctx);
  }

  syncActiveLayer(ctx: ToolContext): void {
    if (isDragging(this.state) || this.session.isActive()) {
      return;
    }
    this.hoveredHandle = null;
    this.adjustments = { undo: [], redo: [] };
    this.state = this.resolveTargets(ctx, null);
    this.notifyGizmoChange(ctx);
  }

  onDeactivate(ctx: ToolContext): void {
    this.session.clear(ctx);
    if (hasTargets(this.state)) {
      for (const id of this.state.targets.layerIds) {
        ctx.clearLayerTransformPreview?.(id);
      }
    }
    this.targetSet.clear();
    this.hoveredHandle = null;
    this.adjustments = { undo: [], redo: [] };
    this.state = IDLE;
    // Defensive: MoveTool / CropTool share the gizmo canvas via ctx.drawGizmo.
    // Clearing on deactivate keeps prior tools from leaving stale paint when
    // the user lands back on transform.
    ctx.clearGizmo();
    ctx.clearOverlay();
    ctx.drawSelectionOverlay();
    this.notifyGizmoChange(ctx);
  }

  onViewportChange(_ctx: ToolContext): void {
    // No-op: the React SVG component subscribes to zoom/pan directly via
    // Zustand and re-renders on viewport changes. The snapshot is in
    // document space and doesn't need viewport refresh.
  }

  /**
   * Cancel the in-flight gesture (Esc / generic tool-cancel path). Drops any
   * preview without committing and keeps the current target so the gizmo
   * stays put.
   */
  onCancel(ctx: ToolContext): void {
    if (this.session.isActive()) {
      this.session.cancel(ctx);
    }
    if (hasTargets(this.state)) {
      for (const id of this.state.targets.layerIds) {
        ctx.clearLayerTransformPreview?.(id);
      }
      this.state = { kind: "armed", targets: this.state.targets };
    }
    this.notifyGizmoChange(ctx);
  }

  // ── Pointer events ─────────────────────────────────────────────────────────

  onDown(ctx: ToolContext, event: ToolPointerEvent): boolean | void {
    const { doc } = ctx;
    // Keep targets aligned with panel selection + active layer when idle.
    // Without this, target bounds/transform can stay stale after leaving
    // multi-select.
    if (!isDragging(this.state) && !this.session.isActive()) {
      this.state = this.resolveTargets(ctx, getStatePivot(this.state));
    }
    if (!hasTargets(this.state)) {
      return false;
    }
    const targets = this.state.targets;

    for (const id of targets.layerIds) {
      const lyr = doc.layers.find((l) => l.id === id);
      if (!lyr || (lyr.locked && !layerAllowsTransformWhilePixelLocked(lyr))) {
        return false;
      }
    }

    const primaryLayer = doc.layers.find((l) => l.id === targets.layerIds[0])!;
    const pt = event.point;
    const isMulti = targets.layerIds.length > 1;
    const currentTransform = this.session.isActive()
      ? this.session.state.currentTransform
      : isMulti
        ? targets.originalTransform
        : primaryLayer.transform;

    // 1. Check edge/corner/rotation handles first (highest geometric priority)
    let handle = hitTestHandles(
      currentTransform,
      targets.rasterBounds,
      pt,
      ctx.zoom
    );

    // 2. Allow the pivot to be re-grabbed anywhere it is visible. When the
    //    pivot is outside the box, `hitTestHandles()` returns null, so the
    //    pivot must win before auto-pick / rotate-zone fallback. Quad-only
    //    transforms have no pivot — skip.
    if (
      (handle === "move" || handle === null) &&
      !isQuadTransform(currentTransform)
    ) {
      const pivotDoc = getEffectivePivot(
        currentTransform,
        targets.rasterBounds,
        targets.pivot
      );
      if (hitTestPivot(pivotDoc, pt, ctx.zoom)) {
        this.state = {
          kind: "draggingPivot",
          targets,
          dragStart: pt,
          dragStartTransform: cloneTransform(currentTransform)
        };
        return true;
      }
    }

    // 3. Outside-box rotate beats auto-select (same rotate cursor/handle UX).
    //    Misses both handles and the rotate margin → auto-select / deselect.
    if (!handle) {
      if (
        isInRotateZone(
          currentTransform,
          targets.rasterBounds,
          pt,
          ctx.zoom,
          this.getConfiguredTransformMode()
        )
      ) {
        handle = "rotate";
      } else {
        return this.handleEmptyClick(ctx, event);
      }
    }

    // 4. Click landed inside the current bounding box (handle === "move").
    //    Auto-retarget to a different layer that paints opaque pixels on top.
    if (handle === "move" && this.tryAutoRetargetOnMove(ctx, event)) {
      return false;
    }

    const needsCornerSnapshot =
      handle !== "move" && handle !== "rotate" && !isMulti;
    const dragStartCorners = needsCornerSnapshot
      ? getCurrentCorners(currentTransform, targets.rasterBounds)
      : null;
    const center = computeTransformedCenter(
      currentTransform,
      targets.rasterBounds
    );
    const pivotAtMoveStart =
      handle === "move" && targets.pivot !== null
        ? { ...targets.pivot }
        : null;

    let multi: DragGestureSnapshot["multi"] = null;
    if (isMulti) {
      const baselineDocMatrices = this.captureMultiGestureBaselines(
        ctx,
        targets.layerIds
      );
      const unionDocMatrixStart = rasterSpaceToDocAffine(
        currentTransform,
        targets.rasterBounds
      );
      if (unionDocMatrixStart) {
        multi = { baselineDocMatrices, unionDocMatrixStart };
      }
    }

    const gesture: DragGestureSnapshot = {
      handle,
      dragStart: pt,
      dragStartTransform: cloneTransform(currentTransform),
      dragStartCorners,
      center,
      pivotAtMoveStart,
      multi
    };

    this.state = { kind: "draggingHandle", targets, gesture };

    // Record the pre-drag transform for in-transform undo; clear redo stack.
    this.adjustments.undo.push(cloneTransform(currentTransform));
    this.adjustments.redo = [];

    const sessionLayerId = targets.layerIds[0]!;
    this.session.start(ctx, sessionLayerId, cloneTransform(currentTransform));
    return true;
  }

  onMove(ctx: ToolContext, event: ToolPointerEvent): void {
    const s = this.state;
    if (!isDragging(s)) {
      return;
    }
    const pt = event.point;

    // Pivot drag: reposition the pivot, don't transform the layer.
    if (s.kind === "draggingPivot") {
      const currentTransform = this.session.isActive()
        ? this.session.state.currentTransform
        : s.dragStartTransform;
      const newPivot = snapPivotToAnchor(
        pt,
        currentTransform,
        s.targets.rasterBounds,
        ctx.zoom
      );
      this.state = {
        kind: "draggingPivot",
        targets: { ...s.targets, pivot: newPivot },
        dragStart: s.dragStart,
        dragStartTransform: s.dragStartTransform
      };
      this.notifyGizmoChange(ctx);
      return;
    }

    // Handle drag.
    const { targets, gesture } = s;
    const primaryId = targets.layerIds[0];
    if (!primaryId || !ctx.doc.layers.some((l) => l.id === primaryId)) {
      return;
    }

    const shift = ctx.shiftHeldRef.current;
    const alt = ctx.altHeldRef.current;
    const ctrlOrMeta = Boolean(
      event.nativeEvent.ctrlKey || event.nativeEvent.metaKey
    );
    const gestureMode = resolveTransformGestureMode(
      this.getConfiguredTransformMode(),
      gesture.handle,
      { ctrlOrMeta, shift, alt }
    );
    const newTransform = this.computeGestureTransform(
      targets,
      gesture,
      pt,
      gestureMode,
      { shift, alt, ctrlOrMeta }
    );
    const isMulti = targets.layerIds.length > 1;
    if (isMulti) {
      this.session.update(ctx, newTransform, { skipCanvasPreview: true });
      this.applyMultiLayerPreviews(ctx, targets, gesture, newTransform);
    } else {
      this.session.update(ctx, newTransform);
    }

    // Track moving pivot with a `move` drag so it follows the layer.
    if (
      gesture.handle === "move" &&
      targets.pivot !== null &&
      gesture.pivotAtMoveStart !== null
    ) {
      const dx = pt.x - gesture.dragStart.x;
      const dy = pt.y - gesture.dragStart.y;
      this.state = {
        kind: "draggingHandle",
        targets: {
          ...targets,
          pivot: {
            x: gesture.pivotAtMoveStart.x + dx,
            y: gesture.pivotAtMoveStart.y + dy
          }
        },
        gesture
      };
    }

    this.notifyGizmoChange(ctx);
  }

  onUp(ctx: ToolContext): void {
    const s = this.state;
    if (!isDragging(s)) {
      return;
    }

    // Pivot drag ends without committing a transform — just refresh the
    // gizmo snapshot at the new pivot position.
    if (s.kind === "draggingPivot") {
      this.state = { kind: "armed", targets: s.targets };
      this.notifyGizmoChange(ctx);
      return;
    }

    const { targets } = s;
    const isMulti = targets.layerIds.length > 1;

    // Capture the final transform before commit clears the active flag so
    // the gizmo can draw at the correct position even though ctx.doc is stale.
    const committedTransform = this.session.isActive()
      ? cloneTransform(this.session.state.currentTransform)
      : null;

    if (isMulti && this.session.isActive()) {
      this.commitMultiLayerGesture(ctx, targets, s.gesture);
    } else {
      this.session.commit(ctx);
    }

    this.state = { kind: "armed", targets };

    for (const id of targets.layerIds) {
      ctx.onStrokeEnd(id, null, undefined, {
        syncDocumentFromCanvas: false
      });
    }
    // Render the gizmo at the freshly-committed transform — `ctx.doc` may
    // still be one React render behind the committed transform, so passing
    // an override prevents the snapshot from drifting to the old position.
    this.pendingOverrideTransform = committedTransform;
    this.notifyGizmoChange(ctx);
    this.pendingOverrideTransform = null;
    // Redraw the selection overlay so marching ants (if any) update to the
    // committed transform instead of staying at the pre-transform position.
    ctx.drawSelectionOverlay();
  }

  // ── Auto-select targeting ─────────────────────────────────────────────────

  /** Read the current `autoSelect` toggle from the tool settings store. */
  private isAutoSelectEnabled(): boolean {
    return (
      useSketchStore.getState().toolSettings?.transform?.autoSelect ?? true
    );
  }

  /**
   * Click missed every handle and the rotate band. If auto-select is on, try
   * to pick the topmost opaque layer; otherwise drop the current target so the
   * gizmo disappears (Affinity-style click-outside-to-deselect).
   */
  private handleEmptyClick(
    ctx: ToolContext,
    event: ToolPointerEvent
  ): boolean {
    if (this.isAutoSelectEnabled() && !ctx.selection) {
      const picked = peekAutoSelectPick(ctx, event.point);
      if (picked && this.tryAutoSelectPick(ctx, event, picked)) {
        return false;
      }
      if (!picked) {
        this.clearTransformTarget(ctx);
      }
    }
    if (ctx.selection) {
      ctx.onSelectionChange?.(null);
    }
    return false;
  }

  /**
   * Click landed inside the current bounding box. If a different layer's
   * opaque pixels are on top, retarget to that layer instead of dragging the
   * current one. Returns `true` when the click was consumed by a retarget.
   */
  private tryAutoRetargetOnMove(
    ctx: ToolContext,
    event: ToolPointerEvent
  ): boolean {
    if (!this.isAutoSelectEnabled() || ctx.selection) {
      return false;
    }
    if (!hasTargets(this.state)) {
      return false;
    }
    const targets = this.state.targets;
    const picked = peekAutoSelectPick(ctx, event.point);
    if (!picked) {
      return false;
    }
    const isCurrentTarget = targets.layerIds.includes(picked.id);
    const isMulti = targets.layerIds.length > 1;

    if (isMulti && isCurrentTarget) {
      // Multi-target: collapse to the clicked layer when exactly one selected
      // layer paints at the pointer.
      const contributorHits = countTransformTargetsHitAtDocPoint(
        ctx.doc.layers,
        ctx.layerCanvasesRef.current,
        targets.layerIds,
        event.point,
        ctx.getOrCreateLayerCanvas
      );
      if (contributorHits === 1) {
        return this.tryAutoSelectPick(ctx, event, picked);
      }
      return false;
    }

    if (!isCurrentTarget) {
      return this.tryAutoSelectPick(ctx, event, picked);
    }
    return false;
  }

  /**
   * Try to pick and target the topmost visible transformable layer at the
   * click point. Returns `true` if a layer was successfully picked and
   * targeted, `false` if no layer was found under the pointer.
   *
   * Shift+click currently follows the same single-target retargeting path as
   * plain click so preview, gizmo, and commit all stay aligned to one layer.
   */
  private tryAutoSelectPick(
    ctx: ToolContext,
    event: ToolPointerEvent,
    pickedOverride?: Layer | null
  ): boolean {
    if (!hasTargets(this.state)) {
      return false;
    }
    const primaryId = this.state.targets.layerIds[0];
    if (!primaryId) {
      return false;
    }
    const isMulti = this.state.targets.layerIds.length > 1;

    const picked = pickedOverride ?? peekAutoSelectPick(ctx, event.point);
    if (!picked) {
      return false;
    }

    // Single-target: only retarget when the topmost pixel belongs to another layer.
    // Multi-target (layers panel multi-select): any concrete hit collapses to that
    // layer so auto-select works while a union transform is armed.
    if (!isMulti && picked.id === primaryId) {
      return false;
    }

    this.hoveredHandle = null;
    ctx.onAutoPickLayer?.(picked.id);
    ctx.getOrCreateLayerCanvas(picked.id);
    const newTargets = this.makeSingleLayerTargets(ctx, picked);
    if (!newTargets) {
      return false;
    }
    this.state = { kind: "armed", targets: newTargets };
    this.notifyGizmoChange(ctx);
    return true;
  }

  isMultiTarget(): boolean {
    return hasTargets(this.state) && this.state.targets.layerIds.length > 1;
  }

  /**
   * Clear the current transform target locally and erase the gizmo.
   * Used by click-outside-to-deselect — keeps the layer panel selection
   * unchanged but removes the visible transform handles.
   */
  private clearTransformTarget(ctx: ToolContext): void {
    if (this.session.isActive()) {
      // Don't drop targets mid-gesture; previewSession owns the lifecycle.
      return;
    }
    this.targetSet.clear();
    this.hoveredHandle = null;
    this.state = IDLE;
    ctx.clearGizmo();
  }

  /** Layer IDs participating in the current union transform (stack order). */
  getMultiTargetLayerIds(): readonly string[] {
    return hasTargets(this.state) ? this.state.targets.layerIds : [];
  }

  /**
   * Reconcile targets against panel selection + active layer. Returns the
   * resulting state (armed or idle). Updates `targetSet` as a side effect.
   *
   * `preservePivot` keeps a custom pivot across reconciliations when the
   * caller knows the target set hasn't meaningfully changed (e.g. onDown).
   */
  private resolveTargets(
    ctx: ToolContext,
    preservePivot: Point | null
  ): TransformToolState {
    const store = useSketchStore.getState();
    const storeActiveId = store.document.activeLayerId;
    const docActiveId = ctx.doc.activeLayerId;
    const activeLayerIdForResolve =
      storeActiveId != null &&
      ctx.doc.layers.some((l) => l.id === storeActiveId)
        ? storeActiveId
        : docActiveId;
    const ids = resolveTransformTargetLayerIds(
      ctx.doc,
      store.selectedLayerIds,
      activeLayerIdForResolve
    );

    if (ids.length === 0) {
      this.targetSet.clear();
      return IDLE;
    }

    if (ids.length === 1) {
      const layer = ctx.doc.layers.find((l) => l.id === ids[0]);
      if (!layer) {
        this.targetSet.clear();
        return IDLE;
      }
      const targets = this.makeSingleLayerTargets(ctx, layer, preservePivot);
      return targets ? { kind: "armed", targets } : IDLE;
    }

    const entries: TransformTargetEntry[] = [];
    const extentRects: Array<ReturnType<typeof computeTransformedExtents>> = [];
    for (const id of ids) {
      const layer = ctx.doc.layers.find((l) => l.id === id);
      if (!layer) {
        continue;
      }
      const canvas = ctx.layerCanvasesRef.current.get(id);
      const rb = getVisualBounds(layer, canvas, ctx.doc.canvas);
      entries.push({ layerId: id, bounds: rb });
      extentRects.push(computeTransformedExtents(layer.transform, rb));
    }

    if (entries.length === 0) {
      this.targetSet.clear();
      return IDLE;
    }

    const union = unionOfDocumentExtents(extentRects);
    if (!union) {
      this.targetSet.clear();
      return IDLE;
    }

    this.targetSet.setTargets(entries);
    const targets: TransformTargets = {
      layerIds: ids,
      rasterBounds: { x: 0, y: 0, width: union.width, height: union.height },
      originalTransform: makeAffineTransform({
        x: union.x,
        y: union.y,
        scaleX: 1,
        scaleY: 1,
        rotation: 0
      }),
      pivot: preservePivot
    };
    return { kind: "armed", targets };
  }

  private makeSingleLayerTargets(
    ctx: ToolContext,
    layer: Layer,
    preservePivot: Point | null = null
  ): TransformTargets | null {
    const layerCanvas = ctx.layerCanvasesRef.current.get(layer.id);
    const rasterBounds = getVisualBounds(layer, layerCanvas, ctx.doc.canvas);
    this.targetSet.setSingle(layer.id, rasterBounds);
    return {
      layerIds: [layer.id],
      rasterBounds,
      originalTransform: cloneTransform(layer.transform),
      pivot: preservePivot
    };
  }

  private captureMultiGestureBaselines(
    ctx: ToolContext,
    layerIds: readonly string[]
  ): ReadonlyMap<string, NonNullable<ReturnType<typeof rasterSpaceToDocAffine>>> {
    const map = new Map<
      string,
      NonNullable<ReturnType<typeof rasterSpaceToDocAffine>>
    >();
    for (const id of layerIds) {
      const layer = ctx.doc.layers.find((l) => l.id === id);
      if (!layer) {
        continue;
      }
      const rb = getVisualBounds(
        layer,
        ctx.layerCanvasesRef.current.get(id),
        ctx.doc.canvas
      );
      const m = rasterSpaceToDocAffine(layer.transform, rb);
      if (m) {
        map.set(id, m);
      }
    }
    return map;
  }

  private applyMultiLayerPreviews(
    ctx: ToolContext,
    targets: TransformTargets,
    gesture: DragGestureSnapshot,
    unionTransform: LayerTransform
  ): void {
    const multi = gesture.multi;
    if (!multi) {
      return;
    }
    const M_live = rasterSpaceToDocAffine(unionTransform, targets.rasterBounds);
    const invStart = affineInvert(multi.unionDocMatrixStart);
    if (!M_live || !invStart) {
      return;
    }
    const D = affineMultiply(M_live, invStart);
    for (const id of targets.layerIds) {
      const Mi0 = multi.baselineDocMatrices.get(id);
      if (!Mi0) {
        continue;
      }
      const Mi1 = affineMultiply(D, Mi0);
      ctx.setLayerTransformPreview?.(id, layerTransformFromDocAffine(Mi1));
    }
  }

  private commitMultiLayerGesture(
    ctx: ToolContext,
    targets: TransformTargets,
    gesture: DragGestureSnapshot
  ): void {
    const unionFinal = this.session.state.currentTransform;
    const multi = gesture.multi;
    const M_end = rasterSpaceToDocAffine(unionFinal, targets.rasterBounds);
    const invStart = multi ? affineInvert(multi.unionDocMatrixStart) : null;
    if (!M_end || !invStart || !multi) {
      this.session.cancel(ctx);
      return;
    }
    const D = affineMultiply(M_end, invStart);
    for (const id of targets.layerIds) {
      const Mi0 = multi.baselineDocMatrices.get(id);
      if (!Mi0) {
        continue;
      }
      const Mi1 = affineMultiply(D, Mi0);
      ctx.onLayerTransformChange?.(id, layerTransformFromDocAffine(Mi1));
      ctx.clearLayerTransformPreview?.(id);
    }
    this.session.cancel(ctx);
  }

  /**
   * Transform driving the union gizmo (session preview, or synthetic union /
   * primary layer transform when idle/armed).
   */
  private resolveDisplayedUnionTransform(
    ctx: ToolContext
  ): LayerTransform | null {
    if (!hasTargets(this.state)) {
      return null;
    }
    if (this.session.isActive()) {
      return this.session.state.currentTransform;
    }
    const targets = this.state.targets;
    if (targets.layerIds.length > 1) {
      return targets.originalTransform;
    }
    const primary = ctx.doc.layers.find((l) => l.id === targets.layerIds[0]);
    return primary ? primary.transform : null;
  }

  private getConfiguredTransformMode(): TransformMode {
    return useSketchStore.getState().toolSettings?.transform?.mode ?? "scale";
  }

  // ── Public API (for settings panel commit/cancel/reset) ────────────────────

  /** Get the original transform captured when the tool was activated. */
  getOriginalTransform(): LayerTransform {
    if (hasTargets(this.state)) {
      return cloneTransform(this.state.targets.originalTransform);
    }
    return { ...IDENTITY_AFFINE };
  }

  /** Refresh the gizmo (e.g. after external transform change). */
  refreshOverlay(ctx: ToolContext): void {
    this.notifyGizmoChange(ctx);
  }

  /** Get the current single-target transform state (read-only). */
  getTargetSet(): TransformTargetSet {
    return this.targetSet;
  }

  // ── In-transform undo/redo ────────────────────────────────────────────────

  /** Whether there are undoable handle adjustments in the current transform session. */
  hasUndoableAdjustments(): boolean {
    return this.adjustments.undo.length > 0;
  }

  /** Whether there are redoable handle adjustments in the current transform session. */
  hasRedoableAdjustments(): boolean {
    return this.adjustments.redo.length > 0;
  }

  /**
   * Undo the last handle adjustment within the current transform session.
   * Returns the transform to apply, or null if the undo stack is empty.
   * The current transform is pushed onto the redo stack.
   */
  undoLastAdjustment(currentTransform: LayerTransform): LayerTransform | null {
    if (this.adjustments.undo.length === 0) {
      return null;
    }
    this.adjustments.redo.push(cloneTransform(currentTransform));
    const previous = this.adjustments.undo.pop()!;
    return cloneTransform(previous);
  }

  /**
   * Redo the last undone handle adjustment within the current transform session.
   * Returns the transform to apply, or null if the redo stack is empty.
   * The current transform is pushed onto the undo stack.
   */
  redoLastAdjustment(currentTransform: LayerTransform): LayerTransform | null {
    if (this.adjustments.redo.length === 0) {
      return null;
    }
    this.adjustments.undo.push(cloneTransform(currentTransform));
    const next = this.adjustments.redo.pop()!;
    return cloneTransform(next);
  }

  /**
   * Test whether a document-space point falls inside the transform bounding box.
   * Used by the pointer handler to decide whether to show the transform context menu.
   */
  isPointInsideBoundingBox(ctx: ToolContext, docPoint: Point): boolean {
    const transform = this.resolveDisplayedUnionTransform(ctx);
    if (!transform || !hasTargets(this.state)) {
      return false;
    }
    const handle = hitTestHandles(
      transform,
      this.state.targets.rasterBounds,
      docPoint,
      ctx.zoom
    );
    // hitTestHandles returns "move" when inside the bounding box, or a named
    // handle when on a handle. The rotate handle lives *outside* the box, so
    // a hit on it is not "inside" — without this exclusion right-clicking the
    // outside-box rotate ring would open the transform context menu.
    return handle !== null && handle !== "rotate";
  }

  /** Get the current live transform (for external undo/redo consumers). */
  getLiveTransform(): LayerTransform | null {
    if (this.session.isActive()) {
      return cloneTransform(this.session.state.currentTransform);
    }
    if (!hasTargets(this.state)) {
      return null;
    }
    const targets = this.state.targets;
    if (targets.layerIds.length > 1) {
      return cloneTransform(targets.originalTransform);
    }
    const doc = useSketchStore.getState().document;
    const layer = doc.layers.find((l) => l.id === targets.layerIds[0]);
    return layer ? cloneTransform(layer.transform) : null;
  }

  /** Get the current preview session (for external consumers). */
  getPreviewSession(): PreviewSession {
    return this.session;
  }

  /**
   * Hit-test handles for cursor feedback during hover (called from pointer handler).
   * Returns the CSS cursor string, or null if no handle is under the pointer.
   */
  getHoverCursor(ctx: ToolContext, docPoint: Point): string | null {
    const transform = this.resolveDisplayedUnionTransform(ctx);
    if (!transform || !hasTargets(this.state)) {
      return null;
    }
    const rasterBounds = this.state.targets.rasterBounds;
    const handle = hitTestHandles(transform, rasterBounds, docPoint, ctx.zoom);
    // Let the visible pivot win over move-zone and rotate-zone hover, while
    // still preserving direct hits on concrete gizmo handles. Quad-only
    // transforms have no pivot.
    if (
      (handle === "move" || handle === null) &&
      !isQuadTransform(transform)
    ) {
      const pivotDoc = getEffectivePivot(
        transform,
        rasterBounds,
        this.state.targets.pivot
      );
      if (hitTestPivot(pivotDoc, docPoint, ctx.zoom)) {
        this.hoveredHandle = "pivot";
        return "crosshair";
      }
    }
    const rot = isAffineTransform(transform) ? transform.rotation : 0;
    if (handle) {
      this.hoveredHandle = handle;
      return cursorForHandle(handle, rot);
    }
    if (
      isInRotateZone(
        transform,
        rasterBounds,
        docPoint,
        ctx.zoom,
        this.getConfiguredTransformMode()
      )
    ) {
      this.hoveredHandle = "rotate";
      return cursorForHandle("rotate", rot);
    }
    this.hoveredHandle = null;
    return null;
  }

  /**
   * Update cursor based on which handle is under the pointer during hover.
   * Encapsulates transform-specific hover policy so usePointerHandlers can
   * dispatch generically via `handler.onHoverMove`.
   */
  onHoverMove(ctx: ToolContext, event: ToolPointerEvent): void {
    const cursor = this.getHoverCursor(ctx, event.point);
    ctx.setTransformHoverCursor?.(cursor);
  }

  // ── Gesture dispatch ──────────────────────────────────────────────────────

  /**
   * Compute the next layer transform for the active handle.
   *
   * - `move` and `rotate` are universal across modes and route directly to
   *   `computeMoveTransform` / `computeRotateTransform`.
   * - Every other handle delegates to the active `TransformModeHandler` via
   *   the registry. Modifier-driven mode promotion (scale + ctrl → skew,
   *   etc.) is resolved by `resolveTransformGestureMode` before lookup.
   */
  private computeGestureTransform(
    targets: TransformTargets,
    gesture: DragGestureSnapshot,
    pt: Point,
    gestureMode: TransformMode,
    modifiers: { shift: boolean; alt: boolean; ctrlOrMeta: boolean }
  ): LayerTransform {
    const { handle, dragStartTransform, dragStart, dragStartCorners, center } =
      gesture;

    if (handle === "move") {
      return computeMoveTransform(dragStartTransform, dragStart, pt);
    }
    if (handle === "rotate") {
      const pivot = getEffectivePivot(
        dragStartTransform,
        targets.rasterBounds,
        targets.pivot
      );
      const layerCenter = targets.pivot ? center : undefined;
      return computeRotateTransform(
        dragStartTransform,
        dragStart,
        pt,
        pivot,
        modifiers.shift,
        layerCenter
      );
    }

    const handler = getTransformMode(gestureMode);
    const cornersRO =
      dragStartCorners ??
      getCurrentCorners(dragStartTransform, targets.rasterBounds);
    const corners: [Point, Point, Point, Point] = [
      cornersRO[0],
      cornersRO[1],
      cornersRO[2],
      cornersRO[3]
    ];
    return handler.applyDrag({
      dragStartCorners: corners,
      dragStartTransform,
      dragStart,
      cursor: pt,
      center,
      rasterBounds: targets.rasterBounds,
      handle,
      modifiers
    });
  }

  // ── Pivot helpers ──────────────────────────────────────────────────────────

  /** Get the current pivot point (for external consumers / UI). */
  getPivotPoint(): Point | null {
    if (!hasTargets(this.state)) {
      return null;
    }
    const pivot = this.state.targets.pivot;
    return pivot ? { ...pivot } : null;
  }

  /** Reset the pivot to the layer center (null = default). */
  resetPivot(): void {
    if (!hasTargets(this.state)) {
      return;
    }
    const targets: TransformTargets = { ...this.state.targets, pivot: null };
    switch (this.state.kind) {
      case "armed":
        this.state = { kind: "armed", targets };
        return;
      case "draggingPivot":
        this.state = { ...this.state, targets };
        return;
      case "draggingHandle":
        this.state = { ...this.state, targets };
        return;
    }
  }

  // ── React/SVG snapshot interface ─────────────────────────────────────────

  /**
   * Subscribe to gizmo state changes. Used by the React `<TransformGizmo />`
   * component via `useSyncExternalStore`. Returns an unsubscribe function.
   */
  subscribeGizmo = (listener: () => void): (() => void) => {
    this.gizmoListeners.add(listener);
    return () => {
      this.gizmoListeners.delete(listener);
    };
  };

  /**
   * Get the current gizmo snapshot. Cached so successive calls without an
   * intervening {@link notifyGizmoChange} return the same reference —
   * `useSyncExternalStore` relies on `===` to bail out cleanly.
   */
  getGizmoSnapshot = (): TransformGizmoSnapshot | null => {
    if (!this.gizmoSnapshotValid) {
      this.cachedGizmoSnapshot = this.buildGizmoSnapshot();
      this.gizmoSnapshotValid = true;
    }
    return this.cachedGizmoSnapshot;
  };

  /**
   * Invalidate the cached snapshot, reconcile targets from the latest
   * `ctx.doc`, and notify all subscribers. Called everywhere the previous
   * imperative implementation called `drawGizmo`.
   */
  private notifyGizmoChange(ctx: ToolContext): void {
    this.lastCtx = ctx;
    // Reconcile targets against the latest doc state. Skip mid-gesture or
    // when an override transform is pending (post-commit): in those cases
    // `ctx.doc` may be one React render behind and re-resolving would drift
    // the displayed transform.
    if (
      this.pendingOverrideTransform === null &&
      !isDragging(this.state) &&
      !this.session.isActive() &&
      hasTargets(this.state)
    ) {
      this.state = this.resolveTargets(ctx, getStatePivot(this.state));
    }
    this.gizmoSnapshotValid = false;
    this.cachedGizmoSnapshot = null;
    for (const listener of this.gizmoListeners) {
      listener();
    }
  }

  private buildGizmoSnapshot(): TransformGizmoSnapshot | null {
    const ctx = this.lastCtx;
    if (!ctx || !hasTargets(this.state)) {
      return null;
    }
    const targets = this.state.targets;
    const transform =
      this.pendingOverrideTransform ?? this.resolveDisplayedUnionTransform(ctx);
    if (!transform) {
      return null;
    }
    const activeHandle = stateActiveHandle(this.state);
    const highlight = activeHandle ?? this.hoveredHandle;
    const snapshot: TransformGizmoSnapshot = {
      transform,
      rasterBounds: targets.rasterBounds,
      pivot: targets.pivot,
      highlight
    };
    return snapshot;
  }
}

// ─── State accessors ──────────────────────────────────────────────────────────

function getStatePivot(s: TransformToolState): Point | null {
  return hasTargets(s) ? s.targets.pivot : null;
}

function stateActiveHandle(s: TransformToolState): TransformHandle | null {
  if (isDraggingHandle(s)) {
    return s.gesture.handle;
  }
  if (s.kind === "draggingPivot") {
    return "pivot";
  }
  return null;
}

function peekAutoSelectPick(ctx: ToolContext, docPoint: Point): Layer | null {
  const { isolatedLayerId } = useSketchStore.getState();
  return pickTopmostTransformableLayer(
    ctx.doc.layers,
    ctx.layerCanvasesRef.current,
    docPoint,
    isolatedLayerId,
    ctx.getOrCreateLayerCanvas
  );
}

export const definition: ToolDefinition = {
  tool: "transform",
  label: "Transform",
  Icon: AspectRatioIcon,
  group: "painting"
};
