/**
 * @jest-environment node
 */
import {
  getDataUrlByteLength,
  stripHistoryCanvasSnapshots,
  toPersistedSketchEditorState,
  fromPersistedSketchEditorState,
  DEFAULT_SKETCH_ACTIVE_TOOL,
  DEFAULT_SKETCH_ZOOM,
  DEFAULT_SKETCH_PAN,
  DEFAULT_SKETCH_DOCUMENT_WIDTH,
  DEFAULT_SKETCH_DOCUMENT_HEIGHT
} from "../persistence";
import type { HistoryEntry } from "../../../components/sketch/types";

describe("getDataUrlByteLength", () => {
  it("computes byte length for a base64 data URL", () => {
    // "AAAA" in base64 is 3 bytes
    const dataUrl = "data:image/png;base64,AAAA";
    expect(getDataUrlByteLength(dataUrl)).toBe(3);
  });

  it("accounts for single-pad base64", () => {
    // "AAAB" is 3 bytes; "AAA=" is 2 bytes
    expect(getDataUrlByteLength("data:image/png;base64,AAA=")).toBe(2);
  });

  it("accounts for double-pad base64", () => {
    // "AA==" is 1 byte
    expect(getDataUrlByteLength("data:image/png;base64,AA==")).toBe(1);
  });

  it("returns string length when no comma is present", () => {
    expect(getDataUrlByteLength("nocomma")).toBe(7);
  });

  it("returns 0 for empty base64 payload", () => {
    expect(getDataUrlByteLength("data:image/png;base64,")).toBe(0);
  });

  it("handles larger payloads correctly", () => {
    // 8 base64 chars = 6 bytes
    const dataUrl = "data:image/jpeg;base64,AAAAAAAA";
    expect(getDataUrlByteLength(dataUrl)).toBe(6);
  });
});

describe("stripHistoryCanvasSnapshots", () => {
  it("removes layerCanvasSnapshots from history entries", () => {
    const entries: HistoryEntry[] = [
      {
        layerSnapshots: { l1: "data:image/png;base64,ABC" },
        layerCanvasSnapshots: { l1: {} as HTMLCanvasElement },
        layerStructure: [],
        documentCanvas: { width: 512, height: 512, backgroundColor: "#ffffff" },
        activeLayerId: "l1",
        maskLayerId: null,
        restoreMode: "full",
        action: "paint",
        timestamp: 1000
      }
    ];

    const result = stripHistoryCanvasSnapshots(entries);
    expect(result).toHaveLength(1);
    expect(result[0]).not.toHaveProperty("layerCanvasSnapshots");
    expect(result[0].layerSnapshots).toEqual({
      l1: "data:image/png;base64,ABC"
    });
    expect(result[0].action).toBe("paint");
  });

  it("returns empty array for empty input", () => {
    expect(stripHistoryCanvasSnapshots([])).toEqual([]);
  });

  it("preserves all other fields", () => {
    const entry: HistoryEntry = {
      changedLayerIds: ["l1"],
      layerSnapshots: { l1: null },
      layerStructure: [],
      documentCanvas: { width: 1024, height: 1024, backgroundColor: "#ffffff" },
      activeLayerId: "l1",
      maskLayerId: "l2",
      selection: null,
      restoreMode: "structure-only",
      action: "resize",
      timestamp: 2000
    };

    const result = stripHistoryCanvasSnapshots([entry]);
    expect(result[0].changedLayerIds).toEqual(["l1"]);
    expect(result[0].maskLayerId).toBe("l2");
    expect(result[0].restoreMode).toBe("structure-only");
  });
});

