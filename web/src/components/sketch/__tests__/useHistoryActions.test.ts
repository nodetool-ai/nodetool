import { renderHook } from "@testing-library/react";
import { useHistoryActions } from "../hooks/useHistoryActions";
import type { HistoryEntry } from "../types";

function makeHistoryEntry(
  restoreMode: HistoryEntry["restoreMode"],
  overrides?: Partial<HistoryEntry>
): HistoryEntry {
  return {
    layerSnapshots: { layer1: "data:image/png;base64,abc" },
    layerStructure: [
      {
        id: "layer1",
        name: "Layer 1",
        type: "raster",
        visible: true,
        opacity: 1,
        locked: false,
        alphaLock: false,
        blendMode: "normal",
        transform: { kind: "affine", x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        contentBounds: { x: 4, y: 5, width: 32, height: 24 },
        effects: []
      }
    ],
    documentCanvas: { width: 512, height: 512, backgroundColor: "#000000" },
    activeLayerId: "layer1",
    maskLayerId: null,
    restoreMode,
    action: "test",
    timestamp: 1,
    ...overrides
  };
}

describe("useHistoryActions", () => {
  it("skips canvas raster replay for structure-only undo entries", () => {
    const restoreLayerCanvas = jest.fn();
    const setLayerData = jest.fn();
    const redrawDisplay = jest.fn();
    const undo = jest.fn(() => makeHistoryEntry("structure-only"));
    const redo = jest.fn(() => null);
    const canvasRef = {
      current: {
        restoreLayerCanvas,
        setLayerData,
        getLayerData: jest.fn(() => "data:image/png;base64,abc"),
        redrawDisplay
      }
    } as any;

    const { result } = renderHook(() => useHistoryActions({ canvasRef, undo, redo }));
    result.current.handleUndo();

    expect(undo).toHaveBeenCalled();
    expect(restoreLayerCanvas).not.toHaveBeenCalled();
    expect(setLayerData).not.toHaveBeenCalled();
    expect(redrawDisplay).toHaveBeenCalled();
  });

  it("replays raster data for full undo entries", () => {
    const restoreLayerCanvas = jest.fn();
    const setLayerData = jest.fn();
    const undo = jest.fn(() => makeHistoryEntry("full"));
    const redo = jest.fn(() => null);
    const canvasRef = {
      current: {
        restoreLayerCanvas,
        setLayerData,
        getLayerData: jest.fn(() => null),
        redrawDisplay: jest.fn()
      }
    } as any;

    const { result } = renderHook(() => useHistoryActions({ canvasRef, undo, redo }));
    result.current.handleUndo();

    expect(setLayerData).toHaveBeenCalledWith(
      "layer1",
      "data:image/png;base64,abc",
      { x: 4, y: 5, width: 32, height: 24 }
    );
  });

  it("skips canvas raster replay for structure-only redo entries", () => {
    const restoreLayerCanvas = jest.fn();
    const setLayerData = jest.fn();
    const redrawDisplay = jest.fn();
    const undo = jest.fn(() => null);
    const redo = jest.fn(() => makeHistoryEntry("structure-only"));
    const canvasRef = {
      current: {
        restoreLayerCanvas,
        setLayerData,
        getLayerData: jest.fn(() => "data:image/png;base64,abc"),
        redrawDisplay
      }
    } as any;

    const { result } = renderHook(() => useHistoryActions({ canvasRef, undo, redo }));
    result.current.handleRedo();

    expect(redo).toHaveBeenCalled();
    expect(restoreLayerCanvas).not.toHaveBeenCalled();
    expect(setLayerData).not.toHaveBeenCalled();
    expect(redrawDisplay).toHaveBeenCalled();
  });

  it("updates canvas data for structure-only restore when runtime state differs from snapshot", () => {
    const setLayerData = jest.fn();
    const undo = jest.fn(() => makeHistoryEntry("structure-only"));
    const redo = jest.fn(() => null);
    const canvasRef = {
      current: {
        restoreLayerCanvas: jest.fn(),
        setLayerData,
        getLayerData: jest.fn(() => "stale-runtime-data"),
        redrawDisplay: jest.fn()
      }
    } as any;

    const { result } = renderHook(() => useHistoryActions({ canvasRef, undo, redo }));
    result.current.handleUndo();

    expect(setLayerData).toHaveBeenCalledWith(
      "layer1",
      "data:image/png;base64,abc",
      { x: 4, y: 5, width: 32, height: 24 }
    );
  });

  it("captures current runtime layer snapshots before undo", () => {
    const layer1Snapshot = { id: "layer-1-snapshot" } as unknown as HTMLCanvasElement;
    const undo = jest.fn(() => null);
    const redo = jest.fn(() => null);
    const canvasRef = {
      current: {
        snapshotLayerCanvas: jest
          .fn()
          .mockImplementation((layerId: string) =>
            layerId === "layer1" ? layer1Snapshot : null
          )
      }
    } as any;

    const { result } = renderHook(() =>
      useHistoryActions({
        canvasRef,
        undo,
        redo,
        currentLayerIds: ["layer1", "layer2"]
      })
    );
    result.current.handleUndo();

    expect(undo).toHaveBeenCalledWith({
      layer1: layer1Snapshot,
      layer2: null
    });
  });

  it("replays captured structure-only tip snapshots synchronously on redo", () => {
    const beforeSnapshot = {
      snapshotData: "before-runtime"
    } as unknown as HTMLCanvasElement;
    const afterSnapshot = {
      snapshotData: "after-runtime"
    } as unknown as HTMLCanvasElement;
    let runtimeData = "after-runtime";
    let tipLayerCanvasSnapshots: Record<string, HTMLCanvasElement | null> | undefined;

    const undo = jest.fn((layerCanvasSnapshots?: Record<string, HTMLCanvasElement | null>) => {
      tipLayerCanvasSnapshots = layerCanvasSnapshots;
      return makeHistoryEntry("structure-only", {
        layerSnapshots: { layer1: "before-runtime" },
        layerCanvasSnapshots: { layer1: beforeSnapshot }
      });
    });
    const redo = jest.fn(() =>
      makeHistoryEntry("structure-only", {
        layerSnapshots: { layer1: "after-runtime" },
        layerCanvasSnapshots: tipLayerCanvasSnapshots
      })
    );
    const canvasRef = {
      current: {
        snapshotLayerCanvas: jest.fn(() => afterSnapshot),
        restoreLayerCanvas: jest.fn(
          (_layerId: string, snapshot: HTMLCanvasElement & { snapshotData?: string }) => {
            runtimeData = snapshot.snapshotData ?? runtimeData;
          }
        ),
        setLayerData: jest.fn((_layerId: string, data: string | null) => {
          runtimeData = `fallback:${data ?? ""}`;
        }),
        getLayerData: jest.fn(() => runtimeData),
        redrawDisplay: jest.fn()
      }
    } as any;

    const { result } = renderHook(() =>
      useHistoryActions({
        canvasRef,
        undo,
        redo,
        currentLayerIds: ["layer1"]
      })
    );

    result.current.handleUndo();
    expect(runtimeData).toBe("before-runtime");

    result.current.handleRedo();
    expect(runtimeData).toBe("after-runtime");
    expect(canvasRef.current.restoreLayerCanvas).toHaveBeenLastCalledWith(
      "layer1",
      afterSnapshot
    );
    expect(canvasRef.current.setLayerData).not.toHaveBeenCalledWith(
      "layer1",
      "after-runtime",
      expect.anything()
    );
  });
});
