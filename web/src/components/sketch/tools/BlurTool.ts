/**
 * BlurTool – paints a blur effect using a snapshot of the layer as source.
 *
 * Delegates all shared stroke lifecycle (coordinate mapping, alpha-lock,
 * dirty-rect, pressure, selection clipping, onStrokeStart/onStrokeEnd)
 * to HelperToolSession. Only blur-specific draw logic lives here.
 */

import type { ToolHandler, ToolContext, ToolPointerEvent, ToolDefinition } from "./types";
import type { BlurSettings, Point } from "../types";
import BlurOnIcon from "@mui/icons-material/BlurOn";
import {
  drawBlurStroke as drawBlurStrokeUtil
} from "../drawingUtils";
import type { BlurTempCanvases } from "../drawingUtils";
import { HelperToolSession } from "../painting/HelperToolSession";
import type { HelperSetupInfo, HelperDrawInfo } from "../painting/HelperToolSession";

export class BlurTool implements ToolHandler {
  readonly toolId = "blur" as const;
  readonly showsBrushCursor = true;

  // Blur-specific state
  private blurSourceCanvas: HTMLCanvasElement | null = null;
  private blurTempCanvases: BlurTempCanvases = { tmp: null, blurred: null, mask: null };

  // Shared session
  private session = new HelperToolSession({
    onSetup: (ctx, info) => this.handleSetup(ctx, info),
    onDraw: (info) => this.handleDraw(info),
    onTeardown: () => this.handleTeardown(),
    useSelectionClipOnMove: true
  });

  // ── Drawing wrapper ──────────────────────────────────────────────────

  private drawBlurStroke(
    from: Point,
    to: Point,
    settings: BlurSettings,
    layerCanvas: HTMLCanvasElement
  ): void {
    const sourceCanvas = this.blurSourceCanvas ?? layerCanvas;
    drawBlurStrokeUtil(
      from,
      to,
      settings,
      layerCanvas,
      sourceCanvas,
      this.session.dirtyRectTracker,
      this.blurTempCanvases
    );
  }

  // ── HelperToolSession callbacks ──────────────────────────────────────

  private handleSetup(
    ctx: ToolContext,
    info: HelperSetupInfo
  ): boolean {
    // No source snapshot: blur reads from the current layer state on each dab,
    // allowing the effect to accumulate as the user paints continuously.
    this.blurSourceCanvas = null;

    const { doc } = ctx;
    const localPt = info.mapper.docToLayer(info.point);

    if (info.isShiftLine && info.lastStrokeEnd) {
      // Shift+click: straight line from last stroke end
      const from = info.mapper.docToLayer(info.lastStrokeEnd);
      this.drawBlurStroke(from, localPt, doc.toolSettings.blur, info.layerCanvas);
    } else {
      // Initial dab
      this.drawBlurStroke(localPt, localPt, doc.toolSettings.blur, info.layerCanvas);
    }

    return true;
  }

  private handleDraw(
    info: HelperDrawInfo
  ): void {
    const { doc } = info.ctx;
    this.drawBlurStroke(info.localFrom, info.localTo, doc.toolSettings.blur, info.layerCanvas);
  }

  private handleTeardown(): void {
    this.blurSourceCanvas = null;
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
  tool: "blur",
  label: "Blur",
  shortcut: "Q",
  Icon: BlurOnIcon,
  group: "painting"
};
