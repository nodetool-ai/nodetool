/**
 * EraserEngine — PaintEngine adapter for the existing eraser stroke utility.
 *
 * Wraps `drawEraserStroke` from drawingUtils. Uses a stroke buffer with
 * `destination-out` compositing so erased pixels are only removed when the
 * stroke is committed.
 */

import type { Point, EraserSettings } from "../types";
import type { PaintEngine, EngineCompositeOp, StrokeBufferMode } from "./PaintEngine";
import {
  drawEraserStroke as drawEraserStrokeUtil
} from "../drawingUtils";
import type { StrokeStampState, DirtyRectTracker } from "../drawingUtils";

const STABILIZER_WINDOW = 4;

export class EraserEngine implements PaintEngine {
  readonly engineId = "eraser";
  readonly compositeOp: EngineCompositeOp = "destination-out";
  readonly bufferMode: StrokeBufferMode = "buffered";
  readonly hasStabilizer = true;
  readonly dabOnDown = false;

  private settings: EraserSettings;
  private dirtyRect: DirtyRectTracker = { current: null };
  private stampStates: Map<number, StrokeStampState> = new Map();
  private stampCache: Map<string, HTMLCanvasElement> = new Map();
  private stabilizerBuffer: Point[] = [];

  constructor(settings: EraserSettings) {
    this.settings = settings;
  }

  updateSettings(settings: EraserSettings): void {
    this.settings = settings;
  }

  beginStroke(): void {
    this.dirtyRect = { current: null };
    this.stampStates.clear();
    this.stabilizerBuffer = [];
  }

  stabilize(raw: Point): Point {
    this.stabilizerBuffer.push(raw);
    if (this.stabilizerBuffer.length > STABILIZER_WINDOW) {
      this.stabilizerBuffer.shift();
    }
    if (this.stabilizerBuffer.length === 1) {
      return raw;
    }
    let sx = 0;
    let sy = 0;
    for (const p of this.stabilizerBuffer) {
      sx += p.x;
      sy += p.y;
    }
    return {
      x: sx / this.stabilizerBuffer.length,
      y: sy / this.stabilizerBuffer.length
    };
  }

  evaluate(
    from: Point,
    to: Point,
    ctx: CanvasRenderingContext2D,
    pressure: number,
    branchIdx: number
  ): void {
    let stampState = this.stampStates.get(branchIdx);
    if (!stampState) {
      stampState = { hasStamped: false, distanceToNextDab: 0 };
      this.stampStates.set(branchIdx, stampState);
    }
    drawEraserStrokeUtil(
      from,
      to,
      this.settings,
      ctx,
      pressure,
      this.dirtyRect,
      this.stampCache,
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
