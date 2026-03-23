/**
 * BrushEngine — PaintEngine adapter for the existing brush stroke utility.
 *
 * Wraps `drawBrushStroke` from drawingUtils to conform to the shared
 * PaintEngine interface. Owns the stabilizer, stamp state per symmetry
 * branch, and stamp cache (persistent across strokes for perf).
 */

import type { Point, BrushSettings } from "../types";
import type { PaintEngine, EngineCompositeOp, StrokeBufferMode } from "./PaintEngine";
import {
  drawBrushStroke as drawBrushStrokeUtil
} from "../drawingUtils";
import type { StrokeStampState, DirtyRectTracker } from "../drawingUtils";

const STABILIZER_WINDOW = 4;

export class BrushEngine implements PaintEngine {
  readonly engineId = "brush";
  readonly compositeOp: EngineCompositeOp = "source-over";
  readonly bufferMode: StrokeBufferMode = "buffered";
  readonly hasStabilizer = true;
  readonly dabOnDown = false;

  private settings: BrushSettings;
  private dirtyRect: DirtyRectTracker = { current: null };
  private stampStates: Map<number, StrokeStampState> = new Map();
  private stampCache: Map<string, HTMLCanvasElement> = new Map();
  private stabilizerBuffer: Point[] = [];

  constructor(settings: BrushSettings) {
    this.settings = settings;
  }

  /** Update settings (e.g. between strokes if user changes brush). */
  updateSettings(settings: BrushSettings): void {
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
    drawBrushStrokeUtil(
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
