/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, fireEvent } from "@testing-library/react";

// Polyfill PointerEvent for jsdom (which doesn't support it natively).
// PointerEvent extends MouseEvent so clientX/clientY work correctly.
if (typeof window !== "undefined" && !window.PointerEvent) {
  (window as Record<string, unknown>).PointerEvent = class PointerEvent extends MouseEvent {
    readonly pointerId: number;
    readonly width: number;
    readonly height: number;
    readonly pressure: number;
    readonly tiltX: number;
    readonly tiltY: number;
    readonly pointerType: string;
    readonly isPrimary: boolean;

    constructor(type: string, params: PointerEventInit & MouseEventInit = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 0;
      this.width = params.width ?? 1;
      this.height = params.height ?? 1;
      this.pressure = params.pressure ?? 0;
      this.tiltX = params.tiltX ?? 0;
      this.tiltY = params.tiltY ?? 0;
      this.pointerType = params.pointerType ?? "";
      this.isPrimary = params.isPrimary ?? false;
    }
  };
}

// Polyfill setPointerCapture / releasePointerCapture for jsdom
if (typeof Element !== "undefined" && !Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = function () { /* noop – jsdom stub */ };
  Element.prototype.releasePointerCapture = function () { /* noop – jsdom stub */ };
}

// Stub @emotion/react's css for jsdom – actual style generation is not needed in unit tests
jest.mock("@emotion/react", () => {
  const actual = jest.requireActual("@emotion/react");
  return {
    ...actual,
    css: () => "" /* return empty string; styles are not applied in jsdom */,
    jsx: actual.jsx ?? React.createElement
  };
});

import SketchCanvasResizeHandles from "../SketchCanvasResizeHandles";

describe("SketchCanvasResizeHandles", () => {
  const defaultProps = {
    canvasWidth: 512,
    canvasHeight: 512,
    zoom: 1,
    pan: { x: 0, y: 0 },
    onResize: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders 8 resize handles (4 edges + 4 corners)", () => {
    const { container } = render(
      <SketchCanvasResizeHandles {...defaultProps} />
    );
    const handles = container.querySelectorAll("[class*='resize-handle--']");
    expect(handles.length).toBe(8);
  });

  it("renders handles for all edge directions", () => {
    const { container } = render(
      <SketchCanvasResizeHandles {...defaultProps} />
    );
    const edges = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
    for (const edge of edges) {
      const handle = container.querySelector(`.resize-handle--${edge}`);
      expect(handle).toBeTruthy();
    }
  });

  it("calls onResizeStart when drag begins", () => {
    const onResizeStart = jest.fn();
    const { container } = render(
      <SketchCanvasResizeHandles
        {...defaultProps}
        onResizeStart={onResizeStart}
      />
    );

    const seHandle = container.querySelector(".resize-handle--se")!;
    fireEvent.pointerDown(seHandle, { clientX: 100, clientY: 100, pointerId: 1 });
    expect(onResizeStart).toHaveBeenCalledTimes(1);
  });

  it("calls onResize with new dimensions during drag (SE corner)", () => {
    const onResize = jest.fn();
    const { container } = render(
      <SketchCanvasResizeHandles
        {...defaultProps}
        canvasWidth={512}
        canvasHeight={512}
        zoom={1}
        onResize={onResize}
      />
    );

    const seHandle = container.querySelector(".resize-handle--se")!;
    fireEvent.pointerDown(seHandle, { clientX: 100, clientY: 100, pointerId: 1 });
    // Move 50px right and 30px down at zoom=1 → canvas grows by 50×30
    fireEvent.pointerMove(seHandle, { clientX: 150, clientY: 130, pointerId: 1 });
    expect(onResize).toHaveBeenCalledWith(562, 542);
  });

  it("calls onResize with new dimensions during drag (N edge)", () => {
    const onResize = jest.fn();
    const { container } = render(
      <SketchCanvasResizeHandles
        {...defaultProps}
        canvasWidth={512}
        canvasHeight={512}
        zoom={1}
        onResize={onResize}
      />
    );

    const nHandle = container.querySelector(".resize-handle--n")!;
    fireEvent.pointerDown(nHandle, { clientX: 200, clientY: 100, pointerId: 1 });
    // Move up by 40px → canvas grows by 40 in height
    fireEvent.pointerMove(nHandle, { clientX: 200, clientY: 60, pointerId: 1 });
    expect(onResize).toHaveBeenCalledWith(512, 552);
  });

  it("respects zoom level when computing size changes", () => {
    const onResize = jest.fn();
    const { container } = render(
      <SketchCanvasResizeHandles
        {...defaultProps}
        canvasWidth={512}
        canvasHeight={512}
        zoom={2}
        onResize={onResize}
      />
    );

    const eHandle = container.querySelector(".resize-handle--e")!;
    fireEvent.pointerDown(eHandle, { clientX: 100, clientY: 100, pointerId: 1 });
    // Move 100px right at zoom=2 → canvas grows by 50 (100/2) in width
    fireEvent.pointerMove(eHandle, { clientX: 200, clientY: 100, pointerId: 1 });
    expect(onResize).toHaveBeenCalledWith(562, 512);
  });

  it("clamps to minimum size", () => {
    const onResize = jest.fn();
    const { container } = render(
      <SketchCanvasResizeHandles
        {...defaultProps}
        canvasWidth={100}
        canvasHeight={100}
        zoom={1}
        minWidth={50}
        minHeight={50}
        onResize={onResize}
      />
    );

    const wHandle = container.querySelector(".resize-handle--w")!;
    fireEvent.pointerDown(wHandle, { clientX: 100, clientY: 100, pointerId: 1 });
    // Move right by 200px → try to shrink width by 200 (from 100 → clamped to 50)
    fireEvent.pointerMove(wHandle, { clientX: 300, clientY: 100, pointerId: 1 });
    expect(onResize).toHaveBeenCalledWith(50, 100);
  });

  it("calls onResizeEnd when drag finishes", () => {
    const onResizeEnd = jest.fn();
    const { container } = render(
      <SketchCanvasResizeHandles
        {...defaultProps}
        onResizeEnd={onResizeEnd}
      />
    );

    const seHandle = container.querySelector(".resize-handle--se")!;
    fireEvent.pointerDown(seHandle, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(seHandle, { clientX: 150, clientY: 150, pointerId: 1 });
    expect(onResizeEnd).toHaveBeenCalledTimes(1);
  });

  it("does not call onResize if pointer moves without prior pointerDown", () => {
    const onResize = jest.fn();
    const { container } = render(
      <SketchCanvasResizeHandles {...defaultProps} onResize={onResize} />
    );

    const seHandle = container.querySelector(".resize-handle--se")!;
    fireEvent.pointerMove(seHandle, { clientX: 200, clientY: 200, pointerId: 1 });
    expect(onResize).not.toHaveBeenCalled();
  });
});
