import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import type { WorkflowMediaItem } from "../../../hooks/handlers/useGenerationToCanvas";

interface FakeNode {
  id: string;
  position: { x: number; y: number };
  data: { properties: Record<string, unknown>; title?: string };
}

const addedNodes: FakeNode[] = [];
const nodeStore = {
  getState: () => ({
    nodes: [],
    createNode: (_metadata: unknown, position: { x: number; y: number }) => ({
      id: `node-${addedNodes.length + 1}`,
      position,
      data: { properties: {} }
    }),
    addNode: (node: FakeNode) => addedNodes.push(node)
  })
};

const createNew = jest.fn(async (projectId?: string) => ({
  id: "workflow-new",
  name: "New Workflow",
  project_id: projectId
}));
const fetchWorkflow = jest.fn(async (id: string) =>
  id === "workflow-missing" ? undefined : { id, name: "Upscale pass" }
);
const getNodeStore = jest.fn(() => nodeStore);
const getMetadata = jest.fn(
  (nodeType: string): { node_type: string } | undefined => ({ node_type: nodeType })
);
const addNotification = jest.fn();
const openTab = jest.fn();
const navigate = jest.fn();
let pathname = "/workspace";

const tabs = [
  { id: "workflow:wf-a", type: "workflow", ref: "wf-a", title: "Upscale pass", mode: "edit" },
  { id: "storyboard:sb-1", type: "storyboard", ref: "sb-1", title: "Board", mode: "edit" },
  {
    id: "workflow:wf-other",
    type: "workflow",
    ref: "wf-other",
    title: "Other project",
    mode: "edit",
    projectId: "project-b"
  }
];

jest.mock("react-router-dom", () => ({
  useNavigate: () => navigate,
  useLocation: () => ({ pathname })
}));

jest.mock("../../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: <T,>(selector: (state: unknown) => T) =>
    selector({ createNew, fetchWorkflow, getNodeStore })
}));

jest.mock("../../../stores/MetadataStore", () => ({
  __esModule: true,
  default: <T,>(selector: (state: unknown) => T) => selector({ getMetadata })
}));

jest.mock("../../../stores/NotificationStore", () => ({
  useNotificationStore: <T,>(selector: (state: unknown) => T) =>
    selector({ addNotification })
}));

jest.mock("../../../stores/WorkspaceTabsStore", () => ({
  creationProjectId: () => "project-a",
  isTabInScope: jest.requireActual("../../../stores/WorkspaceTabsStore")
    .isTabInScope,
  useWorkspaceTabsStore: <T,>(selector: (state: unknown) => T) =>
    selector({ tabs, activeProjectId: null, openTab })
}));

import { SendToWorkflowButton } from "../SendToWorkflowMenu";
import StudioProvider from "../../../studio/StudioContext";

const still: WorkflowMediaItem = {
  type: "image",
  uri: "asset://still-1",
  asset_id: "still-1",
  title: "Shot 01 still"
};
const take: WorkflowMediaItem = { type: "audio", asset_id: "take-1" };

const renderButton = (items: WorkflowMediaItem[]) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <SendToWorkflowButton items={items} />
    </ThemeProvider>
  );

const openMenu = async (): Promise<void> => {
  await userEvent.click(screen.getByRole("button", { name: "Send to workflow" }));
};

beforeEach(() => {
  addedNodes.length = 0;
  jest.clearAllMocks();
  getMetadata.mockImplementation((nodeType: string) => ({ node_type: nodeType }));
  pathname = "/workspace";
});

describe("SendToWorkflowButton", () => {
  it("lists a new workflow and the workflow tabs open in this project", async () => {
    renderButton([still, take]);
    await openMenu();

    expect(screen.getByText("Send 2 items to")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "New workflow" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Upscale pass" })).toBeInTheDocument();
    expect(screen.queryByText("Board")).toBeNull();
    expect(screen.queryByText("Other project")).toBeNull();
  });

  it("adds constant nodes to a new workflow and opens its tab", async () => {
    renderButton([still, take]);
    await openMenu();
    await userEvent.click(screen.getByRole("menuitem", { name: "New workflow" }));

    await waitFor(() => expect(addedNodes).toHaveLength(2));
    expect(createNew).toHaveBeenCalledWith("project-a");
    expect(getMetadata).toHaveBeenCalledWith("nodetool.constant.Image");
    expect(getMetadata).toHaveBeenCalledWith("nodetool.constant.Audio");
    expect(addedNodes[0].data).toEqual({
      properties: {
        value: { type: "image", asset_id: "still-1", uri: "asset://still-1" }
      },
      title: "Shot 01 still"
    });
    // An asset-only ref gets its `asset://` locator.
    expect(addedNodes[1].data.properties.value).toEqual({
      type: "audio",
      asset_id: "take-1",
      uri: "asset://take-1"
    });
    expect(openTab).toHaveBeenCalledWith({
      type: "workflow",
      ref: "workflow-new",
      mode: "edit",
      title: "New Workflow",
      projectId: "project-a"
    });
    expect(navigate).not.toHaveBeenCalled();
    expect(addNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: "success", content: "Added 2 items to New Workflow" })
    );
  });

  it("adds to an open workflow and leaves its project alone", async () => {
    pathname = "/timeline/seq-1";
    renderButton([still]);
    await openMenu();
    await userEvent.click(screen.getByRole("menuitem", { name: "Upscale pass" }));

    await waitFor(() => expect(addedNodes).toHaveLength(1));
    expect(fetchWorkflow).toHaveBeenCalledWith("wf-a");
    expect(createNew).not.toHaveBeenCalled();
    expect(openTab).toHaveBeenCalledWith(
      expect.objectContaining({ ref: "wf-a", projectId: undefined })
    );
    expect(navigate).toHaveBeenCalledWith("/workspace");
  });

  it("warns when node definitions are missing for part of the batch", async () => {
    getMetadata.mockImplementation((nodeType: string) =>
      nodeType === "nodetool.constant.Audio" ? undefined : { node_type: nodeType }
    );
    renderButton([still, take]);
    await openMenu();
    await userEvent.click(screen.getByRole("menuitem", { name: "New workflow" }));

    await waitFor(() =>
      expect(addNotification).toHaveBeenCalledWith(
        expect.objectContaining({ type: "warning" })
      )
    );
    expect(addedNodes).toHaveLength(1);
  });

  it("reports a workflow that cannot be loaded", async () => {
    tabs.push({
      id: "workflow:workflow-missing",
      type: "workflow",
      ref: "workflow-missing",
      title: "Gone",
      mode: "edit"
    });
    renderButton([still]);
    await openMenu();
    await userEvent.click(screen.getByRole("menuitem", { name: "Gone" }));

    await waitFor(() =>
      expect(addNotification).toHaveBeenCalledWith(
        expect.objectContaining({ type: "error" })
      )
    );
    expect(openTab).not.toHaveBeenCalled();
    tabs.pop();
  });

  it("is disabled with nothing to send", () => {
    renderButton([]);
    expect(screen.getByRole("button", { name: "Send to workflow" })).toBeDisabled();
  });

  it("renders nothing in the Studio shell", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <StudioProvider>
          <SendToWorkflowButton items={[still]} />
        </StudioProvider>
      </ThemeProvider>
    );
    expect(screen.queryByRole("button", { name: "Send to workflow" })).toBeNull();
  });
});
