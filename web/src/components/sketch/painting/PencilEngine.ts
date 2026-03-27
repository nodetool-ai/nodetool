/**
 * PencilEngine — PaintEngine adapter for the existing pencil stroke utility.
 *
 * Wraps `drawPencilStroke` from drawingUtils. The pencil has no stabilizer,
 * uses per-branch distance-based stamping (like the brush) so stroke density
 * depends on path length, not pointer event rate, and draws directly onto the
 * layer canvas (no stroke buffer).
 */

import type { Point, PencilSettings } from "../types";
import type { PaintEngine, EngineCompositeOp, StrokeBufferMode } from "./PaintEngine";
import {
  drawPencilStroke as drawPencilStrokeUtil,
  type StrokeStampState
} from "../drawingUtils";
import type { DirtyRectTracker } from "../drawingUtils";

export class PencilEngine implements PaintEngine {
  readonly engineId = "pencil";
  readonly compositeOp: EngineCompositeOp = "source-over";
  readonly bufferMode: StrokeBufferMode = "direct";
  readonly hasStabilizer = false;
  readonly dabOnDown = true;

  private settings: PencilSettings;
  private dirtyRect: DirtyRectTracker = { current: null };
  private stampStates: Map<number, StrokeStampState> = new Map();

  constructor(settings: PencilSettings) {
    this.settings = settings;
  }

  updateSettings(settings: PencilSettings): void {
    this.settings = settings;
  }

  beginStroke(): void {
    this.dirtyRect = { current: null };
    this.stampStates.clear();
  }

  stabilize(raw: Point): Point {
    // Snap to pixel centers for crisp pixel-art drawing
    return { x: Math.round(raw.x), y: Math.round(raw.y) };
  }

  evaluate(
    from: Point,
    to: Point,
    ctx: CanvasRenderingContext2D,
    pressure: number | undefined,
    branchIdx: number
  ): void {
    // Snap coordinates to integer pixels
    const snappedFrom = { x: Math.round(from.x), y: Math.round(from.y) };
    const snappedTo = { x: Math.round(to.x), y: Math.round(to.y) };
    let stampState = this.stampStates.get(branchIdx);
    if (!stampState) {
      stampState = { hasStamped: false, distanceToNextDab: 0 };
      this.stampStates.set(branchIdx, stampState);
    }
    drawPencilStrokeUtil(
      snappedFrom,
      snappedTo,
      this.settings,
      ctx,
      pressure,
      this.dirtyRect,
      stampState
    );
  }

  getDirtyRect(): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } | null {
    return this.dirtyRect.current ?? null;
  }
}
