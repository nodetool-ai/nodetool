/**
 * Phase 2 – Shift-line stroke buffer reuse tests.
 *
 * Verifies that consecutive Shift+click line segments share a single
 * stroke buffer in PaintSession, preventing opacity stacking at
 * crossings and start dots.
 */

import React from "react";
import { PaintSession } from "../painting/PaintSession";
import type { Point, Layer } from "../types";
import type { ToolContext, ToolPointerEvent } from "../tools/types";
import type {
  PaintEngine,
  StrokeBufferMode,
  EngineCompositeOp
} from "../painting/PaintEngine";

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeBrushEngine(): PaintEngine {
  return {
    engineId: "test-brush",
    compositeOp: "source-over" as EngineCompositeOp,
    bufferMode: "buffered" as StrokeBufferMode,
    hasStabilizer: false,
    dabOnDown: false,
    beginStroke: jest.fn(),
    stabilize: (p: Point) => p,
    evaluate: jest.fn(),
    getDirtyRect: () => null
  };
}

function makeLayer(id: string): Layer {
  return {
    id,
    name: "layer",
    visible: true,
    opacity: 1,
    blendMode: "normal",
    locked: false,
    alphaLock: false,
    data: null,
    type: "raster",
    transform: { x: 0, y: 0 },
    contentBounds: { x: 0, y: 0, width: 64, height: 64 }
  };
}

function makeFakeCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  return canvas;
}

function makeToolContext(overrides?: Partial<ToolContext>): ToolContext {
  const layer = makeLayer("test-layer");
  const layerCanvas = makeFakeCanvas();
  const layerCanvases = new Map<string, HTMLCanvasElement>();
  layerCanvases.set(layer.id, layerCanvas);

  return {
    doc: {
      canvas: { width: 64, height: 64 },
      layers: [layer],
      activeLayerId: layer.id,
      toolSettings: {
        brush: {
          size: 10,
          opacity: 0.5,
          hardness: 0.8,
          stabilizer: 0,
          roundness: 1,
          angle: 0,
          pressureSize: false,
          pressureOpacity: false,
          color: "#000000",
          brushType: "round"
        },
        pencil: {
          size: 1,
          opacity: 1,
          color: "#000000",
          pressureSize: false,
          pressureOpacity: false
        },
        eraser: {
          size: 10,
          opacity: 1,
          hardness: 0.8,
          pressureSize: false,
          pressureOpacity: false
        },
        fill: { tolerance: 32, color: "#000000" },
        shape: {
          shapeType: "rectangle",
          fillColor: "#000000",
          strokeColor: "#000000",
          strokeWidth: 2
        },
        gradient: {
          type: "linear",
          angle: 0,
          stops: [
            { color: "#000000", position: 0 },
            { color: "#ffffff", position: 100 }
          ]
        },
        blur: { size: 10, strength: 5, pressureSize: false },
        cloneStamp: {
          size: 20,
          opacity: 1,
          hardness: 0.8,
          pressureSize: false,
          pressureOpacity: false
        }
      },
      foregroundColor: "#000000",
      backgroundColor: "#ffffff",
      mirrorX: false,
      mirrorY: false
    },
    activeTool: "brush",
    onStrokeStart: jest.fn(),
    onStrokeEnd: jest.fn(),
    onBrushSizeChange: jest.fn(),
    activeStrokeRef: { current: null },
    layerCanvasesRef: { current: layerCanvases },
    shiftHeldRef: { current: false },
    altHeldRef: { current: false },
    getOrCreateLayerCanvas: jest.fn(() => layerCanvas),
    invalidateLayer: jest.fn(),
    redraw: jest.fn(),
    redrawDirty: jest.fn(),
    requestRedraw: jest.fn(),
    clearOverlay: jest.fn(),
    drawSelectionOverlay: jest.fn(),
    drawOverlayShape: jest.fn(),
    withMirror: jest.fn((_ctx, fn, from, to) => {
      fn(from, to, {} as CanvasRenderingContext2D, 0);
    }),
    clipSelectionForOffset: jest.fn(() => false),
    selection: null,
    foregroundColor: "#000000",
    strokeDirtyRectRef: { current: null },
    setContentBounds: jest.fn(),
    ...overrides
  } as unknown as ToolContext;
}

