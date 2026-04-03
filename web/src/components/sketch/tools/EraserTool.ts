/**
 * EraserTool – uses destination-out composite via shared PaintSession.
 *
 * Delegates all stroke lifecycle, coordinate mapping, buffer management,
 * and dirty-rect tracking to PaintSession + EraserEngine.
 */

import type { ToolHandler, ToolContext, ToolPointerEvent, ToolDefinition } from "./types";
import { PaintSession, EraserEngine } from "../painting";
import AutoFixNormalIcon from "@mui/icons-material/AutoFixNormal";
import {
  DEFAULT_ERASER_SETTINGS,
  DEFAULT_BRUSH_SETTINGS,
  DEFAULT_PENCIL_SETTINGS,
  mergePenPressureIntoBrush,
  mergePenPressureIntoPencil
} from "../types";

export class EraserTool implements ToolHandler {
  readonly toolId = "eraser" as const;

  private engine = new EraserEngine(
    DEFAULT_ERASER_SETTINGS,
    DEFAULT_BRUSH_SETTINGS,
    DEFAULT_PENCIL_SETTINGS
  );

  private session = new PaintSession(this.engine);

  // ── Handlers ─────────────────────────────────────────────────────────

  onDown(ctx: ToolContext, event: ToolPointerEvent): boolean | void {
    const { eraser, brush, pencil, penPressure } = ctx.doc.toolSettings;
    this.engine.updateSettings(
      eraser,
      mergePenPressureIntoBrush(brush, penPressure),
      mergePenPressureIntoPencil(pencil, penPressure)
    );
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
  tool: "eraser",
  label: "Eraser",
  shortcut: "E",
  Icon: AutoFixNormalIcon,
  group: "painting"
};
