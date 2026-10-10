/**
 * @jest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { useTransformActions } from "../hooks/useTransformActions";
import { useSketchStore } from "../state/useSketchStore";

describe("transform cancel target", () => {
  beforeEach(() => {
    act(() => {
      useSketchStore.getState().resetDocument(32, 32);
    });
  });

  it("restores the layer the baseline was saved from after the active layer changes", () => {
    const layerA = useSketchStore.getState().document.activeLayerId;
    let layerB = "";
    act(() => {
      layerB = useSketchStore.getState().addLayer("B");
      useSketchStore.getState().setActiveLayer(layerA);
    });

    const hook = renderHook(() =>
      useTransformActions({
        canvasRef: { current: null } as never,
        document: useSketchStore((state) => state.document),
        pushHistory: jest.fn(),
        updateLayerData: useSketchStore.getState().updateLayerData,
        offsetLayerTransform: useSketchStore.getState().offsetLayerTransform,
        commitLayerTransform: useSketchStore.getState().commitLayerTransform,
        setLayerTransform: useSketchStore.getState().setLayerTransform,
        setLayerContentBounds: useSketchStore.getState().setLayerContentBounds,
        syncSketchOutputsNow: jest.fn()
      })
    );

    act(() => {
      hook.result.current.saveTransformOriginal();
    });
    const scaled = { kind: "affine" as const, x: 4, y: 2, scaleX: 2, scaleY: 2, rotation: 0 };
    act(() => {
      useSketchStore.getState().setLayerTransform(layerA, scaled);
      useSketchStore.getState().setActiveLayer(layerB);
    });
    act(() => {
      hook.result.current.handleTransformCancel();
    });

    const layers = useSketchStore.getState().document.layers;
    const a = layers.find((layer) => layer.id === layerA);
    const b = layers.find((layer) => layer.id === layerB);
    expect(a?.transform).toEqual(
      expect.objectContaining({ x: 0, y: 0, scaleX: 1, scaleY: 1 })
    );
    expect(b?.transform).toEqual(
      expect.objectContaining({ x: 0, y: 0, scaleX: 1, scaleY: 1 })
    );
  });
});
