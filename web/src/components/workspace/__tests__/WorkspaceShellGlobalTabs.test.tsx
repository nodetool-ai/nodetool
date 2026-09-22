import { render, screen } from "@testing-library/react";

const globalTab = (type: string, ref: string, title: string) => ({
  id: `${type}:${ref}`,
  type,
  ref,
  mode: "view",
  title
});

const workspaceTabsState = {
  tabs: [] as ReturnType<typeof globalTab>[],
  activeTabId: null as string | null,
  activeProjectId: null as string | null,
  setTitle: jest.fn()
};
jest.mock("../../../stores/WorkspaceTabsStore", () => ({
  ...jest.requireActual("../../../stores/WorkspaceTabsStore"),
  useWorkspaceTabsStore: (
    selector: (state: typeof workspaceTabsState) => unknown
  ) => selector(workspaceTabsState)
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
jest.mock("@mui/material", () => ({
  ...jest.requireActual("@mui/material"),
  useMediaQuery: () => false
}));
jest.mock("@mui/material/styles", () => ({
  ...jest.requireActual("@mui/material/styles"),
  useTheme: () => ({
    breakpoints: { down: () => "@media(max-width: 600px)" },
    shape: { borderRadius: 8 },
    spacing: (factor: number) => `${factor * 8}px`,
    vars: {
      palette: {
        action: { hover: "#f5f5f5" },
        c_app_header: "#ffffff",
        divider: "#dddddd",
        text: { primary: "#111111" }
      }
    }
  })
}));

jest.mock("../../panels/FrontendToolRuntimeSync", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../WorkspaceTabBar", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../TabContent", () => ({
  __esModule: true,
  default: () => <div>Tab surface</div>
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

describe("WorkspaceShell global tabs", () => {
  // A global tab carries no project, so a project-scoped visible set dropped
  // it and the empty state rendered its New Project surface underneath the
  // active tab's layer — both are `position: absolute; inset: 0`.
  it.each([
    ["project-list", "projects", "Projects"],
    ["project-new", "new", "New project"]
  ])(
    "renders no empty state behind an active %s tab inside a project",
    async (type, ref, title) => {
      const tab = globalTab(type, ref, title);
      workspaceTabsState.tabs = [tab];
      workspaceTabsState.activeTabId = tab.id;
      workspaceTabsState.activeProjectId = "project-1";

      const { container } = render(<WorkspaceShell />);

      expect(await screen.findByText("Tab surface")).toBeInTheDocument();
      expect(container.querySelector(".workspace-empty")).toBeNull();
    }
  );

  it("still shows the empty state when the active project has no tabs", async () => {
    workspaceTabsState.tabs = [];
    workspaceTabsState.activeTabId = null;
    workspaceTabsState.activeProjectId = "project-1";

    render(<WorkspaceShell />);

    expect(await screen.findByText("New project")).toBeInTheDocument();
  });
});
