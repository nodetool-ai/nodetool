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
 * Geometry policy is delegated to `painting/resolvedLayerGeometry` and
 * `tools/transform/` helpers so this file owns only interaction flow.
 */

import type { ToolHandler, ToolContext, ToolPointerEvent, ToolDefinition } from "./types";
import type { Point, LayerTransform } from "../types";
import OpenWithIcon from "@mui/icons-material/OpenWith";
import {
  isLayerCompositeVisible,
  layerAllowsTransformWhilePixelLocked
} from "../types";
import { hitTestLayerAtDocPoint } from "../painting/sampleDocument";
import { mergeTransformPreview } from "../painting/transformPreview";
import {
  getEffectiveRasterBounds,
  getTransformedExtents
} from "../painting/resolvedLayerGeometry";
import { docRectToScreen } from "./transform/handleGeometry";
import { drawOffCanvasIndicator } from "./gizmo";
import { useSketchStore } from "../state/useSketchStore";
import { createPreviewSession, type PreviewSession } from "./previewSession";
import { pickTopmostTransformableLayer } from "./transformTargetSet";

/** Paint a dashed outline for off-canvas layer extents on the gizmo canvas.
 *  Uses shared resolved-geometry seam for bounds and shared gizmo primitives. */
function paintOffCanvasGizmo(
  ctx: ToolContext,
  layerId: string,
  transform: LayerTransform
): void {
  const layer = ctx.doc.layers.find((l) => l.id === layerId);
  if (!layer) {
    return;
  }

  // Use resolved raster bounds (shared seam) instead of ad-hoc canvas lookup
  const layerCanvas = ctx.layerCanvasesRef.current.get(layerId);
  const rasterBounds = getEffectiveRasterBounds(
    layer,
    layerCanvas,
    ctx.doc.canvas
  );
  // Compute the axis-aligned bounding box of the transformed layer
  const extents = getTransformedExtents(transform, rasterBounds);

  const cw = ctx.doc.canvas.width;
  const ch = ctx.doc.canvas.height;

  // Only show gizmo when the layer visually extends outside the canvas
  const extendsOutside =
    extents.x < 0 ||
    extents.y < 0 ||
    extents.x + extents.width > cw ||
    extents.y + extents.height > ch;
  if (!extendsOutside) {
    ctx.clearGizmo();
    return;
  }

  ctx.drawGizmo((gc, dpr, containerW, containerH) => {
    const r = docRectToScreen(
      extents.x,
      extents.y,
      extents.width,
      extents.height,
      cw,
      ch,
      ctx.zoom,
      ctx.pan,
      containerW,
      containerH,
      dpr
    );

    drawOffCanvasIndicator(gc, r, dpr);
  });
}

export class MoveTool implements ToolHandler {
  readonly toolId = "move" as const;

  /** Shared preview session — single source of truth for preview state. */
  private readonly session: PreviewSession = createPreviewSession();
  private moveStart: Point | null = null;
  private moveLayerStartTransform: LayerTransform = { x: 0, y: 0 };

  onActivate(ctx: ToolContext): void {
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
    this.moveStart = null;
    this.moveLayerStartTransform = { x: 0, y: 0 };
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

    // Ctrl+Alt: duplicate layer then move the duplicate
    if ((event.nativeEvent.ctrlKey || event.nativeEvent.metaKey) && event.nativeEvent.altKey) {
      useSketchStore.getState().duplicateLayer(activeLayer.id);
      const freshDoc = useSketchStore.getState().document;
      const dup = freshDoc.layers.find((l) => l.id === freshDoc.activeLayerId);
      if (dup) {
        moveTargetLayer = dup;
      }
    } else if (event.nativeEvent.altKey && ctx.onAutoPickLayer) {
      // Alt+click: auto-pick topmost non-transparent layer (affine-aware)
      for (let i = doc.layers.length - 1; i >= 0; i--) {
        const layer = doc.layers[i];
        const skipForHit =
          !isLayerCompositeVisible(doc.layers, layer, null) ||
          (layer.locked && !layer.imageReference);
        if (skipForHit) {
          continue;
        }
        const layerCanvas = ctx.layerCanvasesRef.current.get(layer.id);
        if (!layerCanvas) {
          continue;
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
        const picked = pickTopmostTransformableLayer(
          doc.layers,
          ctx.layerCanvasesRef.current,
          pt,
          null
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
    // preview and commit preserve existing scale/rotation/matrix state.
    this.moveLayerStartTransform = {
      x: moveTargetLayer.transform?.x ?? 0,
      y: moveTargetLayer.transform?.y ?? 0,
      scaleX: moveTargetLayer.transform?.scaleX ?? 1,
      scaleY: moveTargetLayer.transform?.scaleY ?? 1,
      rotation: moveTargetLayer.transform?.rotation ?? 0,
      matrix: moveTargetLayer.transform?.matrix
    };
    // Start the shared preview session with the full baseline transform.
    this.session.start(ctx, moveTargetLayer.id, { ...this.moveLayerStartTransform });
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
      // Use the shared merge contract so preview preserves the full
      // transform (scale/rotation/matrix) from the drag baseline.
      const previewTransform = mergeTransformPreview(
        this.moveLayerStartTransform,
        {
          x: Math.round(this.moveLayerStartTransform.x + dx),
          y: Math.round(this.moveLayerStartTransform.y + dy)
        }
      );
      // Update through the shared preview session — this writes to both
      // the compositing pipeline and the UI singleton in one call.
      this.session.update(ctx, previewTransform);
      this.refreshGizmo(ctx);
    }
  }

  onUp(ctx: ToolContext, _event?: ToolPointerEvent): void {
    const layerId = this.session.state.layerId;
    // Capture the final transform before commit clears the session so the
    // gizmo can draw at the correct position even though ctx.doc is stale.
    const committedTransform = this.session.isActive()
      ? { ...this.session.state.currentTransform }
      : null;
    // Commit through the shared session — persists to store, clears preview.
    this.session.commit(ctx);

    this.moveStart = null;
    this.moveLayerStartTransform = { x: 0, y: 0 };

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
  shortcut: "V",
  Icon: OpenWithIcon,
  group: "painting"
};
