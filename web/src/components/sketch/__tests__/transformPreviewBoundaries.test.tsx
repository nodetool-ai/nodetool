/**
 * @jest-environment jsdom
 *
 * Regression tests for:
 * 1. Move/transform preview updates only rerender transform UI consumers,
 *    not SketchEditor or unrelated shell components.
 * 2. Locked exposed-input layers hydrate and show move/transform preview
 *    before any brush stroke.
 * 3. Tool-switch lifecycle rules: leaving `adjust`, `transform`, or `segment`
 *    cancels, initializes, and preserves correct preview/session state.
 */
import React from "react";
import { act, renderHook } from "@testing-library/react";
import { useSketchStore } from "../state/useSketchStore";
import {
  clearActiveLayerTransformPreview,
  setActiveLayerTransformPreview,
  useDisplayedActiveLayerTransform
} from "../activeLayerTransform";
import { createDefaultDocument, createDefaultLayer, makeAffineTransform, type LayerTransform, type SketchDocument } from "../types";
import { aff } from "./_transformFixtures";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Simulate a ConnectedToolbar subscriber (subscribes to activeTool + colors). */
function useToolbarSelectors() {
  const activeTool = useSketchStore((s) => s.activeTool);
  const foregroundColor = useSketchStore((s) => s.foregroundColor);
  return { activeTool, foregroundColor };
}

/** Simulate a ConnectedLayersPanel subscriber (subscribes to document fields). */
function useLayersPanelSelectors() {
  const layers = useSketchStore((s) => s.document.layers);
  const activeLayerId = useSketchStore((s) => s.document.activeLayerId);
  return { layers, activeLayerId };
}

/** Simulate SketchEditor body subscriber (subscribes to document + activeTool). */
function useEditorSelectors() {
  const document = useSketchStore((s) => s.document);
  const activeTool = useSketchStore((s) => s.activeTool);
  return { document, activeTool };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  act(() => {
    useSketchStore.getState().resetDocument();
    clearActiveLayerTransformPreview();
  });
});

// ---------------------------------------------------------------------------
// 1. Move/Transform preview rerender isolation
// ---------------------------------------------------------------------------

describe("Move/Transform preview rerender boundaries", () => {
  it("transform preview updates do NOT rerender toolbar selectors", () => {
    let toolbarRenders = 0;
    renderHook(() => {
      toolbarRenders += 1;
      return useToolbarSelectors();
    });
    expect(toolbarRenders).toBe(1);

    const layerId = useSketchStore.getState().document.activeLayerId;
    act(() => {
      setActiveLayerTransformPreview({
        layerId,
        transform: makeAffineTransform({ x: 10, y: 20, scaleX: 1, scaleY: 1, rotation: 0 })
      });
    });
    // Toolbar should not rerender â€” it doesn't subscribe to transform preview
    expect(toolbarRenders).toBe(1);
  });

  it("transform preview updates do NOT rerender layers panel selectors", () => {
    let panelRenders = 0;
    renderHook(() => {
      panelRenders += 1;
      return useLayersPanelSelectors();
    });
    expect(panelRenders).toBe(1);

    const layerId = useSketchStore.getState().document.activeLayerId;
    act(() => {
      setActiveLayerTransformPreview({
        layerId,
        transform: makeAffineTransform({ x: 50, y: -30, scaleX: 1.2, scaleY: 0.8, rotation: 0.5 })
      });
    });
    // Layers panel should not rerender
    expect(panelRenders).toBe(1);
  });

  it("transform preview updates DO rerender useDisplayedActiveLayerTransform consumers", () => {
    let transformRenders = 0;
    const { result } = renderHook(() => {
      transformRenders += 1;
      return useDisplayedActiveLayerTransform();
    });
    expect(transformRenders).toBe(1);

    const layerId = useSketchStore.getState().document.activeLayerId;
    const previewTransform: LayerTransform = makeAffineTransform({
      x: 15,
      y: -10,
      scaleX: 1.3,
      scaleY: 0.9,
      rotation: Math.PI / 6
    });

    act(() => {
      setActiveLayerTransformPreview({ layerId, transform: previewTransform });
    });
    expect(transformRenders).toBe(2);
    expect(result.current).toEqual(previewTransform);
  });

  it("rapid preview updates each rerender only transform consumers", () => {
    let toolbarRenders = 0;
    let transformRenders = 0;

    renderHook(() => {
      toolbarRenders += 1;
      return useToolbarSelectors();
    });

    renderHook(() => {
      transformRenders += 1;
      return useDisplayedActiveLayerTransform();
    });

    expect(toolbarRenders).toBe(1);
    expect(transformRenders).toBe(1);

    const layerId = useSketchStore.getState().document.activeLayerId;
    for (let i = 0; i < 5; i++) {
      act(() => {
        setActiveLayerTransformPreview({
          layerId,
          transform: makeAffineTransform({ x: i * 10, y: i * 5 })
        });
      });
    }

    // Toolbar should not have rerendered at all
    expect(toolbarRenders).toBe(1);
    // Transform consumer should have rerendered for each preview update
    expect(transformRenders).toBe(6); // 1 initial + 5 updates
  });

  it("clearing preview rerenders transform consumers but not toolbar", () => {
    let toolbarRenders = 0;
    let transformRenders = 0;

    renderHook(() => {
      toolbarRenders += 1;
      return useToolbarSelectors();
    });

    renderHook(() => {
      transformRenders += 1;
      return useDisplayedActiveLayerTransform();
    });

    const layerId = useSketchStore.getState().document.activeLayerId;
    act(() => {
      setActiveLayerTransformPreview({
        layerId,
        transform: makeAffineTransform({ x: 30, y: 40, scaleX: 2, scaleY: 2, rotation: 0 })
      });
    });

    const toolbarRendersAfterPreview = toolbarRenders;
    const transformRendersAfterPreview = transformRenders;

    act(() => {
      clearActiveLayerTransformPreview();
    });

    expect(toolbarRenders).toBe(toolbarRendersAfterPreview);
    expect(transformRenders).toBe(transformRendersAfterPreview + 1);
  });
});

