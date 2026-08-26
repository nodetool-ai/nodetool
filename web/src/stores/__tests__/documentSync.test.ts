/**
 * Tests for the document sync registry — how a `resource_change` on an open
 * document's row is routed to the editor holding it.
 */
import {
  clearDocumentSyncSubscribers,
  handleDocumentResourceChange,
  registerDocumentSync
} from "../documentSync";
import { useConflictStore, clearAllConflicts } from "../ConflictStore";

const subscriber = (
  overrides: Partial<{
    revision: string | null;
    dirty: boolean;
  }> = {}
) => {
  const reload = jest.fn();
  const merge = jest.fn();
  return {
    reload,
    merge,
    handle: {
      localRevision: () => overrides.revision ?? "rev-1",
      isDirty: () => overrides.dirty ?? false,
      reload,
      merge
    }
  };
};

describe("handleDocumentResourceChange", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearDocumentSyncSubscribers();
    clearAllConflicts();
  });

  it("reloads a clean editor when the row changed elsewhere", () => {
    const { handle, reload, merge } = subscriber({ revision: "rev-1" });
    registerDocumentSync("timelinesequence", "t1", handle);

    handleDocumentResourceChange("timelinesequence", {
      event: "updated",
      id: "t1",
      updatedAt: "rev-2"
    });

    expect(reload).toHaveBeenCalledTimes(1);
    expect(merge).not.toHaveBeenCalled();
  });

  it("ignores the editor's own write", () => {
    const { handle, reload, merge } = subscriber({ revision: "rev-2" });
    registerDocumentSync("timelinesequence", "t1", handle);

    handleDocumentResourceChange("timelinesequence", {
      event: "updated",
      id: "t1",
      updatedAt: "rev-2"
    });

    expect(reload).not.toHaveBeenCalled();
    expect(merge).not.toHaveBeenCalled();
  });

  it("merges into a dirty editor instead of reloading", () => {
    const { handle, reload, merge } = subscriber({
      revision: "rev-1",
      dirty: true
    });
    registerDocumentSync("script", "s1", handle);

    const ops = [{ tool: "set_line_text", input: {} }];
    handleDocumentResourceChange("script", {
      event: "updated",
      id: "s1",
      updatedAt: "rev-2",
      ops
    });

    expect(reload).not.toHaveBeenCalled();
    expect(merge).toHaveBeenCalledWith(
      expect.objectContaining({ id: "s1", updatedAt: "rev-2", ops })
    );
  });

  it("still calls merge when the write carried no ops", () => {
    const { handle, merge } = subscriber({ revision: "rev-1", dirty: true });
    registerDocumentSync("storyboard", "b1", handle);

    handleDocumentResourceChange("storyboard", {
      event: "updated",
      id: "b1",
      updatedAt: "rev-2"
    });

    expect(merge).toHaveBeenCalledTimes(1);
    const [notice] = merge.mock.calls[0];
    expect(notice).toMatchObject({ id: "b1", updatedAt: "rev-2" });
    expect(notice.ops).toBeUndefined();
  });

  it("reports a delete to onExternalChange rather than reloading", () => {
    const onExternalChange = jest.fn();
    const reload = jest.fn();
    registerDocumentSync("storyboard", "b1", {
      localRevision: () => "rev-1",
      isDirty: () => false,
      reload,
      onExternalChange
    });

    handleDocumentResourceChange("storyboard", {
      event: "deleted",
      id: "b1",
      updatedAt: null
    });

    expect(reload).not.toHaveBeenCalled();
    expect(onExternalChange).toHaveBeenCalledWith(
      expect.objectContaining({ event: "deleted" })
    );
  });

  it("routes only to the row that changed, and stops after unsubscribe", () => {
    const first = subscriber();
    const second = subscriber();
    registerDocumentSync("imagedocument", "d1", first.handle);
    const unsubscribe = registerDocumentSync(
      "imagedocument",
      "d2",
      second.handle
    );

    handleDocumentResourceChange("imagedocument", {
      event: "updated",
      id: "d2",
      updatedAt: "rev-2"
    });
    expect(first.reload).not.toHaveBeenCalled();
    expect(second.reload).toHaveBeenCalledTimes(1);

    unsubscribe();
    handleDocumentResourceChange("imagedocument", {
      event: "updated",
      id: "d2",
      updatedAt: "rev-3"
    });
    expect(second.reload).toHaveBeenCalledTimes(1);
  });
});

describe("conflict store", () => {
  beforeEach(() => {
    clearAllConflicts();
  });

  const resolvers = {
    onAccept: jest.fn(),
    onDiscard: jest.fn()
  };

  it("registers, resolves, and clears conflicts per key", () => {
    const store = useConflictStore.getState();
    store.setConflicts("script:s1", [{ unit: { kind: "line", id: "l4", label: "Line 4" }, external: {}, reason: "edited" }], resolvers);

    expect(useConflictStore.getState().byKey["script:s1"].conflicts).toHaveLength(1);

    useConflictStore.getState().discard("script:s1", "l4");
    expect(resolvers.onDiscard).toHaveBeenCalledWith("l4");
    expect(useConflictStore.getState().byKey["script:s1"]).toBeUndefined();
  });

  it("accept removes only the resolved conflict", () => {
    const store = useConflictStore.getState();
    store.setConflicts(
      "storyboard:b1",
      [
        { unit: { kind: "shot", id: "s3", label: "Shot 3" }, external: {}, reason: "edited" },
        { unit: { kind: "shot", id: "s5", label: "Shot 5" }, external: null, reason: "deleted" }
      ],
      resolvers
    );

    useConflictStore.getState().accept("storyboard:b1", "s3");
    expect(resolvers.onAccept).toHaveBeenCalledWith("s3");
    expect(
      useConflictStore.getState().byKey["storyboard:b1"].conflicts.map((c) => c.unit.id)
    ).toEqual(["s5"]);
  });
});
