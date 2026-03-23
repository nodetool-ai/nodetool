/**
 * EraserTool – uses destination-out composite via shared PaintSession.
 *
 * Delegates all stroke lifecycle, coordinate mapping, buffer management,
 * and dirty-rect tracking to PaintSession + EraserEngine.
 */

import type { ToolHandler, ToolContext, ToolPointerEvent } from "./types";
import { PaintSession, EraserEngine } from "../painting";

export class EraserTool implements ToolHandler {
  readonly toolId = "eraser" as const;

  private engine = new EraserEngine({
    size: 20,
    opacity: 1,
    hardness: 0.8
  });

  private session = new PaintSession(this.engine);

  // ── Handlers ─────────────────────────────────────────────────────────

  onDown(ctx: ToolContext, event: ToolPointerEvent): boolean | void {
    this.engine.updateSettings(ctx.doc.toolSettings.eraser);
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