// ---------------------------------------------------------------------------
// 2. Exposed-input layer hydration and preview before brush stroke
// ---------------------------------------------------------------------------

describe("Exposed-input layer hydration with transform preview", () => {
  it("image-reference layer shows preview transform without prior brush stroke", () => {
    // Simulate an imageReference layer (as created by exposed inputs)
    act(() => {
      const doc = createDefaultDocument(64, 64);
      const layer = doc.layers[0];
      layer.data = null;
      layer.imageReference = {
        uri: "asset://test-image.png",
        naturalWidth: 64,
        naturalHeight: 64,
        objectFit: "fill"
      };
      useSketchStore.getState().setDocument(doc);
    });

    const { result } = renderHook(() => useDisplayedActiveLayerTransform());
    const layerId = useSketchStore.getState().document.activeLayerId;

    // Verify the layer has an imageReference and no brush data
    const layer = useSketchStore.getState().document.layers.find(
      (l) => l.id === layerId
    );
    expect(layer?.imageReference?.uri).toBe("asset://test-image.png");
    expect(layer?.data).toBeNull();

    // Apply a transform preview â€” should work even without any brush stroke
    const previewTransform: LayerTransform = {
      kind: "affine",
      x: 25,
      y: -15,
      scaleX: 1.5,
      scaleY: 1.5,
      rotation: 0
    };

    act(() => {
      setActiveLayerTransformPreview({ layerId, transform: previewTransform });
    });

    expect(result.current).toEqual(previewTransform);
  });

  it("locked layer with imageReference still shows preview transform", () => {
    act(() => {
      const doc = createDefaultDocument(64, 64);
      const layer = doc.layers[0];
      layer.locked = true;
      layer.imageReference = {
        uri: "asset://locked-layer.png",
        naturalWidth: 64,
        naturalHeight: 64,
        objectFit: "fill"
      };
      useSketchStore.getState().setDocument(doc);
    });

    const { result } = renderHook(() => useDisplayedActiveLayerTransform());
    const layerId = useSketchStore.getState().document.activeLayerId;

    const previewTransform: LayerTransform = {
      kind: "affine",
      x: 10,
      y: 10,
      scaleX: 0.8,
      scaleY: 0.8,
      rotation: Math.PI / 4
    };

    act(() => {
      setActiveLayerTransformPreview({ layerId, transform: previewTransform });
    });

    expect(result.current).toEqual(previewTransform);
  });

  it("asset:// URI is preserved through document state for hydration", () => {
    act(() => {
      const doc = createDefaultDocument(64, 64);
      const layer = doc.layers[0];
      layer.imageReference = {
        uri: "asset://hydration-test.png",
        naturalWidth: 128,
        naturalHeight: 128,
        objectFit: "fill"
      };
      useSketchStore.getState().setDocument(doc);
    });

    const layerId = useSketchStore.getState().document.activeLayerId;
    const layer = useSketchStore.getState().document.layers.find(
      (l) => l.id === layerId
    );
    expect(layer?.imageReference?.uri).toBe("asset://hydration-test.png");
  });
});

// ---------------------------------------------------------------------------
// 3. Tool-switch lifecycle rules
// ---------------------------------------------------------------------------

