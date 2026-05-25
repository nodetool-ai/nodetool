/**
 * @jest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { useTransformActions } from "../hooks/useTransformActions";
import { useSketchStore } from "../state/useSketchStore";
import { serializeLayerData } from "../rendering/canvas2d/layerIO";
import { reconcileLayerToDocumentSpace } from "../rendering/canvas2d/reconcile";
import { getCanvasRasterBounds, setCanvasRasterBounds } from "../transform/geometry/layerGeometry";

function cloneCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = window.document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.drawImage(source, 0, 0);
  }
  const bounds = getCanvasRasterBounds(source);
  if (bounds) {
    setCanvasRasterBounds(canvas, bounds);
  }
  return canvas;
}

function makeLayerCanvas(
  bounds = { x: 0, y: 0, width: 16, height: 16 }
): HTMLCanvasElement {
  const canvas = window.document.createElement("canvas");
  canvas.width = bounds.width;
  canvas.height = bounds.height;
  setCanvasRasterBounds(canvas, bounds);
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#ff00ff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  return canvas;
}

describe("repeat transform actions", () => {
  beforeEach(() => {
    act(() => {
      useSketchStore.getState().resetDocument(32, 32);
    });
  });

  function renderTransformActions() {
    const store = useSketchStore.getState();
    const activeLayerId = store.document.activeLayerId;
    const activeLayer = store.document.layers.find((layer) => layer.id === activeLayerId)!;
    const runtimeCanvases = new Map<string, HTMLCanvasElement>();
    const baseCanvas = makeLayerCanvas({ x: 0, y: 0, width: 16, height: 16 });
    runtimeCanvases.set(activeLayerId, baseCanvas);

    act(() => {
      store.setLayerContentBounds(activeLayerId, { x: 0, y: 0, width: 16, height: 16 });
      store.updateLayerData(
        activeLayerId,
        serializeLayerData(baseCanvas.toDataURL("image/png"), {
          x: 0,
          y: 0,
          width: 16,
          height: 16
        })
      );
    });

    const canvasRef = {
      current: {
        snapshotLayerCanvas: jest.fn((layerId: string) => {
          const canvas = runtimeCanvases.get(layerId);
          return canvas ? cloneCanvas(canvas) : null;
        }),
        restoreLayerCanvas: jest.fn((layerId: string, source: HTMLCanvasElement) => {
          runtimeCanvases.set(layerId, cloneCanvas(source));
        }),
        setLayerData: jest.fn(
          (
            layerId: string,
            _data: string | null,
            boundsOverride?: { x: number; y: number; width: number; height: number }
          ) => {
            runtimeCanvases.set(
              layerId,
              makeLayerCanvas(
                boundsOverride ?? { x: 0, y: 0, width: 16, height: 16 }
              )
            );
          }
        ),
        reconcileLayerToDocumentSpace: jest.fn((layerId: string) => {
          const source = runtimeCanvases.get(layerId);
          if (!source) {
            return null;
          }
          const tempCanvases = new Map([[layerId, cloneCanvas(source)]]);
          const result = reconcileLayerToDocumentSpace(
            layerId,
            useSketchStore.getState().document,
            tempCanvases
          );
          const reconciled = tempCanvases.get(layerId);
          if (reconciled) {
            runtimeCanvases.set(layerId, cloneCanvas(reconciled));
          }
          return result;
        })
      }
    } as const;

    const pushHistory = jest.fn();
    const syncSketchOutputsNow = jest.fn();

    const hook = renderHook(() =>
      useTransformActions({
        canvasRef: canvasRef as never,
        document: useSketchStore.getState().document,
        pushHistory,
        updateLayerData: useSketchStore.getState().updateLayerData,
        offsetLayerTransform: useSketchStore.getState().offsetLayerTransform,
        commitLayerTransform: useSketchStore.getState().commitLayerTransform,
        setLayerTransform: useSketchStore.getState().setLayerTransform,
        setLayerContentBounds: useSketchStore.getState().setLayerContentBounds,
        syncSketchOutputsNow
      })
    );

    return {
      hook,
      canvasRef,
      pushHistory,
      syncSketchOutputsNow,
      activeLayer,
      runtimeCanvases
    };
  }

  it("does nothing when there is no previously committed transform", () => {
    const { hook, canvasRef } = renderTransformActions();

    act(() => {
      hook.result.current.handleRepeatLastTransform();
    });

    expect(canvasRef.current.restoreLayerCanvas).not.toHaveBeenCalled();
  });

  it("repeats the last committed transform on the active layer", () => {
    const { hook, canvasRef, pushHistory, syncSketchOutputsNow, activeLayer } =
      renderTransformActions();

    act(() => {
      useSketchStore.getState().setLayerTransform(activeLayer.id, { kind: "affine", x: 6, y: 4, scaleX: 1, scaleY: 1, rotation: 0 });
    });

    act(() => {
      hook.result.current.handleTransformCommit();
    });

    act(() => {
      hook.result.current.handleRepeatLastTransform();
    });

    expect(pushHistory).toHaveBeenCalledWith(
      "repeat transform",
      expect.objectContaining({ [activeLayer.id]: expect.any(HTMLCanvasElement) }),
      { restoreMode: "structure-only" }
    );
    expect(canvasRef.current.restoreLayerCanvas).toHaveBeenCalled();
    expect(syncSketchOutputsNow).toHaveBeenCalled();
  });

  it("duplicates the active layer before repeating the last transform on copy", () => {
    const { hook, canvasRef, activeLayer } = renderTransformActions();

    act(() => {
      useSketchStore.getState().setLayerTransform(activeLayer.id, { kind: "affine", x: 4, y: 3, scaleX: 1, scaleY: 1, rotation: 0 });
    });

    act(() => {
      hook.result.current.handleTransformCommit();
    });

    const beforeCount = useSketchStore.getState().document.layers.length;

    act(() => {
      hook.result.current.handleRepeatLastTransformOnCopy();
    });

    const afterState = useSketchStore.getState();
    expect(afterState.document.layers).toHaveLength(beforeCount + 1);
    expect(canvasRef.current.setLayerData).toHaveBeenCalled();
    expect(canvasRef.current.restoreLayerCanvas).toHaveBeenCalled();
  });
});
