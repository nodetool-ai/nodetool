/**
 * agentStrokes — paint a described polyline onto a layer.
 *
 * The `ui_sketch_stroke` agent tool hands the editor a finished polyline
 * instead of a pointer stream, so there is no {@link PaintSession} lifecycle to
 * drive: no coalesced samples, no stabilizer, no symmetry branches. What an
 * agent stroke does share with a hand-drawn one is everything that decides
 * pixels — the same `drawBrushStroke` / `drawPencilStroke` / `drawEraserStroke`
 * from the paint core, the same stroke-buffer compositing at tool opacity, and
 * the same alpha-lock restore — so the two land the same marks.
 *
 * Coordinates arrive in document space and are mapped into the layer's backing
 * raster. The raster is never grown here: pixels outside it are clipped, the
 * same way the live tools clip before they expand.
 */

import {
  drawBrushStroke,
  drawEraserStroke,
  drawPencilStroke
} from "./strokeRendering";
import type { StrokeStampState } from "./strokeRendering";
import { acquireStrokeBuffer, releaseStrokeBuffer } from "./PaintSession";
import { restoreAlphaFromSnapshot } from "./alphaLock";
import { CoordinateMapper } from "./CoordinateMapper";
import { getRasterBounds } from "../transform/geometry/layerGeometry";
import {
  mergePenPressureIntoBrush,
  mergePenPressureIntoPencil,
  type Layer,
  type Point,
  type ToolSettings
} from "../types";
import type {
  DirtyRectTracker,
  PaintSurface
} from "@nodetool-ai/image-editor/painting.js";

/** The paint engines an agent can drive. Mirrors the editor's own tools. */
export type AgentStrokeTool = "brush" | "pencil" | "eraser";

/** One sampled point of a stroke, in document (canvas) pixel coordinates. */
interface AgentStrokePoint {
  x: number;
  y: number;
  /** Pen pressure in [0,1]; omit for an unmodulated (mouse-like) stroke. */
  pressure?: number;
}

/** One continuous stroke aimed at one layer. */
export interface AgentStrokeRequest {
  /** Resolved target layer id — the caller has already addressed the layer. */
  layerId: string;
  /** Paint engine; defaults to `brush`. */
  tool?: AgentStrokeTool;
  points: readonly AgentStrokePoint[];
  /** Stroke color (hex). Ignored by the eraser. */
  color?: string;
  /** Brush diameter in pixels. */
  size?: number;
  /** Stroke opacity in [0,1]. */
  opacity?: number;
  /** Edge hardness in [0,1] — 1 is a crisp edge, 0 a soft falloff. */
  hardness?: number;
  /** Connect the last point back to the first, closing the shape. */
  closed?: boolean;
}

interface AgentStrokeBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AgentStrokeOutcome {
  layerId: string;
  tool: AgentStrokeTool;
  /** Number of points the stroke was drawn through. */
  points: number;
  /** Document-space box of the pixels this stroke touched; null if it painted none. */
  bounds: AgentStrokeBounds | null;
}

