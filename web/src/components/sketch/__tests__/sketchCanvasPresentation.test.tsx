/**
 * @jest-environment jsdom
 *
 * Tests for SketchCanvasPresentation — the purely presentational layer
 * extracted from SketchCanvas. Verifies canvas elements, cursor style,
 * info bar content, and resize handle rendering.
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import SketchCanvasPresentation, {
  cursorStyleForTool,
  canvasTransformStyle
} from "../SketchCanvasPresentation";
import type { SketchCanvasPresentationProps } from "../SketchCanvasPresentation";

// Mock MUI ThemeProvider — SketchCanvasPresentation uses useTheme.
jest.mock("@mui/material/styles", () => ({
  ...jest.requireActual("@mui/material/styles"),
  useTheme: () => ({
    vars: { palette: { grey: { 800: "#424242" } } }
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
    canvasWidth: 128,
    canvasHeight: 64,
    zoom: 1,
    pan: { x: 0, y: 0 },
    interactionTool: "brush",
    containerCursor: cursorStyleForTool("brush"),
    bootstrapPhaseActive: false,
    backend: "canvas2d",
    cursorDocPos: null,
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

  it("shows cursor position when cursorDocPos is provided", () => {
    const { container } = render(
      <SketchCanvasPresentation
        {...makeProps({ cursorDocPos: { x: 42, y: 17 } })}
      />
    );
    const infoBar = container.querySelector(".sketch-canvas__info-bar");
    expect(infoBar!.textContent).toContain("42");
    expect(infoBar!.textContent).toContain("17");
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

  it("shows backend label in info bar", () => {
    const { container } = render(
      <SketchCanvasPresentation {...makeProps({ backend: "webgpu" })} />
    );
    const infoBar = container.querySelector(".sketch-canvas__info-bar");
    expect(infoBar!.textContent?.toLowerCase()).toContain("webgpu");
  });
});
