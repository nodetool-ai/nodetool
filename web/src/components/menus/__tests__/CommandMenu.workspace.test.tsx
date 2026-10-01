import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import CommandMenu from "../CommandMenu";
import { useWorkspaceTabsStore } from "../../../stores/WorkspaceTabsStore";
import { trpcClient } from "../../../trpc/client";

const mockRemoveWorkflow = jest.fn();
const mockCreateNew = jest.fn();
const mockCurrent = { id: "existing", name: "Existing" };
const mockManager = {
  getCurrentWorkflow: () => mockCurrent,
  createNew: mockCreateNew,
  removeWorkflow: mockRemoveWorkflow,
  unsavedWorkflowIds: {} as Record<string, true>,
  getNodeStore: () => undefined,
  saveWorkflow: jest.fn(),
  create: jest.fn(),
  load: async () => ({ workflows: [] })
};
jest.mock("../../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: (selector: (state: typeof mockManager) => unknown) => selector(mockManager),
  useWorkflowManagerStore: () => ({ getState: () => mockManager })
}));
jest.mock("../../../contexts/NodeContext", () => ({
  useNodes: (selector: (state: Record<string, unknown>) => unknown) => selector({
    workflow: mockCurrent, workflowJSON: () => "{}", autoLayout: () => undefined,
    selectAllNodes: () => undefined, toggleBypassSelected: () => undefined, getSelectedNodes: () => []
  })
}));
jest.mock("../../../stores/WorkflowRunner", () => ({
  useWebsocketRunner: (selector: (state: { cancel: () => void }) => unknown) => selector({ cancel: () => undefined })
}));
jest.mock("../../../hooks/useFloatingToolbarActions", () => ({ useFloatingToolbarActions: () => ({ handleRun: () => undefined }) }));
jest.mock("../../../hooks/browser/useClipboard", () => ({ useClipboard: () => ({ writeClipboard: () => undefined }) }));
jest.mock("../../../hooks/handlers/useCopyPaste", () => ({ useCopyPaste: () => ({ handleCopy: () => undefined, handlePaste: () => undefined, handleCut: () => undefined }) }));
jest.mock("../../../hooks/useAlignNodes", () => ({ __esModule: true, default: () => () => undefined }));
jest.mock("../../../hooks/useDuplicate", () => ({ useDuplicateNodes: () => () => undefined }));
jest.mock("../../../hooks/nodes/useSurroundWithGroup", () => ({ useSurroundWithGroup: () => () => undefined }));
jest.mock("../../../hooks/useFitView", () => ({ useFitView: () => () => undefined }));
jest.mock("../../../hooks/useSelectionActions", () => ({ useSelectionActions: () => ({}) }));
jest.mock("@xyflow/react", () => ({ useReactFlow: () => ({}) }));
jest.mock("../../../trpc/client", () => ({ trpcClient: { workflows: { get: { query: jest.fn() } } } }));
jest.mock("../../ui_primitives", () => ({ Dialog: ({ children, open }: React.PropsWithChildren<{ open: boolean }>) => open ? <div role="dialog">{children}</div> : null }));

function Location(): React.ReactElement {
  return <output aria-label="Route">{useLocation().pathname}</output>;
}
const renderMenu = () => render(
  <MemoryRouter initialEntries={["/workspace"]}>
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <CommandMenu open setOpen={() => undefined} undo={() => undefined} redo={() => undefined} reactFlowWrapper={{ current: null }} />
      <Location />
    </QueryClientProvider>
  </MemoryRouter>
);
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: jest.fn() });
});

beforeEach(() => {
  jest.clearAllMocks();
  mockManager.unsavedWorkflowIds = {};
  useWorkspaceTabsStore.setState({ tabs: [], activeTabId: null, activeProjectId: "a", projectSessions: {} });
  useWorkspaceTabsStore.getState().openTab({ type: "workflow", ref: "existing", projectId: "a", title: "Existing" });
});

it("New Workflow opens one editable unsaved tab without requesting its server row", async () => {
  mockCreateNew.mockResolvedValue({ id: "unsaved", name: "New workflow" });
  renderMenu();
  await userEvent.click(await screen.findByRole("option", { name: "New Workflow" }));
  await waitFor(() => expect(useWorkspaceTabsStore.getState().activeTabId).toBe("workflow:unsaved"));
  expect(mockCreateNew).toHaveBeenCalledWith("a");
  expect(useWorkspaceTabsStore.getState().tabs.filter((tab) => tab.ref === "unsaved")).toEqual([
    { id: "workflow:unsaved", type: "workflow", ref: "unsaved", title: "New workflow", mode: "edit", projectId: "a" }
  ]);
  expect(trpcClient.workflows.get.query).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Route")).toHaveTextContent("/workspace");
});

it("Close Workflow removes its actual tab and exposes the neighboring document", async () => {
  const store = useWorkspaceTabsStore.getState();
  store.openTab({ type: "text", ref: "note", title: "Note", projectId: "a" });
  store.setActiveTab("workflow:existing");
  renderMenu();
  await userEvent.click(await screen.findByRole("option", { name: "Close Workflow" }));
  await waitFor(() => expect(useWorkspaceTabsStore.getState().activeTabId).toBe("text:note"));
  expect(useWorkspaceTabsStore.getState().tabs.some((tab) => tab.ref === "existing")).toBe(false);
  expect(mockRemoveWorkflow).toHaveBeenCalledWith("existing");
  expect(trpcClient.workflows.get.query).not.toHaveBeenCalled();
});


it("Close Workflow removes the last workflow and keeps the project usable", async () => {
  renderMenu();
  await userEvent.click(await screen.findByRole("option", { name: "Close Workflow" }));
  expect(useWorkspaceTabsStore.getState()).toMatchObject({ tabs: [], activeTabId: null, activeProjectId: "a" });
  expect(mockRemoveWorkflow).toHaveBeenCalledWith("existing");
  expect(trpcClient.workflows.get.query).not.toHaveBeenCalled();
});

it.each([false, true])("Close Workflow honors unsaved discard choice %s", async (discard) => {
  mockManager.unsavedWorkflowIds = { existing: true };
  const confirm = jest.spyOn(window, "confirm").mockReturnValue(discard);
  renderMenu();
  await userEvent.click(await screen.findByRole("option", { name: "Close Workflow" }));
  expect(confirm).toHaveBeenCalledWith('Unsaved changes or saves in progress may be lost. Close “Existing”?');
  expect(useWorkspaceTabsStore.getState().tabs.some((tab) => tab.ref === "existing")).toBe(!discard);
  expect(mockRemoveWorkflow).toHaveBeenCalledTimes(discard ? 1 : 0);
  confirm.mockRestore();
});