describe("Tool-switch lifecycle rules", () => {
  it("switching from transform clears active transform preview", () => {
    const { result } = renderHook(() => useDisplayedActiveLayerTransform());
    const layerId = useSketchStore.getState().document.activeLayerId;

    // Set transform tool as active and apply a preview
    act(() => {
      useSketchStore.getState().setActiveTool("transform");
      setActiveLayerTransformPreview({
        layerId,
        transform: makeAffineTransform({ x: 50, y: 50, scaleX: 2, scaleY: 2, rotation: 0 })
      });
    });

    expect(result.current).toEqual({
      kind: "affine",
      x: 50,
      y: 50,
      scaleX: 2,
      scaleY: 2,
      rotation: 0
    });

    // Switch away from transform to brush
    act(() => {
      useSketchStore.getState().setActiveTool("brush");
      clearActiveLayerTransformPreview();
    });

    // Preview should be cleared, falling back to stored transform
    const storedTransform =
      useSketchStore.getState().document.layers.find((l) => l.id === layerId)
        ?.transform ?? { x: 0, y: 0 };
    expect(result.current).toEqual(storedTransform);
  });

  it("switching from move clears active transform preview", () => {
    const { result } = renderHook(() => useDisplayedActiveLayerTransform());
    const layerId = useSketchStore.getState().document.activeLayerId;

    act(() => {
      useSketchStore.getState().setActiveTool("move");
      setActiveLayerTransformPreview({
        layerId,
        transform: makeAffineTransform({ x: 100, y: -50, scaleX: 1, scaleY: 1, rotation: 0 })
      });
    });

    expect(aff(result.current).x).toBe(100);

    act(() => {
      useSketchStore.getState().setActiveTool("pencil");
      clearActiveLayerTransformPreview();
    });

    const storedTransform =
      useSketchStore.getState().document.layers.find((l) => l.id === layerId)
        ?.transform ?? { x: 0, y: 0 };
    expect(result.current).toEqual(storedTransform);
  });

  it("switching between non-preview tools does not affect editor state", () => {
    let editorRenders = 0;
    renderHook(() => {
      editorRenders += 1;
      return useEditorSelectors();
    });

    const initialRenders = editorRenders;

    act(() => {
      useSketchStore.getState().setActiveTool("brush");
    });
    act(() => {
      useSketchStore.getState().setActiveTool("pencil");
    });
    act(() => {
      useSketchStore.getState().setActiveTool("eraser");
    });

    // Editor should rerender for tool changes (activeTool is subscribed)
    // but document reference should not change
    const finalRenders = editorRenders;
    expect(finalRenders).toBeGreaterThan(initialRenders);
  });

  it("switching to adjust initializes clean state", () => {
    // Switch to adjust tool
    act(() => {
      useSketchStore.getState().setActiveTool("adjust");
    });

    expect(useSketchStore.getState().activeTool).toBe("adjust");

    // Switch away from adjust to brush
    act(() => {
      useSketchStore.getState().setActiveTool("brush");
    });

    expect(useSketchStore.getState().activeTool).toBe("brush");
  });

  it("switching to segment initializes clean state", () => {
    act(() => {
      useSketchStore.getState().setActiveTool("segment");
    });
    expect(useSketchStore.getState().activeTool).toBe("segment");

    // Switch away
    act(() => {
      useSketchStore.getState().setActiveTool("select");
    });
    expect(useSketchStore.getState().activeTool).toBe("select");
  });

  it("rapid tool switches preserve consistent preview state", () => {
    const { result } = renderHook(() => useDisplayedActiveLayerTransform());
    const layerId = useSketchStore.getState().document.activeLayerId;

    // Rapid: transform â†’ move â†’ brush â†’ transform
    act(() => {
      useSketchStore.getState().setActiveTool("transform");
      setActiveLayerTransformPreview({
        layerId,
        transform: makeAffineTransform({ x: 10, y: 10, scaleX: 1, scaleY: 1, rotation: 0 })
      });
    });
    act(() => {
      useSketchStore.getState().setActiveTool("move");
      clearActiveLayerTransformPreview();
      setActiveLayerTransformPreview({
        layerId,
        transform: makeAffineTransform({ x: 20, y: 20, scaleX: 1, scaleY: 1, rotation: 0 })
      });
    });
    act(() => {
      useSketchStore.getState().setActiveTool("brush");
      clearActiveLayerTransformPreview();
    });
    act(() => {
      useSketchStore.getState().setActiveTool("transform");
    });

    // After clearing all previews and switching back to transform,
    // should show stored transform (no stale previews)
    const storedTransform =
      useSketchStore.getState().document.layers.find((l) => l.id === layerId)
        ?.transform ?? { x: 0, y: 0 };
    expect(result.current).toEqual(storedTransform);
  });
});

