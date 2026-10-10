/**
 * Smart-guide snapping for the drawing tools: the pure point snap, the drag
 * session the tools share, the transient snap lines in the store, and the
 * Shape and Crop tools landing on canvas edges.
 */

import { act } from "@testing-library/react";
import { stub } from "../../../test-utils/doubles";
import { buildSnapTargets, snapPoint } from "../snapping/moveSnap";
import { DragSnapSession } from "../snapping/toolSnap";
import { useSketchStore } from "../state/useSketchStore";
import type { ToolPointerEvent } from "../tools";
import { CropTool } from "../tools/CropTool";
import { ShapeTool } from "../tools/ShapeTool";
import { makeToolContext } from "./_toolContextFixture";

// The fixture canvas is 64x64, so its snap lines are 0, 32 and 64 per axis.
const CANVAS = { width: 64, height: 64 };

function pointer(x: number, y: number): ToolPointerEvent {
  return {
    point: { x, y },
    pressure: 0.5,
    nativeEvent: stub<React.PointerEvent>({
      altKey: false,
      shiftKey: false,
      button: 0,
      clientX: x,
      clientY: y,
      pointerId: 1
    })
  };
}

beforeEach(() => {
  act(() => {
    useSketchStore.getState().resetDocument();
    useSketchStore.setState({ snapEnabled: true, activeSnapLines: null });
  });
});

describe("snapPoint", () => {
  const targets = buildSnapTargets(CANVAS, [], []);

  it("snaps each axis to the nearest line within the threshold", () => {
    expect(snapPoint({ x: 3, y: 30 }, targets, 6)).toEqual({
      x: 0,
      y: 32,
      lines: { x: 0, y: 32 }
    });
  });

  it("leaves an axis alone when no line is within the threshold", () => {
    expect(snapPoint({ x: 15, y: 62 }, targets, 6)).toEqual({
      x: 15,
      y: 64,
      lines: { x: null, y: 64 }
    });
  });
});

describe("DragSnapSession", () => {
  it("snaps a point and publishes the lines, then clears them on end", () => {
    const ctx = makeToolContext();
    const session = new DragSnapSession();
    session.begin(ctx);
    expect(session.snap(ctx, { x: 2, y: 33 })).toEqual({ x: 0, y: 32 });
    expect(useSketchStore.getState().activeSnapLines).toEqual({ x: 0, y: 32 });
    session.end();
    expect(useSketchStore.getState().activeSnapLines).toBeNull();
  });

  it("snaps only the edges a handle moves", () => {
    const ctx = makeToolContext();
    const session = new DragSnapSession();
    session.begin(ctx);
    expect(session.snapEdges(ctx, 61, null)).toEqual({ x: 64, y: null });
    expect(useSketchStore.getState().activeSnapLines).toEqual({ x: 64, y: null });
  });

  it("adjusts a moved rectangle's delta so an edge lands on a line", () => {
    const ctx = makeToolContext();
    const session = new DragSnapSession();
    session.begin(ctx);
    // A 10x10 rect at (10, 10) dragged by (-8, 0): its left edge reaches 2.
    expect(
      session.snapRectDelta(ctx, { x: 10, y: 10, width: 10, height: 10 }, -8, 0)
    ).toEqual({ dx: -10, dy: 0 });
  });

  it("passes points through while snapping is off", () => {
    act(() => {
      useSketchStore.setState({ snapEnabled: false });
    });
    const ctx = makeToolContext();
    const session = new DragSnapSession();
    session.begin(ctx);
    expect(session.snap(ctx, { x: 2, y: 33 })).toEqual({ x: 2, y: 33 });
    expect(useSketchStore.getState().activeSnapLines).toBeNull();
  });

  it("scales the threshold with zoom", () => {
    // At 4x zoom the 6px screen threshold is 1.5 document pixels.
    const ctx = makeToolContext({ zoom: 4 });
    const session = new DragSnapSession();
    session.begin(ctx);
    expect(session.snap(ctx, { x: 2, y: 33 })).toEqual({ x: 2, y: 32 });
  });
});

