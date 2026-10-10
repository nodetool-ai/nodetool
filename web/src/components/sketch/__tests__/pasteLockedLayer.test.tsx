/**
 * @jest-environment jsdom
 *
 * Paste writes pixels into the target layer, so a locked layer must refuse it
 * the way Clear and Fill do.
 */
import type { RefObject } from "react";
import { stub } from "../../../test-utils/doubles";
import { act, renderHook } from "@testing-library/react";
import { useCanvasGeometryActions } from "../hooks/useCanvasGeometryActions";
import type { SketchCanvasRef } from "../SketchCanvas";
import { useSketchStore } from "../state/useSketchStore";

jest.mock("../sketchClipboard", () => ({
  ...jest.requireActual("../sketchClipboard"),
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
