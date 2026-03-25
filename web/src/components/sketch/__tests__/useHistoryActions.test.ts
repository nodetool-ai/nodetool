import * as React from "react";
import { useHistoryActions } from "../hooks/useHistoryActions";
import type { HistoryEntry } from "../types";

function makeHistoryEntry(restoreMode: HistoryEntry["restoreMode"]): HistoryEntry {
  return {
    layerSnapshots: { layer1: "data:image/png;base64,abc" },
    layerStructure: [],
    activeLayerId: "layer1",
    maskLayerId: null,
    restoreMode,
    action: "test",
    timestamp: 1
  };
}

describe("useHistoryActions", () => {
  beforeEach(() => {
    jest.spyOn(React, "useCallback").mockImplementation((fn) => fn);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("skips canvas raster replay for structure-only undo entries", () => {
    const restoreLayerCanvas = jest.fn();
    const setLayerData = jest.fn();
    const undo = jest.fn(() => makeHistoryEntry("structure-only"));
    const redo = jest.fn(() => null);
    const canvasRef = {
      current: {
        restoreLayerCanvas,
        setLayerData
      }
    } as any;

    const actions = useHistoryActions({ canvasRef, undo, redo });
    actions.handleUndo();

    expect(undo).toHaveBeenCalled();
    expect(restoreLayerCanvas).not.toHaveBeenCalled();
    expect(setLayerData).not.toHaveBeenCalled();
  });

  it("replays raster data for full undo entries", () => {
    const restoreLayerCanvas = jest.fn();
    const setLayerData = jest.fn();
    const undo = jest.fn(() => makeHistoryEntry("full"));
    const redo = jest.fn(() => null);
    const canvasRef = {
      current: {
        restoreLayerCanvas,
        setLayerData
      }
    } as any;

    const actions = useHistoryActions({ canvasRef, undo, redo });
    actions.handleUndo();

    expect(setLayerData).toHaveBeenCalledWith("layer1", "data:image/png;base64,abc");
  });

  it("skips canvas raster replay for structure-only redo entries", () => {
    const restoreLayerCanvas = jest.fn();
    const setLayerData = jest.fn();
    const undo = jest.fn(() => null);
    const redo = jest.fn(() => makeHistoryEntry("structure-only"));
    const canvasRef = {
      current: {
        restoreLayerCanvas,
        setLayerData
      }
    } as any;

    const actions = useHistoryActions({ canvasRef, undo, redo });
    actions.handleRedo();

    expect(redo).toHaveBeenCalled();
    expect(restoreLayerCanvas).not.toHaveBeenCalled();
    expect(setLayerData).not.toHaveBeenCalled();
  });
});
