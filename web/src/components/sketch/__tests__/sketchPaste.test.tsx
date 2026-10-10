/**
 * @jest-environment jsdom
 *
 * Paste: a locked layer refuses it the way Clear and Fill do, and paste as a
 * new layer is a single undo step.
 */
import type { RefObject } from "react";
import { stub } from "../../../test-utils/doubles";
import { act, renderHook } from "@testing-library/react";
import { useCanvasGeometryActions } from "../hooks/useCanvasGeometryActions";
import type { SketchCanvasRef } from "../SketchCanvas";
import { useSketchStore } from "../state/useSketchStore";
import { makeAffineTransform } from "../types";

jest.mock("../sketchClipboard", () => ({
  ...jest.requireActual("../sketchClipboard"),
  writeImageCanvasToSystemClipboardPng: jest.fn(),
  resolveSketchPasteImageCanvas: jest.fn(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 4;
    canvas.height = 4;
    return canvas;
  })
}));

it("does not paste into a locked layer", async () => {
  act(() => {
    useSketchStore.getState().resetDocument(32, 32);
  });
  act(() => {
    const doc = useSketchStore.getState().document;
    useSketchStore.getState().replaceDocument({
      ...doc,
      layers: doc.layers.map((layer) => ({ ...layer, locked: true }))
    });
  });
  const snapshotLayerCanvas = jest.fn(() => document.createElement("canvas"));
  const pushHistory = jest.fn();
  const store = useSketchStore.getState();
  const { result } = renderHook(() =>
    useCanvasGeometryActions({
      canvasRef: stub<RefObject<SketchCanvasRef | null>>({
        current: { snapshotLayerCanvas, getLayerData: jest.fn(() => null) }
      }),
      document: store.document,
      pushHistory,
      updateLayerData: store.updateLayerData,
      setZoom: store.setZoom,
      setPan: store.setPan,
      resizeCanvas: store.resizeCanvas,
      offsetAllPaintLayersTransform: store.offsetAllPaintLayersTransform,
      commitPixelLayerChange: jest.fn(),
      syncPixelLayerFromCanvas: jest.fn(),
      reconcileAllLayerTransforms: jest.fn(),
      syncSketchOutputsNow: jest.fn()
    })
  );

  await act(async () => {
    await result.current.handlePaste(true);
  });

  expect(pushHistory).not.toHaveBeenCalled();
  expect(snapshotLayerCanvas).not.toHaveBeenCalled();
});

it("records paste as a new layer as one undo step", async () => {
  act(() => {
    useSketchStore.getState().resetDocument(32, 32);
  });
  const store = useSketchStore.getState();
  const { result } = renderHook(() =>
    useCanvasGeometryActions({
      canvasRef: stub<RefObject<SketchCanvasRef | null>>({
        current: {
          setLayerData: jest.fn(),
          snapshotLayerCanvas: jest.fn(() => null),
          getLayerData: jest.fn(() => null)
        }
      }),
      document: store.document,
      pushHistory: store.pushHistory,
      updateLayerData: store.updateLayerData,
      setZoom: store.setZoom,
      setPan: store.setPan,
      resizeCanvas: store.resizeCanvas,
      offsetAllPaintLayersTransform: store.offsetAllPaintLayersTransform,
      commitPixelLayerChange: jest.fn(),
      syncPixelLayerFromCanvas: jest.fn(),
      reconcileAllLayerTransforms: jest.fn(),
      syncSketchOutputsNow: jest.fn()
    })
  );

  await act(async () => {
    await result.current.handlePasteAsNewLayer(() => useSketchStore.getState().addLayer());
  });
  expect(useSketchStore.getState().document.layers).toHaveLength(2);
  // The checkpoint is taken before the layer exists.
  const { history, historyIndex } = useSketchStore.getState();
  expect(history[historyIndex].action).toBe("paste");
  expect(history[historyIndex].layerStructure).toHaveLength(1);

  act(() => {
    useSketchStore.getState().undo();
  });
  expect(useSketchStore.getState().document.layers).toHaveLength(1);
  expect(useSketchStore.getState().canUndo()).toBe(false);
});

it("reports a moved layer's position as the origin of a whole-layer copy", () => {
  act(() => {
    useSketchStore.getState().resetDocument(32, 32);
    const layerId = useSketchStore.getState().document.activeLayerId!;
    useSketchStore.getState().setLayerTransform(layerId, makeAffineTransform({ x: 10, y: 4 }));
  });
  const snapshot = document.createElement("canvas");
  snapshot.width = 32;
  snapshot.height = 32;
  const store = useSketchStore.getState();
  const { result } = renderHook(() =>
    useCanvasGeometryActions({
      canvasRef: stub<RefObject<SketchCanvasRef | null>>({
        current: { snapshotLayerCanvas: jest.fn(() => snapshot) }
      }),
      document: store.document,
      pushHistory: store.pushHistory,
      updateLayerData: store.updateLayerData,
      setZoom: store.setZoom,
      setPan: store.setPan,
      resizeCanvas: store.resizeCanvas,
      offsetAllPaintLayersTransform: store.offsetAllPaintLayersTransform,
      commitPixelLayerChange: jest.fn(),
      syncPixelLayerFromCanvas: jest.fn(),
      reconcileAllLayerTransforms: jest.fn(),
      syncSketchOutputsNow: jest.fn()
    })
  );

  let origin: ReturnType<typeof result.current.handleCopy> = null;
  act(() => {
    origin = result.current.handleCopy();
  });
  expect(origin).toEqual({ x: 10, y: 4 });
});
