/**
 * @jest-environment jsdom
 *
 * Tests for SketchCanvasPresentation — the purely presentational layer
 * extracted from SketchCanvas. Verifies canvas elements, cursor style,
 * info bar content, and resize handle rendering.
 */
import React from "react";
import { render, act } from "@testing-library/react";
import SketchCanvasPresentation from "../SketchCanvasPresentation";
import type { SketchCanvasPresentationProps } from "../SketchCanvasPresentation";
import { useSketchStore } from "../state";
import { cursorStyleForTool } from "../sketchCursorStyle";
import {
  canvasTransformStyle,
  computeFitZoom
} from "../sketchCanvasPresentation.helpers";
import { TransformTool } from "../tools/TransformTool";

// Mock MUI ThemeProvider — SketchCanvasPresentation uses useTheme.
jest.mock("@mui/material/styles", () => ({
  ...jest.requireActual("@mui/material/styles"),
  useTheme: () => ({
    vars: { palette: { grey: { 800: "#424242" } } },
    spacing: (n: number) => `${n * 8}px`
  })
}));

// Mock SketchCanvasResizeHandles so we can detect when it renders.
jest.mock("../SketchCanvasResizeHandles", () => {
  return {
    __esModule: true,
    default: function MockResizeHandles() {
      return <div data-testid="resize-handles" />;
    }
  };
});

