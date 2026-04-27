import { act, renderHook } from "@testing-library/react";
import { useHistoryActions } from "../hooks/useHistoryActions";
import { useStrokeLifecycleActions } from "../hooks/useStrokeLifecycleActions";
import { useTransformActions } from "../hooks/useTransformActions";
import { useSketchStore } from "../state/useSketchStore";
import type { HistoryEntry } from "../types";

function makeHistoryEntry(
  restoreMode: HistoryEntry["restoreMode"],
  overrides?: Partial<HistoryEntry>
): HistoryEntry {
  return {
    layerSnapshots: { layer1: "before-runtime" },
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
        transform: { x: 0, y: 0 },
        contentBounds: { x: 0, y: 0, width: 32, height: 24 },
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

beforeEach(() => {
  act(() => {
    useSketchStore.getState().resetDocument();
  });
});

describe("structure-only history runtime snapshots", () => {
  it("captures active-layer snapshots for transform history pushes", () => {
    const documentState = useSketchStore.getState().document;
    const activeLayerId = documentState.activeLayerId;
    const snapshot = window.document.createElement("canvas");
    const pushHistory = jest.fn();
    const canvasRef = {
      current: {
        snapshotLayerCanvas: jest.fn(() => snapshot)
      }
    } as any;

    const { result } = renderHook(() =>
      useTransformActions({
        canvasRef,
        document: documentState,
        pushHistory,
        updateLayerData: jest.fn(),
        offsetLayerTransform: jest.fn(),
        commitLayerTransform: jest.fn(),
        setLayerTransform: jest.fn(),
        setLayerContentBounds: jest.fn(),
        syncSketchOutputsNow: jest.fn()
      })
    );

    act(() => {
      result.current.pushTransformHistory("nudge layer");
    });

    expect(pushHistory).toHaveBeenCalledWith(
      "nudge layer",
      { [activeLayerId]: snapshot },
      { restoreMode: "structure-only" }
    );
  });

  it("captures active-layer snapshots for transform-only stroke history entries", () => {
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    }) as typeof window.requestAnimationFrame;

    const documentState = useSketchStore.getState().document;
    const activeLayerId = documentState.activeLayerId;
    const snapshot = window.document.createElement("canvas");
    const pushHistory = jest.fn();
    const canvasRef = {
      current: {
        drainPendingStrokeCommit: jest.fn(),
        snapshotLayerCanvas: jest.fn(() => snapshot)
      }
    } as any;

    try {
      const { result } = renderHook(() =>
        useStrokeLifecycleActions({
          canvasRef,
          document: documentState,
          activeTool: "brush",
          interactionTool: "move",
          pushHistory,
          updateLayerData: jest.fn(),
          setLayerContentBounds: jest.fn(),
          pendingExportSyncRef: {
            current: { image: false, mask: false }
          } as any
        })
      );

      act(() => {
        result.current.handleStrokeStart();
      });

      expect(pushHistory).toHaveBeenCalledWith(
        "move layer",
        { [activeLayerId]: snapshot },
        { restoreMode: "structure-only" }
      );
    } finally {
      window.requestAnimationFrame = originalRequestAnimationFrame;
    }
  });

  it("uses captured tip snapshots so structure-only redo updates runtime immediately", () => {
    const beforeSnapshot = {
      snapshotData: "before-runtime"
    } as unknown as HTMLCanvasElement;
    const afterSnapshot = {
      snapshotData: "after-runtime"
    } as unknown as HTMLCanvasElement;
    let runtimeData = "after-runtime";
    let tipSnapshots: Record<string, HTMLCanvasElement | null> | undefined;

    const undo = jest.fn((layerCanvasSnapshots?: Record<string, HTMLCanvasElement | null>) => {
      tipSnapshots = layerCanvasSnapshots;
      return makeHistoryEntry("structure-only", {
        layerCanvasSnapshots: { layer1: beforeSnapshot }
      });
    });
    const redo = jest.fn(() =>
      makeHistoryEntry("structure-only", {
        layerSnapshots: { layer1: "after-runtime" },
        layerCanvasSnapshots: tipSnapshots
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
          window.setTimeout(() => {
            runtimeData = data ?? "";
          }, 0);
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

    act(() => {
      result.current.handleUndo();
    });
    expect(runtimeData).toBe("before-runtime");

    act(() => {
      result.current.handleRedo();
    });
    expect(runtimeData).toBe("after-runtime");
    expect(canvasRef.current.restoreLayerCanvas).toHaveBeenLastCalledWith(
      "layer1",
      afterSnapshot
    );
  });
});
