import { buildUiContext, resolveUiContext } from "../uiContext";
import { useWorkspaceTabsStore } from "../../../stores/WorkspaceTabsStore";

describe("buildUiContext", () => {
  beforeEach(() => {
    useWorkspaceTabsStore.setState({
      tabs: [],
      activeTabId: null
    } as Partial<ReturnType<typeof useWorkspaceTabsStore.getState>>);
  });

  it("returns null when nothing is open and no source is given", () => {
    expect(buildUiContext()).toBeNull();
  });

  it("still emits a source when no document is open", () => {
    expect(buildUiContext({ source: "model3d_assistant" })).toEqual({
      focused: null,
      open: [],
      selection: null,
      source: "model3d_assistant"
    });
  });

  it("uses an explicit focused document and selection", () => {
    const ctx = buildUiContext({
      source: "sketch_assistant",
      focused: { type: "sketch", id: "sk-1", title: "Fox" },
      selection: { layer_ids: ["layer-2"] }
    });
    expect(ctx?.focused).toEqual({
      type: "sketch",
      id: "sk-1",
      title: "Fox"
    });
    expect(ctx?.open).toContainEqual({
      type: "sketch",
      id: "sk-1",
      title: "Fox"
    });
    expect(ctx?.selection?.layer_ids).toEqual(["layer-2"]);
    expect(ctx?.source).toBe("sketch_assistant");
  });
});

describe("resolveUiContext", () => {
  beforeEach(() => {
    useWorkspaceTabsStore.setState({
      tabs: [],
      activeTabId: null
    } as Partial<ReturnType<typeof useWorkspaceTabsStore.getState>>);
  });

  it("reads a getter at call time and applies chatSource", () => {
    const ctx = resolveUiContext(
      () => ({
        focused: { type: "timeline", id: "tl-1" },
        selection: { clip_ids: ["c1"] }
      }),
      "timeline_assistant"
    );
    expect(ctx?.source).toBe("timeline_assistant");
    expect(ctx?.focused?.id).toBe("tl-1");
    expect(ctx?.selection?.clip_ids).toEqual(["c1"]);
  });
});