interface PaintAgentStrokeParams {
  stroke: AgentStrokeRequest;
  /** The document layer being painted — read for transform and alpha lock. */
  layer: Layer;
  /** The layer's backing raster canvas. */
  layerCanvas: HTMLCanvasElement;
  /** The editor's live tool settings, used as the per-stroke defaults. */
  toolSettings: ToolSettings;
  /** Fallback stroke color when the stroke names none (the active foreground). */
  foregroundColor: string;
  /** Artboard size, used to size a layer raster that has none yet. */
  canvasSize: { width: number; height: number };
  /**
   * Brush-stamp cache shared across a batch. Strokes that repeat a brush reuse
   * the rendered stamp instead of re-rasterizing it, the way the live
   * {@link BrushEngine} keeps one cache across strokes.
   */
  stampCache?: Map<string, PaintSurface>;
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

/** A size the engines can stamp: positive and finite. */
const resolveSize = (requested: number | undefined, fallback: number): number =>
  requested !== undefined && Number.isFinite(requested) && requested > 0
    ? requested
    : fallback;

const resolveUnit = (
  requested: number | undefined,
  fallback: number
): number =>
  requested !== undefined && Number.isFinite(requested)
    ? clamp01(requested)
    : fallback;

/**
 * Paint one stroke onto `layerCanvas`. Returns the document-space bounds of the
 * touched pixels, or null when the stroke laid down nothing.
 *
 * Throws when the layer cannot take pixels — the caller turns that into the
 * agent-facing error.
 */
export function paintAgentStroke({
  stroke,
  layer,
  layerCanvas,
  toolSettings,
  foregroundColor,
  canvasSize,
  stampCache
}: PaintAgentStrokeParams): AgentStrokeOutcome {
  const tool: AgentStrokeTool = stroke.tool ?? "brush";
  const outcome: AgentStrokeOutcome = {
    layerId: layer.id,
    tool,
    points: stroke.points.length,
    bounds: null
  };

  if (stroke.points.length === 0) {
    return outcome;
  }

  const layerCtx = layerCanvas.getContext("2d");
  if (!layerCtx) {
    throw new Error(
      `Layer "${layer.name}" has no drawable canvas context; the editor may still be starting up.`
    );
  }

  // ── Document → layer-raster mapping ───────────────────────────────────
  const rasterBounds = getRasterBounds(layer, layerCanvas, canvasSize);
  const mapper = new CoordinateMapper({
    layerTransform: layer.transform,
    rasterBounds
  });
  const points = stroke.points.map((p) => mapper.docToLayer(p));
  // The pencil stamps crisp integer cells; PencilEngine floors its input for
  // the same reason, so agent and pointer strokes snap identically.
  const snap = (p: Point): Point =>
    tool === "pencil" ? { x: Math.floor(p.x), y: Math.floor(p.y) } : p;

  // ── Settings: editor defaults, overridden per stroke ──────────────────
  const { brush, pencil, eraser, penPressure } = toolSettings;
  const brushSettings = {
    ...mergePenPressureIntoBrush(brush, penPressure),
    size: resolveSize(stroke.size, brush.size),
    hardness: resolveUnit(stroke.hardness, brush.hardness),
    color: stroke.color ?? foregroundColor ?? brush.color
  };
  const pencilSettings = {
    ...mergePenPressureIntoPencil(pencil, penPressure),
    size: resolveSize(stroke.size, pencil.size),
    opacity: resolveUnit(stroke.opacity, pencil.opacity),
    color: stroke.color ?? foregroundColor ?? pencil.color
  };
  const eraserSettings = {
    ...eraser,
    size: resolveSize(stroke.size, eraser.size)
  };

  // The brush and the eraser draw opaque dabs into the buffer and get their
  // opacity from the merge; the pencil bakes opacity into its own dabs, so its
  // merge runs at full strength. Same split as `PaintSession.getStrokeOpacity`.
  const compositeOpacity =
    tool === "brush"
      ? resolveUnit(stroke.opacity, brush.opacity)
      : tool === "eraser"
        ? resolveUnit(stroke.opacity, eraser.opacity)
        : 1;
  const compositeOp: GlobalCompositeOperation =
    tool === "eraser" ? "destination-out" : "source-over";

  // ── Draw into a stroke buffer ─────────────────────────────────────────
  const buffer = acquireStrokeBuffer(layerCanvas.width, layerCanvas.height);
  const bufferCtx = buffer.getContext("2d");
  if (!bufferCtx) {
    releaseStrokeBuffer(buffer);
    throw new Error("Could not allocate a stroke buffer for painting.");
  }

  const dirtyRect: DirtyRectTracker = { current: null };
  const stampState: StrokeStampState = {
    hasStamped: false,
    distanceToNextDab: 0
  };
  const stamps = stampCache ?? new Map<string, PaintSurface>();

  const drawSegment = (
    from: Point,
    to: Point,
    pressure: number | undefined
  ): void => {
    switch (tool) {
      case "pencil":
        drawPencilStroke(
          from,
          to,
          pencilSettings,
          bufferCtx,
          pressure,
          dirtyRect,
          stampState
        );
        return;
      case "eraser":
        drawEraserStroke(
          from,
          to,
          eraserSettings,
          brushSettings,
          pencilSettings,
          bufferCtx,
          pressure,
          dirtyRect,
          stamps,
          stampState
        );
        return;
      default:
        drawBrushStroke(
          from,
          to,
          brushSettings,
          bufferCtx,
          pressure,
          dirtyRect,
          stamps,
          stampState
        );
    }
  };

  if (points.length === 1) {
    // A one-point stroke is a single dab, the way a click without a drag is.
    const only = snap(points[0]);
    drawSegment(only, only, stroke.points[0].pressure);
  } else {
    for (let i = 1; i < points.length; i++) {
      drawSegment(
        snap(points[i - 1]),
        snap(points[i]),
        stroke.points[i].pressure ?? stroke.points[i - 1].pressure
      );
    }
    if (stroke.closed && points.length > 2) {
      drawSegment(
        snap(points[points.length - 1]),
        snap(points[0]),
        stroke.points[0].pressure
      );
    }
  }

  // ── Merge onto the layer ──────────────────────────────────────────────
  const alphaSnapshot = layer.alphaLock
    ? layerCtx.getImageData(0, 0, layerCanvas.width, layerCanvas.height)
    : null;

  layerCtx.save();
  layerCtx.globalAlpha = compositeOpacity;
  layerCtx.globalCompositeOperation = compositeOp;
  layerCtx.drawImage(buffer, 0, 0);
  layerCtx.restore();

  if (alphaSnapshot) {
    restoreAlphaFromSnapshot(layerCanvas, alphaSnapshot, dirtyRect.current);
  }
  releaseStrokeBuffer(buffer);

  const box = dirtyRect.current;
  if (box && box.maxX > box.minX && box.maxY > box.minY) {
    const doc = mapper.dirtyToDoc(box);
    outcome.bounds = {
      x: doc.x,
      y: doc.y,
      width: Math.max(0, doc.w),
      height: Math.max(0, doc.h)
    };
  }
  return outcome;
}
