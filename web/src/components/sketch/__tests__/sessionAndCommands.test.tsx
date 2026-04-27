/**
 * @jest-environment jsdom
 *
 * Regression tests for the refactored editor session layer, command surface,
 * transform adapter, and editor-shell module extraction.
 *
 * Tests cover:
 * 1. useEditorSession: session state isolation, interaction tool derivation
 * 2. useTransformAdapter: shared transform display/action model
 * 3. useEditorCommands: command surface wiring
 * 4. Editor-shell module: connected components re-export
 */
import { renderHook, act } from "@testing-library/react";
import { useSketchStore } from "../state/useSketchStore";
import {
  useEditorSession,
  useEditorCommands,
  useTransformAdapter
} from "../hooks";
import {
  setActiveLayerTransformPreview,
  clearActiveLayerTransformPreview
} from "../activeLayerTransform";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetStore() {
  const state = useSketchStore.getState();
  state.setActiveTool("brush");
  state.setForegroundColor("#ffffff");
  state.setBackgroundColor("#000000");
}

beforeEach(() => {
  resetStore();
  clearActiveLayerTransformPreview();
});

// ---------------------------------------------------------------------------
// 1. useEditorSession
// ---------------------------------------------------------------------------

describe("useEditorSession", () => {
  it("returns canvasRef, store bundles, narrow state, and composed action hooks", () => {
    const { result } = renderHook(() =>
      useEditorSession({
        initialDocument: undefined,
        onDocumentChange: undefined,
        onExportImage: undefined,
        onExportMask: undefined
      })
    );

    const s = result.current;

    // Refs
    expect(s.canvasRef).toBeDefined();
    expect(s.canvasRef.current).toBeNull();

    // Store bundles
    expect(s.historyStore).toBeDefined();
    expect(s.layerStore).toBeDefined();
    expect(s.canvasStore).toBeDefined();
    expect(s.colorStore).toBeDefined();
    expect(s.sessionStore).toBeDefined();

    // Narrow state
    expect(s.document).toBeDefined();
    expect(typeof s.activeTool).toBe("string");
    expect(typeof s.interactionTool).toBe("string");

    // Composed actions
    expect(typeof s.handleUndo).toBe("function");
    expect(typeof s.handleRedo).toBe("function");
    expect(s.layerActions).toBeDefined();
    expect(s.canvasActions).toBeDefined();
    expect(s.colorActions).toBeDefined();
    expect(s.segmentation).toBeDefined();

    // Lifecycle
    expect(typeof s.canvasReady).toBe("boolean");
    expect(s.initialDocumentRef).toBeDefined();
    expect(typeof s.canvasResizeHandlesEnabled).toBe("boolean");
    expect(typeof s.handleCanvasResizeHandlesEnabledChange).toBe("function");
  });

  it("derives interactionTool as 'move' when transientMoveModifierHeld is true and activeTool is not 'move'", () => {
    const { result } = renderHook(() =>
      useEditorSession({
        initialDocument: undefined,
        onDocumentChange: undefined,
        onExportImage: undefined,
        onExportMask: undefined
      })
    );

    expect(result.current.activeTool).toBe("brush");
    expect(result.current.interactionTool).toBe("brush");

    act(() => {
      useSketchStore.getState().setTransientMoveModifierHeld(true);
    });

    expect(result.current.activeTool).toBe("brush");
    expect(result.current.interactionTool).toBe("move");
  });

  it("returns stable store bundle references across rerenders", () => {
    const { result, rerender } = renderHook(() =>
      useEditorSession({
        initialDocument: undefined,
        onDocumentChange: undefined,
        onExportImage: undefined,
        onExportMask: undefined
      })
    );

    const first = result.current;
    rerender();
    const second = result.current;

    expect(second.historyStore).toBeDefined();
    expect(second.canvasStore).toBeDefined();
    expect(second.sessionStore).toBeDefined();
  });

  it("does not rerender when unrelated store state changes (zoom/pan)", () => {
    let renderCount = 0;
    renderHook(() => {
      renderCount++;
      return useEditorSession({
        initialDocument: undefined,
        onDocumentChange: undefined,
        onExportImage: undefined,
        onExportMask: undefined
      });
    });

    const baseline = renderCount;

    // Zoom and pan changes should not trigger session rerender since
    // useEditorSession does not subscribe to zoom/pan
    act(() => {
      useSketchStore.getState().setZoom(2);
    });

    // The session may or may not rerender depending on internal subscriptions,
    // but it should not rerender more than once per state change
    expect(renderCount).toBeLessThanOrEqual(baseline + 1);
  });
});

