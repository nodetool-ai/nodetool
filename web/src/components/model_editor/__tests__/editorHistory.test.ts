import { createEditorHistory, MERGE_WINDOW_MS, type EditorCommand } from "../editorHistory";
import { setValueCommand } from "../editorCommands";

/** A command that moves `state.value` between two numbers. */
const setter = (
  state: { value: number },
  from: number,
  to: number,
  mergeKey?: string,
  dispose?: (undone: boolean) => void
): EditorCommand => {
  state.value = to;
  return {
    label: `set ${to}`,
    mergeKey,
    undo: () => {
      state.value = from;
    },
    redo: () => {
      state.value = to;
    },
    dispose
  };
};

describe("createEditorHistory", () => {
  it("undoes and redoes in order", () => {
    const history = createEditorHistory();
    const state = { value: 0 };
    history.push(setter(state, 0, 1));
    history.push(setter(state, 1, 2));

    history.undo();
    expect(state.value).toBe(1);
    history.undo();
    expect(state.value).toBe(0);
    expect(history.canUndo()).toBe(false);
    history.redo();
    history.redo();
    expect(state.value).toBe(2);
    expect(history.canRedo()).toBe(false);
  });

  it("merges edits that share a key inside the merge window into one step", () => {
    const history = createEditorHistory();
    const state = { value: 0 };
    history.push(setter(state, 0, 1, "x"), 1000);
    history.push(setter(state, 1, 2, "x"), 1000 + MERGE_WINDOW_MS / 2);
    history.push(setter(state, 2, 3, "x"), 1000 + MERGE_WINDOW_MS);

    history.undo();
    expect(state.value).toBe(0);
    expect(history.canUndo()).toBe(false);
    history.redo();
    expect(state.value).toBe(3);
  });

  it("starts a new step after the merge window or an undo", () => {
    const history = createEditorHistory();
    const state = { value: 0 };
    history.push(setter(state, 0, 1, "x"), 0);
    history.push(setter(state, 1, 2, "x"), MERGE_WINDOW_MS * 3);
    history.undo();
    expect(state.value).toBe(1);

    history.push(setter(state, 1, 5, "x"), MERGE_WINDOW_MS * 3 + 1);
    history.undo();
    expect(state.value).toBe(1);
  });

  it("returns to the saved revision when edits are undone", () => {
    const history = createEditorHistory();
    const state = { value: 0 };
    const saved = history.revision();
    history.push(setter(state, 0, 1));
    expect(history.revision()).not.toBe(saved);
    history.undo();
    expect(history.revision()).toBe(saved);
    history.redo();
    const afterRedo = history.revision();
    history.undo();
    history.redo();
    expect(history.revision()).toBe(afterRedo);
  });

  it("disposes the redo tail when a new edit replaces it", () => {
    const history = createEditorHistory();
    const state = { value: 0 };
    const dispose = jest.fn();
    history.push(setter(state, 0, 1, undefined, dispose));
    history.undo();
    history.push(setter(state, 0, 7));

    expect(dispose).toHaveBeenCalledWith(true);
    expect(history.canRedo()).toBe(false);
  });

  it("evicts the oldest step past the limit and keeps it out of reach", () => {
    const history = createEditorHistory(2);
    const state = { value: 0 };
    const evicted = jest.fn();
    history.push(setter(state, 0, 1, undefined, evicted));
    history.push(setter(state, 1, 2));
    history.push(setter(state, 2, 3));

    expect(evicted).toHaveBeenCalledWith(false);
    history.undo();
    history.undo();
    expect(state.value).toBe(1);
    expect(history.canUndo()).toBe(false);
  });

  it("clear disposes every step and resets the stack", () => {
    const history = createEditorHistory();
    const state = { value: 0 };
    const applied = jest.fn();
    const undone = jest.fn();
    history.push(setter(state, 0, 1, undefined, applied));
    history.push(setter(state, 1, 2, undefined, undone));
    history.undo();

    history.clear();

    expect(applied).toHaveBeenCalledWith(false);
    expect(undone).toHaveBeenCalledWith(true);
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);
  });

  it("releases the unreachable middle value of a merged step at once", () => {
    const history = createEditorHistory();
    let live = "A";
    const released: string[] = [];
    const push = (from: string, to: string, at: number) => {
      live = to;
      history.push(
        setValueCommand(
          "Edit geometry",
          (v: string) => {
            live = v;
          },
          from,
          to,
          "geometry",
          (v) => released.push(v)
        ),
        at
      );
    };
    push("A", "B", 0);
    push("B", "C", 10);
    push("C", "D", 20);
    expect(released).toEqual(["B", "C"]);

    history.undo();
    expect(live).toBe("A");
    history.redo();
    expect(live).toBe("D");
    history.clear();
    expect(released).toEqual(["B", "C", "A"]);
  });

  it("releases the merged result when a merged step is dropped while undone", () => {
    const history = createEditorHistory();
    const released: string[] = [];
    const command = (from: string, to: string) =>
      setValueCommand("Edit", () => {}, from, to, "k", (v: string) => released.push(v));
    history.push(command("A", "B"), 0);
    history.push(command("B", "C"), 10);
    history.undo();
    history.clear();
    expect(released).toEqual(["B", "C"]);
  });
});