// Mock SelectionActionBar — this suite stubs useTheme with a minimal theme
// that lacks the shape/shadows the bar reads. Its own behavior is covered by
// SelectionActionBar.test.tsx.
jest.mock("../SelectionActionBar", () => ({
  __esModule: true,
  SelectionActionBar: () => null,
  default: () => null
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeProps(
  overrides?: Partial<SketchCanvasPresentationProps>
): SketchCanvasPresentationProps {
  return {
    containerRef: React.createRef<HTMLDivElement>(),
    bootstrapDisplayRef: React.createRef<HTMLCanvasElement>(),
    displayCanvasRef: React.createRef<HTMLCanvasElement>(),
    overlayCanvasRef: React.createRef<HTMLCanvasElement>(),
    selectionGpuCanvasRef: React.createRef<HTMLCanvasElement>(),
    selectionCanvasRef: React.createRef<HTMLCanvasElement>(),
    cursorCanvasRef: React.createRef<HTMLCanvasElement>(),
    gizmoCanvasRef: React.createRef<HTMLCanvasElement>(),
    transformTool: new TransformTool(),
    canvasWidth: 128,
    canvasHeight: 64,
    zoom: 1,
    pan: { x: 0, y: 0 },
    interactionTool: "brush",
    containerCursor: cursorStyleForTool("brush"),
    bootstrapPhaseActive: false,
    backend: "canvas2d",
    onPointerDown: jest.fn(),
    onPointerMove: jest.fn(),
    onPointerUp: jest.fn(),
    onDoubleClick: jest.fn(),
    onPointerLeave: jest.fn(),
    onMouseLeave: jest.fn(),
    onContextMenu: jest.fn(),
    onDragOver: jest.fn(),
    onDrop: jest.fn(),
    ...overrides
  };
}

// ─── cursorStyleForTool ──────────────────────────────────────────────────────

describe("cursorStyleForTool", () => {
  it('returns "move" for move tool', () => {
    expect(cursorStyleForTool("move")).toBe("move");
  });

  it('returns "move" for transform tool', () => {
    expect(cursorStyleForTool("transform")).toBe("move");
  });

  it('returns "crosshair" for crop tool', () => {
    expect(cursorStyleForTool("crop")).toBe("crosshair");
  });

  it('returns "crosshair" for color picker / eyedropper tool', () => {
    expect(cursorStyleForTool("eyedropper")).toBe("crosshair");
  });

  it('returns "crosshair" for select tool', () => {
    expect(cursorStyleForTool("select")).toBe("crosshair");
  });

  it('returns "none" for brush tool', () => {
    expect(cursorStyleForTool("brush")).toBe("none");
  });

  it('returns "none" for pencil tool', () => {
    expect(cursorStyleForTool("pencil")).toBe("none");
  });

  it('returns "none" for eraser tool', () => {
    expect(cursorStyleForTool("eraser")).toBe("none");
  });

  it('returns "none" for blur tool', () => {
    expect(cursorStyleForTool("blur")).toBe("none");
  });

  it('returns "crosshair" for unknown tools', () => {
    expect(cursorStyleForTool("shape")).toBe("crosshair");
    expect(cursorStyleForTool("gradient")).toBe("crosshair");
    expect(cursorStyleForTool("fill")).toBe("crosshair");
  });
});

// ─── canvasTransformStyle ────────────────────────────────────────────────────

describe("canvasTransformStyle", () => {
  it("produces correct CSS transform", () => {
    const style = canvasTransformStyle({ x: 10, y: 20 }, 2);
    expect(style.transform).toBe(
      "translate(-50%, -50%) translate(10px, 20px) scale(2)"
    );
    expect(style.transformOrigin).toBe("center center");
    expect(style.imageRendering).toBe("pixelated");
  });
});

// ─── computeFitZoom ──────────────────────────────────────────────────────────

describe("computeFitZoom", () => {
  it("fits by the limiting axis with the default 90% margin", () => {
    // Wide viewport, square canvas — height is limiting: 400/1000 * 0.9.
    expect(computeFitZoom(2000, 400, 1000, 1000)).toBeCloseTo(0.36, 5);
  });

  it("uses the width axis when it is the limiting dimension", () => {
    expect(computeFitZoom(500, 2000, 1000, 1000)).toBeCloseTo(0.45, 5);
  });

  it("can enlarge a small canvas past 100%", () => {
    expect(computeFitZoom(1000, 1000, 100, 100)).toBeCloseTo(9, 5);
  });

  it("honors a custom margin", () => {
    expect(computeFitZoom(1000, 1000, 1000, 1000, 1)).toBe(1);
  });

  it("falls back to 1 when any dimension is non-positive", () => {
    expect(computeFitZoom(0, 500, 1000, 1000)).toBe(1);
    expect(computeFitZoom(500, 500, 0, 1000)).toBe(1);
    expect(computeFitZoom(-10, 500, 1000, 1000)).toBe(1);
  });
});

// ─── SketchCanvasPresentation ────────────────────────────────────────────────

describe("SketchCanvasPresentation", () => {
  it("renders canvas elements", () => {
    const { container } = render(
      <SketchCanvasPresentation {...makeProps()} />
    );
    // Should have at least the bootstrap, display, overlay, GPU selection, selection, cursor, gizmo canvases.
    const canvases = container.querySelectorAll("canvas");
    expect(canvases.length).toBeGreaterThanOrEqual(7);
  });

  it("renders info bar with canvas dimensions and zoom", () => {
    const { container } = render(
      <SketchCanvasPresentation
        {...makeProps({ canvasWidth: 256, canvasHeight: 128, zoom: 2 })}
      />
    );
    const infoBar = container.querySelector(".sketch-canvas__info-bar");
    expect(infoBar).toBeTruthy();
    expect(infoBar!.textContent).toContain("256");
    expect(infoBar!.textContent).toContain("128");
    expect(infoBar!.textContent).toContain("200%");
  });

  it("shows cursor position when the store cursorDocPos is set", () => {
    act(() => {
      useSketchStore.setState({ cursorDocPos: { x: 42, y: 17 } });
    });
    try {
      const { container } = render(
        <SketchCanvasPresentation {...makeProps()} />
      );
      const infoBar = container.querySelector(".sketch-canvas__info-bar");
      expect(infoBar!.textContent).toContain("42");
      expect(infoBar!.textContent).toContain("17");
    } finally {
      act(() => {
        useSketchStore.setState({ cursorDocPos: null });
      });
    }
  });

  it("does NOT render resize handles when onCanvasResize is not provided", () => {
    const { queryByTestId } = render(
      <SketchCanvasPresentation {...makeProps()} />
    );
    expect(queryByTestId("resize-handles")).toBeNull();
  });

  it("renders resize handles when onCanvasResize is provided", () => {
    const { queryByTestId } = render(
      <SketchCanvasPresentation
        {...makeProps({ onCanvasResize: jest.fn() })}
      />
    );
    expect(queryByTestId("resize-handles")).toBeTruthy();
  });

  it("applies the root className", () => {
    const { container } = render(
      <SketchCanvasPresentation
        {...makeProps({ className: "my-test-class" })}
      />
    );
    const root = container.firstElementChild;
    expect(root!.className).toContain("sketch-canvas");
    expect(root!.className).toContain("my-test-class");
  });

});
