/**
 * Reopening a workflow that is still mid-Workflow-flow.
 *
 * The `+ New` menu creates the workflow at stage `idea` and opens its tab
 * straight onto the flow; a refresh or a close loses nothing because the
 * stage on the document is the only thing read here. Anything but `done`
 * mounts the setup host, `done` (or no `settings.setup` at all, for
 * workflows saved before the flow existed) mounts the canvas.
 *
 * The flow is mounted for real at its first step, not stubbed, so the
 * assertion is which surface comes back — that is what "resumes" means.
 */
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";

// The canvas and its overlays: this suite asks which of the two surfaces
// mounts, not what either draws.
jest.mock("../../node_editor/NodeEditor", () => ({
  __esModule: true,
  default: () => <div data-testid="node-editor" />
}));
jest.mock("../../panels/FloatingToolBar", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../../panels/QueueOverlay", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../../panels/StatusMessage", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../../editor/NodeCreateBridge", () => ({
  __esModule: true,
  default: () => <div data-testid="node-create-bridge" />
}));
jest.mock("../SubgraphTabStrip", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../SubgraphTabContent", () => ({
  __esModule: true,
  default: ({ tab, active }: { tab: { key: string }; active: boolean }) => (
    <div
      data-testid="subgraph-content"
      data-tab={tab.key}
      data-active={String(active)}
    />
  )
}));
jest.mock("../WorkflowChainSurface", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../../KeyboardProvider", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  )
}));
jest.mock("../../../providers/ContextMenuProvider", () => ({
  ContextMenuProvider: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  )
}));
jest.mock("../../../providers/ConnectableNodesProvider", () => ({
  ConnectableNodesProvider: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  )
}));
jest.mock("../../../hooks/useDocumentConflicts", () => ({
  useDocumentConflicts: () => ({
    items: [],
    accept: jest.fn(),
    discard: jest.fn()
  })
}));

// What the flow reads out of the install: models on offer. Each has its own
// suite; here they only need to answer so the first step can mount.
jest.mock("../../../hooks/useModelsByProvider", () => ({
  __esModule: true,
  useLanguageModelsByProvider: () => ({
    models: [],
    isLoading: false,
    error: null,
    refetch: jest.fn()
  }),
  useImageModelsByProvider: () => ({
    models: [],
    isLoading: false,
    error: null,
    refetch: jest.fn()
  }),
  useVideoModelsByProvider: () => ({
    models: [],
    isLoading: false,
    error: null,
    refetch: jest.fn()
  }),
  useTTSModelsByProvider: () => ({
    models: [],
    isLoading: false,
    error: null,
    refetch: jest.fn()
  })
}));
jest.mock("../../../hooks/useRecommendedModelKeys", () => ({
  __esModule: true,
  useRecommendedModelKeys: () => [],
  recommendedModelKey: (provider: string, id: string) => `${provider}:${id}`
}));
jest.mock("../../../stores/MetadataStore", () => ({
  __esModule: true,
  default: Object.assign(
    (selector: (state: unknown) => unknown) => selector({ metadata: {} }),
    {
      getState: () => ({ metadata: {} }),
      subscribe: jest.fn(() => jest.fn())
    }
  )
}));
jest.mock("../../../hooks/workflow/usePlanWorkflow", () => ({
  usePlanWorkflow: () => ({
    planWorkflow: jest.fn(),
    planning: false,
    error: null
  })
}));
let mockPersistedBuild: Record<string, unknown> | null = null;
const mockBuildResult = {
  status: "completed-with-output" as const,
  nodeCount: 3,
  issues: [],
  validationErrors: [],
  testRun: { started: true, error: null },
  output: { post: "hello" },
  explanation: "The sample run completed and produced output."
};
jest.mock("../../../hooks/workflow/useBuildFromPlan", () => ({
  useBuildFromPlan: () => ({
    buildFromPlan: jest.fn(),
    cancelBuild: jest.fn(),
    building: false,
    result: null
  }),
  isWorkflowBuildLive: () => false,
  readWorkflowBuild: () => mockPersistedBuild,
  workflowBuildResult: () => mockBuildResult
}));
jest.mock("../../../serverState/useEntities", () => ({
  useEntities: () => ({ data: [] })
}));

