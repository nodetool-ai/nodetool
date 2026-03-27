/**
 * SegmentTool – tool handler for SAM-based object segmentation.
 *
 * In "point" mode, clicks add positive (left-click) or negative (Alt+click)
 * point prompts. In "box" mode, click-drag defines a bounding box prompt.
 *
 * The actual segmentation inference and mask preview are orchestrated by
 * the useSegmentation hook; this handler only collects user prompts and
 * draws overlay feedback on the canvas.
 */

import type { ToolHandler, ToolContext, ToolPointerEvent } from "./types";
import type { Point, SegmentPointPrompt, SegmentBoxPrompt } from "../types";

// ─── Overlay Rendering Constants ──────────────────────────────────────────────

const POINT_RADIUS = 6;
const POSITIVE_COLOR = "#22cc44";
const NEGATIVE_COLOR = "#ff4444";
const BOX_STROKE_COLOR = "#22aaff";
const BOX_FILL_COLOR = "rgba(34, 170, 255, 0.12)";
const BOX_LINE_WIDTH = 2;
const BOX_DASH_PATTERN = [6, 4];
/** Minimum box dimension in pixels to accept as a valid prompt (avoids accidental clicks). */
const MIN_BOX_SIZE = 3;

export class SegmentTool implements ToolHandler {
  readonly toolId = "segment" as const;

  // ── Collected prompts (reset on tool activate / deactivate) ──────────────
  private pointPrompts: SegmentPointPrompt[] = [];
  private boxPrompt: SegmentBoxPrompt | null = null;

  // ── Transient drag state for box mode ───────────────────────────────────
  private dragStart: Point | null = null;
  private dragCurrent: Point | null = null;
  private isDragging = false;

  // ── External callback wired by useSegmentation ──────────────────────────
  onPromptsChanged?: (
    points: SegmentPointPrompt[],
    box: SegmentBoxPrompt | null
  ) => void;

  // ─── Public accessors ───────────────────────────────────────────────────

  getPointPrompts(): ReadonlyArray<SegmentPointPrompt> {
    return this.pointPrompts;
  }

  getBoxPrompt(): SegmentBoxPrompt | null {
    return this.boxPrompt;
  }

  clearPrompts(): void {
    this.pointPrompts = [];
    this.boxPrompt = null;
    this.dragStart = null;
    this.dragCurrent = null;
    this.isDragging = false;
  }

  // ─── ToolHandler lifecycle ──────────────────────────────────────────────

  onActivate(_ctx: ToolContext): void {
    this.clearPrompts();
  }

  onDeactivate(_ctx: ToolContext): void {
    this.clearPrompts();
  }

  // ─── Pointer events ────────────────────────────────────────────────────

  onDown(ctx: ToolContext, event: ToolPointerEvent): boolean | void {
    const mode = ctx.doc.toolSettings.segment.promptMode;

    if (mode === "point") {
      const label: "positive" | "negative" = ctx.altHeldRef.current
        ? "negative"
        : "positive";
      this.pointPrompts.push({ x: event.point.x, y: event.point.y, label });
      this.notifyPromptsChanged();
      this.drawOverlay(ctx);
      return true;
    }

    if (mode === "box") {
      this.dragStart = { x: event.point.x, y: event.point.y };
      this.dragCurrent = { ...this.dragStart };
      this.isDragging = true;
      return true;
    }

    return false;
  }

  onMove(ctx: ToolContext, event: ToolPointerEvent): void {
    if (!this.isDragging || !this.dragStart) {
      return;
    }
    this.dragCurrent = { x: event.point.x, y: event.point.y };
    this.drawOverlay(ctx);
  }

  onUp(ctx: ToolContext, _event: ToolPointerEvent): void {
    if (!this.isDragging || !this.dragStart || !this.dragCurrent) {
      return;
    }

    const x = Math.min(this.dragStart.x, this.dragCurrent.x);
    const y = Math.min(this.dragStart.y, this.dragCurrent.y);
    const width = Math.abs(this.dragCurrent.x - this.dragStart.x);
    const height = Math.abs(this.dragCurrent.y - this.dragStart.y);

    // Only set box if it has meaningful size
    if (width > MIN_BOX_SIZE && height > MIN_BOX_SIZE) {
      this.boxPrompt = { x, y, width, height };
      this.notifyPromptsChanged();
    }

    this.isDragging = false;
    this.dragStart = null;
    this.dragCurrent = null;
    this.drawOverlay(ctx);
  }

  // ─── Overlay Drawing ────────────────────────────────────────────────────

  drawOverlay(ctx: ToolContext): void {
    const overlayCanvas = ctx.overlayCanvasRef.current;
    if (!overlayCanvas) {
      return;
    }
    const oc = overlayCanvas.getContext("2d");
    if (!oc) {
      return;
    }

    ctx.clearOverlay();

    oc.save();
    // Apply zoom and pan so prompts are in canvas space
    oc.setTransform(ctx.zoom, 0, 0, ctx.zoom, ctx.pan.x, ctx.pan.y);

    // Draw point prompts
    for (const pt of this.pointPrompts) {
      oc.beginPath();
      oc.arc(pt.x, pt.y, POINT_RADIUS / ctx.zoom, 0, Math.PI * 2);
      oc.fillStyle = pt.label === "positive" ? POSITIVE_COLOR : NEGATIVE_COLOR;
      oc.fill();
      oc.strokeStyle = "#ffffff";
      oc.lineWidth = 1.5 / ctx.zoom;
      oc.stroke();
    }

    // Draw box prompt or in-progress drag
    const box = this.isDragging && this.dragStart && this.dragCurrent
      ? {
          x: Math.min(this.dragStart.x, this.dragCurrent.x),
          y: Math.min(this.dragStart.y, this.dragCurrent.y),
          width: Math.abs(this.dragCurrent.x - this.dragStart.x),
          height: Math.abs(this.dragCurrent.y - this.dragStart.y)
        }
      : this.boxPrompt;

    if (box && box.width > 0 && box.height > 0) {
      oc.setLineDash(BOX_DASH_PATTERN.map((v) => v / ctx.zoom));
      oc.strokeStyle = BOX_STROKE_COLOR;
      oc.lineWidth = BOX_LINE_WIDTH / ctx.zoom;
      oc.strokeRect(box.x, box.y, box.width, box.height);
      oc.fillStyle = BOX_FILL_COLOR;
      oc.fillRect(box.x, box.y, box.width, box.height);
      oc.setLineDash([]);
    }

    oc.restore();
  }

  // ─── Internal ───────────────────────────────────────────────────────────

  private notifyPromptsChanged(): void {
    this.onPromptsChanged?.(
      [...this.pointPrompts],
      this.boxPrompt ? { ...this.boxPrompt } : null
    );
  }
}
