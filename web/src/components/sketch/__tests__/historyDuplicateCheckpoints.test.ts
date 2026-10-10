/**
 * Pre-edit checkpoints must not leave history entries that repeat a state:
 * each one costs an undo that changes nothing and a ghost History row.
 */

import { act } from "@testing-library/react";
import { useSketchStore } from "../state/useSketchStore";
import { buildHistoryRows } from "../history/historyRows";
import { hasUncommittedHistoryTip } from "../state/slices/historySlice";
import { createEmptyMask } from "../selection";

const A = "data:image/png;base64,A";
const B = "data:image/png;base64,B";

function stroke(label: string, data: string): void {
  const state = useSketchStore.getState();
  const layerId = state.document.layers[0].id;
  state.pushHistory(label, undefined, { timing: "before" });
  useSketchStore.getState().updateLayerData(layerId, data);
}

function liveData(): string | null {
  return useSketchStore.getState().document.layers[0].data;
}

function rowLabels(): string[] {
  const s = useSketchStore.getState();
  return buildHistoryRows(
    s.history,
    s.historyIndex,
    hasUncommittedHistoryTip(s)
  ).map((row) => row.label);
}

beforeEach(() => {
  act(() => {
    useSketchStore.getState().resetDocument();
  });
});

describe("a stroke after an undo", () => {
  it("replaces the undone checkpoint instead of repeating it", () => {
    const blank = liveData();
    act(() => {
      stroke("stroke A", A);
      useSketchStore.getState().undo();
      stroke("stroke B", B);
    });

    expect(rowLabels()).toEqual(["Open", "Stroke B"]);

    act(() => {
      useSketchStore.getState().undo();
    });
    expect(liveData()).toBe(blank);
    expect(useSketchStore.getState().canUndo()).toBe(false);
  });

  it("keeps earlier strokes reachable one undo each", () => {
    act(() => {
      stroke("stroke A", A);
      stroke("stroke B", B);
      useSketchStore.getState().undo();
      stroke("stroke C", "data:image/png;base64,C");
    });

    expect(rowLabels()).toEqual(["Open", "Stroke A", "Stroke C"]);
    act(() => {
      useSketchStore.getState().undo();
    });
    expect(liveData()).toBe(A);
  });
});

describe("a selection after a stroke", () => {
  it("undoes the selection first, then the stroke", () => {
    const blank = liveData();
    const { width, height } = useSketchStore.getState().document.canvas;
    const mask = createEmptyMask(width, height);
    mask.data.fill(255);

    act(() => {
      stroke("stroke", A);
      useSketchStore.getState().setSelection(mask);
      useSketchStore
        .getState()
        .pushHistory("selection", undefined, { selectionOnly: true });
    });
    expect(rowLabels()).toEqual(["Open", "Stroke", "Selection"]);

    act(() => {
      useSketchStore.getState().undo();
    });
    expect(useSketchStore.getState().selection).toBeNull();
    expect(liveData()).toBe(A);

    act(() => {
      useSketchStore.getState().undo();
    });
    expect(liveData()).toBe(blank);

    act(() => {
      useSketchStore.getState().redo();
      useSketchStore.getState().redo();
    });
    expect(liveData()).toBe(A);
    expect(useSketchStore.getState().selection).toBe(mask);
  });
});

describe("the first edit on a freshly loaded document", () => {
  it("undoes an edit pushed after it ran", () => {
    act(() => {
      const state = useSketchStore.getState();
      state.addLayer("Second");
      useSketchStore.getState().pushHistory("add layer");
    });
    expect(useSketchStore.getState().document.layers).toHaveLength(2);
    expect(useSketchStore.getState().canUndo()).toBe(true);
    expect(rowLabels()).toEqual(["Open", "Add layer"]);

    act(() => {
      useSketchStore.getState().undo();
    });
    expect(useSketchStore.getState().document.layers).toHaveLength(1);
    expect(useSketchStore.getState().canUndo()).toBe(false);
  });

  it("undoes a first edit after setDocument", () => {
    const doc = useSketchStore.getState().document;
    act(() => {
      useSketchStore.getState().setDocument({ ...doc, layers: [...doc.layers] });
      useSketchStore.getState().renameLayer(doc.layers[0].id, "Renamed");
      useSketchStore.getState().pushHistory("rename layer");
      useSketchStore.getState().undo();
    });
    expect(useSketchStore.getState().document.layers[0].name).toBe(doc.layers[0].name);
  });

  it("does not add an undo step before a first stroke", () => {
    act(() => {
      stroke("stroke A", A);
    });
    expect(useSketchStore.getState().history).toHaveLength(1);
    expect(rowLabels()).toEqual(["Open", "Stroke A"]);
  });
});

describe("commitPendingEdit", () => {
  it("gives a stroke and the layer edit after it separate undo steps", () => {
    const layerId = useSketchStore.getState().document.layers[0].id;
    act(() => {
      stroke("brush stroke", A);
      useSketchStore.getState().commitPendingEdit();
      useSketchStore.getState().renameLayer(layerId, "Renamed");
      useSketchStore.getState().pushHistory("rename layer");
    });
    expect(rowLabels()).toEqual(["Open", "Brush stroke", "Rename layer"]);

    act(() => {
      useSketchStore.getState().undo();
    });
    expect(useSketchStore.getState().document.layers[0].name).not.toBe("Renamed");
    expect(liveData()).toBe(A);

    act(() => {
      useSketchStore.getState().undo();
    });
    expect(liveData()).not.toBe(A);
  });

  it("records nothing when no edit is pending", () => {
    act(() => {
      stroke("brush stroke", A);
      useSketchStore.getState().commitPendingEdit();
    });
    const { history } = useSketchStore.getState();
    act(() => {
      useSketchStore.getState().commitPendingEdit();
    });
    expect(useSketchStore.getState().history).toBe(history);
  });
});
