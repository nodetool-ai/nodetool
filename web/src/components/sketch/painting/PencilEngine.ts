/**
 * PencilEngine — PaintEngine adapter for the existing pencil stroke utility.
 *
 * Wraps `drawPencilStroke` from drawingUtils. The pencil has no stabilizer,
 * no stamp state, and draws directly onto the layer canvas (no stroke
 * buffer) so that each pixel is written exactly once.
 */

import type { Point, PencilSettings } from "../types";
import type { PaintEngine, EngineCompositeOp, StrokeBufferMode } from "./PaintEngine";
import {
  drawPencilStroke as drawPencilStrokeUtil
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

  constructor(settings: PencilSettings) {
    this.settings = settings;
  }

  updateSettings(settings: PencilSettings): void {
    this.settings = settings;
  }

  beginStroke(): void {
    this.dirtyRect = { current: null };
  }

  stabilize(raw: Point): Point {
    return raw;
  }

  evaluate(
    from: Point,
    to: Point,
    ctx: CanvasRenderingContext2D,
    pressure: number,
    _branchIdx: number
  ): void {
    drawPencilStrokeUtil(
      from,
      to,
      this.settings,
      ctx,
      pressure,
      this.dirtyRect
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
