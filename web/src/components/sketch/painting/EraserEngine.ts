/**
 * EraserEngine — PaintEngine adapter for the existing eraser stroke utility.
 *
 * Wraps `drawEraserStroke` from drawingUtils. Brush mode uses the same stamp
 * as the Brush tool; pencil mode uses Pencil tool dabs. Uses a stroke buffer
 * with `destination-out` compositing so erased pixels are only removed when the
 * stroke is committed.
 */

import {
  type Point,
  type EraserSettings,
  type BrushSettings,
  type PencilSettings,
  DEFAULT_BRUSH_SETTINGS,
  DEFAULT_PENCIL_SETTINGS
} from "../types";
import type { PaintEngine, EngineCompositeOp, StrokeBufferMode } from "./PaintEngine";
import {
  drawEraserStroke as drawEraserStrokeUtil
} from "../drawingUtils";
import type { StrokeStampState, DirtyRectTracker } from "../drawingUtils";
import { StabilizerBuffer } from "./StabilizerBuffer";

export class EraserEngine implements PaintEngine {
  readonly engineId = "eraser";
  readonly compositeOp: EngineCompositeOp = "destination-out";
  readonly bufferMode: StrokeBufferMode = "buffered";
  readonly hasStabilizer = true;
  readonly dabOnDown = false;

  private eraser: EraserSettings;
  private brushTemplate: BrushSettings;
  private pencilTemplate: PencilSettings;
  private dirtyRect: DirtyRectTracker = { current: null };
  private stampStates: Map<number, StrokeStampState> = new Map();
  private stampCache: Map<string, HTMLCanvasElement> = new Map();
  private stab = new StabilizerBuffer();

  constructor(
    eraser: EraserSettings,
    brushTemplate: BrushSettings = DEFAULT_BRUSH_SETTINGS,
    pencilTemplate: PencilSettings = DEFAULT_PENCIL_SETTINGS
  ) {
    this.eraser = eraser;
    this.brushTemplate = brushTemplate;
    this.pencilTemplate = pencilTemplate;
  }

  updateSettings(
    eraser: EraserSettings,
    brushTemplate: BrushSettings,
    pencilTemplate: PencilSettings
  ): void {
    this.eraser = eraser;
    this.brushTemplate = brushTemplate;
    this.pencilTemplate = pencilTemplate;
  }

  beginStroke(): void {
    this.dirtyRect = { current: null };
    this.stampStates.clear();
    this.stab.reset();
  }

  stabilize(raw: Point): Point {
    return this.stab.apply(raw, this.eraser.stabilizer ?? 0);
  }

  evaluate(
    from: Point,
    to: Point,
    ctx: CanvasRenderingContext2D,
    pressure: number | undefined,
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
      this.eraser,
      this.brushTemplate,
      this.pencilTemplate,
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
