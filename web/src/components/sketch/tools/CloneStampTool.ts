/**
 * CloneStampTool – clones pixels from a source point to the brush location.
 *
 * Delegates all shared stroke lifecycle (coordinate mapping, alpha-lock,
 * dirty-rect, pressure, onStrokeStart/onStrokeEnd) to HelperToolSession.
 * Only clone-specific source setup and draw logic lives here.
 */

import type { ToolHandler, ToolContext, ToolPointerEvent, ToolDefinition } from "./types";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import {
  getAncestorGroupOpacityProduct,
  isLayerCompositeVisible,
  type Point
} from "../types";
import {
  drawCloneStampStroke as drawCloneStampStrokeUtil,
  blendModeToComposite
} from "../drawingUtils";
import { HelperToolSession } from "../painting/HelperToolSession";
import type { HelperSetupInfo, HelperDrawInfo } from "../painting/HelperToolSession";
import { getLayerCompositeOffset } from "../painting/layerBounds";

export class CloneStampTool implements ToolHandler {
  readonly toolId = "clone_stamp" as const;
  readonly showsBrushCursor = true;

  // Clone-specific state
  private cloneSource: Point | null = null;
  /** Document-space delta (clone source − first stroke point); used with composited sampling. */
  private cloneDeltaDoc: Point | null = null;
  /** Backing-raster delta; used with active-layer sampling. */
  private cloneDeltaLayer: Point | null = null;
  private cloneSourceCanvas: HTMLCanvasElement | null = null;

  // Shared session
  private session = new HelperToolSession({
    onSetup: (ctx, info) => this.handleSetup(ctx, info),
    onDraw: (info) => this.handleDraw(info),
    onTeardown: () => this.handleTeardown(),
    useSelectionClipOnMove: false
  });

  // ── Helpers ───────────────────────────────────────────────────────────

  private snapPoint(point: Point): Point {
    return {
      x: Math.round(point.x),
      y: Math.round(point.y)
    };
  }

  private drawCloneStampStroke(
    from: Point,
    to: Point,
    settings: import("../types").CloneStampSettings,
    ctx: CanvasRenderingContext2D
  ): void {
    const sourceCanvas = this.cloneSourceCanvas;
    const mapper = this.session.coordinateMapper;
    if (!sourceCanvas || !mapper) {
      return;
    }
    if (settings.sampling === "composited") {
      if (!this.cloneDeltaDoc) {
        return;
      }
      drawCloneStampStrokeUtil(
        from,
        to,
        settings,
        ctx,
        sourceCanvas,
        this.cloneDeltaDoc,
        { layerToDoc: (p) => mapper.layerToDoc(p) }
      );
    } else {
      if (!this.cloneDeltaLayer) {
        return;
      }
      drawCloneStampStrokeUtil(
        from,
        to,
        settings,
        ctx,
        sourceCanvas,
        this.cloneDeltaLayer
      );
    }
  }

  /**
   * Set the clone source point. Called externally when Alt+click is detected
   * by the pointer handler dispatcher.
   */
  setCloneSource(point: Point): void {
    this.cloneSource = this.snapPoint(point);
    this.cloneDeltaDoc = null;
    this.cloneDeltaLayer = null;
  }

  /** Returns the current clone source point (for overlay rendering). */
  getCloneSource(): Point | null {
    return this.cloneSource;
  }

  // ── HelperToolSession callbacks ──────────────────────────────────────

  private handleSetup(ctx: ToolContext, info: HelperSetupInfo): boolean {
    if (!this.cloneSource) {
      return false;
    }

    const { doc } = ctx;
    const snappedPt = this.snapPoint(info.point);

    // Compute document-space and layer-space deltas for clone offset.
    this.cloneDeltaDoc = {
      x: this.cloneSource.x - snappedPt.x,
      y: this.cloneSource.y - snappedPt.y
    };
    const srcL = info.mapper.docToLayer(this.cloneSource);
    const dstL = info.mapper.docToLayer(snappedPt);
    this.cloneDeltaLayer = {
      x: Math.round(srcL.x - dstL.x),
      y: Math.round(srcL.y - dstL.y)
    };

    // Create source canvas snapshot
    const settings = doc.toolSettings.cloneStamp;
    if (settings.sampling === "composited") {
      const tmp = window.document.createElement("canvas");
      tmp.width = doc.canvas.width;
      tmp.height = doc.canvas.height;
      const tmpCtx = tmp.getContext("2d", { willReadFrequently: true });
      if (tmpCtx) {
        for (const layer of doc.layers) {
          if (layer.type === "mask") {
            continue;
          }
          if (!isLayerCompositeVisible(doc.layers, layer, null)) {
            continue;
          }
          const lc = ctx.layerCanvasesRef.current.get(layer.id);
          if (lc) {
            const compositeOffset = getLayerCompositeOffset(
              layer,
              { width: lc.width, height: lc.height },
              lc
            );
            tmpCtx.save();
            tmpCtx.globalAlpha =
              layer.opacity *
              getAncestorGroupOpacityProduct(doc.layers, layer, null);
            tmpCtx.globalCompositeOperation = blendModeToComposite(
              layer.blendMode || "normal"
            );
            tmpCtx.drawImage(lc, compositeOffset.x, compositeOffset.y);
            tmpCtx.restore();
          }
        }
      }
      this.cloneSourceCanvas = tmp;
    } else {
      const layerCanvas = ctx.getOrCreateLayerCanvas(info.layer.id);
      const snapshot = window.document.createElement("canvas");
      snapshot.width = layerCanvas.width;
      snapshot.height = layerCanvas.height;
      const snapCtx = snapshot.getContext("2d", { willReadFrequently: true });
      if (snapCtx) {
        snapCtx.drawImage(layerCanvas, 0, 0);
      }
      this.cloneSourceCanvas = snapshot;
    }

    // Initial dab (map document-space point to layer-local)
    const localPt = info.mapper.docToLayer(snappedPt);
    this.drawCloneStampStroke(localPt, localPt, doc.toolSettings.cloneStamp, info.paintCtx);

    return true;
  }

  private handleDraw(info: HelperDrawInfo): void {
    const { doc } = info.ctx;
    const snappedFrom = this.snapPoint(info.docFrom);
    const snappedTo = this.snapPoint(info.docTo);
    const mapper = this.session.coordinateMapper;
    if (!mapper) {
      return;
    }
    const localFrom = mapper.docToLayer(snappedFrom);
    const localTo = mapper.docToLayer(snappedTo);
    this.drawCloneStampStroke(localFrom, localTo, doc.toolSettings.cloneStamp, info.paintCtx);
  }

  private handleTeardown(): void {
    this.cloneSourceCanvas = null;
  }

  // ── Handlers ─────────────────────────────────────────────────────────

  onDown(ctx: ToolContext, event: ToolPointerEvent): boolean | void {
    return this.session.begin(ctx, event);
  }

  onMove(
    ctx: ToolContext,
    event: ToolPointerEvent,
    coalescedPoints: ToolPointerEvent[]
  ): void {
    this.session.move(ctx, event, coalescedPoints);
  }

  onUp(ctx: ToolContext, event: ToolPointerEvent): void {
    this.session.end(ctx, event);
  }
}

export const definition: ToolDefinition = {
  tool: "clone_stamp",
  label: "Clone Stamp",
  shortcut: "S",
  Icon: ContentCopyIcon,
  group: "painting"
};
