/**
 * MoveTool – translates the active layer by dragging.
 *
 * Supports:
 *   - Ctrl+Alt click to duplicate-and-move
 *   - Alt click to auto-pick topmost non-transparent layer
 *   - Shared PreviewSession for live compositing preview
 *   - clearLayerTransformPreview on release
 *
 * Preview lifecycle uses the shared `PreviewSession` contract so
 * compositing, gizmo drawing, transform UI, and top-bar numbers all
 * read one live preview source. See `previewSession.ts` for the
 * start → update → commit/cancel/clear lifecycle.
 *
 * Geometry policy is delegated to `transform/geometry/layerGeometry` and
 * `tools/transform/` helpers so this file owns only interaction flow.
 */

import type { ToolHandler, ToolContext, ToolPointerEvent, ToolDefinition } from "./types";
import type { Point, LayerTransform } from "../types";
import OpenWithIcon from "@mui/icons-material/OpenWith";
import {
  IDENTITY_AFFINE,
  cloneTransform,
  isLayerCompositeVisible,
  layerAllowsTransformWhilePixelLocked
} from "../types";
import { computeMoveTransform } from "./transform";
import { hitTestLayerAtDocPoint } from "../painting/sampleDocument";
import { mergeTransformPreview } from "../painting/transformPreview";
import {
  getVisualBounds,
  computeTransformedExtents,
  computeTransformedCorners
} from "../transform/geometry/layerGeometry";
import { docToScreen } from "./transform/handleGeometry";
import { drawOffCanvasIndicator } from "./gizmo";
import { useSketchStore } from "../state/useSketchStore";
import { createPreviewSession, type PreviewSession } from "./previewSession";
import { pickTopmostTransformableLayer } from "./transformTargetSet";
import { getSelectionBounds, selectionHasAnyPixels } from "../selection";
import { buildSketchInternalClipboardCanvas } from "../sketchClipboard";

/**
 * Full-layer duplicate (Ctrl+Alt+drag with no active selection). Returns
 * the freshly-active layer from the store, or null when duplication
 * yielded no new active layer.
 */
function duplicateActiveLayer(
  sourceLayerId: string
): import("../types").Layer | null {
  useSketchStore.getState().duplicateLayer(sourceLayerId);
  const freshDoc = useSketchStore.getState().document;
  const dup = freshDoc.layers.find((l) => l.id === freshDoc.activeLayerId);
  return dup ?? null;
}

/**
 * Selection-aware variant for Ctrl+Alt+drag: lift the selected pixels
 * out of the active layer into a brand-new layer that sits exactly on
 * top of the source so the duplicate visually starts in-place. The
 * source layer is left untouched (this is duplicate, not cut). The
 * runtime is used to materialize a doc-sized canvas for the new
 * layer and paint the cropped selection at its original document
 * coordinates. Selection is preserved.
 *
 * Falls back to a full-layer duplicate when any required runtime
 * surface is unavailable (snapshots, layer canvases, contexts).
 */
