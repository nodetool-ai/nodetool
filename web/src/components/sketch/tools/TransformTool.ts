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
 *            When clicking outside the gizmo with auto-select: toggle
 *            layer in the transform target set.
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
 *   - An optional auto-select toggle (stored in `TransformSettings`) controls
 *     whether clicking opaque pixels targets the topmost visible transformable
 *     layer without requiring a panel switch.
 *   - Shift+click adds/removes layers from the transform target set.
 *   - The transform gizmo, transform UI, and live preview all use one shared
 *     bounds source derived from the target set.
 *   - The transform target set is intentionally separate from the layers-panel
 *     multi-select (`selectedLayerIds`).
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
import type { Point, LayerTransform, LayerContentBounds } from "../types";
import { layerAllowsTransformWhilePixelLocked } from "../types";
import TransformIcon from "@mui/icons-material/Transform";
import {
  getTransformedCenter
} from "../painting/resolvedLayerGeometry";
import {
  type TransformHandle,
  hitTestHandles,
  isInRotateZone,
  hitTestPivot,
  snapPivotToAnchor,
  computeTransformForHandle
} from "./transform";
import {
  paintTransformGizmo,
  GizmoRedrawScheduler
} from "./transform/transformGizmoPainter";
import {
  applyCursorFeedback
} from "./transform/transformHoverPolicy";
import { createPreviewSession, type PreviewSession } from "./previewSession";
import { resolveGizmoBounds } from "../painting/resolvedLayerGeometry";
import {
  TransformTargetSet,
  pickTopmostTransformableLayer,
  resolveTargetEntry
} from "./transformTargetSet";
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
  /** Batched gizmo redraw scheduler. */
  private gizmoScheduler = new GizmoRedrawScheduler();

  // ── Pivot state ───────────────────────────────────────────────────────────
  /**
   * Custom pivot position in document space. `null` means "use layer center"
   * (the default). Set by dragging the pivot crosshair on the gizmo.
   * Reset when the tool is activated/deactivated.
   */
  private pivotPoint: Point | null = null;

  // ── Transform target set ──────────────────────────────────────────────────
  /** Set of layers targeted for transform (separate from layers-panel multi-select). */
  private readonly targetSet = new TransformTargetSet();

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

    const layer = ctx.doc.layers.find((l) => l.id === ctx.doc.activeLayerId);
    if (!layer) {
      return;
    }
    this.originalTransform = {
      x: layer.transform.x,
      y: layer.transform.y,
      scaleX: layer.transform.scaleX ?? 1,
      scaleY: layer.transform.scaleY ?? 1,
      rotation: layer.transform.rotation ?? 0
    };
    // Use the shared resolved-bounds contract for gizmo sizing
    const layerCanvas = ctx.layerCanvasesRef.current.get(layer.id);
    this.rasterBounds = resolveGizmoBounds(
      layer,
      layerCanvas,
      ctx.doc.canvas
    );
    // Initialize the target set with the active layer
    this.targetSet.setSingle(layer.id, this.rasterBounds);

    this.activeHandle = null;
    this.hoveredHandle = null;
    this.gestureActive = false;
    this.pivotPoint = null;
    this.adjustmentUndoStack = [];
    this.adjustmentRedoStack = [];
    this.drawGizmo(ctx);
  }

  onDeactivate(ctx: ToolContext): void {
    this.activeHandle = null;
    this.hoveredHandle = null;
    this.gestureActive = false;
    this.pivotPoint = null;
    this.session.clear(ctx);
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
    const layer = doc.layers.find((l) => l.id === doc.activeLayerId);
    if (!layer) {
      return false;
    }
    if (layer.locked && !layerAllowsTransformWhilePixelLocked(layer)) {
      return false;
    }

    const pt = event.point;
    const currentTransform = this.session.isActive()
      ? this.session.state.currentTransform
      : layer.transform;

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
        this.activeHandle = "pivot";
        this.dragStart = pt;
        this.dragStartTransform = { ...currentTransform };
        return true;
      }
    }

    // 3. If the click misses the gizmo, try auto-select targeting first,
    //    then fall back to outside-box rotation zone.
    if (!handle) {
      const storeSettings = useSketchStore.getState().toolSettings;
      const autoSelect = storeSettings?.transform?.autoSelect ?? true;
      if (autoSelect) {
        const picked = this.tryAutoSelectPick(ctx, event);
        if (picked) {
          return false; // Layer retargeted, no drag started
        }
      }
      // No handle hit and no auto-select pick — check the rotate zone.
      if (isInRotateZone(currentTransform, this.rasterBounds, pt, ctx.zoom)) {
        handle = "rotate";
      } else {
        return false;
      }
    }

    this.activeHandle = handle;
    this.dragStart = pt;
    this.dragStartTransform = { ...currentTransform };
    this.center = getTransformedCenter(currentTransform, this.rasterBounds);
    this.gestureActive = true;
    // Record the pre-drag transform for in-transform undo; clear redo stack.
    this.adjustmentUndoStack.push({ ...currentTransform });
    this.adjustmentRedoStack = [];
    // Start the shared preview session for compositing + UI.
    this.session.start(ctx, layer.id, { ...currentTransform });
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

    const layer = ctx.doc.layers.find((l) => l.id === ctx.doc.activeLayerId);
    if (!layer) {
      return;
    }

    const shift = ctx.shiftHeldRef.current;
    const alt = ctx.altHeldRef.current;
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
    const newTransform = computeTransformForHandle(
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
    // Update through the shared preview session — writes to both compositing
    // pipeline and the UI singleton in one call.
    this.session.update(ctx, newTransform);

    // Batch gizmo redraws with rAF to avoid redundant per-event paints
    this.gizmoScheduler.scheduleRedraw(() => this.drawGizmo(ctx));
  }

  onUp(ctx: ToolContext): void {
    // Pivot drag ends without committing a transform — just redraw the gizmo
    // at the new pivot position.
    if (this.activeHandle === "pivot") {
      this.activeHandle = null;
      this.dragStart = null;
      this.drawGizmo(ctx);
      return;
    }

    // Capture the final transform before commit clears the active flag so
    // the gizmo can draw at the correct position even though ctx.doc is stale.
    const committedTransform = this.session.isActive()
      ? { ...this.session.state.currentTransform }
      : null;
    // Commit the final transform through the shared session.
    this.session.commit(ctx);

    this.activeHandle = null;
    this.dragStart = null;

    const layer = ctx.doc.layers.find((l) => l.id === ctx.doc.activeLayerId);
    if (layer) {
      ctx.onStrokeEnd(layer.id, null, undefined, {
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
   * When Shift is held, the picked layer is toggled in the target set
   * rather than replacing it.
   */
  private tryAutoSelectPick(ctx: ToolContext, event: ToolPointerEvent): boolean {
    const { doc } = ctx;
    const pt = event.point;
    const shift = event.nativeEvent.shiftKey;

    const picked = pickTopmostTransformableLayer(
      doc.layers,
      ctx.layerCanvasesRef.current,
      pt,
      null // no isolation filter for auto-pick
    );

    if (!picked) {
      return false;
    }

    const pickedCanvas = ctx.layerCanvasesRef.current.get(picked.id);
    const entry = resolveTargetEntry(picked, pickedCanvas, doc.canvas);

    if (shift) {
      // Shift+click: toggle the picked layer in the target set
      this.targetSet.toggle(picked.id, entry.bounds);
    } else {
      // Plain click: replace the target set with the picked layer
      this.targetSet.setSingle(picked.id, entry.bounds);
    }

    // Switch the active layer to the picked layer so the gizmo and
    // preview session operate on it.
    if (picked.id !== doc.activeLayerId) {
      this.pivotPoint = null;
      this.hoveredHandle = null;
      ctx.onAutoPickLayer?.(picked.id);
    }

    // Update the gizmo bounds to match the new target
    this.rasterBounds = entry.bounds;
    this.originalTransform = {
      x: picked.transform.x,
      y: picked.transform.y,
      scaleX: picked.transform.scaleX ?? 1,
      scaleY: picked.transform.scaleY ?? 1,
      rotation: picked.transform.rotation ?? 0
    };

    this.drawGizmo(ctx);
    return true;
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

  /** Get the current transform target set (read-only). */
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
    const layer = ctx.doc.layers.find((l) => l.id === ctx.doc.activeLayerId);
    if (!layer) {
      return false;
    }
    const transform = this.session.isActive()
      ? this.session.state.currentTransform
      : layer.transform;
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
    return this.session.isActive()
      ? { ...this.session.state.currentTransform }
      : null;
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
    const layer = ctx.doc.layers.find((l) => l.id === ctx.doc.activeLayerId);
    if (!layer) {
      return null;
    }
    const transform = this.session.isActive()
      ? this.session.state.currentTransform
      : layer.transform;
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
    applyCursorFeedback(ctx, cursor);
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
    const layer = ctx.doc.layers.find((l) => l.id === ctx.doc.activeLayerId);
    if (!layer) {
      return;
    }
    const transform = this.session.isActive()
      ? this.session.state.currentTransform
      : overrideTransform ?? layer.transform;
    const hoveredHandle = this.activeHandle ?? this.hoveredHandle;
    const pivotDoc = this.pivotPoint ?? null;
    paintTransformGizmo(ctx, transform, this.rasterBounds, hoveredHandle, pivotDoc);
  }
}

export const definition: ToolDefinition = {
  tool: "transform",
  label: "Transform",
  shortcut: "F",
  Icon: TransformIcon,
  group: "painting"
};
