import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { PanelBodyContent } from "../PanelBottom";
let mockTabType: string | null = "chat";
jest.mock("../../../stores/WorkspaceTabsStore", () => ({ useWorkspaceTabsStore: (select: (s: unknown) => unknown) => select({ tabs: mockTabType ? [{ id: "active", type: mockTabType, ref: "visible-workflow" }] : [], activeTabId: "active" }) }));
jest.mock("../../../contexts/WorkflowManagerContext", () => ({ useWorkflowManager: (select: (s: unknown) => unknown) => select({ currentWorkflowId: "previous-workflow", nodeStores: {} }) }));
jest.mock("../../version/VersionHistoryPanel", () => ({ VersionHistoryPanel: ({ workflowId }: { workflowId: string }) => <div>Versions for {workflowId}</div> }));
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
