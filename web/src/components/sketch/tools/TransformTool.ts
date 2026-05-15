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
  TransformMode,
  AffineMatrix
} from "../types";
import { layerAllowsTransformWhilePixelLocked, composeAffineMatrix } from "../types";
import AspectRatioIcon from "@mui/icons-material/AspectRatio";
import {
  getTransformedCenter,
  getTransformedCorners,
  getTransformedExtents,
  resolveGizmoBounds
} from "../painting/resolvedLayerGeometry";
import {
  type TransformHandle,
  type CornerHandle,
  type EdgeHandle,
  isCornerHandle,
  isEdgeHandle,
  isQuadOnlyTransform,
  hitTestHandles,
  isInRotateZone,
  hitTestPivot,
  snapPivotToAnchor,
  computeTransformForHandle,
  computeDistortTransform,
  computeSkewTransform,
  computePerspectiveTransform,
  computeWarpTransform,
  resolveTransformGestureMode
} from "./transform";
import {
  paintTransformGizmo,
  GizmoRedrawScheduler
} from "./transform/transformGizmoPainter";
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

// ─── TransformTool class ──────────────────────────────────────────────────────

export { type TransformHandle } from "./transform/handleGeometry";

/**
 * Build a sensible initial second quad for the dual-perspective mode.
 * The new quad shares the primary's right edge as its left "fold" edge and
 * extends `width` document-space units to the right with the same height.
 */
function buildSeedSecondaryQuad(
  primary: NonNullable<LayerTransform["quad"]>,
  width: number
): NonNullable<LayerTransform["quad"]> {
  const tr = primary[1];
  const br = primary[2];
  // Edge vector along the fold (top-right → bottom-right of the primary).
  const foldDx = br.x - tr.x;
  const foldDy = br.y - tr.y;
  // Perpendicular pointing "outward" to the right of the fold.
  const perpX = foldDy;
  const perpY = -foldDx;
  const length = Math.hypot(perpX, perpY) || 1;
  const ux = (perpX / length) * width;
  const uy = (perpY / length) * width;
  return [
    { x: tr.x, y: tr.y },
    { x: tr.x + ux, y: tr.y + uy },
    { x: br.x + ux, y: br.y + uy },
    { x: br.x, y: br.y }
  ];
}

export class TransformTool implements ToolHandler {
  readonly toolId = "transform" as const;

  /** Shared preview session — single source of truth for preview state. */
  private readonly session: PreviewSession = createPreviewSession();
  /** Transform when the tool was activated (used by cancel). */
  private originalTransform: LayerTransform = { x: 0, y: 0 };
  /** Raster bounds when the tool was activated (for scale computation). */
  private rasterBounds: LayerContentBounds = { x: 0, y: 0, width: 0, height: 0 };
  /** Transform at the start of the current drag. */
  private dragStartTransform: LayerTransform = { x: 0, y: 0 };
  /** Which handle is being dragged. */
  private activeHandle: TransformHandle | null = null;
  /** Pointer position at drag start (canvas space). */
  private dragStart: Point | null = null;
  /** Center of the layer content (document space) – computed at drag start. */
  private center: Point = { x: 0, y: 0 };
  /** Whether a transform gesture has been started. */
  private gestureActive = false;
  /** Currently hovered handle (for cursor feedback). */
  private hoveredHandle: TransformHandle | null = null;
  /** Corner snapshot used for skew/distort gestures. */
  private dragStartCorners: [Point, Point, Point, Point] | null = null;
  /** Batched gizmo redraw scheduler. */
  private gizmoScheduler = new GizmoRedrawScheduler();

  // ── Pivot state ───────────────────────────────────────────────────────────
  /**
   * Custom pivot position in document space. `null` means "use layer center"
   * (the default). Set by dragging the pivot crosshair on the gizmo.
   * Reset when the tool is activated/deactivated.
   */
  private pivotPoint: Point | null = null;
  /** Pivot snapshot at pointer-down when dragging `move` with a custom pivot. */
  private pivotPointAtMoveStart: Point | null = null;

  // ── Transform target set ──────────────────────────────────────────────────
  /** Current transform target (separate from raw panel multi-select expansion). */
  private readonly targetSet = new TransformTargetSet();

  /** Expanded target layers (union transform); stack order. */
  private multiTargetLayerIds: string[] = [];

