import { render, screen } from "@testing-library/react";

const workspaceTabsState = {
  tabs: [],
  activeTabId: null,
  setTitle: jest.fn()
};
jest.mock("../../../stores/WorkspaceTabsStore", () => ({
  useWorkspaceTabsStore: (
    selector: (state: typeof workspaceTabsState) => unknown
  ) =>
    selector(workspaceTabsState)
}));

const workflowManagerState = {
  setCurrentWorkflowId: jest.fn(),
  openWorkflows: []
};
jest.mock("../../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: (
    selector: (state: typeof workflowManagerState) => unknown
  ) => selector(workflowManagerState)
}));

const panelState = {
  panel: { isVisible: false, isDragging: false, panelSize: 0 }
};
jest.mock("../../../stores/PanelStore", () => ({
  usePanelStore: (selector: (state: typeof panelState) => unknown) =>
    selector(panelState)
}));

jest.mock("../../../hooks/useWorkspaceMenuShortcuts", () => ({
  useWorkspaceMenuShortcuts: jest.fn()
}));
jest.mock("../../../hooks/useProjects", () => ({
  useProjects: () => ({ data: [], isPending: false, error: null }),
  useOpenProject: () => jest.fn(),
  useOpenNewProjectTab: () => jest.fn()
}));
jest.mock("@mui/material", () => ({
  ...jest.requireActual("@mui/material"),
  useMediaQuery: () => false
}));
jest.mock("@mui/material/styles", () => ({
  ...jest.requireActual("@mui/material/styles"),
  useTheme: () => ({
    breakpoints: { down: () => "@media(max-width: 600px)" }
  })
}));

jest.mock("../../panels/FrontendToolRuntimeSync", () => ({
  __esModule: true,
  default: () => <div data-testid="frontend-tool-runtime-sync" />
}));
jest.mock("../WorkspaceTabBar", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../WorkspaceTabLayer", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => children
}));
jest.mock("../TabContent", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../../projects/NewProjectSurface", () => ({
  __esModule: true,
  default: () => <div>New project</div>
}));
jest.mock("../../panels/PanelLeft", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../../panels/PanelRight", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../../panels/PanelBottom", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../../node_editor/Alert", () => ({
  __esModule: true,
  default: () => null
}));

import WorkspaceShell from "../WorkspaceShell";

describe("WorkspaceShell frontend tool runtime", () => {
  it("initializes the runtime while the New Project surface is active", async () => {
    render(<WorkspaceShell />);

    expect(await screen.findByText("New project")).toBeInTheDocument();
    expect(screen.getByTestId("frontend-tool-runtime-sync")).toBeInTheDocument();
  });
});
