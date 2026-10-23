import {
  isTabInScope,
  useWorkspaceTabsStore
} from "../../stores/WorkspaceTabsStore";
import { openSharedDocument } from "../openSharedDocument";

beforeEach(() => {
  localStorage.clear();
  useWorkspaceTabsStore.setState({
    tabs: [],
    activeTabId: null,
    activeProjectId: "project-mine",
    personalProjectId: null,
    projectSessions: {}
  });
});

describe("openSharedDocument", () => {
  it("opens a viewer's document read-only in the loose bucket and shows it", () => {
    openSharedDocument({
      type: "storyboard",
      id: "board-9",
      name: "Their Board",
      role: "viewer"
    });

    const state = useWorkspaceTabsStore.getState();
    const tab = state.tabs.find((candidate) => candidate.ref === "board-9");
    expect(tab).toMatchObject({
      type: "storyboard",
      mode: "view",
      title: "Their Board"
    });
    expect(tab?.projectId).toBeUndefined();
    expect(state.activeTabId).toBe(tab?.id);
    expect(isTabInScope(tab!, state.activeProjectId)).toBe(true);
  });

  it("opens an editor's document in edit mode", () => {
    openSharedDocument({
      type: "sketch",
      id: "sketch-3",
      name: "Their Sketch",
      role: "editor"
    });

    expect(
      useWorkspaceTabsStore
        .getState()
        .tabs.find((candidate) => candidate.ref === "sketch-3")?.mode
    ).toBe("edit");
  });
});