function duplicateActiveLayerFromSelection(
  ctx: ToolContext,
  sourceLayer: import("../types").Layer,
  selection: import("../types").Selection
): import("../types").Layer | null {
  const runtime = ctx.runtime;
  if (!runtime) {
    return duplicateActiveLayer(sourceLayer.id);
  }
  const snapshot = runtime.snapshotLayerCanvas(sourceLayer.id);
  if (!snapshot) {
    return duplicateActiveLayer(sourceLayer.id);
  }
  const docW = ctx.doc.canvas.width;
  const docH = ctx.doc.canvas.height;
  const clipboard = buildSketchInternalClipboardCanvas({
    snapshot,
    layer: sourceLayer,
    documentCanvasWidth: docW,
    documentCanvasHeight: docH,
    selection
  });
  const bounds = getSelectionBounds(selection);
  if (!clipboard || !bounds) {
    return duplicateActiveLayer(sourceLayer.id);
  }

  const newLayerId = useSketchStore.getState().addLayer();
  // Materialize a doc-sized blank canvas in the runtime so the next
  // drawImage lands on a real backing store. Without this, the layer
  // exists only in the Zustand store and the runtime won't create its
  // canvas until the next reconciliation tick.
  runtime.setLayerData(newLayerId, null, {
    x: 0,
    y: 0,
    width: docW,
    height: docH
  });
  const newCanvas = ctx.getOrCreateLayerCanvas(newLayerId);
  const newCtx = newCanvas.getContext("2d");
  if (!newCtx) {
    return duplicateActiveLayer(sourceLayer.id);
  }
  newCtx.drawImage(clipboard, bounds.x, bounds.y);
  ctx.invalidateLayer?.(newLayerId);
  // Persist the new layer's pixels back into the store so undo/redo
  // and future reconciliation see them.
  const dataUrl = newCanvas.toDataURL();
  useSketchStore.setState((s) => ({
    document: {
      ...s.document,
      layers: s.document.layers.map((l) =>
        l.id === newLayerId ? { ...l, data: dataUrl } : l
      )
    }
  }));

  const freshDoc = useSketchStore.getState().document;
  return freshDoc.layers.find((l) => l.id === newLayerId) ?? null;
}

/** Paint corner brackets for off-canvas layer extents on the gizmo canvas.
 *  Uses {@link resolveGizmoBounds} (same contract as TransformTool) and maps the
 *  transformed quad to screen space so bounds track tight content and rotation. */
function paintOffCanvasGizmo(
  ctx: ToolContext,
  layerId: string,
  transform: LayerTransform
): void {
  const layer = ctx.doc.layers.find((l) => l.id === layerId);
  if (!layer) {
    return;
  }

  const layerCanvas = ctx.layerCanvasesRef.current.get(layerId);
  const rasterBounds = getVisualBounds(layer, layerCanvas, ctx.doc.canvas);
  const extents = computeTransformedExtents(transform, rasterBounds);

  const cw = ctx.doc.canvas.width;
  const ch = ctx.doc.canvas.height;

  const extendsOutside =
    extents.x < 0 ||
    extents.y < 0 ||
    extents.x + extents.width > cw ||
    extents.y + extents.height > ch;
  if (!extendsOutside) {
    ctx.clearGizmo();
    return;
  }

  const docCorners = computeTransformedCorners(transform, rasterBounds);

  ctx.drawGizmo((gc, dpr, containerW, containerH) => {
    const screenCorners: [Point, Point, Point, Point] = [
      docToScreen(docCorners[0].x, docCorners[0].y, cw, ch, ctx.zoom, ctx.pan, containerW, containerH, dpr),
      docToScreen(docCorners[1].x, docCorners[1].y, cw, ch, ctx.zoom, ctx.pan, containerW, containerH, dpr),
      docToScreen(docCorners[2].x, docCorners[2].y, cw, ch, ctx.zoom, ctx.pan, containerW, containerH, dpr),
      docToScreen(docCorners[3].x, docCorners[3].y, cw, ch, ctx.zoom, ctx.pan, containerW, containerH, dpr)
    ];

    drawOffCanvasIndicator(gc, screenCorners, dpr);
  });
}

export class MoveTool implements ToolHandler {
  readonly toolId = "move" as const;

  /** Shared preview session — single source of truth for preview state. */
  private readonly session: PreviewSession = createPreviewSession();
  private moveStart: Point | null = null;
  private moveLayerStartTransform: LayerTransform = { ...IDENTITY_AFFINE };
  /**
   * Additional layers being moved as part of a multi-selection drag.
   * Each carries its own baseline transform so the same translation delta
   * can be applied independently (preserving each layer's scale/rotation).
   * The session itself only tracks the primary layer.
   */
  private extraMoveTargets: Array<{
    layerId: string;
    baseline: LayerTransform;
  }> = [];

  onActivate(ctx: ToolContext): void {
    this.refreshGizmo(ctx);
  }

