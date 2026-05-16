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
      this.refreshGizmo(ctx);
    }
  }

  onUp(ctx: ToolContext, _event?: ToolPointerEvent): void {
    const layerId = this.session.state.layerId;
    // Capture the final transform before commit clears the session so the
    // gizmo can draw at the correct position even though ctx.doc is stale.
    const committedTransform = this.session.isActive()
      ? cloneTransform(this.session.state.currentTransform)
      : null;
    this.session.commit(ctx);

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
