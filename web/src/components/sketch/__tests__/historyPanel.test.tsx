/**
 * History panel: the state rows built from the undo history, jumping between
 * states through the real store undo/redo, and the panel rendering.
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

import type { HistoryEntry } from "../types";
import { createDefaultDocument } from "../types";
import { buildHistoryRows } from "../history/historyRows";
import { jumpToHistoryIndex } from "../history/jumpToHistoryIndex";
import { MAX_HISTORY_SIZE } from "../types";
import { SketchHistoryPanel } from "../history/SketchHistoryPanel";
import { useSketchStore } from "../state/useSketchStore";

function entry(action: string, timing?: "before"): HistoryEntry {
  const result: HistoryEntry = {
    layerSnapshots: {},
    layerStructure: [],
    documentCanvas: { width: 10, height: 10, backgroundColor: "#fff" },
    activeLayerId: "l",
    maskLayerId: null,
    restoreMode: "full",
    action,
    timestamp: 0
  };
  if (timing) {
    result.timing = timing;
  }
  return result;
}

const labels = (rows: ReturnType<typeof buildHistoryRows>) =>
  rows.map((r) => `${r.label}${r.current ? "*" : ""}${r.undone ? "~" : ""}`);

describe("buildHistoryRows", () => {
  it("labels push-before checkpoints by the edit that follows them", () => {
    const history = [entry("brush stroke", "before"), entry("eraser stroke", "before")];
    // Live document is ahead of the last checkpoint: the eraser stroke is unrecorded.
    expect(labels(buildHistoryRows(history, 1, true))).toEqual([
      "Open",
      "Brush stroke",
      "Eraser stroke*"
    ]);
  });

  it("labels push-after entries by their own action", () => {
    const history = [entry("add layer"), entry("rename layer")];
    expect(labels(buildHistoryRows(history, 1, false))).toEqual([
      "Add layer",
      "Rename layer*"
    ]);
  });

  it("hides a push-before checkpoint that repeats the preceding push-after state", () => {
    const history = [entry("add layer"), entry("brush stroke", "before")];
    const rows = buildHistoryRows(history, 1, true);
    expect(labels(rows)).toEqual(["Add layer", "Brush stroke*"]);
    // Being at the hidden checkpoint highlights the row with the same state.
    expect(labels(buildHistoryRows(history, 1, false))).toEqual(["Add layer*"]);
  });

  it("labels the snapshot undo appends for an unrecorded edit", () => {
    const history = [entry("brush stroke", "before"), entry("current state")];
    expect(labels(buildHistoryRows(history, 0, false))).toEqual([
      "Open*",
      "Brush stroke~"
    ]);
  });

  it("returns no rows for an empty history", () => {
    expect(buildHistoryRows([], -1, false)).toEqual([]);
  });
});

describe("jumpToHistoryIndex", () => {
  beforeEach(() => {
    const doc = createDefaultDocument(32, 32);
    useSketchStore.setState({ document: doc, history: [], historyIndex: -1 });
  });

  function addLayers(n: number) {
    for (let i = 0; i < n; i++) {
      useSketchStore.getState().addLayer(`L${i}`);
      useSketchStore.getState().pushHistory("add layer");
    }
  }

  it("undoes and redoes until the target entry is current", () => {
    addLayers(4);
    const undo = jest.fn(() => useSketchStore.getState().undo());
    const redo = jest.fn(() => useSketchStore.getState().redo());
    jumpToHistoryIndex(1, undo, redo);
    expect(useSketchStore.getState().historyIndex).toBe(1);
    expect(useSketchStore.getState().document.layers).toHaveLength(3);
    expect(undo).toHaveBeenCalledTimes(2);
    jumpToHistoryIndex(3, undo, redo);
    expect(useSketchStore.getState().historyIndex).toBe(3);
    expect(useSketchStore.getState().document.layers).toHaveLength(5);
    expect(redo).toHaveBeenCalledTimes(2);
  });

  it("records an unrecorded edit before stepping back from it", () => {
    useSketchStore.getState().pushHistory("rename layer", undefined, { timing: "before" });
    const layerId = useSketchStore.getState().document.layers[0]!.id;
    useSketchStore.getState().renameLayer(layerId, "Renamed");
    jumpToHistoryIndex(
      0,
      () => useSketchStore.getState().undo(),
      () => useSketchStore.getState().redo()
    );
    const state = useSketchStore.getState();
    expect(state.historyIndex).toBe(0);
    expect(state.history).toHaveLength(2);
    expect(state.document.layers[0]!.name).not.toBe("Renamed");
  });

  it("reaches the oldest entry when recording the tip trims a full history", () => {
    const layerId = useSketchStore.getState().document.layers[0]!.id;
    for (let i = 0; i < MAX_HISTORY_SIZE; i++) {
      useSketchStore.getState().pushHistory("rename layer", undefined, { timing: "before" });
      useSketchStore.getState().renameLayer(layerId, `Name ${i}`);
    }
    expect(useSketchStore.getState().history).toHaveLength(MAX_HISTORY_SIZE);

    jumpToHistoryIndex(
      0,
      () => useSketchStore.getState().undo(),
      () => useSketchStore.getState().redo()
    );

    expect(useSketchStore.getState().historyIndex).toBe(0);
  });

  it("stops when undo makes no progress", () => {
    addLayers(1);
    const undo = jest.fn();
    jumpToHistoryIndex(-5, undo, jest.fn());
    expect(undo).toHaveBeenCalledTimes(1);
  });
});

function renderPanel(onUndo: () => void, onRedo: () => void) {
  return render(
    <ThemeProvider theme={mockTheme}>
      <SketchHistoryPanel onUndo={onUndo} onRedo={onRedo} />
    </ThemeProvider>
  );
}

describe("SketchHistoryPanel", () => {
  beforeEach(() => {
    useSketchStore.setState({ document: createDefaultDocument(32, 32), history: [], historyIndex: -1 });
  });

  it("shows a placeholder before any edit", () => {
    renderPanel(jest.fn(), jest.fn());
    expect(screen.getByTestId("sketch-history-empty")).toBeInTheDocument();
  });

  it("marks the current row and jumps when an earlier row is clicked", () => {
    useSketchStore.getState().addLayer("A");
    useSketchStore.getState().pushHistory("add layer");
    useSketchStore.getState().addLayer("B");
    useSketchStore.getState().pushHistory("add layer");
    const undo = jest.fn(() => useSketchStore.getState().undo());
    renderPanel(undo, jest.fn());
    const rows = screen.getAllByTestId("sketch-history-row");
    expect(rows).toHaveLength(2);
    expect(rows[1]).toHaveAttribute("aria-current", "step");
    fireEvent.click(rows[0]!);
    expect(undo).toHaveBeenCalledTimes(1);
    expect(screen.getAllByTestId("sketch-history-row")[1]).toHaveAttribute("data-undone", "true");
  });
});