  /** Resync off-canvas gizmo when the layers panel changes the active layer. */
  syncActiveLayer(ctx: ToolContext): void {
    if (this.session.isActive()) {
      return;
    }
    this.refreshGizmo(ctx);
  }

  onDeactivate(ctx: ToolContext): void {
    // If a spring-loaded move was in progress when deactivating, commit it
    // so the layer keeps the committed transform and we don't leave stale
    // preview state.
    if (this.session.isActive()) {
      this.session.commit(ctx);
      const layerId = this.session.state.layerId;
      if (layerId) {
        ctx.onStrokeEnd(layerId, null, undefined, {
          syncDocumentFromCanvas: false
        });
      }
    }
    this.session.clear(ctx);
    for (const extra of this.extraMoveTargets) {
      ctx.clearLayerTransformPreview?.(extra.layerId);
    }
    this.extraMoveTargets = [];
    this.moveStart = null;
    this.moveLayerStartTransform = { ...IDENTITY_AFFINE };
    ctx.clearGizmo();
  }

  private refreshGizmo(ctx: ToolContext): void {
    this.refreshGizmoWithTransform(ctx, null);
  }

  /**
   * Refresh the gizmo overlay. When `overrideTransform` is provided it is
   * used instead of the layer's stored transform — this avoids reading from
   * the stale `ctx.doc` snapshot right after a commit.
   */
  private refreshGizmoWithTransform(
    ctx: ToolContext,
    overrideTransform: LayerTransform | null
  ): void {
    const { doc } = ctx;
    const activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId);
    if (!activeLayer) {
      ctx.clearGizmo();
      return;
    }
    const previewTransform = this.session.isActive()
      ? this.session.state.currentTransform
      : overrideTransform ?? activeLayer.transform;
    paintOffCanvasGizmo(ctx, activeLayer.id, previewTransform);
  }

  /** Get the current preview session (for external consumers). */
  getPreviewSession(): PreviewSession {
    return this.session;
  }

  onDown(ctx: ToolContext, event: ToolPointerEvent): boolean | void {
    const { doc } = ctx;
    const activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId);
    if (!activeLayer) {
      return false;
    }
    if (
      activeLayer.locked &&
      !layerAllowsTransformWhilePixelLocked(activeLayer)
    ) {
      return false;
    }

    const pt = event.point;
    let moveTargetLayer = activeLayer;

    // Ctrl+Alt: duplicate layer (or just the selected pixels) then move
    // the duplicate. When a selection is active and has pixels, only
    // the selected region is lifted into the new layer at its original
    // document position — mirroring "Layer via Copy" + drag.
    if ((event.nativeEvent.ctrlKey || event.nativeEvent.metaKey) && event.nativeEvent.altKey) {
      const sel = useSketchStore.getState().selection;
      const hasSelPixels = sel != null && selectionHasAnyPixels(sel);
      const dup = hasSelPixels
        ? duplicateActiveLayerFromSelection(ctx, activeLayer, sel)
        : duplicateActiveLayer(activeLayer.id);
      if (dup) {
        moveTargetLayer = dup;
      }
    } else if (
      (event.nativeEvent.ctrlKey || event.nativeEvent.metaKey) &&
      event.nativeEvent.shiftKey &&
      ctx.onAutoPickLayer
    ) {
      // Ctrl/Cmd+Shift+click with auto-select: toggle the hit layer into the
      // multi-layer selection instead of replacing it. This mirrors how the
      // layers panel builds multi-selection (Ctrl/Cmd+click) but works
      // directly on the canvas, which is how users naturally compose
      // a group to move together.
      const storeSettings = useSketchStore.getState().toolSettings;
      const autoSelect = storeSettings?.move?.autoSelect ?? true;
      if (autoSelect) {
        const { isolatedLayerId } = useSketchStore.getState();
        const picked = pickTopmostTransformableLayer(
          doc.layers,
          ctx.layerCanvasesRef.current,
          pt,
          isolatedLayerId,
          ctx.getOrCreateLayerCanvas
        );
        if (picked) {
          useSketchStore.getState().toggleLayerInSelection(picked.id);
          // Do not start a drag for the toggle click; let the user click
          // again (without Shift) to begin moving the assembled group.
          // This keeps the gesture predictable — Shift+click is purely
          // a selection-mutation gesture, never a move gesture.
          this.refreshGizmo(ctx);
          return false;
        }
      }
      // No hit and no toggle: fall through with active layer as target.
    } else if (event.nativeEvent.altKey && ctx.onAutoPickLayer) {
      // Alt+click: auto-pick topmost non-transparent layer (affine-aware)
      const { isolatedLayerId } = useSketchStore.getState();
      for (let i = doc.layers.length - 1; i >= 0; i--) {
        const layer = doc.layers[i];
        const skipForHit =
          !isLayerCompositeVisible(doc.layers, layer, isolatedLayerId) ||
          (layer.locked && !layer.imageReference);
        if (skipForHit) {
          continue;
        }
        let layerCanvas = ctx.layerCanvasesRef.current.get(layer.id);
        if (!layerCanvas) {
          layerCanvas = ctx.getOrCreateLayerCanvas(layer.id);
        }
        if (hitTestLayerAtDocPoint(layer, layerCanvas, pt)) {
          ctx.onAutoPickLayer(layer.id);
          moveTargetLayer = layer;
          break;
        }
      }
    } else {
      // Auto-select: if enabled, pick the topmost visible transformable layer
      // at the click point (same behavior as TransformTool auto-select).
      const storeSettings = useSketchStore.getState().toolSettings;
      const autoSelect = storeSettings?.move?.autoSelect ?? true;
      if (autoSelect && ctx.onAutoPickLayer) {
        const { isolatedLayerId } = useSketchStore.getState();
        const picked = pickTopmostTransformableLayer(
          doc.layers,
          ctx.layerCanvasesRef.current,
          pt,
          isolatedLayerId,
          ctx.getOrCreateLayerCanvas
        );
        if (picked && picked.id !== doc.activeLayerId) {
          ctx.onAutoPickLayer(picked.id);
          moveTargetLayer = picked;
        }
      }
    }

    // Ensure the layer canvas exists so the compositing pipeline can render
    // the layer while it is being dragged.
    ctx.getOrCreateLayerCanvas(moveTargetLayer.id);

    this.moveStart = pt;
    // Capture the *full* layer transform as the drag baseline so that
    // preview and commit preserve existing scale/rotation state.
    this.moveLayerStartTransform = cloneTransform(moveTargetLayer.transform);
    this.session.start(ctx, moveTargetLayer.id, cloneTransform(this.moveLayerStartTransform));

    // Collect siblings that should follow the primary target as a group
    // drag. Only kicks in when the primary target is itself part of an
    // explicit multi-layer selection — otherwise a plain move on a layer
    // that's incidentally in selectedLayerIds would silently drag the
    // whole group, which is surprising for a single click.
    this.extraMoveTargets = [];
    const { selectedLayerIds } = useSketchStore.getState();
    if (
      selectedLayerIds.length >= 2 &&
      selectedLayerIds.includes(moveTargetLayer.id)
    ) {
      const docLayerById = new Map(doc.layers.map((l) => [l.id, l]));
      for (const id of selectedLayerIds) {
        if (id === moveTargetLayer.id) {
          continue;
        }
        const sibling = docLayerById.get(id);
        if (!sibling || sibling.type === "group") {
          continue;
        }
        if (
          sibling.locked &&
          !layerAllowsTransformWhilePixelLocked(sibling)
        ) {
          continue;
        }
        ctx.getOrCreateLayerCanvas(sibling.id);
        this.extraMoveTargets.push({
          layerId: sibling.id,
          baseline: cloneTransform(sibling.transform)
        });
      }
    }
    return true;
  }

  onMove(ctx: ToolContext, event: ToolPointerEvent, _coalescedPoints?: ToolPointerEvent[]): void {
    if (!this.moveStart || !this.session.isActive()) {
      return;
    }
    const pt = event.point;
    const dx = pt.x - this.moveStart.x;
    const dy = pt.y - this.moveStart.y;
    const previewId = this.session.state.layerId;
    // Read freshest doc from the store in case a duplicate just occurred.
    // Fall back to ctx.doc when the store document doesn't contain the target layer
    // (e.g. in unit tests where the store isn't populated).
    const storeDoc = useSketchStore.getState().document;
    const layer =
      previewId != null
        ? (storeDoc.layers.find((l) => l.id === previewId) ??
           ctx.doc.layers.find((l) => l.id === previewId))
        : null;
    if (layer) {
      const cursor = { x: this.moveStart.x + dx, y: this.moveStart.y + dy };
      const previewTransform = computeMoveTransform(
        this.moveLayerStartTransform,
        this.moveStart,
        cursor
      );
      const merged = mergeTransformPreview(this.moveLayerStartTransform, previewTransform);
      this.session.update(ctx, merged);
      // Mirror the same delta onto every extra target. Each layer keeps
      // its own scale/rotation since computeMoveTransform operates on
      // the per-layer baseline; only the translation component changes.
      for (const extra of this.extraMoveTargets) {
        const extraPreview = computeMoveTransform(
          extra.baseline,
          this.moveStart,
          cursor
        );
        const extraMerged = mergeTransformPreview(extra.baseline, extraPreview);
        ctx.setLayerTransformPreview?.(extra.layerId, extraMerged);
      }
      this.refreshGizmo(ctx);
    }
  }

  onUp(ctx: ToolContext, event?: ToolPointerEvent): void {
    const layerId = this.session.state.layerId;
    // Capture the final transform before commit clears the session so the
    // gizmo can draw at the correct position even though ctx.doc is stale.
    const committedTransform = this.session.isActive()
      ? cloneTransform(this.session.state.currentTransform)
      : null;
    this.session.commit(ctx);

    // Commit each extra target using the same final cursor delta. Done
    // after the primary commit so the store mutations apply in a stable
    // order (primary first, then extras), which keeps history entries
    // grouped naturally and makes the post-up gizmo refresh see the
    // freshest doc.
    const finalCursor = event?.point ?? null;
    const extras = this.extraMoveTargets;
    this.extraMoveTargets = [];
    if (finalCursor && this.moveStart) {
      for (const extra of extras) {
        const extraTransform = computeMoveTransform(
          extra.baseline,
          this.moveStart,
          finalCursor
        );
        const extraMerged = mergeTransformPreview(extra.baseline, extraTransform);
        ctx.onLayerTransformChange?.(extra.layerId, extraMerged);
        ctx.clearLayerTransformPreview?.(extra.layerId);
        ctx.onStrokeEnd(extra.layerId, null, undefined, {
          syncDocumentFromCanvas: false
        });
      }
    } else {
      for (const extra of extras) {
        ctx.clearLayerTransformPreview?.(extra.layerId);
      }
    }

    this.moveStart = null;
    this.moveLayerStartTransform = { ...IDENTITY_AFFINE };

    if (layerId) {
      ctx.onStrokeEnd(layerId, null, undefined, {
        syncDocumentFromCanvas: false
      });
    }
    // Use the committed transform for the gizmo instead of reading from the
    // stale ctx.doc (which still holds the pre-move position).
    this.refreshGizmoWithTransform(ctx, committedTransform);
    // Redraw the selection overlay so marching ants (if any) update to the
    // committed layer position instead of staying at the pre-move position.
    ctx.drawSelectionOverlay();
  }
}

export const definition: ToolDefinition = {
  tool: "move",
  label: "Move",
  Icon: OpenWithIcon,
  group: "painting"
};
