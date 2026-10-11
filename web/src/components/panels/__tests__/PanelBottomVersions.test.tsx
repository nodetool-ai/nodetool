import { act, fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { PanelBodyContent } from "../PanelBottom";
import { createNodeStore } from "../../../stores/NodeStore";
let mockTabType: string | null = "chat";
jest.mock("../../../stores/WorkspaceTabsStore", () => ({ useWorkspaceTabsStore: (select: (s: unknown) => unknown) => select({ tabs: mockTabType ? [{ id: "active", type: mockTabType, ref: "visible-workflow" }] : [], activeTabId: "active" }) }));
let mockNodeStores: Record<string, unknown> = {};
jest.mock("../../../contexts/WorkflowManagerContext", () => ({ useWorkflowManager: (select: (s: unknown) => unknown) => select({ currentWorkflowId: "previous-workflow", nodeStores: mockNodeStores }) }));
jest.mock("../../version/VersionHistoryPanel", () => ({
  VersionHistoryPanel: ({
    workflowId,
    onRestore
  }: {
    workflowId: string;
    onRestore: (version: unknown, restored: unknown) => Promise<void>;
  }) => (
    <div>
      Versions for {workflowId}
      <button
        onClick={() =>
          void onRestore(
            { version: 2, graph: { nodes: [], edges: [] } },
            { updated_at: "2026-10-09T12:00:00Z", etag: "restored-etag" }
          )
        }
      >
        Restore
      </button>
    </div>
  )
}));
jest.mock("../TracePanel", () => () => null);
jest.mock("../LogPanel", () => () => null);
jest.mock("../jobs/QueuePanel", () => () => null);
jest.mock("../../workers/WorkersPanel", () => () => null);
jest.mock("../../workers/WorkerStatusIndicator", () => () => null);
jest.mock("../../context_menus/ContextMenus", () => () => null);
jest.mock("../../../hooks/useRunningJobs", () => ({ useRunningJobs: () => ({ data: [] }) }));
jest.mock("../../../lib/websocket/GlobalWebSocketManager", () => ({ globalWebSocketManager: {} }));
it("explains versions when a non-workflow tab is visible", () => {
  mockTabType = "chat";
  render(<ThemeProvider theme={mockTheme}><PanelBodyContent activeView="versions" /></ThemeProvider>);
  expect(screen.getByText("Select a workflow to view its versions")).toBeInTheDocument();
  expect(screen.queryByText("Versions for previous-workflow")).not.toBeInTheDocument();
});
it("uses the visible workflow rather than the previously current workflow", () => {
  mockTabType = "workflow";
  render(<ThemeProvider theme={mockTheme}><PanelBodyContent activeView="versions" /></ThemeProvider>);
  expect(screen.getByText("Versions for visible-workflow")).toBeInTheDocument();
});

it("explains versions when no document is open", () => {
  mockTabType = null;
  render(<ThemeProvider theme={mockTheme}><PanelBodyContent activeView="versions" /></ThemeProvider>);
  expect(screen.getByText("Select a workflow to view its versions")).toBeInTheDocument();
});

it("adopts the restored row's concurrency tokens", async () => {
  mockTabType = "workflow";
  const store = createNodeStore({
    id: "visible-workflow",
    name: "Workflow",
    access: "private",
    description: "",
    graph: { nodes: [], edges: [] },
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    etag: "old-etag"
  });
  mockNodeStores = { "visible-workflow": store };
  render(<ThemeProvider theme={mockTheme}><PanelBodyContent activeView="versions" /></ThemeProvider>);

  await act(async () => {
    fireEvent.click(screen.getByText("Restore"));
  });

  expect(store.getState().workflow.updated_at).toBe("2026-10-09T12:00:00Z");
  expect(store.getState().workflow.etag).toBe("restored-etag");
  expect(store.getState().workflowIsDirty).toBe(true);
  mockNodeStores = {};
});
