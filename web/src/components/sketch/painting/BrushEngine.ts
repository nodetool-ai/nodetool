/**
 * BrushEngine — PaintEngine adapter for the existing brush stroke utility.
 *
 * Wraps `drawBrushStroke` from drawingUtils to conform to the shared
 * PaintEngine interface. Owns the stabilizer, stamp state per symmetry
 * branch, and stamp cache (persistent across strokes for perf).
 */

import type { Point, BrushSettings } from "../types";
import { resolveStrokeAssistSettings } from "../types";
import type {
  PaintEngine,
  EngineCompositeOp,
  StrokeBufferMode,
  EngineAssistMode
} from "./PaintEngine";
import {
  drawBrushStroke as drawBrushStrokeUtil
} from "../drawingUtils";
import type { StrokeStampState } from "../drawingUtils";
import type { DirtyRectBox } from "../rendering/canvasUtils";
import { StrokeDirtyRegion } from "./StrokeDirtyRegion";
import { StrokeAssist } from "./StrokeAssist";

export class BrushEngine implements PaintEngine {
  readonly engineId = "brush";
  readonly compositeOp: EngineCompositeOp = "source-over";
  readonly bufferMode: StrokeBufferMode = "buffered";
  readonly hasStabilizer = true;
  readonly dabOnDown = false;

  private settings: BrushSettings;
  private dirty = new StrokeDirtyRegion();
  private stampStates: Map<number, StrokeStampState> = new Map();
  private stampCache: Map<string, HTMLCanvasElement> = new Map();
  private assist = new StrokeAssist();

  constructor(settings: BrushSettings) {
    this.settings = settings;
  }

  /** Update settings (e.g. between strokes if user changes brush). */
  updateSettings(settings: BrushSettings): void {
    this.settings = settings;
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
        this.settings.stabilizer,
        this.settings.strokeAssist
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
      drawBrushStrokeUtil(
        from,
        to,
        this.settings,
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
      this.settings.stabilizer,
      this.settings.strokeAssist
    ).mode;
  }
}
