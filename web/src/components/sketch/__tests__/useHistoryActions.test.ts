import * as React from "react";
import { useHistoryActions } from "../hooks/useHistoryActions";
import type { HistoryEntry } from "../types";

function makeHistoryEntry(restoreMode: HistoryEntry["restoreMode"]): HistoryEntry {
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
        transform: { x: 0, y: 0 },
        contentBounds: { x: 4, y: 5, width: 32, height: 24 },
        effects: []
      }
    ],
    documentCanvas: { width: 512, height: 512, backgroundColor: "#000000" },
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

    const actions = useHistoryActions({ canvasRef, undo, redo });
    actions.handleUndo();

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

    const actions = useHistoryActions({ canvasRef, undo, redo });
    actions.handleUndo();

    expect(setLayerData).toHaveBeenCalledWith("layer1", "data:image/png;base64,abc");
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

    const actions = useHistoryActions({ canvasRef, undo, redo });
    actions.handleRedo();

    expect(redo).toHaveBeenCalled();
    expect(restoreLayerCanvas).not.toHaveBeenCalled();
    expect(setLayerData).not.toHaveBeenCalled();
    expect(redrawDisplay).toHaveBeenCalled();
  });

  it("replays structure-only raster data when runtime canvases drift", () => {
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

    const actions = useHistoryActions({ canvasRef, undo, redo });
    actions.handleUndo();

    expect(setLayerData).toHaveBeenCalledWith(
      "layer1",
      "data:image/png;base64,abc",
      { x: 4, y: 5, width: 32, height: 24 }
    );
  });
});
