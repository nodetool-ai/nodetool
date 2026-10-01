import { act, renderHook } from "@testing-library/react";
import type { MenuEventData } from "../../window";
import {
  useWorkspaceTabsStore,
  type WorkspaceTab
} from "../../stores/WorkspaceTabsStore";
import { useDocumentDraftStore } from "../../stores/DocumentDraftStore";
import { useWorkspaceMenuShortcuts } from "../useWorkspaceMenuShortcuts";

let mockMenuHandler: (data: MenuEventData) => void;
jest.mock("../useIpcRenderer", () => ({
  useMenuHandler: (handler: (data: MenuEventData) => void) => {
    mockMenuHandler = handler;
  }
}));
jest.mock("../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManagerStore: () => ({
    getState: () => ({
      unsavedWorkflowIds: { dirty: true },
      getNodeStore: () => undefined,
      removeWorkflow: jest.fn(),
      isSavingWorkflow: () => false
    })
  })
}));

it("keyboard/menu close preserves a dirty workflow when discard is canceled", () => {
  const tab: WorkspaceTab = {
    id: "workflow:dirty",
    type: "workflow",
    ref: "dirty",
    title: "Draft",
    mode: "edit"
  };
  useWorkspaceTabsStore.setState({
    tabs: [tab],
    activeTabId: tab.id,
    projectSessions: {}
  });
  useDocumentDraftStore.setState({ dirtyTabs: {}, savingTabs: {} });
  const confirm = jest.spyOn(window, "confirm").mockReturnValue(false);
  renderHook(useWorkspaceMenuShortcuts);
  act(() => mockMenuHandler({ type: "close" }));
  expect(confirm).toHaveBeenCalled();
  expect(useWorkspaceTabsStore.getState().tabs).toEqual([tab]);
  confirm.mockRestore();
});
