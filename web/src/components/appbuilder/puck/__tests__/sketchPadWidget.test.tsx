/**
 * The Sketch Pad's binding: when it writes, what it writes, and what it does
 * before anyone has drawn. The surface is mounted directly — `SketchPadWidget`
 * is the lazy wrapper around exactly this component.
 *
 * The editor session and its canvas are stubbed — they need a real WebGL/2D
 * context that jsdom does not have, and neither is what this file is about. The
 * stub keeps the one seam that matters: the `onExportImage` callback the pad
 * hands the session, which is how a flattened drawing reaches the binding.
 */
import React from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../../__mocks__/themeMock";
import { makeTestRuntime, INPUT_KEY } from "../../__tests__/testRuntime";

const handleClearLayer = jest.fn();
const handleUndo = jest.fn();
const syncSketchOutputsNow = jest.fn();
/** The export callback the pad handed the session on its last render. */
let exportImage: ((dataUrl: string) => void) | undefined;
/** The document the pad seeded the session with. */
let seededDocument: { layers: { name: string; data: string | null }[] } | undefined;

const sketchStoreState = {
  activeTool: "brush",
  setActiveTool: jest.fn(),
  foregroundColor: "#111111",
  setForegroundColor: jest.fn(),
  canUndo: () => true,
  canRedo: () => false
};

jest.mock("../../../sketch", () => {
  // The document helpers are pure and the pad's own tests cover them, so they
  // stay real; everything that needs a canvas is replaced.
  const types = jest.requireActual("../../../sketch/types");
  return {
    __esModule: true,
    createDefaultDocument: types.createDefaultDocument,
    createDefaultLayer: types.createDefaultLayer,
    SKETCH_PRESET_SWATCHES: ["#111111", "#ef4444"],
    SketchCanvasPane: () => <div data-testid="sketch-canvas" />,
    getToolDefinition: (tool: string) => ({
      tool,
      label: tool,
      Icon: () => null
    }),
    useColorIntentRouter: () => jest.fn(),
    useResolvedToolSettings: () => ({
      brush: { size: 8 },
      pencil: { size: 2 },
      eraser: { size: 16 }
    }),
    useToolChromeActions: () => ({
      setBrushSettings: jest.fn(),
      setPencilSettings: jest.fn(),
      setEraserSettings: jest.fn()
    }),
    useSketchStore: (selector: (s: typeof sketchStoreState) => unknown) =>
      selector(sketchStoreState),
    useEditorSession: ({
      initialDocument,
      onExportImage
    }: {
      initialDocument: { layers: { name: string; data: string | null }[] };
      onExportImage: (dataUrl: string) => void;
    }) => {
      exportImage = onExportImage;
      seededDocument = initialDocument;
      return {
        canvasReady: true,
        canvasRef: { current: null },
        document: { layers: [], canvas: { width: 1, height: 1 } },
        activeTool: "brush",
        interactionTool: "brush",
        handleUndo,
        handleRedo: jest.fn(),
        canvasActions: {
          handleStrokeStart: jest.fn(),
          handleStrokeEnd: jest.fn(),
          handleClearLayer,
          handleCommitLayerTransform: jest.fn(),
          flushLayerThumbnailsWhenIdle: jest.fn(),
          syncSketchOutputsNow,
          handleZoomFit: jest.fn()
        },
        canvasStore: { setZoom: jest.fn(), setPan: jest.fn() },
        layerStore: { setLayerContentBounds: jest.fn() },
        colorActions: {
          handleBrushSizeChange: jest.fn(),
          handleEyedropperPick: jest.fn()
        },
        segmentation: {}
      };
    }
  };
});

// The provider builds a real store bundle the stubbed session never reads.
jest.mock("../../../../stores/sketch/SketchInstance", () => ({
  __esModule: true,
  SketchProvider: ({ children }: { children: React.ReactNode }) => children
}));

// eslint-disable-next-line import/first
import { SketchPadSurface } from "../SketchPadSurface";

const PNG = "data:image/png;base64,AAA";