let settings: Record<string, unknown> = {};
let canvasNodes: Array<{ id: string; type: string; data: object }> = [];
const nodeStore = { getState: () => ({ nodes: canvasNodes, edges: [] }) };
const managerState = {
  getWorkflow: () => ({ id: "w1", name: "W", settings, graph: null }),
  getNodeStore: jest.fn((): typeof nodeStore | undefined => nodeStore),
  fetchWorkflow: jest.fn(async () => ({ id: "w1" })),
  create: jest.fn(async () => ({ id: "copy-1", name: "Summarize a PDF" })),
  delete: jest.fn(async () => {}),
  updateWorkflow: jest.fn(),
  saveWorkflow: jest.fn(async () => {}),
  // Step 1's inline examples browser reads the shipped examples.
  loadTemplates: jest.fn(async () => ({
    workflows: [
      {
        id: "summarize.json",
        name: "Summarize a PDF",
        description: "Read a PDF and write a summary",
        tags: ["example"]
      }
    ],
    next: null
  }))
};
const mockCreateApplication = jest.fn(async () => ({
  id: "app-1",
  name: "W",
  projectId: "project-1"
}));
const mockOpenApplication = jest.fn();
const mockOpenNodeMenu = jest.fn();
jest.mock("../../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: (selector: (state: unknown) => unknown) =>
    selector(managerState),
  useWorkflowManagerStore: () => ({ getState: () => managerState })
}));
const mockTabs = {
  closeTab: jest.fn(),
  openTab: jest.fn(),
  setTitle: jest.fn(),
  tabs: [{ type: "workflow", ref: "w1", projectId: "project-1" }]
};
jest.mock("../../../stores/WorkspaceTabsStore", () => ({
  __esModule: true,
  creationProjectId: () => "default",
  tabId: (kind: string, ref: string) => `${kind}:${ref}`,
  useWorkspaceTabsStore: Object.assign(
    (selector: (state: unknown) => unknown) => selector(mockTabs),
    { getState: () => mockTabs }
  )
}));
jest.mock("../../../hooks/useApplications", () => ({
  useCreateApplication: () => ({
    mutateAsync: mockCreateApplication,
    isPending: false
  })
}));
jest.mock("../../../hooks/useOpenApplication", () => ({
  useOpenApplication: () => mockOpenApplication
}));
jest.mock("../../../stores/NodeMenuStore", () => ({
  __esModule: true,
  default: { getState: () => ({ openNodeMenu: mockOpenNodeMenu }) }
}));
const mockAddNotification = jest.fn();
jest.mock("../../../stores/NotificationStore", () => ({
  useNotificationStore: (selector: (state: unknown) => unknown) =>
    selector({ addNotification: mockAddNotification })
}));

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  writeWorkflowSetup,
  type WorkflowSetupStage
} from "@nodetool-ai/protocol/api-schemas/workflows.js";
import WorkflowEditorSurface from "../WorkflowEditorSurface";
import {
  useSubgraphTabsStore,
  type SubgraphTab
} from "../../../stores/SubgraphTabsStore";

const seed = (stage: WorkflowSetupStage) => {
  settings = writeWorkflowSetup({}, { stage, brief: "summarize the inbox" });
};

const renderSurface = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ThemeProvider theme={mockTheme}>
        <WorkflowEditorSurface workflowId="w1" active />
      </ThemeProvider>
    </QueryClientProvider>
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockPersistedBuild = null;
  canvasNodes = [];
  useSubgraphTabsStore.setState({ tabs: [], activeKey: null });
});

describe("WorkflowEditorSurface subgraphs", () => {
  const subgraphTab = (workflowId: string, nodeId: string): SubgraphTab =>
    // SAFETY: SubgraphTabContent is mocked, so nothing reads the store.
    ({
      key: `${workflowId}:${nodeId}`,
      workflowId,
      nodeId,
      label: nodeId,
      store: {}
    }) as SubgraphTab;

  it("shows the top-level subgraph holding an active nested subgraph", () => {
    settings = {};
    const outer = subgraphTab("w1", "outer");
    const inner = subgraphTab(outer.key, "inner");
    useSubgraphTabsStore.setState({ tabs: [outer, inner], activeKey: inner.key });
    renderSurface();

    const content = screen.getByTestId("subgraph-content");
    expect(content).toHaveAttribute("data-tab", outer.key);
    expect(content).toHaveAttribute("data-active", "true");
  });

  it("leaves node-menu requests to the open subgraph's canvas", () => {
    settings = {};
    renderSurface();
    expect(screen.getByTestId("node-create-bridge")).toBeInTheDocument();

    const outer = subgraphTab("w1", "outer");
    act(() => {
      useSubgraphTabsStore.setState({ tabs: [outer], activeKey: outer.key });
    });
    expect(screen.queryByTestId("node-create-bridge")).not.toBeInTheDocument();
  });

  it("ignores another workflow's open subgraph", () => {
    settings = {};
    const other = subgraphTab("w2", "outer");
    useSubgraphTabsStore.setState({ tabs: [other], activeKey: other.key });
    renderSurface();

    expect(screen.queryByTestId("subgraph-content")).not.toBeInTheDocument();
    expect(screen.getByTestId("node-create-bridge")).toBeInTheDocument();
  });
});

