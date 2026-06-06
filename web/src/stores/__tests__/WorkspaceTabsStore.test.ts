import {
  useWorkspaceTabsStore,
  nextActiveAfterClose,
  seedTabsFromLegacy,
  tabId,
  type WorkspaceTab
} from "../WorkspaceTabsStore";

const tab = (
  type: WorkspaceTab["type"],
  ref: string,
  mode: WorkspaceTab["mode"] = "edit"
): WorkspaceTab => ({
  id: tabId(type, ref),
  type,
  ref,
  mode,
  title: ref
});

const reset = (tabs: WorkspaceTab[] = [], activeTabId: string | null = null) => {
  useWorkspaceTabsStore.setState({ tabs, activeTabId });
};

beforeEach(() => {
  localStorage.clear();
  reset();
});

describe("tabId", () => {
  it("builds a stable id from type and ref", () => {
    expect(tabId("workflow", "abc")).toBe("workflow:abc");
    expect(tabId("image", "asset-1")).toBe("image:asset-1");
  });
});

describe("nextActiveAfterClose", () => {
  const tabs = [tab("workflow", "a"), tab("image", "b"), tab("text", "c")];

  it("keeps the active tab when a different tab closes", () => {
    expect(nextActiveAfterClose(tabs, "image:b", "workflow:a")).toBe("image:b");
  });

  it("activates the right neighbour when the active tab closes", () => {
    expect(nextActiveAfterClose(tabs, "image:b", "image:b")).toBe("text:c");
  });

  it("falls back to the left neighbour when closing the last tab", () => {
    expect(nextActiveAfterClose(tabs, "text:c", "text:c")).toBe("image:b");
  });

  it("returns null when closing the only tab", () => {
    expect(nextActiveAfterClose([tab("text", "c")], "text:c", "text:c")).toBeNull();
  });
});

describe("openTab", () => {
  it("opens a new tab and focuses it", () => {
    const id = useWorkspaceTabsStore.getState().openTab({
      type: "workflow",
      ref: "wf1",
      title: "Flow 1"
    });
    const state = useWorkspaceTabsStore.getState();
    expect(id).toBe("workflow:wf1");
    expect(state.tabs).toHaveLength(1);
    expect(state.activeTabId).toBe("workflow:wf1");
    expect(state.tabs[0]).toMatchObject({ mode: "edit", title: "Flow 1" });
  });

  it("focuses an existing tab instead of duplicating it", () => {
    const store = useWorkspaceTabsStore.getState();
    store.openTab({ type: "workflow", ref: "wf1", title: "Flow 1" });
    store.openTab({ type: "image", ref: "img1" });
    store.openTab({ type: "workflow", ref: "wf1", mode: "view" });

    const state = useWorkspaceTabsStore.getState();
    expect(state.tabs).toHaveLength(2);
    expect(state.activeTabId).toBe("workflow:wf1");
    expect(state.getActiveTab()).toMatchObject({
      mode: "view",
      title: "Flow 1" // preserved when reopened without a title
    });
  });
});

describe("mode", () => {
  it("toggles between edit and view", () => {
    const store = useWorkspaceTabsStore.getState();
    const id = store.openTab({ type: "workflow", ref: "wf1" });
    store.toggleMode(id);
    expect(useWorkspaceTabsStore.getState().getActiveTab()?.mode).toBe("view");
    store.toggleMode(id);
    expect(useWorkspaceTabsStore.getState().getActiveTab()?.mode).toBe("edit");
  });
});

describe("closeTab", () => {
  it("removes the tab and reassigns the active tab", () => {
    reset(
      [tab("workflow", "a"), tab("image", "b"), tab("text", "c")],
      "image:b"
    );
    useWorkspaceTabsStore.getState().closeTab("image:b");
    const state = useWorkspaceTabsStore.getState();
    expect(state.tabs.map((t) => t.id)).toEqual(["workflow:a", "text:c"]);
    expect(state.activeTabId).toBe("text:c");
  });
});

describe("closeOthers", () => {
  it("keeps only the given tab", () => {
    reset(
      [tab("workflow", "a"), tab("image", "b"), tab("text", "c")],
      "workflow:a"
    );
    useWorkspaceTabsStore.getState().closeOthers("image:b");
    const state = useWorkspaceTabsStore.getState();
    expect(state.tabs.map((t) => t.id)).toEqual(["image:b"]);
    expect(state.activeTabId).toBe("image:b");
  });
});

describe("moveTab", () => {
  it("reorders a tab to a new index", () => {
    reset([tab("workflow", "a"), tab("image", "b"), tab("text", "c")]);
    useWorkspaceTabsStore.getState().moveTab("text:c", 0);
    expect(useWorkspaceTabsStore.getState().tabs.map((t) => t.ref)).toEqual([
      "c",
      "a",
      "b"
    ]);
  });
});

describe("setTitle", () => {
  it("updates the title for a document", () => {
    reset([tab("workflow", "a")]);
    useWorkspaceTabsStore.getState().setTitle("a", "workflow", "Renamed");
    expect(useWorkspaceTabsStore.getState().tabs[0].title).toBe("Renamed");
  });
});

describe("seedTabsFromLegacy", () => {
  it("returns empty state when no workflows were open", () => {
    expect(seedTabsFromLegacy()).toEqual({ tabs: [], activeTabId: null });
  });

  it("seeds workflow tabs from openWorkflows and honours currentWorkflowId", () => {
    localStorage.setItem("openWorkflows", JSON.stringify(["a", "b", "c"]));
    localStorage.setItem("currentWorkflowId", "b");

    const seeded = seedTabsFromLegacy();
    expect(seeded.tabs.map((t) => t.id)).toEqual([
      "workflow:a",
      "workflow:b",
      "workflow:c"
    ]);
    expect(seeded.tabs.every((t) => t.type === "workflow" && t.mode === "edit")).toBe(
      true
    );
    expect(seeded.activeTabId).toBe("workflow:b");
  });

  it("defaults the active tab to the first workflow when currentWorkflowId is unknown", () => {
    localStorage.setItem("openWorkflows", JSON.stringify(["a", "b"]));
    localStorage.setItem("currentWorkflowId", "missing");
    expect(seedTabsFromLegacy().activeTabId).toBe("workflow:a");
  });

  it("ignores malformed openWorkflows", () => {
    localStorage.setItem("openWorkflows", "{not json");
    expect(seedTabsFromLegacy()).toEqual({ tabs: [], activeTabId: null });
  });
});
