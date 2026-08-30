import {
  useWorkspaceTabsStore,
  creationProjectId,
  dropTargetIndex,
  gatherProjectTabs,
  nextActiveAfterClose,
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

  it("gathers a stray tab of the project that is not in the documents list", () => {
    reset([
      { ...tab("storyboard", "stray"), projectId: "p1" },
      tab("workflow", "a"),
      tab("storyboard", "b1")
    ]);

    useWorkspaceTabsStore.getState().openProject({
      id: "p1",
      name: "Aurora",
      documents: [{ type: "storyboard", ref: "b1", title: "Board" }]
    });

    const state = useWorkspaceTabsStore.getState();
    const grouped = state.tabs.filter((t) => t.projectId === "p1");
    const first = state.tabs.findIndex((t) => t.projectId === "p1");
    // The group is one contiguous run: stray included, nothing interleaved.
    expect(
      state.tabs.slice(first, first + grouped.length).map((t) => t.projectId)
    ).toEqual(grouped.map(() => "p1"));
    expect(grouped.map((t) => t.id)).toContain("storyboard:stray");
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

describe("rehydration", () => {
  it("drops a persisted active project none of whose tabs survived", async () => {
    localStorage.setItem(
      "workspace-tabs-storage",
      JSON.stringify({
        state: {
          tabs: [tab("workflow", "a")],
          activeTabId: "workflow:a",
          activeProjectId: "dead-project"
        },
        version: 1
      })
    );

    await useWorkspaceTabsStore.persist.rehydrate();

    const state = useWorkspaceTabsStore.getState();
    expect(state.activeProjectId).toBeNull();
    expect(creationProjectId()).toBe(LOOSE_PROJECT_ID);
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

const grouped = (ref: string): WorkspaceTab => ({
  ...tab("storyboard", ref),
  projectId: "p1"
});

describe("gatherProjectTabs", () => {
  it("leaves the order alone when no project is active", () => {
    const tabs = [grouped("b1"), tab("workflow", "a"), grouped("b2")];
    expect(gatherProjectTabs(tabs, null)).toBe(tabs);
  });

  it("gathers the group where its first member sits", () => {
    const tabs = [
      tab("workflow", "a"),
      grouped("b1"),
      tab("text", "c"),
      grouped("b2")
    ];
    expect(gatherProjectTabs(tabs, "p1").map((t) => t.ref)).toEqual([
      "a",
      "b1",
      "b2",
      "c"
    ]);
  });

  it("returns the same array when the group is already contiguous", () => {
    const tabs = [tab("workflow", "a"), grouped("b1"), grouped("b2")];
    expect(gatherProjectTabs(tabs, "p1")).toBe(tabs);
  });
});

// The tab bar renders `tabs` as they come and computes drop indices against
// them, so these exercise the one index space end to end: build the divergence
// the bar used to render around, then drop and close through it.
describe("store order is render order", () => {
  const g1 = grouped("g1");
  const g2 = grouped("g2");
  const l1 = tab("workflow", "l1");
  const l2 = tab("text", "l2");

  /** What the bar does on drop: index against the store, then move. */
  const drop = (
    sourceId: string,
    targetId: string,
    position: "left" | "right"
  ) => {
    const toIndex = dropTargetIndex(
      useWorkspaceTabsStore.getState().tabs,
      sourceId,
      targetId,
      position
    );
    if (toIndex !== null) {
      useWorkspaceTabsStore.getState().moveTab(sourceId, toIndex);
    }
  };

  const refs = () => useWorkspaceTabsStore.getState().tabs.map((t) => t.ref);

  beforeEach(() => {
    // A group split by two loose tabs — the shape the bar used to render as
    // [g1, g2, l1, l2] while the store still held this.
    reset([g1, l1, l2, g2], "storyboard:g2");
    useWorkspaceTabsStore.getState().setActiveProjectId("p1");
  });

  it("gathers the group into the store when the project becomes active", () => {
    expect(refs()).toEqual(["g1", "g2", "l1", "l2"]);
  });

  it("drops a loose tab where the indicator showed, just after the group", () => {
    // Indicator on the right edge of g2 — between the group and l1.
    drop("text:l2", "storyboard:g2", "right");
    expect(refs()).toEqual(["g1", "g2", "l2", "l1"]);
  });

  it("keeps the group contiguous when a tab is dropped inside it", () => {
    // Indicator between g1 and g2. No loose tab can live there, so l1 lands at
    // the near edge of the group — and never past l2, which is what the old
    // store-index arithmetic did.
    drop("workflow:l1", "storyboard:g2", "left");
    expect(refs()).toEqual(["g1", "g2", "l1", "l2"]);
  });

  it("reorders inside the group", () => {
    drop("storyboard:g2", "storyboard:g1", "left");
    expect(refs()).toEqual(["g2", "g1", "l1", "l2"]);
  });

  it("focuses the visually adjacent tab when the active tab closes", () => {
    useWorkspaceTabsStore.getState().closeTab("storyboard:g2");
    expect(refs()).toEqual(["g1", "l1", "l2"]);
    expect(useWorkspaceTabsStore.getState().activeTabId).toBe("workflow:l1");
  });
});

describe("closeProject focus", () => {
  it("focuses the tab that slid into the group's place", () => {
    reset(
      [tab("image", "l0"), grouped("g1"), grouped("g2"), tab("workflow", "l1"), tab("text", "l2")],
      "storyboard:g1"
    );
    useWorkspaceTabsStore.getState().setActiveProjectId("p1");

    useWorkspaceTabsStore.getState().closeProject("p1");

    const state = useWorkspaceTabsStore.getState();
    expect(state.tabs.map((t) => t.ref)).toEqual(["l0", "l1", "l2"]);
    expect(state.activeTabId).toBe("workflow:l1");
  });
});

describe("dropTargetIndex", () => {
  const tabs = [tab("workflow", "a"), tab("image", "b"), tab("text", "c")];

  it("is null for a drop on the dragged tab itself", () => {
    expect(dropTargetIndex(tabs, "image:b", "image:b", "left")).toBeNull();
  });

  it("is null when either tab is gone", () => {
    expect(dropTargetIndex(tabs, "text:gone", "image:b", "left")).toBeNull();
    expect(dropTargetIndex(tabs, "image:b", "text:gone", "left")).toBeNull();
  });

  it("accounts for the dragged tab leaving its slot", () => {
    // a moves to the right of c: removing a first shifts c down to index 1.
    expect(dropTargetIndex(tabs, "workflow:a", "text:c", "right")).toBe(2);
    // c moves to the left of a: nothing before it is removed.
    expect(dropTargetIndex(tabs, "text:c", "workflow:a", "left")).toBe(0);
  });
});
