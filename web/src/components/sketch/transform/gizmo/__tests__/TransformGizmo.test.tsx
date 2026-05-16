/**
 * @jest-environment jsdom
 */
/**
 * Render tests for the React/SVG transform gizmo.
 *
 * We avoid asserting exact pixel positions (that's what `getGizmoSnapshot`
 * tests cover at the data level). Instead we verify:
 *   - Nothing renders when `activeTool !== "transform"`
 *   - Nothing renders when the snapshot is null
 *   - The SVG renders the bounding box + visible handles for the active mode
 */

import React from "react";
import { render } from "@testing-library/react";
import { TransformGizmo } from "../TransformGizmo";
import { TransformTool } from "../../../tools/TransformTool";
import type { ToolContext } from "../../../tools";
import { createDefaultDocument, makeAffineTransform } from "../../../types";
import { useSketchStore } from "../../../state";

function makeCtx(): ToolContext {
  const doc = createDefaultDocument(64, 64);
  doc.layers[0].contentBounds = { x: 0, y: 0, width: 64, height: 64 };
  return {
    doc,
    activeTool: "transform",
    zoom: 1,
    pan: { x: 0, y: 0 },
    mirrorX: false,
    mirrorY: false,
    symmetryMode: "off",
    symmetryRays: 6,
    selection: null,
    displayCanvasRef: { current: null },
    overlayCanvasRef: { current: null },
    gizmoCanvasRef: { current: null },
    cursorCanvasRef: { current: null },
    containerRef: { current: null },
    layerCanvasesRef: { current: new Map() },
    mousePositionRef: { current: { x: 0, y: 0 } },
    activeStrokeRef: { current: null },
    getOrCreateLayerCanvas: jest.fn(),
    redraw: jest.fn(),
    redrawDirty: jest.fn(),
    requestRedraw: jest.fn(),
    requestDirtyRedraw: jest.fn(),
    clearOverlay: jest.fn(),
    drawSelectionOverlay: jest.fn(),
    drawOverlayShape: jest.fn(),
    drawOverlayGradient: jest.fn(),
    drawOverlayCrop: jest.fn(),
    drawOverlayLassoPreview: jest.fn(),
    drawOverlaySelection: jest.fn(),
    drawCursor: jest.fn(),
    clearGizmo: jest.fn(),
    drawGizmo: jest.fn(),
    onZoomChange: jest.fn(),
    onPanChange: jest.fn(),
    onStrokeStart: jest.fn(),
    onStrokeEnd: jest.fn(),
    onLayerTransformChange: jest.fn(),
    setLayerTransformPreview: jest.fn(),
    clearLayerTransformPreview: jest.fn(),
    onLayerContentBoundsChange: jest.fn(),
    onBrushSizeChange: jest.fn(),
    onContextMenu: jest.fn(),
    onCropComplete: jest.fn(),
    onEyedropperPick: jest.fn(),
    onSelectionChange: jest.fn(),
    onAutoPickLayer: jest.fn(),
    screenToCanvas: jest.fn((x: number, y: number) => ({ x, y })),
    shiftHeldRef: { current: false },
    altHeldRef: { current: false },
    withMirror: jest.fn((c, fn, from, to) => fn(from, to, c, 0))
  };
}

function withContainerSize<T extends HTMLDivElement>(
  ref: React.RefObject<T | null>,
  w = 400,
  h = 400
): void {
  if (!ref.current) {
    return;
  }
  Object.defineProperty(ref.current, "clientWidth", { value: w, configurable: true });
  Object.defineProperty(ref.current, "clientHeight", { value: h, configurable: true });
  Object.defineProperty(ref.current, "getBoundingClientRect", {
    value: () => ({
      left: 0,
      top: 0,
      width: w,
      height: h,
      right: w,
      bottom: h,
      x: 0,
      y: 0,
      toJSON: () => ({})
    }),
    configurable: true
  });
}

// Stub ResizeObserver so tests don't depend on the polyfill.
class StubResizeObserver implements ResizeObserver {
  observe = jest.fn();
  unobserve = jest.fn();
  disconnect = jest.fn();
}
(globalThis as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver =
  StubResizeObserver as unknown as typeof ResizeObserver;

beforeEach(() => {
  useSketchStore.setState((s) => ({
    ...s,
    activeTool: "transform",
    zoom: 1,
    pan: { x: 0, y: 0 }
  }));
});

describe("<TransformGizmo />", () => {
  it("renders nothing when activeTool is not 'transform'", () => {
    useSketchStore.setState((s) => ({ ...s, activeTool: "brush" }));
    const tool = new TransformTool();
    const ctx = makeCtx();
    tool.onActivate!(ctx);

    const ref = { current: document.createElement("div") };
    withContainerSize(ref);

    const { queryByTestId } = render(
      <TransformGizmo containerRef={ref} tool={tool} />
    );
    expect(queryByTestId("transform-gizmo")).toBeNull();
  });

  it("renders nothing when the snapshot is null (no activation)", () => {
    const tool = new TransformTool();
    const ref = { current: document.createElement("div") };
    withContainerSize(ref);
    const { queryByTestId } = render(
      <TransformGizmo containerRef={ref} tool={tool} />
    );
    expect(queryByTestId("transform-gizmo")).toBeNull();
  });

  it("renders the SVG with bounding rect + handles for an affine transform", () => {
    const tool = new TransformTool();
    const ctx = makeCtx();
    const layer = ctx.doc.layers[0];
    layer.transform = makeAffineTransform({
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0
    });
    tool.onActivate!(ctx);

    const ref = { current: document.createElement("div") };
    withContainerSize(ref);
    const { container, getByTestId } = render(
      <TransformGizmo containerRef={ref} tool={tool} />
    );

    const svg = getByTestId("transform-gizmo");
    expect(svg).toBeTruthy();
    // Default scale mode: 8 handles + rotate + pivot.
    const rects = container.querySelectorAll("rect");
    // bounding box + 8 scale handles = 9 rects
    expect(rects.length).toBeGreaterThanOrEqual(9);
    const circles = container.querySelectorAll("circle");
    // 1 rotate handle + 1 pivot dot = at least 2 circles
    expect(circles.length).toBeGreaterThanOrEqual(2);
  });
});
