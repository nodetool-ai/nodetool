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
      pt.x >= selection.x &&
      pt.x < selection.x + selection.width &&
      pt.y >= selection.y &&
      pt.y < selection.y + selection.height
    ) {
      this.isMovingSelection = true;
      this.moveSelectionOrigin = pt;
      this.selectionAtMoveStart = { ...selection };
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
      const dx = pt.x - this.moveSelectionOrigin.x;
      const dy = pt.y - this.moveSelectionOrigin.y;
      const orig = this.selectionAtMoveStart;
      ctx.onSelectionChange?.({
        x: Math.round(orig.x + dx),
        y: Math.round(orig.y + dy),
        width: orig.width,
        height: orig.height
      });
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
      const newRect = { x, y, width: w, height: h };
      const { selection } = ctx;
      if (ctx.shiftHeldRef.current && selection) {
        // Shift+drag: union
        const ux = Math.min(selection.x, newRect.x);
        const uy = Math.min(selection.y, newRect.y);
        const ux2 = Math.max(
          selection.x + selection.width,
          newRect.x + newRect.width
        );
        const uy2 = Math.max(
          selection.y + selection.height,
          newRect.y + newRect.height
        );
        ctx.onSelectionChange({
          x: ux,
          y: uy,
          width: ux2 - ux,
          height: uy2 - uy
        });
      } else if (ctx.altHeldRef.current && selection) {
        // Alt+drag: subtract
        const sx1 = selection.x;
        const sy1 = selection.y;
        const sx2 = selection.x + selection.width;
        const sy2 = selection.y + selection.height;
        const nx1 = newRect.x;
        const ny1 = newRect.y;
        const nx2 = newRect.x + newRect.width;
        const ny2 = newRect.y + newRect.height;
        if (nx1 <= sx1 && ny1 <= sy1 && nx2 >= sx2 && ny2 >= sy2) {
          ctx.onSelectionChange(null);
        } else {
          // Partial overlap: keep existing selection unchanged
          ctx.onSelectionChange(selection);
        }
      } else {
        ctx.onSelectionChange(newRect);
      }
    }
  }
}
