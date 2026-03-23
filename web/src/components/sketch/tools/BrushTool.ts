/**
 * BrushTool – full-featured brush using the shared PaintSession.
 *
 * Delegates all stroke lifecycle, coordinate mapping, buffer management,
 * alpha-lock, and dirty-rect tracking to PaintSession + BrushEngine.
 */

import type { ToolHandler, ToolContext, ToolPointerEvent } from "./types";
import { PaintSession, BrushEngine } from "../painting";

export class BrushTool implements ToolHandler {
  readonly toolId = "brush" as const;

  private engine = new BrushEngine({
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
    // Update engine settings from the current document state
    this.engine.updateSettings(ctx.doc.toolSettings.brush);
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
