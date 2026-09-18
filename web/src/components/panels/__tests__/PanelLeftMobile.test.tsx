/**
 * PanelLeft — mobile bottom sheet tests
 *
 * The sheet's tab row is the only way to reach a left-panel view on a phone,
 * so it must offer the same top-level views the desktop rail does, minus the
 * ones that only make sense while a workflow is open for editing.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import PanelLeft from "../PanelLeft";
import mockTheme from "../../../__mocks__/themeMock";
import { usePanelStore } from "../../../stores/PanelStore";
import { LEFT_PANEL_TOP_LEVEL } from "../../../config/quickAccessCategories";

jest.mock("@mui/material/useMediaQuery", () => () => true);

jest.mock("react-router-dom", () => ({
  useNavigate: () => jest.fn(),
  useLocation: () => ({ pathname: "/workspace" })
}));

jest.mock("../../../hooks/handlers/useResizePanel", () => ({
  useResizePanel: () => ({
    ref: { current: null },
    size: 300,
    isVisible: true,
    isDragging: false,
    handleMouseDown: jest.fn(),
    handlePanelToggle: (view: string) =>
      usePanelStore.getState().setActiveView(view as never)
  })
}));

jest.mock("../../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: () => null
}));

jest.mock("../../../stores/WorkspaceTabsStore", () => ({
  useWorkspaceTabsStore: <T,>(
    selector: (state: {
      tabs: unknown[];
      activeTabId: string | null;
      activeProjectId: string;
      personalProjectId: string;
      openTab: jest.Mock;
    }) => T
  ) =>
    selector({
      tabs: [],
      activeTabId: null,
      activeProjectId: "project-a",
      personalProjectId: "personal-project",
      openTab: jest.fn()
    }),
  LOOSE_PROJECT_ID: "default"
}));

jest.mock("../../assets/AssetGrid", () => () => (
  <div data-testid="asset-grid" />
));
jest.mock(
  "../../workflows/WorkflowList",
  () => (props: { projectId?: string }) => (
    <div data-testid="workflow-list" data-project-id={props.projectId} />
  )
);
jest.mock("../../workflows/WorkflowForm", () => () => (
  <div data-testid="workflow-form" />
));
jest.mock(
  "../../workflows/CreateWorkflowButton",
  () => (props: { projectId?: string }) => (
    <div data-testid="create-workflow" data-project-id={props.projectId} />
  )
);
jest.mock("../../node_menu/NodeLibrary", () => () => (
  <div data-testid="node-library" />
));
jest.mock("../../node_menu/HistoryTilesPanel", () => () => (
  <div data-testid="history-tiles" />
));
jest.mock("../../node_menu/FavoritesTiles", () => () => (
  <div data-testid="favorites-tiles" />
));
jest.mock("../RailAppMenu", () => () => <div data-testid="rail-app-menu" />);
jest.mock("../../content/Help/Help", () => () => null);
jest.mock("../../ui/ThemeToggle", () => () => (
  <div data-testid="theme-toggle" />
));
jest.mock("../../context_menus/ContextMenus", () => () => (
  <div data-testid="context-menus" />
));

jest.mock("../../timeline/TimelineListPanel", () => ({
  __esModule: true,
  default: (props: { projectId?: string }) => (
    <div data-testid="timeline-list" data-project-id={props.projectId} />
  ),
  CreateTimelineButton: () => <div data-testid="create-timeline" />
}));
jest.mock("../../sketch/SketchListPanel", () => ({
  __esModule: true,
  default: (props: { projectId?: string }) => (
    <div data-testid="sketch-list" data-project-id={props.projectId} />
  ),
  CreateSketchButton: () => <div data-testid="create-sketch" />
}));
jest.mock("../../storyboard/StoryboardListPanel", () => ({
  __esModule: true,
  default: (props: { projectId?: string }) => (
    <div data-testid="storyboard-list" data-project-id={props.projectId} />
  ),
  CreateStoryboardButton: () => <div data-testid="create-storyboard" />
}));
jest.mock("../../script/ScriptListPanel", () => ({
  __esModule: true,
  default: (props: { projectId?: string }) => (
    <div data-testid="script-list" data-project-id={props.projectId} />
  ),
  CreateScriptButton: () => <div data-testid="create-script" />
}));
jest.mock("../../chat/ChatListPanel", () => ({
  __esModule: true,
  default: (props: { projectId?: string }) => (
    <div data-testid="chat-list" data-project-id={props.projectId} />
  ),
  CreateChatButton: (props: { projectId?: string }) => (
    <div data-testid="create-chat" data-project-id={props.projectId} />
  )
}));
jest.mock("../../applications/ApplicationListPanel", () => ({
  __esModule: true,
  default: (props: { projectId?: string }) => (
    <div data-testid="application-list" data-project-id={props.projectId} />
  ),
  CreateApplicationButton: () => <div data-testid="create-application" />,
  CreateApplicationFromWorkflowButton: () => (
    <div data-testid="create-application-from-workflow" />
  )
}));
jest.mock("../../entities/EntityListPanel", () => ({
  __esModule: true,
  default: (props: { projectId?: string }) => (
    <div data-testid="entity-list" data-project-id={props.projectId} />
  ),
  CreateEntityButton: (props: { projectId?: string }) => (
    <div data-testid="create-entity" data-project-id={props.projectId} />
  )
}));
jest.mock("../../jsScript/JsScriptListPanel", () => ({
  __esModule: true,
  default: (props: { projectId?: string }) => (
    <div data-testid="jsscript-list" data-project-id={props.projectId} />
  ),
  CreateJsScriptButton: () => <div data-testid="create-jsscript" />
}));
jest.mock("../../skills/SkillListPanel", () => ({
  __esModule: true,
  default: () => <div data-testid="skill-list" />,
  CreateSkillButton: () => <div data-testid="create-skill" />
}));
jest.mock("../../workspaces/WorkspaceTree", () => ({
  __esModule: true,
  default: (props: { projectId?: string }) => (
    <div data-testid="workspace-tree" data-project-id={props.projectId} />
  )
}));
jest.mock("../DocumentsTree", () => ({
  __esModule: true,
  default: (props: { projectId?: string }) => (
    <div data-testid="documents-tree" data-project-id={props.projectId} />
  )
}));

const WORKFLOW_EDIT_ONLY = ["nodes", "settings", "history", "favorites"];

const renderPanel = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <PanelLeft />
    </ThemeProvider>
  );

beforeEach(() => {
  usePanelStore.getState().setVisibility(true);
  usePanelStore.getState().setActiveView("workflows");
});

it("offers every non-workflow-edit top-level view as a tab", () => {
  renderPanel();

  for (const category of LEFT_PANEL_TOP_LEVEL) {
    const tab = screen.queryByLabelText(category.label);
    if (WORKFLOW_EDIT_ONLY.includes(category.id)) {
      expect(tab).not.toBeInTheDocument();
    } else {
      expect(tab).toBeInTheDocument();
    }
  }
});

it("keeps the consolidated document tree and utility views in the mobile tab row", () => {
  renderPanel();

  const groups = Array.from(document.querySelectorAll(".mobile-tab-group"));
  expect(groups).toHaveLength(1);
  expect(
    groups.map((group) =>
      Array.from(group.querySelectorAll("button")).map((button) =>
        button.getAttribute("aria-label")
      )
    )
  ).toEqual([["Projects", "Documents", "Chats", "Library", "More"]]);
  expect(screen.queryByLabelText("Workflows")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Apps")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Sketches")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Assets")).not.toBeInTheDocument();
});

it("offers Projects in the workspace shell", async () => {
  const user = userEvent.setup();
  renderPanel();

  const projects = screen.getByLabelText("Projects");
  expect(projects).toBeInTheDocument();

  await user.click(projects);
});

it("reaches documents directly and utility pages through More", async () => {
  const user = userEvent.setup();
  renderPanel();

  expect(screen.getByLabelText("Documents")).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await user.click(screen.getByLabelText("More"));

  // The destinations the desktop logo menu carries.
  expect(screen.getByText("Settings")).toBeInTheDocument();
  expect(screen.getByText("Downloads")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: /^Workspace Browse/ })
  ).toBeInTheDocument();
  expect(screen.queryByTestId("workflow-list")).not.toBeInTheDocument();
  expect(screen.queryByTestId("create-workflow")).not.toBeInTheDocument();

  await user.click(screen.getByLabelText("Documents"));
  expect(screen.getByTestId("documents-tree")).toBeInTheDocument();
  expect(screen.queryByText("Downloads")).not.toBeInTheDocument();
});

it("searches nested panels and application destinations together", async () => {
  const user = userEvent.setup();
  renderPanel();

  await user.click(screen.getByLabelText("More"));
  await user.type(
    screen.getByRole("textbox", { name: "Search all panels" }),
    "downloads"
  );

  expect(screen.getByText("Downloads")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Favorite Nodes/ })).toBeNull();
  expect(screen.queryByText("Workflow tools")).toBeNull();
});

it("switches the sheet to the view whose tab was tapped", async () => {
  const user = userEvent.setup();
  renderPanel();

  await user.click(screen.getByLabelText("Documents"));
  expect(usePanelStore.getState().panel.activeView).toBe("documents");
  expect(screen.getByTestId("documents-tree")).toBeInTheDocument();

  await user.click(screen.getByLabelText("Chats"));
  expect(usePanelStore.getState().panel.activeView).toBe("chats");
  expect(screen.getByTestId("chat-list")).toHaveAttribute(
    "data-project-id",
    "project-a"
  );
  expect(screen.queryByTestId("create-chat")).not.toBeInTheDocument();

  await user.click(screen.getByLabelText("More"));
  await user.click(
    screen.getByRole("button", { name: /^Workspace Browse/ })
  );
  expect(usePanelStore.getState().panel.activeView).toBe("workspace-files");
  expect(screen.getByTestId("workspace-tree")).toBeInTheDocument();
});

it("opens global skills from More without a create control", async () => {
  const user = userEvent.setup();
  renderPanel();

  await user.click(screen.getByLabelText("More"));
  await user.click(screen.getByRole("button", { name: /^Skills\b/ }));

  expect(screen.getByTestId("skill-list")).toBeInTheDocument();
  expect(screen.queryByTestId("create-skill")).not.toBeInTheDocument();
});

it("scopes the document tree and workspace tree to the active project", async () => {
  const user = userEvent.setup();
  renderPanel();

  await user.click(screen.getByLabelText("Documents"));
  expect(screen.getByTestId("documents-tree")).toHaveAttribute(
    "data-project-id",
    "project-a"
  );
  await user.click(screen.getByLabelText("More"));
  await user.click(
    screen.getByRole("button", { name: /^Workspace Browse/ })
  );
  expect(screen.getByTestId("workspace-tree")).toHaveAttribute(
    "data-project-id",
    "project-a"
  );
});

it("maps a legacy document view to the document tree", () => {
  usePanelStore.getState().setActiveView("storyboards");
  renderPanel();

  expect(screen.getByTestId("documents-tree")).toBeInTheDocument();
  expect(screen.queryByTestId("storyboard-list")).not.toBeInTheDocument();
});
