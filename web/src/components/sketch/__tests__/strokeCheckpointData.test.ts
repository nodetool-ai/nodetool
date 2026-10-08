/**
 * Strokes defer writing their pixels into the document until the browser is
 * idle. A stroke that starts before that flush must still record the previous
 * stroke's pixels in its checkpoint, or undo restores stale layer data and the
 * canvas re-hydrates from it (a blank layer after a single Ctrl+Z).
 */

import { act, renderHook } from "@testing-library/react";

import { useStrokeLifecycleActions } from "../hooks/useStrokeLifecycleActions";
import { useSketchStore } from "../state/useSketchStore";
import type { SketchCanvasRef } from "../SketchCanvas";

beforeEach(() => {
  act(() => {
    useSketchStore.getState().resetDocument();
  });
});

it("records the pixels of a still-pending stroke in the next stroke's checkpoint", () => {
  const layerId = useSketchStore.getState().document.activeLayerId;
  let canvasData: string | null = null;
  const canvasRef = {
    current: {
      drainPendingStrokeCommit: jest.fn(),
      snapshotLayerCanvas: jest.fn(() => window.document.createElement("canvas")),
      getLayerData: jest.fn(() => canvasData)
    } as Partial<SketchCanvasRef> as SketchCanvasRef
  };

  const { result } = renderHook(() =>
    useStrokeLifecycleActions({
      canvasRef,
      document: useSketchStore.getState().document,
      activeTool: "brush",
      interactionTool: "brush",
      pushHistory: useSketchStore.getState().pushHistory,
      updateLayerData: useSketchStore.getState().updateLayerData,
      setLayerContentBounds: useSketchStore.getState().setLayerContentBounds,
      pendingExportSyncRef: { current: { image: false, mask: false } }
    })
  );

  act(() => {
    result.current.handleStrokeStart();
  });
  canvasData = "pixels-after-stroke-1";
  act(() => {
    // The brush ends without serializing; the document sync is deferred.
    result.current.handleStrokeEnd(layerId, null);
    result.current.handleStrokeStart();
  });

  const { history } = useSketchStore.getState();
  expect(history).toHaveLength(2);
  expect(history[1]!.layerSnapshots[layerId]).toBe("pixels-after-stroke-1");
});