describe("WorkflowEditorSurface workflow setup resume", () => {
  it("renders the flow for a workflow still in setup", () => {
    seed("idea");
    renderSurface();

    expect(
      screen.getByRole("heading", { name: "What should this workflow do?" })
    ).toBeInTheDocument();
    expect(screen.queryByTestId("node-editor")).not.toBeInTheDocument();
  });

  it("renders the canvas once the flow is done", () => {
    seed("done");
    renderSurface();

    expect(screen.getByTestId("node-editor")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "What should this workflow do?" })
    ).not.toBeInTheDocument();
  });

  it("renders the canvas for a workflow saved before the flow existed", () => {
    settings = {};
    renderSurface();

    expect(screen.getByTestId("node-editor")).toBeInTheDocument();
  });

  it("creates and opens an app for a reopened app-mode build", async () => {
    const user = userEvent.setup();
    settings = writeWorkflowSetup(
      {},
      {
        stage: "done",
        brief: "summarize the inbox",
        run_mode: "app"
      }
    );
    mockPersistedBuild = { status: "completed-with-output" };
    renderSurface();

    expect(
      screen.getByRole("button", { name: "Create Mini App" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("Create and open a Mini App backed by this workflow.")
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Create Mini App" }));

    expect(mockCreateApplication).toHaveBeenCalledWith({
      name: "W",
      description: "",
      projectId: "project-1",
      fromWorkflowId: "w1"
    });
    expect(mockOpenApplication).toHaveBeenCalledWith("app-1", "W", "project-1");
  });

  it("opens the trigger-node picker for a reopened trigger-mode build", async () => {
    const user = userEvent.setup();
    settings = writeWorkflowSetup(
      {},
      {
        stage: "done",
        brief: "summarize the inbox",
        run_mode: "trigger"
      }
    );
    mockPersistedBuild = { status: "completed-with-output" };
    renderSurface();

    await user.click(screen.getByRole("button", { name: "Add a trigger" }));

    expect(mockOpenNodeMenu).toHaveBeenCalledWith(
      expect.objectContaining({
        centerOnScreen: true,
        searchTerm: "trigger"
      })
    );
  });
});

// The `+ New` placeholder exists only to host the flow. Picking an example
// replaces it, so it goes rather than staying behind as "Untitled workflow",
// and the copy is filed in the tab's project rather than the default one.
it("files the example copy in the tab's project and deletes the placeholder", async () => {
  seed("idea");
  renderSurface();

  await userEvent.click(
    screen.getByRole("button", { name: /Start from an example/ })
  );
  await userEvent.click(await screen.findByText("Summarize a PDF"));

  await waitFor(() => expect(managerState.delete).toHaveBeenCalledTimes(1));
  expect(managerState.create).toHaveBeenCalledWith(
    expect.objectContaining({ project_id: "project-1" }),
    "nodetool-base",
    "summarize"
  );
  expect(managerState.delete).toHaveBeenCalledWith(
    expect.objectContaining({ id: "w1" })
  );
  expect(mockTabs.openTab).toHaveBeenCalledWith(
    expect.objectContaining({ ref: "copy-1", projectId: "project-1" })
  );
  expect(mockTabs.closeTab).toHaveBeenCalledWith("workflow:w1");
});

// A built workflow can be sent back to step 1, by `ui_workflow_set_setup` for
// one. Its canvas is the creator's work, not an empty placeholder.
it("keeps a workflow whose canvas holds nodes when an example is picked", async () => {
  seed("idea");
  canvasNodes = [
    { id: "step_1", type: "nodetool.text.Template", data: { properties: {} } }
  ];
  renderSurface();

  await userEvent.click(
    screen.getByRole("button", { name: /Start from an example/ })
  );
  await userEvent.click(await screen.findByText("Summarize a PDF"));

  await waitFor(() =>
    expect(mockTabs.openTab).toHaveBeenCalledWith(
      expect.objectContaining({ ref: "copy-1" })
    )
  );
  expect(managerState.delete).not.toHaveBeenCalled();
});

it("keeps a failed workflow load visible and lets the user retry", async () => {
  managerState.getNodeStore.mockReturnValue(undefined);
  managerState.fetchWorkflow.mockRejectedValue(new Error("offline"));
  renderSurface();
  expect(await screen.findByText("Could not load workflow")).toBeVisible();
  expect(screen.getByRole("button", { name: "Report" })).toBeVisible();
  const callsBeforeRetry = managerState.fetchWorkflow.mock.calls.length;
  await userEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(managerState.fetchWorkflow.mock.calls.length).toBeGreaterThan(
    callsBeforeRetry
  );
  managerState.getNodeStore.mockReturnValue(nodeStore);
});
