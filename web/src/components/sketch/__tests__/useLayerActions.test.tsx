/**
 * @jest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { createDefaultLayer } from "../types";
import { useSketchStore } from "../state/useSketchStore";
import { useLayerActions } from "../hooks/useLayerActions";

describe("useLayerActions merge selected layers", () => {
  it("merges selected contiguous layers from top to bottom through merge-down", () => {
    const lower = createDefaultLayer("Lower", "raster", 64, 64);
    const middle = createDefaultLayer("Middle", "raster", 64, 64);
    const upper = createDefaultLayer("Upper", "raster", 64, 64);
    const document = {
      ...useSketchStore.getState().document,
      layers: [lower, middle, upper],
      activeLayerId: upper.id
    };

    useSketchStore.setState((state) => ({
      ...state,
      document,
      selectedLayerIds: [lower.id, middle.id, upper.id],
      layerShiftRangeAnchorId: upper.id
    }));

    const mergeLayerDown = jest.fn();
    const updateLayerData = jest.fn();
    const canvasRef = {
      current: {
        mergeLayerDown: jest
          .fn()
          .mockReturnValueOnce("merged-upper-middle")
          .mockReturnValueOnce("merged-middle-lower")
      }
    };

    const { result } = renderHook(() =>
      useLayerActions({
        canvasRef: canvasRef as never,
        document,
        pushHistory: jest.fn(),
        addLayer: jest.fn(() => "new-layer"),
        removeLayer: jest.fn(),
        duplicateLayer: jest.fn(),
        reorderLayers: jest.fn(),
        toggleLayerVisibility: jest.fn(),
        setLayerOpacity: jest.fn(),
        setLayerBlendMode: jest.fn(),
        renameLayer: jest.fn(),
        updateLayerData,
        setMaskLayer: jest.fn(),
        toggleAlphaLock: jest.fn(),
        toggleLayerExposedInput: jest.fn(),
        toggleLayerExposedOutput: jest.fn(),
        mergeLayerDown,
        flattenVisible: jest.fn(),
        addGroup: jest.fn(() => "group"),
        toggleGroupCollapsed: jest.fn(),
        moveLayerToGroup: jest.fn(),
        ungroupLayer: jest.fn(),
        groupLayers: jest.fn()
      })
    );

    act(() => {
      result.current.handleMergeSelectedLayers();
    });

    expect(canvasRef.current.mergeLayerDown).toHaveBeenNthCalledWith(
      1,
      upper.id,
      middle.id
    );
    expect(canvasRef.current.mergeLayerDown).toHaveBeenNthCalledWith(
      2,
      middle.id,
      lower.id
    );
    expect(mergeLayerDown).toHaveBeenNthCalledWith(1, upper.id);
    expect(mergeLayerDown).toHaveBeenNthCalledWith(2, middle.id);
    expect(updateLayerData).toHaveBeenNthCalledWith(
      1,
      middle.id,
      "merged-upper-middle"
    );
    expect(updateLayerData).toHaveBeenNthCalledWith(
      2,
      lower.id,
      "merged-middle-lower"
    );
  });
});
