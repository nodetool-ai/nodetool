/**
 * BrushTool – full-featured brush using the shared PaintSession.
 *
 * Delegates all stroke lifecycle, coordinate mapping, buffer management,
 * alpha-lock, and dirty-rect tracking to PaintSession + BrushEngine.
 */

import type { ToolHandler, ToolContext, ToolPointerEvent, ToolDefinition } from "./types";
import { PaintSession, BrushEngine } from "../painting";
import { DEFAULT_BRUSH_SETTINGS, mergePenPressureIntoBrush } from "../types";
import BrushIcon from "@mui/icons-material/Brush";

export class BrushTool implements ToolHandler {
  readonly toolId = "brush" as const;
  readonly showsBrushCursor = true;
  readonly showsActiveStrokePreview = true;

  private engine = new BrushEngine({
    ...DEFAULT_BRUSH_SETTINGS,
    size: 10,
    opacity: 1,
    hardness: 0.8,
    color: "#000000",
    brushType: "round",
    pressureSensitivity: true,
    pressureAffects: "size",
    roundness: 1,
    angle: 0
  });

  private session = new PaintSession(this.engine);

  // ── Handlers ─────────────────────────────────────────────────────────

  onDown(ctx: ToolContext, event: ToolPointerEvent): boolean | void {
    const { brush, penPressure } = ctx.doc.toolSettings;
    this.engine.updateSettings(mergePenPressureIntoBrush(brush, penPressure));
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
  tool: "brush",
  label: "Brush",
  shortcut: "B",
  Icon: BrushIcon,
  group: "painting"
};