const renderPad = (props: Record<string, unknown> = {}) => {
  const runtime = makeTestRuntime();
  const view = render(
    <ThemeProvider theme={mockTheme}>
      <runtime.wrapper>
        <SketchPadSurface id="pad-1" binding="prompt" {...props} />
      </runtime.wrapper>
    </ThemeProvider>
  );
  return { ...runtime, view };
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  exportImage = undefined;
  seededDocument = undefined;
});

afterEach(() => {
  jest.useRealTimers();
});

describe("SketchPadWidget", () => {
  it("writes the flattened drawing as the image ref an input takes", () => {
    const { value } = renderPad();

    act(() => exportImage?.(PNG));

    expect(value.write).toHaveBeenCalledWith(expect.anything(), {
      type: "image",
      uri: PNG
    });
  });

  it("fires its change event once per finished drawing", () => {
    // A stroke is both the live change and the settled value, so the pad emits
    // both phases — an event must still run the operation exactly once.
    const { value } = renderPad({
      events: [{ trigger: "change", kind: "run" }]
    });

    act(() => exportImage?.(PNG));

    expect(value.dispatch).toHaveBeenCalledTimes(1);
    expect(value.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "run" })
    );
  });

  it("writes nothing before the user has drawn", () => {
    // A pad that published its blank canvas on mount would fire the run wired
    // to it before anyone touched the app.
    const { value } = renderPad();

    jest.advanceTimersByTime(2000);

    expect(syncSketchOutputsNow).not.toHaveBeenCalled();
    expect(value.write).not.toHaveBeenCalled();
  });

  it("flattens after a clear, so erasing the drawing updates the binding", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    renderPad();

    await user.click(screen.getByRole("button", { name: "Clear" }));
    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(handleClearLayer).toHaveBeenCalled();
    expect(syncSketchOutputsNow).toHaveBeenCalled();
  });

  it("offers undo but not redo when only undo is available", () => {
    renderPad();

    expect(screen.getByRole("button", { name: "Undo" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Redo" })).toBeDisabled();
  });

  it("flattens after an undo, so rewinding updates the binding too", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    renderPad();

    await user.click(screen.getByRole("button", { name: "Undo" }));
    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(handleUndo).toHaveBeenCalled();
    expect(syncSketchOutputsNow).toHaveBeenCalled();
  });

  it("does not take the pointer in the builder", () => {
    // In design mode the canvas would swallow the drag Puck needs to move the
    // widget.
    const runtime = makeTestRuntime({}, { designMode: true });
    const { container } = render(
      <ThemeProvider theme={mockTheme}>
        <runtime.wrapper>
          <SketchPadSurface id="pad-1" binding="prompt" />
        </runtime.wrapper>
      </ThemeProvider>
    );

    const pane = screen.getByTestId("sketch-canvas").parentElement;
    expect(pane).toHaveStyle({ pointerEvents: "none" });
    expect(container).toBeTruthy();
  });

  it("labels the pad when the author gave it one", () => {
    renderPad({ label: "Draw a shape" });
    expect(screen.getByText("Draw a shape")).toBeInTheDocument();
  });
});

describe("SketchPadWidget seeding", () => {
  const renderBound = (initial: unknown) => {
    const runtime = makeTestRuntime({
      inputs: { [INPUT_KEY]: { value: initial, dirty: true, revision: 1 } }
    });
    render(
      <ThemeProvider theme={mockTheme}>
        <runtime.wrapper>
          <SketchPadSurface id="pad-1" binding="prompt" />
        </runtime.wrapper>
      </ThemeProvider>
    );
  };

  it("redraws the drawing the binding already held", () => {
    // Switching away from the app's page and back remounts the pad; without
    // this the canvas comes back blank while the binding still holds a drawing.
    renderBound({ type: "image", uri: PNG });

    const drawing = seededDocument?.layers.at(-1);
    expect(drawing?.name).toBe("Drawing");
    expect(drawing?.data).toBe(PNG);
  });

  it("starts blank when the binding holds a reference it cannot draw", () => {
    renderBound({ type: "image", uri: "https://cdn.test/a.png" });

    expect(seededDocument?.layers.at(-1)?.data).toBeNull();
  });
});
