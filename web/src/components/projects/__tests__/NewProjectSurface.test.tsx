/**
 * Starting a project: what Start creates, what the agent is handed, and that
 * the blank-document strip still opens loose tabs.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

const createProject = jest.fn(async () => ({
  id: "p9",
  name: "A spot for our desk lamp",
  kind: "spot",
  threadId: null,
  createdAt: "",
  updatedAt: ""
}));
const openProject = jest.fn(async () => undefined);

jest.mock("../../../hooks/useProjects", () => ({
  useCreateProject: () => ({ mutateAsync: createProject }),
  useOpenProject: () => openProject,
  useProjectSummaries: () => ({ data: [] })
}));

jest.mock("../../../serverState/useEntities", () => ({
  useEntities: () => ({
    data: [
      {
        id: "e1",
        kind: "prop",
        name: "Aurora lamp",
        descriptor: "a warm desk lamp",
        reference_images: []
      }
    ]
  })
}));

const createWorkflow = jest.fn(async () => undefined);
const catalogOptions = jest.fn();
jest.mock("../../workspace/newDocumentCatalog", () => ({
  TEXT_FILE_TEMPLATES: [
    { label: "Markdown (.md)", filename: "Untitled.md", mimeType: "text/markdown", content: "" }
  ],
  useNewDocumentCatalog: (options: unknown) => {
    catalogOptions(options);
    return {
      entries: [
        {
          key: "workflow",
          label: "Workflow",
          menuLabel: "New workflow",
          type: "workflow",
          icon: null,
          create: createWorkflow
        },
        {
          key: "text",
          label: "Text",
          menuLabel: "New text file…",
          type: "text",
          icon: null,
          submenu: "texts"
        }
      ],
      createTextFile: jest.fn(),
      createBlankStoryboard: jest.fn(),
      installStoryboardExample: jest.fn(),
      creating: null
    };
  }
}));

jest.mock("../../../hooks/storyboard/useStoryboards", () => ({
  useExampleStoryboards: () => ({ data: [], isLoading: false })
}));

const closeTab = jest.fn();
jest.mock("../../../stores/WorkspaceTabsStore", () => ({
  ...jest.requireActual("../../../stores/WorkspaceTabsStore"),
  useWorkspaceTabsStore: <T,>(selector: (s: { closeTab: jest.Mock }) => T) =>
    selector({ closeTab })
}));

jest.mock("../../../stores/NotificationStore", () => ({
  useNotificationStore: <T,>(
    selector: (s: { addNotification: jest.Mock }) => T
  ) => selector({ addNotification: jest.fn() })
}));

let hasConfiguredProvider = true;
jest.mock("../../../hooks/useHasConfiguredProvider", () => ({
  useHasConfiguredProvider: () => hasConfiguredProvider
}));

const openPageTab = jest.fn();
jest.mock("../../workspace/openPageTab", () => ({
  openPageTab: (key: string) => openPageTab(key)
}));

const handleCreateNewWorkflow = jest.fn(async () => undefined);
jest.mock("../../../hooks/useWorkflowActions", () => ({
  useWorkflowActions: () => ({ handleCreateNewWorkflow })
}));

import NewProjectSurface from "../NewProjectSurface";
import { takeProjectFirstTurn } from "../projectAgent";
import useOnboardingStore from "../../../stores/OnboardingStore";
import { useProviderOnboardingStore } from "../../../stores/ProviderOnboardingStore";

const renderSurface = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <NewProjectSurface />
    </ThemeProvider>
  );

beforeEach(() => {
  jest.clearAllMocks();
  hasConfiguredProvider = true;
  useOnboardingStore.setState({ completedSteps: [], dismissed: false });
  useProviderOnboardingStore.setState({ open: false });
});

describe("NewProjectSurface", () => {
  it("shows the selected shape's document chain", async () => {
    renderSurface();
    expect(screen.getByText("30s spot sets up")).toBeInTheDocument();
    expect(screen.getByText("Board")).toBeInTheDocument();
    expect(screen.getByText("Cut")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Music video" }));
    expect(screen.getByText("Music video sets up")).toBeInTheDocument();
    expect(screen.queryByText("Script")).not.toBeInTheDocument();
  });

  it("shows no estimate when no past project of the shape was priced", () => {
    renderSurface();
    expect(screen.queryByText(/est\. \$/)).not.toBeInTheDocument();
  });

  it("cannot start until something is asked for", async () => {
    renderSurface();
    expect(screen.getByRole("button", { name: "Start" })).toBeDisabled();
    await userEvent.type(
      screen.getByPlaceholderText(/30-second launch spot/),
      "A spot for our desk lamp"
    );
    expect(screen.getByRole("button", { name: "Start" })).toBeEnabled();
  });

  it("creates the project, stages its first turn, and opens its group", async () => {
    renderSurface();
    await userEvent.type(
      screen.getByPlaceholderText(/30-second launch spot/),
      "A spot for our desk lamp"
    );
    await userEvent.click(screen.getByRole("button", { name: "Entities · none" }));
    await userEvent.click(screen.getByText("Aurora lamp"));
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "Start" }));

    await waitFor(() =>
      expect(createProject).toHaveBeenCalledWith({
        name: "A spot for our desk lamp",
        kind: "spot"
      })
    );
    await waitFor(() =>
      expect(openProject).toHaveBeenCalledWith(
        expect.objectContaining({ id: "p9" })
      )
    );
    expect(closeTab).toHaveBeenCalledWith("project-new:new");

    const staged = takeProjectFirstTurn("p9");
    expect(staged).not.toBeNull();
    const text = staged?.[0].type === "text" ? staged[0].text : "";
    expect(text).toContain("A spot for our desk lamp");
    expect(text).toContain("30-second spot");
    expect(text).toContain("Use these entities: Aurora lamp.");
  });

  it("opens blank documents outside any project", async () => {
    renderSurface();
    expect(catalogOptions).toHaveBeenCalledWith({ projectId: "default" });
    await userEvent.click(screen.getByRole("button", { name: "Workflow" }));
    expect(createWorkflow).toHaveBeenCalled();
  });

  it("shows the checklist until onboarding is done", () => {
    renderSurface();
    expect(
      screen.getByRole("region", { name: "Getting started checklist" })
    ).toBeInTheDocument();
  });

  it("hides the checklist once dismissed", () => {
    useOnboardingStore.setState({ dismissed: true });
    renderSurface();
    expect(
      screen.queryByRole("region", { name: "Getting started checklist" })
    ).not.toBeInTheDocument();
  });

  it("opens examples and tutorials as page tabs, onboarding done or not", async () => {
    useOnboardingStore.setState({ dismissed: true });
    renderSurface();
    await userEvent.click(
      screen.getByRole("button", { name: "Browse examples" })
    );
    expect(openPageTab).toHaveBeenCalledWith("examples");
    await userEvent.click(screen.getByRole("button", { name: "Tutorials" }));
    expect(openPageTab).toHaveBeenCalledWith("tutorials");
  });

  it("parks a start on provider onboarding and resumes once connected", async () => {
    hasConfiguredProvider = false;
    const { rerender } = renderSurface();
    await userEvent.type(
      screen.getByPlaceholderText(/30-second launch spot/),
      "A spot for our desk lamp"
    );
    await userEvent.click(screen.getByRole("button", { name: "Start" }));

    expect(createProject).not.toHaveBeenCalled();
    expect(useProviderOnboardingStore.getState().open).toBe(true);

    hasConfiguredProvider = true;
    rerender(
      <ThemeProvider theme={mockTheme}>
        <NewProjectSurface />
      </ThemeProvider>
    );
    await waitFor(() =>
      expect(createProject).toHaveBeenCalledWith({
        name: "A spot for our desk lamp",
        kind: "spot"
      })
    );
  });

});
