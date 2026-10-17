import { act, renderHook } from "@testing-library/react";
import { useWorkspaceDocumentClose } from "../useWorkspaceDocumentClose";
import {
  useWorkspaceTabsStore,
  type WorkspaceTab
} from "../../stores/WorkspaceTabsStore";
import { useDocumentDraftStore } from "../../stores/DocumentDraftStore";
import { useConfirmStore } from "../../stores/ConfirmStore";

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
  useConfirmStore.setState({ pending: null });
});

/** Answer the app confirm dialog and let the close continuation run. */
const answerConfirm = async (confirmed: boolean): Promise<void> => {
  await act(async () => {
    useConfirmStore.getState().settle(confirmed);
  });
};

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

it("canceling dirty audio close preserves the registered draft and active tab", async () => {
  const audio = tab("audio", "dirty");
  useWorkspaceTabsStore.setState({ tabs: [audio], activeTabId: audio.id });
  useDocumentDraftStore.getState().setDirty(audio.id, true);
  const confirm = jest.spyOn(window, "confirm");
  const { result } = renderHook(useWorkspaceDocumentClose);
  act(() => result.current.closeDocument(audio));
  expect(useConfirmStore.getState().pending?.request.content).toBe(
    "Unsaved changes or saves in progress may be lost. Close “dirty”?"
  );
  await answerConfirm(false);
  expect(confirm).not.toHaveBeenCalled();
  expect(useWorkspaceTabsStore.getState().activeTabId).toBe(audio.id);
  expect(useDocumentDraftStore.getState().dirtyTabs[audio.id]).toBe(true);
  confirm.mockRestore();
});

it("confirming the dialog closes the dirty document and drops its draft", async () => {
  const audio = tab("audio", "dirty");
  useWorkspaceTabsStore.setState({ tabs: [audio], activeTabId: audio.id });
  useDocumentDraftStore.getState().setDirty(audio.id, true);
  const { result } = renderHook(useWorkspaceDocumentClose);
  act(() => result.current.closeDocument(audio));
  // Nothing closes while the dialog is open.
  expect(useWorkspaceTabsStore.getState().tabs).toEqual([audio]);
  await answerConfirm(true);
  expect(useWorkspaceTabsStore.getState().tabs).toEqual([]);
  expect(useDocumentDraftStore.getState().dirtyTabs[audio.id]).toBeUndefined();
});

it("Close Others keeps a sibling that turned dirty while the dialog was open", async () => {
  const kept = tab("workflow", "kept");
  const dirty = tab("audio", "dirty");
  const late = tab("text", "late");
  useWorkspaceTabsStore.setState({
    tabs: [kept, dirty, late],
    activeTabId: dirty.id
  });
  useDocumentDraftStore.getState().setDirty(dirty.id, true);
  const { result } = renderHook(useWorkspaceDocumentClose);
  act(() => result.current.closeOtherDocuments(kept));
  useDocumentDraftStore.getState().setDirty(late.id, true);
  await answerConfirm(true);
  expect(useWorkspaceTabsStore.getState().tabs).toEqual([kept, dirty, late]);
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

it("asks before closing an app whose save is still pending", async () => {
  const application = tab("application", "saving");
  useWorkspaceTabsStore.setState({
    tabs: [application],
    activeTabId: application.id
  });
  useDocumentDraftStore.getState().setSaving(application.id, true);
  const { result } = renderHook(useWorkspaceDocumentClose);
  act(() => result.current.closeDocument(application));
  expect(useConfirmStore.getState().pending).not.toBeNull();
  await answerConfirm(false);
  expect(useWorkspaceTabsStore.getState().tabs).toEqual([application]);
});