describe("toPersistedSketchEditorState", () => {
  it("spreads document and adds viewport and history", () => {
    const snapshot = {
      document: {
        canvas: { width: 512, height: 512 },
        layers: [],
        activeLayerId: "l1",
        maskLayerId: null
      },
      activeTool: "brush" as const,
      zoom: 2,
      pan: { x: 100, y: 200 },
      history: [],
      historyIndex: -1
    };

    const result = toPersistedSketchEditorState(snapshot as any);
    expect(result.canvas).toEqual({ width: 512, height: 512 });
    expect(result.activeTool).toBe("brush");
    expect(result.viewport).toEqual({ zoom: 2, pan: { x: 100, y: 200 } });
    expect(result.history).toEqual([]);
    expect(result.historyIndex).toBe(-1);
  });
});

describe("fromPersistedSketchEditorState", () => {
  it("returns defaults for empty input", () => {
    const result = fromPersistedSketchEditorState({});
    expect(result.activeTool).toBe(DEFAULT_SKETCH_ACTIVE_TOOL);
    expect(result.zoom).toBe(DEFAULT_SKETCH_ZOOM);
    expect(result.pan).toEqual(DEFAULT_SKETCH_PAN);
    expect(result.history).toEqual([]);
    expect(result.historyIndex).toBe(-1);
  });

  it("returns defaults for null input", () => {
    const result = fromPersistedSketchEditorState(null);
    expect(result.activeTool).toBe(DEFAULT_SKETCH_ACTIVE_TOOL);
    expect(result.zoom).toBe(DEFAULT_SKETCH_ZOOM);
  });

  it("returns defaults for non-object input", () => {
    const result = fromPersistedSketchEditorState("invalid");
    expect(result.zoom).toBe(DEFAULT_SKETCH_ZOOM);
  });

  const historyEntry: HistoryEntry = {
    layerSnapshots: { l1: null },
    layerStructure: [],
    documentCanvas: { width: 800, height: 600, backgroundColor: "#ffffff" },
    activeLayerId: "l1",
    maskLayerId: null,
    selection: null,
    restoreMode: "full",
    action: "paint",
    timestamp: 1000
  };

  it("restores viewport when present", () => {
    const persisted = {
      canvas: { width: 800, height: 600 },
      layers: [],
      activeLayerId: "l1",
      maskLayerId: null,
      activeTool: "eraser",
      viewport: { zoom: 3.5, pan: { x: 50, y: 75 } },
      history: [historyEntry],
      historyIndex: 0
    };

    const result = fromPersistedSketchEditorState(persisted);
    expect(result.activeTool).toBe("eraser");
    expect(result.zoom).toBe(3.5);
    expect(result.pan).toEqual({ x: 50, y: 75 });
    expect(result.historyIndex).toBe(0);
  });

  it("clamps historyIndex above the history length", () => {
    const result = fromPersistedSketchEditorState({
      history: [historyEntry],
      historyIndex: 10
    });
    expect(result.historyIndex).toBe(0);
  });

  it("clamps negative and non-finite historyIndex to -1", () => {
    expect(
      fromPersistedSketchEditorState({
        history: [historyEntry],
        historyIndex: -5
      }).historyIndex
    ).toBe(-1);
    expect(
      fromPersistedSketchEditorState({
        history: [historyEntry],
        historyIndex: Number.NaN
      }).historyIndex
    ).toBe(-1);
  });

  it("normalizes the document through normalizeSketchDocument", () => {
    const result = fromPersistedSketchEditorState({
      canvas: { width: 256, height: 128 }
    });
    expect(result.document.canvas.width).toBe(256);
    expect(result.document.canvas.height).toBe(128);
  });
});

describe("constants", () => {
  it("has expected default values", () => {
    expect(DEFAULT_SKETCH_DOCUMENT_WIDTH).toBe(1024);
    expect(DEFAULT_SKETCH_DOCUMENT_HEIGHT).toBe(1024);
    expect(DEFAULT_SKETCH_ACTIVE_TOOL).toBe("brush");
    expect(DEFAULT_SKETCH_ZOOM).toBe(1);
    expect(DEFAULT_SKETCH_PAN).toEqual({ x: 0, y: 0 });
  });
});
