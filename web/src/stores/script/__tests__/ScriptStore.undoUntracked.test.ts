/**
 * Undo and redo leave alone the fields that change without an undo step: the
 * timeline link, the storyboard link and the guided setup. Restoring a whole
 * older snapshot used to unlink an assembled sequence, drop the board
 * back-pointer, and put the setup flow back in place of the editor.
 */
import { useScriptStore } from "../ScriptStore";

const ID = "s-untracked";

const seed = (): void => {
  useScriptStore.setState({ scripts: {}, history: {} });
  useScriptStore.getState().loadScript(ID, {
    title: "",
    cast: [],
    sections: [
      { id: "sec", lines: [{ id: "l1", text: "one", takes: [] }] }
    ],
    timelineId: null,
    storyboardId: null,
    setup: { stage: "voices", brief: "" }
  });
};

describe("ScriptStore undo keeps untracked fields", () => {
  beforeEach(seed);

  it("undo restores the text but keeps the links and the setup", () => {
    const store = useScriptStore.getState();
    store.patchLine(ID, "l1", { text: "one, edited" });
    store.setTimelineLink(ID, "seq-1");
    store.setStoryboardLink(ID, "board-1");
    store.setSetup(ID, { stage: "done", pace: "fast" });

    useScriptStore.getState().undo(ID);
    const undone = useScriptStore.getState().scripts[ID];
    expect(undone.sections[0].lines[0].text).toBe("one");
    expect(undone.timelineId).toBe("seq-1");
    expect(undone.storyboardId).toBe("board-1");
    expect(undone.setup).toEqual(
      expect.objectContaining({ stage: "done", pace: "fast" })
    );
  });

  it("redo keeps links set after the undo", () => {
    const store = useScriptStore.getState();
    store.patchLine(ID, "l1", { text: "one, edited" });
    useScriptStore.getState().undo(ID);
    useScriptStore.getState().setTimelineLink(ID, "seq-2");

    useScriptStore.getState().redo(ID);
    const redone = useScriptStore.getState().scripts[ID];
    expect(redone.sections[0].lines[0].text).toBe("one, edited");
    expect(redone.timelineId).toBe("seq-2");
  });
});