function makePointerEvent(
  overrides?: Partial<ToolPointerEvent>
): ToolPointerEvent {
  return {
    point: { x: 10, y: 10 },
    pressure: 0.5,
    nativeEvent: {} as React.PointerEvent,
    ...overrides
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe("PaintSession shift-line buffer reuse", () => {
  it("keeps the stroke buffer alive when shift is held at end()", () => {
    const engine = makeBrushEngine();
    const session = new PaintSession(engine);
    const ctx = makeToolContext();

    // Start a normal stroke
    session.begin(ctx, makePointerEvent({ point: { x: 0, y: 0 } }));
    expect(ctx.onStrokeStart).toHaveBeenCalledTimes(1);
    expect(ctx.activeStrokeRef.current).not.toBeNull();

    // Hold shift and end the stroke
    ctx.shiftHeldRef.current = true;
    session.end(ctx, makePointerEvent({ point: { x: 20, y: 20 } }));

    // Buffer should still be alive (not merged)
    expect(ctx.activeStrokeRef.current).not.toBeNull();
    // onStrokeEnd should NOT have been called (deferred until shift released)
    expect(ctx.onStrokeEnd).not.toHaveBeenCalled();
    expect(session.isActive).toBe(false);
  });

  it("reuses the buffer on the next shift+click begin()", () => {
    const engine = makeBrushEngine();
    const session = new PaintSession(engine);
    const ctx = makeToolContext();

    // First stroke
    session.begin(ctx, makePointerEvent({ point: { x: 0, y: 0 } }));
    const firstBuffer = ctx.activeStrokeRef.current!.buffer;

    // End with shift held
    ctx.shiftHeldRef.current = true;
    session.end(ctx, makePointerEvent({ point: { x: 20, y: 20 } }));

    // Second stroke with shift held – should reuse the same buffer
    session.begin(ctx, makePointerEvent({ point: { x: 40, y: 40 } }));
    expect(ctx.activeStrokeRef.current!.buffer).toBe(firstBuffer);
    // onStrokeStart should only have been called once (for the first stroke)
    expect(ctx.onStrokeStart).toHaveBeenCalledTimes(1);
  });

  it("creates a new buffer when shift is released between strokes", () => {
    const engine = makeBrushEngine();
    const session = new PaintSession(engine);
    const ctx = makeToolContext();

    // First stroke
    session.begin(ctx, makePointerEvent({ point: { x: 0, y: 0 } }));
    const firstBuffer = ctx.activeStrokeRef.current!.buffer;

    // End with shift held
    ctx.shiftHeldRef.current = true;
    session.end(ctx, makePointerEvent({ point: { x: 20, y: 20 } }));

    // Release shift, then start a new stroke
    ctx.shiftHeldRef.current = false;
    session.begin(ctx, makePointerEvent({ point: { x: 40, y: 40 } }));

    // The old buffer should have been flushed and a new one created
    expect(ctx.activeStrokeRef.current!.buffer).not.toBe(firstBuffer);
    // onStrokeStart should have been called twice (once for each stroke)
    expect(ctx.onStrokeStart).toHaveBeenCalledTimes(2);
  });

  it("flushes the shift-chain buffer when starting a non-shift stroke", () => {
    const engine = makeBrushEngine();
    const session = new PaintSession(engine);
    const ctx = makeToolContext();

    // Build a shift chain
    session.begin(ctx, makePointerEvent({ point: { x: 0, y: 0 } }));
    ctx.shiftHeldRef.current = true;
    session.end(ctx, makePointerEvent({ point: { x: 20, y: 20 } }));

    // Now release shift and start a new stroke
    ctx.shiftHeldRef.current = false;
    session.begin(ctx, makePointerEvent({ point: { x: 50, y: 50 } }));

    // onStrokeEnd should have been called to flush the chain
    expect(ctx.onStrokeEnd).toHaveBeenCalledTimes(1);
    // New buffer should exist
    expect(ctx.activeStrokeRef.current).not.toBeNull();
  });

  it("only pushes one history entry for the entire shift-chain", () => {
    const engine = makeBrushEngine();
    const session = new PaintSession(engine);
    const ctx = makeToolContext();

    // First click in chain
    session.begin(ctx, makePointerEvent({ point: { x: 0, y: 0 } }));
    ctx.shiftHeldRef.current = true;
    session.end(ctx, makePointerEvent({ point: { x: 20, y: 20 } }));

    // Second click in chain
    session.begin(ctx, makePointerEvent({ point: { x: 40, y: 40 } }));
    session.end(ctx, makePointerEvent({ point: { x: 60, y: 60 } }));

    // Third click in chain
    session.begin(ctx, makePointerEvent({ point: { x: 80, y: 80 } }));
    session.end(ctx, makePointerEvent({ point: { x: 100, y: 100 } }));

    // onStrokeStart should have been called only once for the whole chain
    expect(ctx.onStrokeStart).toHaveBeenCalledTimes(1);
  });

  it("normal end() without shift sets pendingCommit on the buffer", () => {
    const engine = makeBrushEngine();
    const session = new PaintSession(engine);
    const ctx = makeToolContext();

    session.begin(ctx, makePointerEvent({ point: { x: 0, y: 0 } }));
    const stroke = ctx.activeStrokeRef.current!;
    session.end(ctx, makePointerEvent({ point: { x: 20, y: 20 } }));

    // For normal (non-shift) end, pendingCommit should be set for deferred merge
    expect(stroke.pendingCommit).toBeDefined();
    expect(session.isActive).toBe(false);
  });
});
