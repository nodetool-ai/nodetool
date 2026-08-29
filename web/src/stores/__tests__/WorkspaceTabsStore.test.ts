import {
  useWorkspaceTabsStore,
  creationProjectId,
  nextActiveAfterClose,
  orderTabsForRender,
  seedTabsFromLegacy,
  tabId,
  LOOSE_PROJECT_ID,
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
  useWorkspaceTabsStore.setState({ tabs, activeTabId, activeProjectId: null });
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

  it("preserves an existing tab's mode when reopened without a mode", () => {
    const store = useWorkspaceTabsStore.getState();
    store.openTab({ type: "workflow", ref: "wf1", mode: "view" });
    store.openTab({ type: "image", ref: "img1" });
    // Refocus without specifying a mode — must NOT flip back to "edit".
    store.openTab({ type: "workflow", ref: "wf1" });

    const state = useWorkspaceTabsStore.getState();
    expect(state.activeTabId).toBe("workflow:wf1");
    expect(state.getActiveTab()).toMatchObject({ mode: "view" });
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

describe("closing the last tab of a project", () => {
  it("leaves the project, so a new document does not land in it unseen", () => {
    useWorkspaceTabsStore.getState().openProject({ id: "p1", name: "Aurora" });
    useWorkspaceTabsStore.getState().closeTab("project:p1");
    expect(useWorkspaceTabsStore.getState().activeProjectId).toBeNull();
  });

  it("keeps the project while another of its tabs is still open", () => {
    useWorkspaceTabsStore.getState().openProject({
      id: "p1",
      name: "Aurora",
      documents: [{ type: "storyboard", ref: "b1", title: "Board" }]
    });
    useWorkspaceTabsStore.getState().closeTab("project:p1");
    expect(useWorkspaceTabsStore.getState().activeProjectId).toBe("p1");
  });

  it("leaves the project when Close Others keeps a loose tab", () => {
    useWorkspaceTabsStore.getState().openTab({ type: "workflow", ref: "a" });
    useWorkspaceTabsStore.getState().openProject({ id: "p1", name: "Aurora" });
    useWorkspaceTabsStore.getState().closeOthers("workflow:a");
    expect(useWorkspaceTabsStore.getState().activeProjectId).toBeNull();
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

describe("creationProjectId", () => {
  it("names the loose bucket while no project is open", () => {
    expect(creationProjectId()).toBe(LOOSE_PROJECT_ID);
  });

  it("follows the project that was opened after the caller was created", () => {
    const create = () => creationProjectId();
    useWorkspaceTabsStore.getState().setActiveProjectId("proj-1");
    expect(create()).toBe("proj-1");
    useWorkspaceTabsStore.getState().setActiveProjectId(null);
    expect(create()).toBe(LOOSE_PROJECT_ID);
  });
});

describe("openProject", () => {
  it("opens the overview first and a tab per document, all in the group", () => {
    useWorkspaceTabsStore.getState().openProject({
      id: "p1",
      name: "Aurora",
      documents: [
        { type: "storyboard", ref: "b1", title: "Board" },
        { type: "timeline", ref: "t1", title: "Cut" }
      ]
    });

    const state = useWorkspaceTabsStore.getState();
    expect(state.tabs.map((t) => t.id)).toEqual([
      "project:p1",
      "storyboard:b1",
      "timeline:t1"
    ]);
    expect(state.tabs.every((t) => t.projectId === "p1")).toBe(true);
    expect(state.activeTabId).toBe("project:p1");
    expect(state.activeProjectId).toBe("p1");
  });

  it("adopts a document already open instead of duplicating it, keeping its mode", () => {
    reset([{ ...tab("timeline", "t1", "view"), title: "Cut" }], "timeline:t1");

    useWorkspaceTabsStore.getState().openProject({
      id: "p1",
      name: "Aurora",
      documents: [{ type: "timeline", ref: "t1", title: "Cut v2" }]
    });

    const state = useWorkspaceTabsStore.getState();
    expect(state.tabs.map((t) => t.id)).toEqual(["project:p1", "timeline:t1"]);
    expect(state.tabs[1]).toMatchObject({
      mode: "view",
      title: "Cut v2",
      projectId: "p1"
    });
  });

  it("places the group where its first member already sat", () => {
    reset([tab("workflow", "a"), tab("storyboard", "b1"), tab("text", "c")]);

    useWorkspaceTabsStore.getState().openProject({
      id: "p1",
      name: "Aurora",
      documents: [{ type: "storyboard", ref: "b1", title: "Board" }]
    });

    expect(useWorkspaceTabsStore.getState().tabs.map((t) => t.id)).toEqual([
      "workflow:a",
      "project:p1",
      "storyboard:b1",
      "text:c"
    ]);
  });
});

describe("closeProject", () => {
  it("closes the group, leaves loose tabs, and clears the active project", () => {
    useWorkspaceTabsStore.getState().openTab({ type: "workflow", ref: "a" });
    useWorkspaceTabsStore.getState().openProject({
      id: "p1",
      name: "Aurora",
      documents: [{ type: "storyboard", ref: "b1", title: "Board" }]
    });

    useWorkspaceTabsStore.getState().closeProject("p1");

    const state = useWorkspaceTabsStore.getState();
    expect(state.tabs.map((t) => t.id)).toEqual(["workflow:a"]);
    expect(state.activeTabId).toBe("workflow:a");
    expect(state.activeProjectId).toBeNull();
  });

  it("keeps another project open", () => {
    useWorkspaceTabsStore.getState().openProject({ id: "p1", name: "One" });
    useWorkspaceTabsStore.getState().openProject({ id: "p2", name: "Two" });

    useWorkspaceTabsStore.getState().closeProject("p1");

    const state = useWorkspaceTabsStore.getState();
    expect(state.tabs.map((t) => t.id)).toEqual(["project:p2"]);
    expect(state.activeProjectId).toBe("p2");
  });
});

describe("openTab with a project", () => {
  it("reads the loose bucket as no project", () => {
    useWorkspaceTabsStore.getState().openTab({
      type: "storyboard",
      ref: "b1",
      projectId: LOOSE_PROJECT_ID
    });
    expect(useWorkspaceTabsStore.getState().tabs[0].projectId).toBeUndefined();
  });

  it("leaves an existing tab's project alone when none is given", () => {
    useWorkspaceTabsStore
      .getState()
      .openTab({ type: "storyboard", ref: "b1", projectId: "p1" });
    useWorkspaceTabsStore.getState().openTab({ type: "storyboard", ref: "b1" });
    expect(useWorkspaceTabsStore.getState().tabs[0].projectId).toBe("p1");
  });
});

describe("setActiveTab", () => {
  it("switches the scope to the activated tab's project", () => {
    reset(
      [
        { ...tab("storyboard", "b1"), projectId: "p1" },
        { ...tab("timeline", "t2"), projectId: "p2" },
        tab("workflow", "loose")
      ],
      "storyboard:b1"
    );
    useWorkspaceTabsStore.setState({ activeProjectId: "p1" });

    useWorkspaceTabsStore.getState().setActiveTab("timeline:t2");
    expect(useWorkspaceTabsStore.getState().activeProjectId).toBe("p2");

    // A loose tab is not a project of its own: the scope stays.
    useWorkspaceTabsStore.getState().setActiveTab("workflow:loose");
    expect(useWorkspaceTabsStore.getState().activeProjectId).toBe("p2");
  });
});

describe("orderTabsForRender", () => {
  const grouped = (ref: string): WorkspaceTab => ({
    ...tab("storyboard", ref),
    projectId: "p1"
  });

  it("leaves the order alone when no project is active", () => {
    const tabs = [grouped("b1"), tab("workflow", "a"), grouped("b2")];
    expect(orderTabsForRender(tabs, null)).toBe(tabs);
  });

  it("gathers the group where its first member sits", () => {
    const tabs = [
      tab("workflow", "a"),
      grouped("b1"),
      tab("text", "c"),
      grouped("b2")
    ];
    expect(orderTabsForRender(tabs, "p1").map((t) => t.ref)).toEqual([
      "a",
      "b1",
      "b2",
      "c"
    ]);
  });

  it("keeps a group that is already contiguous exactly where it is", () => {
    const tabs = [tab("workflow", "a"), grouped("b1"), grouped("b2")];
    expect(orderTabsForRender(tabs, "p1").map((t) => t.ref)).toEqual([
      "a",
      "b1",
      "b2"
    ]);
  });
});