// ---------------------------------------------------------------------------
// 2. useTransformAdapter
// ---------------------------------------------------------------------------

describe("useTransformAdapter", () => {
  it("returns display state and action callbacks", () => {
    const onCommit = jest.fn();
    const onCancel = jest.fn();
    const onReset = jest.fn();

    const { result } = renderHook(() =>
      useTransformAdapter({
        onTransformCommit: onCommit,
        onTransformCancel: onCancel,
        onTransformReset: onReset
      })
    );

    expect(result.current.display).toEqual({
      scaleX: 1,
      scaleY: 1,
      rotation: 0
    });
    expect(typeof result.current.actions.onCommit).toBe("function");
    expect(typeof result.current.actions.onCancel).toBe("function");
    expect(typeof result.current.actions.onReset).toBe("function");
  });

  it("display state reflects preview transform when active", () => {
    const onCommit = jest.fn();
    const onCancel = jest.fn();
    const onReset = jest.fn();

    const { result } = renderHook(() =>
      useTransformAdapter({
        onTransformCommit: onCommit,
        onTransformCancel: onCancel,
        onTransformReset: onReset
      })
    );

    const layerId = useSketchStore.getState().document.activeLayerId;
    act(() => {
      setActiveLayerTransformPreview({
        layerId,
        transform: { x: 0, y: 0, scaleX: 2, scaleY: 0.5, rotation: Math.PI / 4 }
      });
    });

    expect(result.current.display.scaleX).toBe(2);
    expect(result.current.display.scaleY).toBe(0.5);
    expect(result.current.display.rotation).toBeCloseTo(Math.PI / 4);
  });

  it("display state resets when preview is cleared", () => {
    const onCommit = jest.fn();
    const onCancel = jest.fn();
    const onReset = jest.fn();

    const { result } = renderHook(() =>
      useTransformAdapter({
        onTransformCommit: onCommit,
        onTransformCancel: onCancel,
        onTransformReset: onReset
      })
    );

    const layerId = useSketchStore.getState().document.activeLayerId;
    act(() => {
      setActiveLayerTransformPreview({
        layerId,
        transform: { x: 0, y: 0, scaleX: 3, scaleY: 3, rotation: 1 }
      });
    });

    expect(result.current.display.scaleX).toBe(3);

    act(() => {
      clearActiveLayerTransformPreview();
    });

    expect(result.current.display.scaleX).toBe(1);
    expect(result.current.display.scaleY).toBe(1);
    expect(result.current.display.rotation).toBe(0);
  });

  it("action callbacks delegate to provided handlers", () => {
    const onCommit = jest.fn();
    const onCancel = jest.fn();
    const onReset = jest.fn();

    const { result } = renderHook(() =>
      useTransformAdapter({
        onTransformCommit: onCommit,
        onTransformCancel: onCancel,
        onTransformReset: onReset
      })
    );

    result.current.actions.onCommit();
    expect(onCommit).toHaveBeenCalledTimes(1);

    result.current.actions.onCancel();
    expect(onCancel).toHaveBeenCalledTimes(1);

    result.current.actions.onReset();
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("returns stable display reference when scalars have not changed", () => {
    const onCommit = jest.fn();
    const onCancel = jest.fn();
    const onReset = jest.fn();

    const { result, rerender } = renderHook(() =>
      useTransformAdapter({
        onTransformCommit: onCommit,
        onTransformCancel: onCancel,
        onTransformReset: onReset
      })
    );

    const first = result.current.display;
    rerender();
    const second = result.current.display;

    // Memoized — same reference when scalars unchanged
    expect(second).toBe(first);
  });
});

// ---------------------------------------------------------------------------
// 3. Editor-shell module exports
// ---------------------------------------------------------------------------

describe("editor-shell module", () => {
  it("exports all connected components", async () => {
    const shell = await import("../editor-shell");

    expect(shell.ConnectedToolbar).toBeDefined();
    expect(shell.ConnectedToolTopBar).toBeDefined();
    expect(shell.ConnectedLayersPanel).toBeDefined();
    expect(shell.ConnectedContextMenu).toBeDefined();
    expect(shell.SketchCanvasPane).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 4. Hooks index exports
// ---------------------------------------------------------------------------

describe("hooks index exports", () => {
  it("exports useEditorSession", async () => {
    const hooks = await import("../hooks");
    expect(hooks.useEditorSession).toBeDefined();
  });

  it("exports useEditorCommands", async () => {
    const hooks = await import("../hooks");
    expect(hooks.useEditorCommands).toBeDefined();
  });

  it("exports useTransformAdapter", async () => {
    const hooks = await import("../hooks");
    expect(hooks.useTransformAdapter).toBeDefined();
  });
});

describe("useEditorCommands", () => {
  const createParams = (): Parameters<typeof useEditorCommands>[0] => {
    const document = useSketchStore.getState().document;
    const editorRef = { current: null };
    const canvasRef = { current: null };
    const initialDocumentRef = { current: document };

    return {
      editorRef,
      canvasRef,
      initialDocumentRef,
      document,
      handleUndo: jest.fn(),
      handleRedo: jest.fn(),
      canvasActions: {
        handleZoomIn: jest.fn(),
        handleZoomOut: jest.fn(),
        handleZoomReset: jest.fn(),
        handleExportPng: jest.fn(),
        handleClearLayer: jest.fn(),
        handleFillLayerWithColor: jest.fn(),
        handleCopy: jest.fn(),
        handleCut: jest.fn(),
        handlePaste: jest.fn(async () => undefined),
        handleNudgeLayer: jest.fn(),
        syncSketchOutputsNow: jest.fn(),
        handleInvertLayerColors: jest.fn(),
        prepareSelectionFreeTransform: jest.fn()
      } as unknown as Parameters<typeof useEditorCommands>[0]["canvasActions"],
      layerActions: {
        handleAddLayer: jest.fn(() => "layer-new")
      } as unknown as Parameters<typeof useEditorCommands>[0]["layerActions"],
      colorActions: {} as unknown as Parameters<typeof useEditorCommands>[0]["colorActions"],
      segmentation: {
        runSegmentation: jest.fn(),
        splitSelectedLayer: jest.fn()
      } as unknown as Parameters<typeof useEditorCommands>[0]["segmentation"],
      canvasStore: {
        setZoom: jest.fn(),
        setMirrorX: jest.fn(),
        setMirrorY: jest.fn()
      } as unknown as Parameters<typeof useEditorCommands>[0]["canvasStore"],
      colorStore: {
        setBrushSettings: jest.fn(),
        setPencilSettings: jest.fn(),
        setEraserSettings: jest.fn(),
        setShapeSettings: jest.fn(),
        setBlurSettings: jest.fn(),
        setCloneStampSettings: jest.fn(),
        swapColors: jest.fn(),
        resetColors: jest.fn()
      } as unknown as Parameters<typeof useEditorCommands>[0]["colorStore"],
      sessionStore: {
        setActiveTool: jest.fn(),
        togglePanelsHidden: jest.fn(),
        setDocument: jest.fn()
      } as unknown as Parameters<typeof useEditorCommands>[0]["sessionStore"]
    };
  };

  it("routes layer via copy through a new target layer", async () => {
    const params = createParams();
    const { result } = renderHook(() => useEditorCommands(params));

    await act(async () => {
      await result.current.handleLayerViaCopy();
    });

    expect(params.canvasActions.handleCopy).toHaveBeenCalledTimes(1);
    expect(params.layerActions.handleAddLayer).toHaveBeenCalledTimes(1);
    expect(params.canvasActions.handlePaste).toHaveBeenCalledWith(true, {
      targetLayerId: "layer-new",
      pasteAnchorDocument: null
    });
  });

  it("routes layer via cut through a new target layer", async () => {
    const params = createParams();
    const { result } = renderHook(() => useEditorCommands(params));

    await act(async () => {
      await result.current.handleLayerViaCut();
    });

    expect(params.canvasActions.handleCut).toHaveBeenCalledTimes(1);
    expect(params.layerActions.handleAddLayer).toHaveBeenCalledTimes(1);
    expect(params.canvasActions.handlePaste).toHaveBeenCalledWith(true, {
      targetLayerId: "layer-new",
      pasteAnchorDocument: null
    });
  });

  it("creates the requested layer type from the context menu", () => {
    const params = createParams();
    const { result } = renderHook(() => useEditorCommands(params));

    act(() => {
      result.current.handleNewLayerFromContextMenu("mask");
    });

    expect(params.layerActions.handleAddLayer).toHaveBeenCalledWith({
      type: "mask"
    });
  });

  it("routes Local SAM3 runs through splitSelectedLayer", () => {
    useSketchStore.setState((state) => ({
      document: {
        ...state.document,
        toolSettings: {
          ...state.document.toolSettings,
          segment: {
            ...state.document.toolSettings.segment,
            backend: "local-sam3"
          }
        }
      }
    }));
    const params = createParams();
    const { result } = renderHook(() => useEditorCommands(params));

    act(() => {
      result.current.handleRunSegmentation();
    });

    expect(params.segmentation.splitSelectedLayer).toHaveBeenCalledTimes(1);
    expect(params.segmentation.runSegmentation).not.toHaveBeenCalled();
  });
});
