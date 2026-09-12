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

it("keeps the visible desktop groups in the mobile tab row", () => {
  renderPanel();

  const groups = Array.from(document.querySelectorAll(".mobile-tab-group"));
  expect(groups).toHaveLength(5);
  expect(
    groups.map((group) =>
      Array.from(group.querySelectorAll("button")).map((button) =>
        button.getAttribute("aria-label")
      )
    )
  ).toEqual([
    ["Workflows", "Apps", "Chats"],
    ["Sketches", "Scripts", "Storyboards", "Entities", "Timelines"],
    ["JS Scripts", "Skills"],
    ["Workspace", "Assets", "Library"],
    ["Projects", "More"]
  ]);
});

it("offers Projects in the workspace shell", async () => {
  const user = userEvent.setup();
  renderPanel();

  const projects = screen.getByLabelText("Projects");
  expect(projects).toBeInTheDocument();

  await user.click(projects);
});

it("reaches the app pages through More, not a second menu button", async () => {
  const user = userEvent.setup();
  renderPanel();

  await user.click(screen.getByLabelText("More"));

  // The destinations the desktop logo menu carries.
  expect(screen.getByText("Settings")).toBeInTheDocument();
  expect(screen.getByText("Downloads")).toBeInTheDocument();
  expect(screen.queryByTestId("workflow-list")).not.toBeInTheDocument();
  expect(screen.queryByTestId("create-workflow")).not.toBeInTheDocument();

  // A category tab takes the sheet back to browsing documents.
  await user.click(screen.getByLabelText("Chats"));
  expect(screen.getByTestId("chat-list")).toBeInTheDocument();
  expect(screen.queryByText("Downloads")).not.toBeInTheDocument();
});

it("switches the sheet to the view whose tab was tapped", async () => {
  const user = userEvent.setup();
  renderPanel();

  await user.click(screen.getByLabelText("Chats"));
  expect(usePanelStore.getState().panel.activeView).toBe("chats");
  expect(screen.getByTestId("chat-list")).toBeInTheDocument();

  await user.click(screen.getByLabelText("Apps"));
  expect(usePanelStore.getState().panel.activeView).toBe("apps");
  expect(screen.getByTestId("application-list")).toBeInTheDocument();
});

it("scopes every project-owned list to the active project", async () => {
  const user = userEvent.setup();
  renderPanel();

  const projectViews = [
    ["Workflows", "workflow-list"],
    ["Apps", "application-list"],
    ["Chats", "chat-list"],
    ["Sketches", "sketch-list"],
    ["Scripts", "script-list"],
    ["Storyboards", "storyboard-list"],
    ["Entities", "entity-list"],
    ["Timelines", "timeline-list"],
    ["JS Scripts", "jsscript-list"],
    ["Workspace", "workspace-tree"]
  ] as const;

  for (const [label, testId] of projectViews) {
    await user.click(screen.getByLabelText(label));
    expect(screen.getByTestId(testId)).toHaveAttribute(
      "data-project-id",
      "project-a"
    );
  }

  await user.click(screen.getByLabelText("Workflows"));
  expect(screen.getByTestId("create-workflow")).toHaveAttribute(
    "data-project-id",
    "project-a"
  );
  await user.click(screen.getByLabelText("Chats"));
  expect(screen.getByTestId("create-chat")).toHaveAttribute(
    "data-project-id",
    "project-a"
  );
  await user.click(screen.getByLabelText("Entities"));
  expect(screen.getByTestId("create-entity")).toHaveAttribute(
    "data-project-id",
    "project-a"
  );
});

it("shows the create action for the active list view", async () => {
  const user = userEvent.setup();
  renderPanel();

  expect(screen.getByTestId("create-workflow")).toBeInTheDocument();

  await user.click(screen.getByLabelText("Storyboards"));
  expect(screen.getByTestId("create-storyboard")).toBeInTheDocument();

  await user.click(screen.getByLabelText("Assets"));
  expect(screen.queryByTestId("create-storyboard")).not.toBeInTheDocument();
});
