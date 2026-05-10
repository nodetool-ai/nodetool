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
  resolveGizmoBounds,
  getTransformedCenter,
  getTransformedCorners,
  getTransformedExtents
} from "../painting/resolvedLayerGeometry";
import {
  type TransformHandle,
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
  /** Active transform gesture mode for the current drag. */
  private activeTransformMode: TransformMode = "auto";
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

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  onActivate(ctx: ToolContext): void {
    // Clear any stale session from a previous activation (e.g. re-activation
    // without explicit deactivation, or singleton reuse across tests).
    this.session.clear(ctx);
    this.targetSet.clear();
    this.multiGestureBaselineDocMatrices = null;
    this.multiGestureUnionDocMatrixStart = null;

    this.syncTransformTargets(ctx);

    this.activeHandle = null;
    this.hoveredHandle = null;
    this.gestureActive = false;
    this.pivotPoint = null;
    this.pivotPointAtMoveStart = null;
    this.activeTransformMode = "auto";
    this.dragStartCorners = null;
    this.adjustmentUndoStack = [];
    this.adjustmentRedoStack = [];
    this.drawGizmo(ctx);
  }

  syncActiveLayer(ctx: ToolContext): void {
    if (this.gestureActive || this.session.isActive()) {
      return;
    }
    this.activeHandle = null;
    this.hoveredHandle = null;
    this.pivotPoint = null;
    this.pivotPointAtMoveStart = null;
    this.activeTransformMode = "auto";
    this.dragStartCorners = null;
    this.adjustmentUndoStack = [];
    this.adjustmentRedoStack = [];
    this.syncTransformTargets(ctx);
    this.drawGizmo(ctx);
  }

  onDeactivate(ctx: ToolContext): void {
    this.activeHandle = null;
    this.hoveredHandle = null;
    this.gestureActive = false;
    this.pivotPoint = null;
    this.pivotPointAtMoveStart = null;
    this.activeTransformMode = "auto";
    this.dragStartCorners = null;
    this.session.clear(ctx);
    for (const id of this.multiTargetLayerIds) {
      ctx.clearLayerTransformPreview?.(id);
    }
    this.multiTargetLayerIds = [];
    this.multiGestureBaselineDocMatrices = null;
    this.multiGestureUnionDocMatrixStart = null;
    this.targetSet.clear();
    this.adjustmentUndoStack = [];
    this.adjustmentRedoStack = [];
    ctx.clearGizmo();
    ctx.clearOverlay();
    ctx.drawSelectionOverlay();
  }

  onViewportChange(ctx: ToolContext): void {
    // Redraw gizmo when zoom/pan changes so it stays aligned with the layer.
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
    //    pivot must win before auto-pick / rotate-zone fallback.
    if (handle === "move" || handle === null) {
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
    //    Auto-select only runs on misses outside both handles and rotate margin —
    //    never from interior move clicks (avoids accidental layer switches while translating).
    if (!handle) {
      if (isInRotateZone(currentTransform, this.rasterBounds, pt, ctx.zoom)) {
        handle = "rotate";
      } else {
        const storeSettings = useSketchStore.getState().toolSettings;
        const autoSelect = storeSettings?.transform?.autoSelect ?? true;
        if (
          !this.isMultiTarget() &&
          autoSelect &&
          !ctx.selection
        ) {
          const picked = this.tryAutoSelectPick(ctx, event);
          if (picked) {
            return false;
          }
        }
        if (ctx.selection) {
          ctx.onSelectionChange?.(null);
        }
        return false;
      }
    }

    this.activeHandle = handle;
    if (handle === "move" && this.pivotPoint !== null) {
      this.pivotPointAtMoveStart = { ...this.pivotPoint };
    } else {
      this.pivotPointAtMoveStart = null;
    }
    this.dragStart = pt;
    this.dragStartTransform = { ...currentTransform };
    this.dragStartCorners =
      handle === "move" || handle === "rotate"
        ? null
        : this.isMultiTarget()
          ? null
          : this.getCurrentCorners(currentTransform);
    this.activeTransformMode = this.getConfiguredTransformMode();
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
    const gestureMode = resolveTransformGestureMode(
      this.getConfiguredTransformMode(),
      this.activeHandle,
      {
        ctrlOrMeta: Boolean(
          event.nativeEvent.ctrlKey || event.nativeEvent.metaKey
        ),
        shift,
        alt
      }
    );
    let newTransform: LayerTransform;

    if (
      (gestureMode === "perspective" || gestureMode === "warp") &&
      this.dragStartCorners &&
      (this.activeHandle === "top-left" ||
        this.activeHandle === "top-right" ||
        this.activeHandle === "bottom-left" ||
        this.activeHandle === "bottom-right")
    ) {
      newTransform =
        gestureMode === "warp"
          ? computeWarpTransform(
              this.dragStartCorners,
              this.activeHandle,
              this.dragStart,
              pt,
              this.rasterBounds,
              this.dragStartTransform
            )
          : computePerspectiveTransform(
              this.dragStartCorners,
              this.activeHandle,
              this.dragStart,
              pt,
              this.rasterBounds,
              this.dragStartTransform
            );
    } else if (
      gestureMode === "distort" &&
      this.dragStartCorners &&
      (this.activeHandle === "top-left" ||
        this.activeHandle === "top-right" ||
        this.activeHandle === "bottom-left" ||
        this.activeHandle === "bottom-right")
    ) {
      newTransform = computeDistortTransform(
        this.dragStartCorners,
        this.activeHandle,
        this.dragStart,
        pt,
        this.rasterBounds,
        shift
      );
    } else if (
      gestureMode === "skew" &&
      this.dragStartCorners &&
      (this.activeHandle === "top" ||
        this.activeHandle === "bottom" ||
        this.activeHandle === "left" ||
        this.activeHandle === "right")
    ) {
      newTransform = computeSkewTransform(
        this.dragStartCorners,
        this.activeHandle,
        this.dragStart,
        pt,
        this.rasterBounds
      );
    } else {
      // Use the pivot as the rotation center when set; fall back to layer center.
      const rotationCenter = this.activeHandle === "rotate"
        ? this.getEffectivePivot(this.dragStartTransform)
        : this.center;
      // When the pivot is not the layer center, pass the layer center so
      // computeRotateTransform can compute the orbital translation.
      const layerCenter =
        this.activeHandle === "rotate" && this.pivotPoint
          ? this.center
          : undefined;
      newTransform = computeTransformForHandle(
        this.activeHandle,
        this.dragStartTransform,
        this.dragStart,
        pt,
        rotationCenter,
        this.rasterBounds,
        shift,
        alt,
        layerCenter
      );
      if (gestureMode === "scale") {
        delete newTransform.mode;
      }
    }
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
      this.activeHandle = null;
      this.dragStart = null;
      this.dragStartCorners = null;
      this.pivotPointAtMoveStart = null;
      this.activeTransformMode = "auto";
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

    this.multiGestureBaselineDocMatrices = null;
    this.multiGestureUnionDocMatrixStart = null;

    this.activeHandle = null;
    this.dragStart = null;
    this.dragStartCorners = null;
    this.pivotPointAtMoveStart = null;
    this.activeTransformMode = "auto";
    // Without this, idle draw/sync skip retargeting until tool reactivation.
    this.gestureActive = false;

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
    if (this.isMultiTarget()) {
      return false;
    }
    const primaryId = this.multiTargetLayerIds[0];
    if (!primaryId) {
      return false;
    }

    const picked = pickedOverride ?? this.peekAutoSelectPick(ctx, event.point);

    if (!picked || picked.id === primaryId) {
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

  /** Layer IDs participating in the current union transform (stack order). */
  getMultiTargetLayerIds(): readonly string[] {
    return this.multiTargetLayerIds;
  }

  private syncTransformTargets(ctx: ToolContext): void {
    const store = useSketchStore.getState();
    const ids = resolveTransformTargetLayerIds(
      ctx.doc,
      store.selectedLayerIds,
      ctx.doc.activeLayerId
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
    return useSketchStore.getState().toolSettings?.transform?.mode ?? "auto";
  }

  private getCurrentCorners(
    transform: LayerTransform
  ): [Point, Point, Point, Point] {
    return getTransformedCorners(transform, this.rasterBounds);
  }

  private peekAutoSelectPick(ctx: ToolContext, docPoint: Point): Layer | null {
    return pickTopmostTransformableLayer(
      ctx.doc.layers,
      ctx.layerCanvasesRef.current,
      docPoint,
      null,
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
    // handle when on a handle — both count as "inside".
    return handle !== null;
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
    // still preserving direct hits on concrete gizmo handles.
    if (handle === "move" || handle === null) {
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
    const transform =
      overrideTransform ?? this.resolveDisplayedUnionTransform(ctx);
    if (!transform) {
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
