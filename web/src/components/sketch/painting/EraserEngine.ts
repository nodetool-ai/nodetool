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
  DEFAULT_PENCIL_SETTINGS,
  resolveStrokeAssistSettings
} from "../types";
import type {
  PaintEngine,
  EngineCompositeOp,
  StrokeBufferMode,
  EngineAssistMode
} from "./PaintEngine";
import {
  drawEraserStroke as drawEraserStrokeUtil
} from "../drawingUtils";
import type { StrokeStampState } from "../drawingUtils";
import type { DirtyRectBox } from "../rendering/canvasUtils";
import { StrokeDirtyRegion } from "./StrokeDirtyRegion";
import { StrokeAssist } from "./StrokeAssist";

export class EraserEngine implements PaintEngine {
  readonly engineId = "eraser";
  readonly compositeOp: EngineCompositeOp = "destination-out";
  readonly bufferMode: StrokeBufferMode = "buffered";
  readonly hasStabilizer = true;
  readonly dabOnDown = false;

  private eraser: EraserSettings;
  private brushTemplate: BrushSettings;
  private pencilTemplate: PencilSettings;
  private dirty = new StrokeDirtyRegion();
  private stampStates: Map<number, StrokeStampState> = new Map();
  private stampCache: Map<string, HTMLCanvasElement> = new Map();
  private assist = new StrokeAssist();

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
    this.dirty.reset();
    this.stampStates.clear();
    this.assist.reset();
  }

  stabilize(raw: Point): Point {
    return this.assist.apply(
      raw,
      resolveStrokeAssistSettings(
        this.eraser.stabilizer,
        this.eraser.strokeAssist
      )
    );
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
    this.dirty.track((tracker) =>
      drawEraserStrokeUtil(
        from,
        to,
        this.eraser,
        this.brushTemplate,
        this.pencilTemplate,
        ctx,
        pressure,
        tracker,
        this.stampCache,
        stampState
      )
    );
  }

  getDirtyRect(): DirtyRectBox | null {
    return this.dirty.strokeRect;
  }

  takeFrameDirtyRect(): DirtyRectBox | null {
    return this.dirty.takeFrameRect();
  }

  getAssistMode(): EngineAssistMode {
    return resolveStrokeAssistSettings(
      this.eraser.stabilizer,
      this.eraser.strokeAssist
    ).mode;
  }
}
