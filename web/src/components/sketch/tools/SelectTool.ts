/**
 * SelectTool – rectangular selection: draw, move, add (shift), subtract (alt).
 *
 * Extracted from usePointerHandlers:
 *   handlePointerDown (~line 951-978)
 *   handlePointerMove (~line 1193-1213)
 *   handlePointerUp   (~line 1472-1528)
 */

import type { ToolHandler, ToolContext, ToolPointerEvent } from "./types";
import type { Point, Selection } from "../types";
import {
  selectionHitTest,
  rectSelectionMask,
  combineMasks,
  offsetSelectionByDocumentDelta,
  cloneSelectionMask,
} from "../selection/selectionMask";

export class SelectTool implements ToolHandler {
  readonly toolId = "select" as const;

  private selectStart: Point | null = null;
  private isMovingSelection = false;
  private moveSelectionOrigin: Point | null = null;
  private selectionAtMoveStart: Selection | null = null;

  onDown(ctx: ToolContext, event: ToolPointerEvent): boolean | void {
    const pt = event.point;
    const { selection } = ctx;

    // Check if clicking inside an existing selection — start moving it
    if (
      selection &&
      !ctx.shiftHeldRef.current &&
      !ctx.altHeldRef.current &&
      selectionHitTest(selection, pt.x, pt.y)
    ) {
      this.isMovingSelection = true;
      this.moveSelectionOrigin = pt;
      this.selectionAtMoveStart = cloneSelectionMask(selection);
      return true;
    }

    // Otherwise draw a new selection (Shift=add, Alt=subtract handled on pointerUp)
    this.selectStart = pt;
    if (!ctx.shiftHeldRef.current && !ctx.altHeldRef.current) {
      ctx.onSelectionChange?.(null);
    }
    return true;
  }

  onMove(ctx: ToolContext, event: ToolPointerEvent, _coalescedPoints?: ToolPointerEvent[]): void {
    const pt = event.point;

    if (
      this.isMovingSelection &&
      this.moveSelectionOrigin &&
      this.selectionAtMoveStart
    ) {
      const dx = Math.round(pt.x - this.moveSelectionOrigin.x);
      const dy = Math.round(pt.y - this.moveSelectionOrigin.y);
      ctx.onSelectionChange?.(
        offsetSelectionByDocumentDelta(this.selectionAtMoveStart, dx, dy)
      );
      return;
    }

    if (this.selectStart) {
      ctx.drawOverlaySelection(this.selectStart, pt);
    }
  }

  onUp(ctx: ToolContext, _event?: ToolPointerEvent): void {
    // Finalize selection movement
    if (this.isMovingSelection) {
      this.isMovingSelection = false;
      this.moveSelectionOrigin = null;
      this.selectionAtMoveStart = null;
      return;
    }

    if (!this.selectStart) {
      return;
    }

    const pt = ctx.screenToCanvas(
      ctx.mousePositionRef.current.x +
        (ctx.containerRef.current?.getBoundingClientRect().left ?? 0),
      ctx.mousePositionRef.current.y +
        (ctx.containerRef.current?.getBoundingClientRect().top ?? 0)
    );
    const x = Math.round(Math.min(this.selectStart.x, pt.x));
    const y = Math.round(Math.min(this.selectStart.y, pt.y));
    const w = Math.round(Math.abs(pt.x - this.selectStart.x));
    const h = Math.round(Math.abs(pt.y - this.selectStart.y));
    ctx.clearOverlay();
    this.selectStart = null;

    if (w > 1 && h > 1 && ctx.onSelectionChange) {
      const docW = ctx.doc.width;
      const docH = ctx.doc.height;
      const newSel = rectSelectionMask(docW, docH, x, y, w, h);
      const { selection } = ctx;
      if (ctx.shiftHeldRef.current && selection) {
        // Shift+drag: union
        ctx.onSelectionChange(combineMasks(selection, newSel, "add"));
      } else if (ctx.altHeldRef.current && selection) {
        // Alt+drag: subtract
        ctx.onSelectionChange(combineMasks(selection, newSel, "subtract"));
      } else {
        ctx.onSelectionChange(newSel);
      }
    }
  }
}
