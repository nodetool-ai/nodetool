/**
 * PencilTool – simple pixel pencil using the shared PaintSession.
 *
 * Delegates all stroke lifecycle, coordinate mapping, and dirty-rect
 * tracking to PaintSession + PencilEngine.
 */

import type { ToolHandler, ToolContext, ToolPointerEvent, ToolDefinition } from "./types";
import { PaintSession, PencilEngine } from "../painting";
import { DEFAULT_PENCIL_SETTINGS, mergePenPressureIntoPencil } from "../types";
import CreateIcon from "@mui/icons-material/Create";

export class PencilTool implements ToolHandler {
  readonly toolId = "pencil" as const;

  private engine = new PencilEngine({
    ...DEFAULT_PENCIL_SETTINGS,
    size: 1,
    opacity: 1,
    color: "#000000"
  });

  private session = new PaintSession(this.engine);

  // ── Handlers ─────────────────────────────────────────────────────────

  onDown(ctx: ToolContext, event: ToolPointerEvent): boolean | void {
    const { pencil, penPressure } = ctx.doc.toolSettings;
    this.engine.updateSettings(mergePenPressureIntoPencil(pencil, penPressure));
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
  tool: "pencil",
  label: "Pencil",
  shortcut: "P",
  Icon: CreateIcon,
  group: "painting"
};
