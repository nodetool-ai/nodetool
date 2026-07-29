/**
 * @jest-environment node
 *
 * Per-document undo/redo stack mechanics: checkpoints push and pop, redo
 * mirrors undo and is cleared by a fresh edit, rapid same-key edits coalesce
 * into one step, and the stack honours its size limit.
 */

import {
  pushHistory,
  undoHistory,
  redoHistory,
  clearHistory,
  canUndo,
  canRedo,
  HISTORY_LIMIT,
  HISTORY_COALESCE_MS,
  type HistoryMap
} from "../documentHistory";

interface Doc {
  v: number;
}

const ID = "doc-1";

describe("pushHistory / undo / redo", () => {
  it("records a checkpoint and undoes to it", () => {
    let h: HistoryMap<Doc> = {};
    h = pushHistory(h, ID, { v: 0 }, null, 1000);
    expect(canUndo(h, ID)).toBe(true);
    expect(canRedo(h, ID)).toBe(false);

    const res = undoHistory(h, ID, { v: 1 });
    expect(res).not.toBeNull();
    expect(res?.restored).toEqual({ v: 0 });
    expect(canUndo(res!.history, ID)).toBe(false);
    expect(canRedo(res!.history, ID)).toBe(true);
  });

  it("redo returns the document undo moved onto the future stack", () => {
    let h: HistoryMap<Doc> = {};
    h = pushHistory(h, ID, { v: 0 }, null, 1000);
    const undone = undoHistory(h, ID, { v: 1 })!;
    const redone = redoHistory(undone.history, ID, { v: 0 })!;
    expect(redone.restored).toEqual({ v: 1 });
    expect(canRedo(redone.history, ID)).toBe(false);
    expect(canUndo(redone.history, ID)).toBe(true);
  });

  it("returns null when there is nothing to undo or redo", () => {
    const h: HistoryMap<Doc> = {};
    expect(undoHistory(h, ID, { v: 1 })).toBeNull();
    expect(redoHistory(h, ID, { v: 1 })).toBeNull();
  });

  it("a fresh edit clears the redo stack", () => {
    let h: HistoryMap<Doc> = {};
    h = pushHistory(h, ID, { v: 0 }, null, 1000);
    h = undoHistory(h, ID, { v: 1 })!.history;
    expect(canRedo(h, ID)).toBe(true);
    h = pushHistory(h, ID, { v: 0 }, null, 2000);
    expect(canRedo(h, ID)).toBe(false);
  });
});

describe("coalescing", () => {
  it("folds rapid same-key edits into a single checkpoint", () => {
    let h: HistoryMap<Doc> = {};
    h = pushHistory(h, ID, { v: 0 }, "title", 1000);
    h = pushHistory(h, ID, { v: 1 }, "title", 1000 + HISTORY_COALESCE_MS - 1);
    h = pushHistory(h, ID, { v: 2 }, "title", 1000 + HISTORY_COALESCE_MS);
    // Only the first checkpoint survives; undo steps back to the pre-typing v:0.
    expect(h[ID].past).toEqual([{ v: 0 }]);
    expect(undoHistory(h, ID, { v: 3 })!.restored).toEqual({ v: 0 });
  });

  it("does not fold once the window lapses", () => {
    let h: HistoryMap<Doc> = {};
    h = pushHistory(h, ID, { v: 0 }, "title", 1000);
    h = pushHistory(h, ID, { v: 1 }, "title", 1000 + HISTORY_COALESCE_MS + 1);
    expect(h[ID].past).toEqual([{ v: 0 }, { v: 1 }]);
  });

  it("does not fold across different keys", () => {
    let h: HistoryMap<Doc> = {};
    h = pushHistory(h, ID, { v: 0 }, "title", 1000);
    h = pushHistory(h, ID, { v: 1 }, "brief", 1000);
    expect(h[ID].past).toEqual([{ v: 0 }, { v: 1 }]);
  });

  it("a null key never coalesces", () => {
    let h: HistoryMap<Doc> = {};
    h = pushHistory(h, ID, { v: 0 }, null, 1000);
    h = pushHistory(h, ID, { v: 1 }, null, 1000);
    expect(h[ID].past).toEqual([{ v: 0 }, { v: 1 }]);
  });
});

describe("limit and clear", () => {
  it("drops the oldest checkpoint past the limit", () => {
    let h: HistoryMap<Doc> = {};
    for (let i = 0; i <= HISTORY_LIMIT; i++) {
      h = pushHistory(h, ID, { v: i }, null, i);
    }
    expect(h[ID].past.length).toBe(HISTORY_LIMIT);
    // The very first checkpoint (v:0) has been evicted.
    expect(h[ID].past[0]).toEqual({ v: 1 });
  });

  it("clearHistory drops a document's stacks", () => {
    let h: HistoryMap<Doc> = {};
    h = pushHistory(h, ID, { v: 0 }, null, 1000);
    h = clearHistory(h, ID);
    expect(canUndo(h, ID)).toBe(false);
    expect(h[ID]).toBeUndefined();
  });
});