describe("setActiveSnapLines", () => {
  it("keeps the same object when the lines do not change", () => {
    const { setActiveSnapLines } = useSketchStore.getState();
    act(() => setActiveSnapLines({ x: 0, y: null }));
    const first = useSketchStore.getState().activeSnapLines;
    act(() => setActiveSnapLines({ x: 0, y: null }));
    expect(useSketchStore.getState().activeSnapLines).toBe(first);
  });

  it("stores no lines when neither axis snapped", () => {
    const { setActiveSnapLines } = useSketchStore.getState();
    act(() => setActiveSnapLines({ x: null, y: null }));
    expect(useSketchStore.getState().activeSnapLines).toBeNull();
  });
});

describe("ShapeTool snapping", () => {
  it("draws the shape from and to the snapped canvas edges", () => {
    const ctx = makeToolContext({ activeTool: "shape" });
    const tool = new ShapeTool();
    tool.onDown(ctx, pointer(3, 4));
    tool.onMove(ctx, pointer(60, 61));
    expect(ctx.drawOverlayShape).toHaveBeenLastCalledWith(
      { x: 0, y: 0 },
      { x: 64, y: 64 }
    );
    tool.onUp(ctx, pointer(60, 61));
    expect(useSketchStore.getState().activeSnapLines).toBeNull();
  });

  it("clears the snap line when the drag is cancelled", () => {
    const ctx = makeToolContext({ activeTool: "shape" });
    const tool = new ShapeTool();
    tool.onDown(ctx, pointer(3, 4));
    tool.onMove(ctx, pointer(60, 61));
    expect(useSketchStore.getState().activeSnapLines).not.toBeNull();
    tool.onCancel?.(ctx);
    expect(useSketchStore.getState().activeSnapLines).toBeNull();
  });

  it("follows the pointer exactly while snapping is off", () => {
    act(() => {
      useSketchStore.setState({ snapEnabled: false });
    });
    const ctx = makeToolContext({ activeTool: "shape" });
    const tool = new ShapeTool();
    tool.onDown(ctx, pointer(3, 4));
    tool.onMove(ctx, pointer(60, 61));
    expect(ctx.drawOverlayShape).toHaveBeenLastCalledWith(
      { x: 3, y: 4 },
      { x: 60, y: 61 }
    );
    tool.onUp(ctx, pointer(60, 61));
  });
});

describe("CropTool snapping", () => {
  it("snaps the crop marquee to the canvas center and edge", () => {
    const ctx = makeToolContext({ activeTool: "crop" });
    const tool = new CropTool();
    tool.onDown(ctx, pointer(30, 2));
    tool.onMove(ctx, pointer(62, 40), []);
    tool.onUp(ctx, pointer(62, 40));
    expect(useSketchStore.getState().cropPreviewBounds).toEqual({
      x: 32,
      y: 0,
      width: 32,
      height: 40
    });
  });

  it("snaps a dragged crop edge to the canvas center", () => {
    const ctx = makeToolContext({ activeTool: "crop" });
    const tool = new CropTool();
    tool.onDown(ctx, pointer(10, 10));
    tool.onUp(ctx, pointer(50, 50));
    // Drag the right edge from 50 to 34, which lands near the center line.
    tool.onDown(ctx, pointer(50, 30));
    tool.onMove(ctx, pointer(34, 30), []);
    expect(useSketchStore.getState().cropPreviewBounds).toEqual({
      x: 10,
      y: 10,
      width: 22,
      height: 40
    });
    expect(useSketchStore.getState().activeSnapLines).toEqual({ x: 32, y: null });
    tool.onUp(ctx, pointer(34, 30));
    expect(useSketchStore.getState().activeSnapLines).toBeNull();
  });
});
