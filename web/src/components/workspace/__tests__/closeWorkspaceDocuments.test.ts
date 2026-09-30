import { closeWorkspaceDocuments } from "../closeWorkspaceDocuments";
import {
  tabsToCloseOthers,
  useWorkspaceTabsStore,
  type WorkspaceTab
} from "../../../stores/WorkspaceTabsStore";

const workflow = (ref: string, projectId: string): WorkspaceTab => ({
  id: `workflow:${ref}`,
  ref,
  projectId,
  title: ref,
  type: "workflow",
  mode: "edit"
});
beforeEach(() =>
  useWorkspaceTabsStore.setState({
    tabs: [],
    activeTabId: null,
    activeProjectId: "a",
    projectSessions: {}
  })
);

it.each(["saved-dirty-b", "never-saved-b"])(
  "Close Others preserves the backing state of %s in another project",
  (ref) => {
    const keep = workflow("keep", "a");
    const closing = workflow("closing", "a");
    const retained = workflow(ref, "b");
    const draft = {
      nodes: [{ text: "unsaved edit" }],
      undo: ["before edit"],
      run: { job: "live" }
    };
    const documents = new Map([
      [ref, draft],
      ["closing", { nodes: [], undo: [], run: { job: "closed" } }]
    ]);
    useWorkspaceTabsStore.setState({
      tabs: [keep, closing, retained],
      activeTabId: keep.id
    });
    const cleanup = jest.fn((tab: WorkspaceTab) => documents.delete(tab.ref));
    closeWorkspaceDocuments(
      tabsToCloseOthers(useWorkspaceTabsStore.getState().tabs, keep.id),
      {
        isDirty: (tab) => tab.id === retained.id,
        confirmDiscard: () => false,
        cleanup
      }
    );
    expect(useWorkspaceTabsStore.getState().tabs).toEqual([keep, retained]);
    expect(documents.get(ref)).toBe(draft);
    expect(draft).toEqual({
      nodes: [{ text: "unsaved edit" }],
      undo: ["before edit"],
      run: { job: "live" }
    });
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledWith(closing);
  }
);

it("cancel leaves the tabs and document state untouched", () => {
  const dirty = workflow("dirty", "a");
  useWorkspaceTabsStore.setState({ tabs: [dirty], activeTabId: dirty.id });
  const cleanup = jest.fn();
  expect(
    closeWorkspaceDocuments([dirty], {
      isDirty: () => true,
      confirmDiscard: () => false,
      cleanup
    })
  ).toBe(false);
  expect(useWorkspaceTabsStore.getState().tabs).toEqual([dirty]);
  expect(cleanup).not.toHaveBeenCalled();
});

it("closes an unsaved workflow and reveals its neighboring non-workflow document", () => {
  const closing = workflow("new", "a");
  const next: WorkspaceTab = {
    id: "text:note",
    ref: "note",
    title: "Note",
    projectId: "a",
    type: "text",
    mode: "edit"
  };
  useWorkspaceTabsStore.setState({
    tabs: [closing, next],
    activeTabId: closing.id
  });
  const cleanup = jest.fn();
  expect(
    closeWorkspaceDocuments([closing], {
      isDirty: () => true,
      confirmDiscard: () => true,
      cleanup
    })
  ).toBe(true);
  expect(useWorkspaceTabsStore.getState().tabs).toEqual([next]);
  expect(useWorkspaceTabsStore.getState().activeTabId).toBe(next.id);
  expect(cleanup).toHaveBeenCalledWith(closing);
});

it("closes the last workflow while preserving the selected project", () => {
  const closing = workflow("last", "a");
  useWorkspaceTabsStore.setState({ tabs: [closing], activeTabId: closing.id });
  closeWorkspaceDocuments([closing], {
    isDirty: () => false,
    confirmDiscard: () => true,
    cleanup: () => undefined
  });
  expect(useWorkspaceTabsStore.getState()).toMatchObject({
    tabs: [],
    activeTabId: null,
    activeProjectId: "a"
  });
});
