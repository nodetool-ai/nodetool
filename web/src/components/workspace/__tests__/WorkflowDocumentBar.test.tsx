import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import WorkflowDocumentBar from "../WorkflowDocumentBar";
import { useSettingsStore } from "../../../stores/SettingsStore";
import { useMiniMapStore } from "../../../stores/MiniMapStore";

const undo = jest.fn();
const openWorkflowApp = jest.fn();
const convertToJsScript = jest.fn();
let dirty = false;
let saveStates: Record<string, "saving" | "error"> = {};

interface NodeStateMock {
  workflowJSON: () => string;
  workflow: { name: string };
}
interface TemporalStateMock {
  undo: () => void;
  redo: () => void;
  pastStates: unknown[];
  futureStates: unknown[];
}
interface ManagerStateMock {
  workflowSaveStates: Record<string, "saving" | "error">;
  getWorkflow: () => void;
  saveWorkflow: () => void;
}

jest.mock("../WorkspaceDocumentBar", () => ({
  __esModule: true,
  default: ({
    tab,
    ...slots
  }: {
    tab: { title: string };
    status?: React.ReactNode;
    history?: React.ReactNode;
    mode?: React.ReactNode;
    view?: React.ReactNode;
    actions?: React.ReactNode;
  }) => (
    <div role="toolbar" aria-label={`${tab.title} document`}>
      {slots.status}
      {slots.history}
      {slots.mode}
      {slots.view}
      {slots.actions}
    </div>
  )
}));

jest.mock("../../../contexts/NodeContext", () => ({
  __esModule: true,
  useNodes: <T,>(selector: (s: NodeStateMock) => T) =>
    selector({ workflowJSON: () => "{}", workflow: { name: "Flow" } }),
  useTemporalNodes: <T,>(selector: (s: TemporalStateMock) => T) =>
    selector({ undo, redo: jest.fn(), pastStates: [1], futureStates: [] })
}));

jest.mock("../../../contexts/WorkflowManagerContext", () => ({
  __esModule: true,
  useWorkflowManager: <T,>(selector: (s: ManagerStateMock) => T) =>
    selector({
      workflowSaveStates: saveStates,
      getWorkflow: jest.fn(),
      saveWorkflow: jest.fn()
    })
}));

jest.mock("../../../hooks/useWorkflowDirty", () => ({
  useWorkflowDirty: () => dirty
}));

jest.mock("../../../hooks/useWorkflowApp", () => ({
  useWorkflowApp: () => ({ openWorkflowApp, hasApp: false, isPending: false })
}));

jest.mock("../../../hooks/useWorkflowScriptExport", () => ({
  useWorkflowScriptExport: () => ({
    convertToJsScript,
    downloadNodeScript: jest.fn(),
    isExporting: false
  })
}));

jest.mock("../../../hooks/useCanvasConversation", () => ({
  useCanvasConversation: () => ({ conversationCount: 2, chatBusy: false })
}));

const tab = {
  id: "workflow:wf-1",
  type: "workflow" as const,
  ref: "wf-1",
  mode: "edit" as const,
  title: "Flow"
};

const renderBar = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <WorkflowDocumentBar tab={tab} />
    </ThemeProvider>
  );

beforeEach(() => {
  dirty = false;
  saveStates = {};
  jest.clearAllMocks();
  act(() => {
    useSettingsStore.getState().setEditorViewMode("graph");
    useMiniMapStore.getState().setVisible(false);
  });
});

it("reads the autosave state", () => {
  const view = renderBar();
  expect(screen.getByText("Saved")).toBeInTheDocument();
  dirty = true;
  view.rerender(
    <ThemeProvider theme={mockTheme}>
      <WorkflowDocumentBar tab={{ ...tab, title: "Flow 2" }} />
    </ThemeProvider>
  );
  expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
  saveStates = { "wf-1": "saving" };
  view.rerender(
    <ThemeProvider theme={mockTheme}>
      <WorkflowDocumentBar tab={tab} />
    </ThemeProvider>
  );
  expect(screen.getByText("Saving…")).toBeInTheDocument();
});

it("undoes the graph history", async () => {
  renderBar();
  await userEvent.click(screen.getByRole("button", { name: /undo/i }));
  expect(undo).toHaveBeenCalled();
});

it("switches between graph and chain, with the mini map only on the graph", async () => {
  renderBar();
  expect(screen.getByRole("button", { name: /mini map/i })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Chain" }));
  expect(useSettingsStore.getState().settings.editorViewMode).toBe("chain");
  expect(
    screen.queryByRole("button", { name: /mini map/i })
  ).not.toBeInTheDocument();
});

it("holds the app and the exports in ⋮", async () => {
  renderBar();
  await userEvent.click(screen.getByRole("button", { name: "More actions" }));
  const menu = screen.getByRole("menu");
  for (const name of [
    "Make app",
    "Download JSON",
    "Convert to JS script",
    "Download Node.js script"
  ]) {
    expect(within(menu).getByText(name)).toBeInTheDocument();
  }
  await userEvent.click(within(menu).getByText("Convert to JS script"));
  expect(convertToJsScript).toHaveBeenCalled();
});
