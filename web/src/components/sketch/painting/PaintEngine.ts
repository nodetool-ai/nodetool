/**
 * PaintEngine — abstraction for brush evaluation / rendering.
 *
 * Each engine describes how to evaluate a segment of a paint stroke
 * (e.g. brush, pencil, eraser). The PaintSession drives the lifecycle;
 * the engine is responsible only for drawing between two points on a
 * Canvas2D context.
 *
 * This separation allows brush/pencil/eraser to share session logic
 * (input sampling, transform mapping, preview composition, commit)
 * while having completely different evaluation code. It also leaves
 * room for future extensible/programmatic brush definitions without
 * changing the session contract.
 */

import type { Point } from "../types";

// ─── Engine configuration ───────────────────────────────────────────────────

/**
 * Describes the compositing behaviour of the engine's output.
 * - `"source-over"` – additive paint (brush, pencil)
 * - `"destination-out"` – subtractive paint (eraser)
 */
export type EngineCompositeOp = "source-over" | "destination-out";

/**
 * Describes whether the engine wants a dedicated stroke buffer
 * (for correct per-stroke opacity) or paints directly onto the layer.
 */
export type StrokeBufferMode = "buffered" | "direct";

// ─── Engine interface ───────────────────────────────────────────────────────

export interface PaintEngine {
  /** Unique engine identifier (for debugging / logging). */
  readonly engineId: string;

  /** Composite operation used when merging the stroke buffer onto the layer. */
  readonly compositeOp: EngineCompositeOp;

  /** Whether this engine uses a stroke buffer or draws directly. */
  readonly bufferMode: StrokeBufferMode;

  /** Whether the engine has its own point stabiliser. */
  readonly hasStabilizer: boolean;

  /** Whether the engine places an initial dab at the start point. */
  readonly dabOnDown: boolean;

  /**
   * Called once at the beginning of a stroke to let the engine
   * reset any per-stroke state (stamp counters, accumulators, etc.).
   */
  beginStroke(): void;

  /**
   * Apply the stabilizer (if any) to a raw input point.
   * If the engine has no stabilizer, return the raw point unchanged.
   */
  stabilize(raw: Point): Point;

  /**
   * Evaluate a single segment of the stroke.
   *
   * @param from       Start point (layer-local coordinates)
   * @param to         End point (layer-local coordinates)
   * @param ctx        Canvas2D context to draw on (either layer or buffer)
   * @param pressure   Pen/touch pressure in [0, 1]; `undefined` when not applicable (e.g. mouse)
   * @param branchIdx  Symmetry branch index
   */
  evaluate(
    from: Point,
    to: Point,
    ctx: CanvasRenderingContext2D,
    pressure: number | undefined,
    branchIdx: number
  ): void;

  /**
   * Read the engine's current dirty-rect tracker.
   * Returns `null` when no pixels have been touched yet.
   */
  getDirtyRect(): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } | null;
}
