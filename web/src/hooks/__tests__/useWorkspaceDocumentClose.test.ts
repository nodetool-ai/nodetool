import { act, renderHook } from "@testing-library/react";
import { useWorkspaceDocumentClose } from "../useWorkspaceDocumentClose";
import {
  useWorkspaceTabsStore,
  type WorkspaceTab
} from "../../stores/WorkspaceTabsStore";
import { useDocumentDraftStore } from "../../stores/DocumentDraftStore";

const mockRemoveWorkflow = jest.fn();
jest.mock("../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManagerStore: () => ({
    getState: () => ({
      unsavedWorkflowIds: {},
      getNodeStore: () => undefined,
      removeWorkflow: mockRemoveWorkflow
    })
  })
}));

const tab = (type: WorkspaceTab["type"], ref: string): WorkspaceTab => {
  const result: WorkspaceTab = {
    id: `${type}:${ref}`,
    type,
    ref,
    title: ref,
    mode: "edit"
  };
  if (type !== "page") {
    result.projectId = "a";
  }
  return result;
};
beforeEach(() => {
  jest.clearAllMocks();
  useWorkspaceTabsStore.setState({
    tabs: [],
    activeProjectId: "a",
    activeTabId: null,
    projectSessions: {}
  });
  useDocumentDraftStore.setState({
    dirtyTabs: {},
    savingTabs: {},
    codeDrafts: {}
  });
});

it("Close Others focuses the kept document after closing siblings", () => {
  const kept = tab("workflow", "kept");
  const sibling = tab("workflow", "sibling");
  const settings = tab("page", "settings");
  useWorkspaceTabsStore.setState({
    tabs: [kept, sibling, settings],
    activeTabId: settings.id
  });
  const { result } = renderHook(useWorkspaceDocumentClose);
  act(() => result.current.closeOtherDocuments(kept));
  expect(useWorkspaceTabsStore.getState().activeTabId).toBe(kept.id);
  expect(useWorkspaceTabsStore.getState().tabs).toEqual([kept, settings]);
  expect(mockRemoveWorkflow).toHaveBeenCalledWith("sibling");
});

it("canceling dirty audio close preserves the registered draft and active tab", () => {
  const audio = tab("audio", "dirty");
  useWorkspaceTabsStore.setState({ tabs: [audio], activeTabId: audio.id });
  useDocumentDraftStore.getState().setDirty(audio.id, true);
  const confirm = jest.spyOn(window, "confirm").mockReturnValue(false);
  const { result } = renderHook(useWorkspaceDocumentClose);
  act(() => result.current.closeDocument(audio));
  expect(useWorkspaceTabsStore.getState().activeTabId).toBe(audio.id);
  expect(useDocumentDraftStore.getState().dirtyTabs[audio.id]).toBe(true);
  confirm.mockRestore();
});

it("blocks browser unload for dirty documents", () => {
  const audio = tab("audio", "dirty");
  useWorkspaceTabsStore.setState({ tabs: [audio], activeTabId: audio.id });
  useDocumentDraftStore.getState().setDirty(audio.id, true);
  renderHook(useWorkspaceDocumentClose);
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
});

it("asks before closing an app whose save is still pending", () => {
  const application = tab("application", "saving");
  useWorkspaceTabsStore.setState({
    tabs: [application],
    activeTabId: application.id
  });
  useDocumentDraftStore.getState().setSaving(application.id, true);
  const confirm = jest.spyOn(window, "confirm").mockReturnValue(false);
  const { result } = renderHook(useWorkspaceDocumentClose);
  act(() => result.current.closeDocument(application));
  expect(confirm).toHaveBeenCalled();
  expect(useWorkspaceTabsStore.getState().tabs).toEqual([application]);
  confirm.mockRestore();
});
