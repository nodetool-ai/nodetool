/**
 * PencilEngine — PaintEngine adapter for the existing pencil stroke utility.
 *
 * Wraps `drawPencilStroke` from drawingUtils. The pencil has no stabilizer,
 * uses per-branch distance-based stamping (like the brush) so stroke density
 * depends on path length, not pointer event rate.  Uses a stroke buffer so
 * feathered selection masks are properly applied at commit time.
 */

import type { Point, PencilSettings } from "../types";
import { resolveStrokeAssistSettings } from "../types";
import type {
  PaintEngine,
  EngineCompositeOp,
  StrokeBufferMode,
  EngineAssistMode
} from "./PaintEngine";
import {
  drawPencilStroke as drawPencilStrokeUtil,
  type StrokeStampState
} from "../drawingUtils";
import type { DirtyRectTracker } from "../drawingUtils";
import { StrokeAssist } from "./StrokeAssist";

export class PencilEngine implements PaintEngine {
  readonly engineId = "pencil";
  readonly compositeOp: EngineCompositeOp = "source-over";
  readonly bufferMode: StrokeBufferMode = "buffered";
  // Always true: stabilize() at minimum snaps to pixel centres, and may also
  // smooth when settings.stabilizer > 0.  PaintSession uses lastSmoothedPoint
  // as "from", which keeps segments connected at the snapped coordinates.
  readonly hasStabilizer = true;
  readonly dabOnDown = true;

  private settings: PencilSettings;
  private dirtyRect: DirtyRectTracker = { current: null };
  private stampStates: Map<number, StrokeStampState> = new Map();
  private assist = new StrokeAssist();

  constructor(settings: PencilSettings) {
    this.settings = settings;
  }

  updateSettings(settings: PencilSettings): void {
    this.settings = settings;
  }

  beginStroke(): void {
    this.dirtyRect = { current: null };
    this.stampStates.clear();
    this.assist.reset();
  }

  stabilize(raw: Point): Point {
    // Apply stroke assist first, then snap to pixel centres for crisp lines.
    const smoothed = this.assist.apply(
      raw,
      resolveStrokeAssistSettings(
        this.settings.stabilizer,
        this.settings.strokeAssist
      )
    );
    return { x: Math.round(smoothed.x), y: Math.round(smoothed.y) };
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

  getAssistMode(): EngineAssistMode {
    return resolveStrokeAssistSettings(
      this.settings.stabilizer,
      this.settings.strokeAssist
    ).mode;
  }
}