  /** Per-layer doc affine at pointer-down (multi-target gestures). */
  private multiGestureBaselineDocMatrices: Map<string, AffineMatrix> | null = null;

  /** Union doc affine at pointer-down (multi-target gestures). */
  private multiGestureUnionDocMatrixStart: AffineMatrix | null = null;

  // ── In-transform undo/redo stacks ─────────────────────────────────────────
  /** Stack of transforms recorded before each handle adjustment (for in-transform undo). */
  private adjustmentUndoStack: LayerTransform[] = [];
  /** Stack of transforms recorded when undoing an adjustment (for in-transform redo). */
  private adjustmentRedoStack: LayerTransform[] = [];

  // ── State reset helpers ───────────────────────────────────────────────────

  /** Reset transient gesture state (handles, drag corners, hover). */
  private resetGestureState(): void {
    this.activeHandle = null;
    this.hoveredHandle = null;
    this.dragStart = null;
    this.dragStartCorners = null;
    this.gestureActive = false;
  }

  private resetPivotState(): void {
    this.pivotPoint = null;
    this.pivotPointAtMoveStart = null;
  }

  private resetMultiGestureState(): void {
    this.multiGestureBaselineDocMatrices = null;
    this.multiGestureUnionDocMatrixStart = null;
  }

  private resetAdjustmentStacks(): void {
    this.adjustmentUndoStack = [];
    this.adjustmentRedoStack = [];
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  onActivate(ctx: ToolContext): void {
    // Clear any stale session from a previous activation (e.g. re-activation
    // without explicit deactivation, or singleton reuse across tests).
    this.session.clear(ctx);
    this.targetSet.clear();
    this.resetGestureState();
    this.resetPivotState();
    this.resetMultiGestureState();
    this.resetAdjustmentStacks();
    this.syncTransformTargets(ctx);
    // useOverlayRenderer no longer wipes the gizmo for the transform tool, so
    // the synchronous paint here is enough — no need to defer to rAF.
    this.drawGizmo(ctx);
  }

  syncActiveLayer(ctx: ToolContext): void {
    if (this.gestureActive || this.session.isActive()) {
      return;
    }
    this.resetGestureState();
    this.resetPivotState();
    this.resetAdjustmentStacks();
    this.syncTransformTargets(ctx);
    this.drawGizmo(ctx);
  }

  onDeactivate(ctx: ToolContext): void {
    this.resetGestureState();
    this.resetPivotState();
    this.resetMultiGestureState();
    this.resetAdjustmentStacks();
    this.session.clear(ctx);
    for (const id of this.multiTargetLayerIds) {
      ctx.clearLayerTransformPreview?.(id);
    }
    this.multiTargetLayerIds = [];
    this.targetSet.clear();
    ctx.clearGizmo();
    ctx.clearOverlay();
    ctx.drawSelectionOverlay();
  }

  onViewportChange(ctx: ToolContext): void {
    // Redraw gizmo when zoom/pan changes so it stays aligned with the layer.
    this.drawGizmo(ctx);
  }

  /**
   * Cancel the in-flight gesture (Esc / generic tool-cancel path). Drops any
   * preview without committing and resets transient state, but keeps the
   * current target so the gizmo stays put.
   */
  onCancel(ctx: ToolContext): void {
    this.gizmoScheduler.cancelPending();
    if (this.session.isActive()) {
      this.session.cancel(ctx);
    }
    for (const id of this.multiTargetLayerIds) {
      ctx.clearLayerTransformPreview?.(id);
    }
    this.resetGestureState();
    this.resetMultiGestureState();
    this.pivotPointAtMoveStart = null;
    this.drawGizmo(ctx);
  }

  // ── Pointer events ─────────────────────────────────────────────────────────

  onDown(ctx: ToolContext, event: ToolPointerEvent): boolean | void {
    const { doc } = ctx;
    // Keep targets aligned with panel selection + active layer (multi union vs single).
    // Without this, rasterBounds/originalTransform can stay stale after leaving multi-select.
    if (!this.gestureActive && !this.session.isActive()) {
      this.syncTransformTargets(ctx);
    }
    if (this.multiTargetLayerIds.length === 0) {
      return false;
    }
    for (const id of this.multiTargetLayerIds) {
      const lyr = doc.layers.find((l) => l.id === id);
      if (!lyr || (lyr.locked && !layerAllowsTransformWhilePixelLocked(lyr))) {
        return false;
      }
    }

    const primaryLayer = doc.layers.find(
      (l) => l.id === this.multiTargetLayerIds[0]
    )!;
    const pt = event.point;
    const currentTransform = this.session.isActive()
      ? this.session.state.currentTransform
      : this.isMultiTarget()
        ? this.originalTransform
        : primaryLayer.transform;

    // 1. Check edge/corner/rotation handles first (highest geometric priority)
    let handle = hitTestHandles(
      currentTransform,
      this.rasterBounds,
      pt,
      ctx.zoom
    );

    // 2. Allow the pivot to be re-grabbed anywhere it is visible. When the
    //    pivot is outside the box, `hitTestHandles()` returns null, so the
    //    pivot must win before auto-pick / rotate-zone fallback. Quad-only
    //    transforms have no pivot — skip.
    if (
      (handle === "move" || handle === null) &&
      !isQuadOnlyTransform(currentTransform)
    ) {
      const pivotDoc = this.getEffectivePivot(currentTransform);
      if (hitTestPivot(pivotDoc, pt, ctx.zoom)) {
        this.pivotPointAtMoveStart = null;
        this.activeHandle = "pivot";
        this.dragStart = pt;
        this.dragStartTransform = { ...currentTransform };
        return true;
      }
    }

    // 3. Outside-box rotate beats auto-select (same rotate cursor/handle UX).
    //    Misses both handles and the rotate margin → auto-select / deselect.
    if (!handle) {
      if (isInRotateZone(currentTransform, this.rasterBounds, pt, ctx.zoom)) {
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

    this.activeHandle = handle;
    this.pivotPointAtMoveStart =
      handle === "move" && this.pivotPoint !== null
        ? { ...this.pivotPoint }
        : null;
    this.dragStart = pt;
    this.dragStartTransform = { ...currentTransform };
    const needsCornerSnapshot =
      handle !== "move" && handle !== "rotate" && !this.isMultiTarget();
    this.dragStartCorners = needsCornerSnapshot
      ? this.getCurrentCorners(currentTransform)
      : null;
    this.center = getTransformedCenter(currentTransform, this.rasterBounds);
    this.gestureActive = true;
    // Record the pre-drag transform for in-transform undo; clear redo stack.
    this.adjustmentUndoStack.push({ ...currentTransform });
    this.adjustmentRedoStack = [];

    this.multiGestureBaselineDocMatrices = null;
    this.multiGestureUnionDocMatrixStart = null;
    if (this.isMultiTarget()) {
      this.captureMultiGestureBaselines(ctx);
      this.multiGestureUnionDocMatrixStart = rasterSpaceToDocAffine(
        this.dragStartTransform,
        this.rasterBounds
      );
    }

    const sessionLayerId = this.multiTargetLayerIds[0]!;
    // Start the shared preview session for compositing + UI.
    this.session.start(ctx, sessionLayerId, { ...currentTransform });
    return true;
  }

  onMove(ctx: ToolContext, event: ToolPointerEvent): void {
    if (!this.dragStart || !this.activeHandle) {
      return;
    }
    const pt = event.point;

    // Pivot drag: reposition the pivot, don't transform the layer.
    if (this.activeHandle === "pivot") {
      const currentTransform = this.session.isActive()
        ? this.session.state.currentTransform
        : this.dragStartTransform;
      this.pivotPoint = snapPivotToAnchor(
        pt,
        currentTransform,
        this.rasterBounds,
        ctx.zoom
      );
      this.gizmoScheduler.scheduleRedraw(() => this.drawGizmo(ctx));
      return;
    }

    const primaryId = this.multiTargetLayerIds[0];
    if (
      !primaryId ||
      !ctx.doc.layers.some((l) => l.id === primaryId)
    ) {
      return;
    }

    const shift = ctx.shiftHeldRef.current;
    const alt = ctx.altHeldRef.current;
    const ctrlOrMeta = Boolean(
      event.nativeEvent.ctrlKey || event.nativeEvent.metaKey
    );
    const gestureMode = resolveTransformGestureMode(
      this.getConfiguredTransformMode(),
      this.activeHandle,
      { ctrlOrMeta, shift, alt }
    );
    const newTransform = this.computeGestureTransform(pt, gestureMode, {
      shift,
      alt,
      ctrlOrMeta
    });
    if (this.isMultiTarget()) {
      this.session.update(ctx, newTransform, { skipCanvasPreview: true });
      this.applyMultiLayerPreviews(ctx, newTransform);
    } else {
      this.session.update(ctx, newTransform);
    }

    if (
      this.activeHandle === "move" &&
      this.pivotPoint !== null &&
      this.pivotPointAtMoveStart !== null &&
      this.dragStart
    ) {
      const dx = pt.x - this.dragStart.x;
      const dy = pt.y - this.dragStart.y;
      this.pivotPoint = {
        x: this.pivotPointAtMoveStart.x + dx,
        y: this.pivotPointAtMoveStart.y + dy
      };
    }

    // Batch gizmo redraws with rAF to avoid redundant per-event paints
    this.gizmoScheduler.scheduleRedraw(() => this.drawGizmo(ctx));
  }

  onUp(ctx: ToolContext): void {
    // Invalidate any batched gizmo draw from the last onMove; otherwise an rAF
    // can fire after commit and re-sync from stale ctx.doc (wrong position).
    this.gizmoScheduler.cancelPending();

    // Pivot drag ends without committing a transform — just redraw the gizmo
    // at the new pivot position.
    if (this.activeHandle === "pivot") {
      this.resetGestureState();
      this.pivotPointAtMoveStart = null;
      this.drawGizmo(ctx);
      return;
    }

    // Capture the final transform before commit clears the active flag so
    // the gizmo can draw at the correct position even though ctx.doc is stale.
    const committedTransform = this.session.isActive()
      ? { ...this.session.state.currentTransform }
      : null;

    if (this.isMultiTarget() && this.session.isActive()) {
      this.commitMultiLayerGesture(ctx);
    } else {
      this.session.commit(ctx);
    }

    this.resetMultiGestureState();
    this.resetGestureState();
    this.pivotPointAtMoveStart = null;

    for (const id of this.multiTargetLayerIds) {
      ctx.onStrokeEnd(id, null, undefined, {
        syncDocumentFromCanvas: false
      });
    }
    this.drawGizmoWithTransform(ctx, committedTransform);
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
      const picked = this.peekAutoSelectPick(ctx, event.point);
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
    const picked = this.peekAutoSelectPick(ctx, event.point);
    if (!picked) {
      return false;
    }
    const isCurrentTarget = this.multiTargetLayerIds.includes(picked.id);

    if (this.isMultiTarget() && isCurrentTarget) {
      // Multi-target: collapse to the clicked layer when exactly one selected
      // layer paints at the pointer.
      const contributorHits = countTransformTargetsHitAtDocPoint(
        ctx.doc.layers,
        ctx.layerCanvasesRef.current,
        this.multiTargetLayerIds,
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
    const primaryId = this.multiTargetLayerIds[0];
    if (!primaryId) {
      return false;
    }

    const picked = pickedOverride ?? this.peekAutoSelectPick(ctx, event.point);

    if (!picked) {
      return false;
    }

    // Single-target: only retarget when the topmost pixel belongs to another layer.
    // Multi-target (layers panel multi-select): any concrete hit collapses to that
    // layer so auto-select works while a union transform is armed.
    if (!this.isMultiTarget() && picked.id === primaryId) {
      return false;
    }

    this.pivotPoint = null;
    this.pivotPointAtMoveStart = null;
    this.hoveredHandle = null;
    ctx.onAutoPickLayer?.(picked.id);
    ctx.getOrCreateLayerCanvas(picked.id);
    this.syncSingleLayer(ctx, picked);
    this.drawGizmo(ctx);
    return true;
  }

  isMultiTarget(): boolean {
    return this.multiTargetLayerIds.length > 1;
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
    this.multiTargetLayerIds = [];
    this.targetSet.clear();
    this.pivotPoint = null;
    this.pivotPointAtMoveStart = null;
    this.hoveredHandle = null;
    this.activeHandle = null;
    ctx.clearGizmo();
  }

  /** Layer IDs participating in the current union transform (stack order). */
  getMultiTargetLayerIds(): readonly string[] {
    return this.multiTargetLayerIds;
  }

  private syncTransformTargets(ctx: ToolContext): void {
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
    this.multiTargetLayerIds = ids;

    if (ids.length === 0) {
      this.targetSet.clear();
      return;
    }

    if (ids.length === 1) {
      const layer = ctx.doc.layers.find((l) => l.id === ids[0]);
      if (!layer) {
        this.multiTargetLayerIds = [];
        this.targetSet.clear();
        return;
      }
      this.syncSingleLayer(ctx, layer);
      return;
    }

    const entries: TransformTargetEntry[] = [];
    const extentRects: Array<ReturnType<typeof getTransformedExtents>> = [];
    for (const id of ids) {
      const layer = ctx.doc.layers.find((l) => l.id === id);
      if (!layer) {
        continue;
      }
      const canvas = ctx.layerCanvasesRef.current.get(id);
      // Tight bounds for parity with the single-layer path — see Fix #2.
      const rb = resolveGizmoBounds(layer, canvas, ctx.doc.canvas);
      entries.push({ layerId: id, bounds: rb });
      extentRects.push(getTransformedExtents(layer.transform, rb));
    }

    if (entries.length === 0) {
      this.multiTargetLayerIds = [];
      this.targetSet.clear();
      return;
    }

    const union = unionOfDocumentExtents(extentRects);
    if (!union) {
      this.multiTargetLayerIds = [];
      this.targetSet.clear();
      return;
    }

    this.rasterBounds = {
      x: 0,
      y: 0,
      width: union.width,
      height: union.height
    };
    this.originalTransform = {
      x: union.x,
      y: union.y,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      matrix: composeAffineMatrix(union.x, union.y, 1, 1, 0)
    };
    this.targetSet.setTargets(entries);
  }

  private syncSingleLayer(ctx: ToolContext, layer: Layer): void {
    this.multiTargetLayerIds = [layer.id];
    this.originalTransform = { ...layer.transform };
    const layerCanvas = ctx.layerCanvasesRef.current.get(layer.id);
    // resolveGizmoBounds prefers contentBounds / opaque-pixel scan when the
    // layer canvas is full-doc-sized, so the gizmo wraps the actual content
    // for fresh / untrimmed layers.
    this.rasterBounds = resolveGizmoBounds(layer, layerCanvas, ctx.doc.canvas);
    this.targetSet.setSingle(layer.id, this.rasterBounds);
  }

  private captureMultiGestureBaselines(ctx: ToolContext): void {
    const map = new Map<string, AffineMatrix>();
    for (const id of this.multiTargetLayerIds) {
      const layer = ctx.doc.layers.find((l) => l.id === id);
      if (!layer) {
        continue;
      }
      const rb = resolveGizmoBounds(
        layer,
        ctx.layerCanvasesRef.current.get(id),
        ctx.doc.canvas
      );
      const m = rasterSpaceToDocAffine(layer.transform, rb);
      if (m) {
        map.set(id, m);
      }
    }
    this.multiGestureBaselineDocMatrices = map;
  }

  private applyMultiLayerPreviews(
    ctx: ToolContext,
    unionTransform: LayerTransform
  ): void {
    if (
      !this.multiGestureBaselineDocMatrices ||
      !this.multiGestureUnionDocMatrixStart
    ) {
      return;
    }
    const M_live = rasterSpaceToDocAffine(unionTransform, this.rasterBounds);
    const invStart = affineInvert(this.multiGestureUnionDocMatrixStart);
    if (!M_live || !invStart) {
      return;
    }
    const D = affineMultiply(M_live, invStart);
    for (const id of this.multiTargetLayerIds) {
      const Mi0 = this.multiGestureBaselineDocMatrices.get(id);
      if (!Mi0) {
        continue;
      }
      const Mi1 = affineMultiply(D, Mi0);
      ctx.setLayerTransformPreview?.(id, layerTransformFromDocAffine(Mi1));
    }
  }

  private commitMultiLayerGesture(ctx: ToolContext): void {
    const unionFinal = this.session.state.currentTransform;
    const M_end = rasterSpaceToDocAffine(unionFinal, this.rasterBounds);
    const invStart = this.multiGestureUnionDocMatrixStart
      ? affineInvert(this.multiGestureUnionDocMatrixStart)
      : null;
    const baseline = this.multiGestureBaselineDocMatrices;
    if (!M_end || !invStart || !baseline) {
      this.session.cancel(ctx);
      return;
    }
    const D = affineMultiply(M_end, invStart);
    for (const id of this.multiTargetLayerIds) {
      const Mi0 = baseline.get(id);
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
   * primary layer transform when idle).
   */
  private resolveDisplayedUnionTransform(ctx: ToolContext): LayerTransform | null {
    if (this.multiTargetLayerIds.length === 0) {
      return null;
    }
    if (this.session.isActive()) {
      return this.session.state.currentTransform;
    }
    if (this.isMultiTarget()) {
      return this.originalTransform;
    }
    const primary = ctx.doc.layers.find(
      (l) => l.id === this.multiTargetLayerIds[0]
    );
    return primary ? primary.transform : null;
  }

  private getConfiguredTransformMode(): TransformMode {
    return useSketchStore.getState().toolSettings?.transform?.mode ?? "scale";
  }

  private getCurrentCorners(
    transform: LayerTransform
  ): [Point, Point, Point, Point] {
    return getTransformedCorners(transform, this.rasterBounds);
  }

  private peekAutoSelectPick(ctx: ToolContext, docPoint: Point): Layer | null {
    const { isolatedLayerId } = useSketchStore.getState();
    return pickTopmostTransformableLayer(
      ctx.doc.layers,
      ctx.layerCanvasesRef.current,
      docPoint,
      isolatedLayerId,
      ctx.getOrCreateLayerCanvas
    );
  }

  // ── Public API (for settings panel commit/cancel/reset) ────────────────────

  /** Get the original transform captured when the tool was activated. */
  getOriginalTransform(): LayerTransform {
    return { ...this.originalTransform };
  }

  /** Refresh the gizmo (e.g. after external transform change). */
  refreshOverlay(ctx: ToolContext): void {
    this.drawGizmo(ctx);
  }

  /** Get the current single-target transform state (read-only). */
  getTargetSet(): TransformTargetSet {
    return this.targetSet;
  }

  // ── In-transform undo/redo ────────────────────────────────────────────────

  /** Whether there are undoable handle adjustments in the current transform session. */
  hasUndoableAdjustments(): boolean {
    return this.adjustmentUndoStack.length > 0;
  }

  /** Whether there are redoable handle adjustments in the current transform session. */
  hasRedoableAdjustments(): boolean {
    return this.adjustmentRedoStack.length > 0;
  }

  /**
   * Undo the last handle adjustment within the current transform session.
   * Returns the transform to apply, or null if the undo stack is empty.
   * The current transform is pushed onto the redo stack.
   */
  undoLastAdjustment(currentTransform: LayerTransform): LayerTransform | null {
    if (this.adjustmentUndoStack.length === 0) {
      return null;
    }
    // Push current state onto redo stack before restoring
    this.adjustmentRedoStack.push({ ...currentTransform });
    const previous = this.adjustmentUndoStack.pop()!;
    return { ...previous };
  }

  /**
   * Redo the last undone handle adjustment within the current transform session.
   * Returns the transform to apply, or null if the redo stack is empty.
   * The current transform is pushed onto the undo stack.
   */
  redoLastAdjustment(currentTransform: LayerTransform): LayerTransform | null {
    if (this.adjustmentRedoStack.length === 0) {
      return null;
    }
    // Push current state onto undo stack before re-applying
    this.adjustmentUndoStack.push({ ...currentTransform });
    const next = this.adjustmentRedoStack.pop()!;
    return { ...next };
  }

  /**
   * Test whether a document-space point falls inside the transform bounding box.
   * Used by the pointer handler to decide whether to show the transform context menu.
   */
  isPointInsideBoundingBox(ctx: ToolContext, docPoint: Point): boolean {
    const transform = this.resolveDisplayedUnionTransform(ctx);
    if (!transform) {
      return false;
    }
    const handle = hitTestHandles(
      transform,
      this.rasterBounds,
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
      return { ...this.session.state.currentTransform };
    }
    if (this.isMultiTarget()) {
      return { ...this.originalTransform };
    }
    if (this.multiTargetLayerIds.length === 1) {
      const doc = useSketchStore.getState().document;
      const layer = doc.layers.find((l) => l.id === this.multiTargetLayerIds[0]);
      return layer ? { ...layer.transform } : null;
    }
    return null;
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
    if (!transform) {
      return null;
    }
    const handle = hitTestHandles(transform, this.rasterBounds, docPoint, ctx.zoom);
    // Let the visible pivot win over move-zone and rotate-zone hover, while
    // still preserving direct hits on concrete gizmo handles. Quad-only
    // transforms have no pivot.
    if (
      (handle === "move" || handle === null) &&
      !isQuadOnlyTransform(transform)
    ) {
      const pivotDoc = this.getEffectivePivot(transform);
      if (hitTestPivot(pivotDoc, docPoint, ctx.zoom)) {
        this.hoveredHandle = "pivot";
        return "crosshair";
      }
    }
    if (handle) {
      this.hoveredHandle = handle;
      return cursorForHandle(handle, transform.rotation ?? 0);
    }
    if (isInRotateZone(transform, this.rasterBounds, docPoint, ctx.zoom)) {
      this.hoveredHandle = "rotate";
      return cursorForHandle("rotate", transform.rotation ?? 0);
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
   * Compute the next layer transform for the active handle + mode.
   *
   * Each branch handles exactly one (mode, handle-class) pair and returns a
   * fully-formed transform. The `else` branch is the standard scale / move /
   * rotate dispatcher and is the only branch that hits `computeRotateTransform`.
   *
   * Invariants:
   *   - `this.activeHandle` and `this.dragStart` are non-null (caller checks).
   *   - `this.dragStartCorners` is set for non-move/non-rotate handles
   *     when single-target.
   *   - The returned transform is in document space, ready for the preview
   *     session.
   */
  private computeGestureTransform(
    pt: Point,
    gestureMode: TransformMode,
    modifiers: { shift: boolean; alt: boolean; ctrlOrMeta: boolean }
  ): LayerTransform {
    const handle = this.activeHandle!;
    const corners = this.dragStartCorners;

    if (corners && isCornerHandle(handle)) {
      if (gestureMode === "warp" || gestureMode === "mesh-warp") {
        return this.computeWarpDrag(pt, corners, handle, gestureMode);
      }
      if (
        gestureMode === "perspective" ||
        gestureMode === "perspective-dual" ||
        gestureMode === "perspective-distort"
      ) {
        return this.computePerspectiveDrag(pt, corners, handle, gestureMode);
      }
      if (gestureMode === "distort") {
        return computeDistortTransform(
          corners,
          handle,
          this.dragStart!,
          pt,
          this.rasterBounds,
          modifiers.shift,
          this.dragStartTransform
        );
      }
    }
    if (corners && isEdgeHandle(handle) && gestureMode === "skew") {
      return computeSkewTransform(
        corners,
        handle,
        this.dragStart!,
        pt,
        this.rasterBounds
      );
    }

    return this.computeStandardDrag(pt, gestureMode, modifiers);
  }

  /** Warp / mesh-warp corner drag — quad-based. */
  private computeWarpDrag(
    pt: Point,
    corners: [Point, Point, Point, Point],
    handle: CornerHandle,
    gestureMode: TransformMode
  ): LayerTransform {
    // Mesh-warp currently shares the warp gesture math for the 4 corner
    // handles; the full mesh-grid editing gizmo is a planned follow-up
    // and will replace this branch when it lands.
    const warped = computeWarpTransform(
      corners,
      handle,
      this.dragStart!,
      pt,
      this.rasterBounds,
      this.dragStartTransform
    );
    return gestureMode === "mesh-warp" ? { ...warped, mode: "mesh-warp" } : warped;
  }

  /** Single / dual / distort perspective corner drag. */
  private computePerspectiveDrag(
    pt: Point,
    corners: [Point, Point, Point, Point],
    handle: CornerHandle,
    gestureMode: TransformMode
  ): LayerTransform {
    const single = computePerspectiveTransform(
      corners,
      handle,
      this.dragStart!,
      pt,
      this.rasterBounds,
      this.dragStartTransform
    );
    if (gestureMode === "perspective-dual") {
      const primaryQuad = single.quad;
      const seedSecondary =
        this.dragStartTransform.secondaryQuad ??
        (primaryQuad
          ? buildSeedSecondaryQuad(primaryQuad, this.rasterBounds.width / 2)
          : undefined);
      return {
        ...single,
        mode: "perspective-dual",
        secondaryQuad: seedSecondary
      };
    }
    if (gestureMode === "perspective-distort") {
      // Perspective Distort uses the same live perspective math while
      // the user defines the four-point quad. The differentiator is the
      // commit step (inverse-perspective bake to straighten the layer)
      // — that lands in a follow-up; today the bake reuses the standard
      // perspective bake which already maps the layer onto the quad.
      return { ...single, mode: "perspective-distort" };
    }
    return single;
  }

  /** Standard scale / rotate / move via the unified dispatcher. */
  private computeStandardDrag(
    pt: Point,
    gestureMode: TransformMode,
    modifiers: { shift: boolean; alt: boolean; ctrlOrMeta: boolean }
  ): LayerTransform {
    const handle = this.activeHandle!;
    const isRotate = handle === "rotate";
    // For rotate: pivot defaults to layer center; pass `layerCenter` only when
    // a custom pivot is set so computeRotateTransform applies the orbital
    // translation. For non-rotate gestures the rotation is fixed and we use
    // the layer center as the scale anchor reference.
    const rotationCenter = isRotate
      ? this.getEffectivePivot(this.dragStartTransform)
      : this.center;
    const layerCenter = isRotate && this.pivotPoint ? this.center : undefined;
    // Affinity-style: Ctrl/Cmd on a scale handle scales from center
    // (in addition to Alt, kept for backwards compatibility).
    const fromCenter = modifiers.alt || (modifiers.ctrlOrMeta && !isRotate);
    const next = computeTransformForHandle(
      handle,
      this.dragStartTransform,
      this.dragStart!,
      pt,
      rotationCenter,
      this.rasterBounds,
      modifiers.shift,
      fromCenter,
      layerCenter
    );
    if (gestureMode === "scale") {
      delete next.mode;
    }
    return next;
  }

  // ── Pivot helpers ──────────────────────────────────────────────────────────

  /**
   * Get the effective pivot point in document space. Returns the custom
   * pivot if set, otherwise the layer center computed from the transform
   * and raster bounds.
   */
  private getEffectivePivot(transform: LayerTransform): Point {
    return this.pivotPoint ?? getTransformedCenter(transform, this.rasterBounds);
  }

  /** Get the current pivot point (for external consumers / UI). */
  getPivotPoint(): Point | null {
    return this.pivotPoint ? { ...this.pivotPoint } : null;
  }

  /** Reset the pivot to the layer center (null = default). */
  resetPivot(): void {
    this.pivotPoint = null;
    this.pivotPointAtMoveStart = null;
  }

  // ── Gizmo drawing ─────────────────────────────────────────────────────────

  private drawGizmo(ctx: ToolContext): void {
    this.drawGizmoWithTransform(ctx, null);
  }

  /**
   * Draw the transform gizmo. When `overrideTransform` is provided it is
   * used instead of the layer's stored transform — this avoids reading from
   * the stale `ctx.doc` snapshot right after a commit.
   */
  private drawGizmoWithTransform(
    ctx: ToolContext,
    overrideTransform: LayerTransform | null
  ): void {
    // Don't sync targets when drawing with an explicit transform: right after
    // commit, ctx.doc can still be one React render behind the committed
    // transform — recomputing rasterBounds/originalTransform from stale doc
    // would mismatch overrideTransform and drift the gizmo.
    if (
      overrideTransform === null &&
      !this.gestureActive &&
      !this.session.isActive()
    ) {
      this.syncTransformTargets(ctx);
    }
    // Clear any stale gizmo when there is nothing to transform — without
    // this an old gizmo can linger after the active layer is deleted or the
    // selection emptied (because syncTransformTargets bails early without
    // erasing the previous paint).
    if (this.multiTargetLayerIds.length === 0) {
      ctx.clearGizmo();
      return;
    }
    const transform =
      overrideTransform ?? this.resolveDisplayedUnionTransform(ctx);
    if (!transform) {
      ctx.clearGizmo();
      return;
    }
    const hoveredHandle = this.activeHandle ?? this.hoveredHandle;
    const pivotDoc = this.pivotPoint ?? null;
    paintTransformGizmo(ctx, transform, this.rasterBounds, hoveredHandle, pivotDoc);
  }
}

export const definition: ToolDefinition = {
  tool: "transform",
  label: "Transform",
  Icon: AspectRatioIcon,
  group: "painting"
};
