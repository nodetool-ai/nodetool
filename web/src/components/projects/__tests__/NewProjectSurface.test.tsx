/**
 * Starting a project: what Start creates, what the agent is handed, and that
 * the blank-document strip still opens loose tabs.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

const createProject = jest.fn(async () => ({
  id: "p9",
  name: "A spot for our desk lamp",
  kind: "launch-commercial",
  threadId: null,
  createdAt: "",
  updatedAt: ""
}));
const openProject = jest.fn(async () => true);

jest.mock("../../../hooks/useProjects", () => ({
  useCreateProject: () => ({ mutateAsync: createProject }),
  useOpenProject: () => openProject,
  useProjectSummaries: () => ({ data: [] })
}));

let skills: { id: string; name: string; description: string; updatedAt: string; system: boolean }[] = [
  {
    id: "system:launch-commercial",
    name: "launch-commercial",
    description: "Turn a product page into a finished launch commercial.",
    updatedAt: "",
    system: true
  },
  {
    id: "s1",
    name: "house-style",
    description: "Our house grade and typography.",
    updatedAt: "",
    system: false
  }
];
const useSkillsOptions = jest.fn();
jest.mock("../../../hooks/skills/useSkills", () => ({
  useSkills: (options: unknown) => {
    useSkillsOptions(options);
    return { data: skills };
  }
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

const addNotification = jest.fn();
jest.mock("../../../stores/NotificationStore", () => ({
  useNotificationStore: <T,>(
    selector: (s: { addNotification: jest.Mock }) => T
  ) => selector({ addNotification })
}));

// The surface reads the chat's model selection to decide whether the project
// agent could actually send its opening turn, and writes it back when a model
// is picked from this screen's own menu.
let selectedModel: { provider: string; id: string; name?: string } = {
  provider: "anthropic",
  id: "claude-sonnet-5"
};
const setSelectedModel = jest.fn();
jest.mock("../../../stores/GlobalChatStore", () => ({
  __esModule: true,
  default: <T,>(
    selector: (s: {
      selectedModel: unknown;
      setSelectedModel: jest.Mock;
    }) => T
  ) => selector({ selectedModel, setSelectedModel })
}));

// The real dialog fans out a query per provider; this surface only needs the
// picked model to reach the store.
jest.mock("../../model_menu/LanguageModelMenuDialog", () => ({
  __esModule: true,
  default: ({
    open,
    onModelChange
  }: {
    open: boolean;
    onModelChange?: (model: unknown) => void;
  }) =>
    open ? (
      <button
        type="button"
        onClick={() =>
          onModelChange?.({
            type: "language_model",
            provider: "anthropic",
            id: "claude-sonnet-5",
            name: "Claude Sonnet 5"
          })
        }
      >
        Pick Claude
      </button>
    ) : null
}));

let hasConfiguredProvider = true;
jest.mock("../../../hooks/useHasConfiguredProvider", () => ({
  useHasConfiguredProvider: () => hasConfiguredProvider
}));

const openPageTab = jest.fn();
jest.mock("../../workspace/openPageTab", () => ({
  openPageTab: (key: string) => openPageTab(key)
}));

// The `@` picker's search fans out to the asset store and the entity library;
// this surface only needs the picked row to reach the prompt.
jest.mock(
  "../../node_types/editing/promptComposer/useAssetMentionSearch",
  () => ({
    useAssetMentionSearch: (query: string | null) => ({
      activeTab: "recent",
      setActiveTab: jest.fn(),
      entities:
        query === null
          ? []
          : [
              {
                id: "e1",
                kind: "prop",
                name: "Aurora lamp",
                descriptor: "a warm desk lamp",
                reference_images: []
              }
            ],
      displayedAssets: [],
      hasMoreSaved: false,
      loadMoreSaved: jest.fn(),
      handleRename: jest.fn()
    })
  })
);

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
  openProject.mockResolvedValue(true);
  hasConfiguredProvider = true;
  selectedModel = { provider: "anthropic", id: "claude-sonnet-5" };
  // An earlier test's start may have left a turn staged for this project id.
  takeProjectFirstTurn("p9");
  useOnboardingStore.setState({ completedSteps: [], dismissed: false });
  skills = [
    {
      id: "system:launch-commercial",
      name: "launch-commercial",
      description: "Turn a product page into a finished launch commercial.",
      updatedAt: "",
      system: true
    },
    {
      id: "s1",
      name: "house-style",
      description: "Our house grade and typography.",
      updatedAt: "",
      system: false
    }
  ];
  useProviderOnboardingStore.setState({ open: false });
});

describe("NewProjectSurface", () => {
  it("offers every skill as a starter, the user's own and the shipped ones", () => {
    renderSurface();
    expect(useSkillsOptions).toHaveBeenCalledWith({ includeSystem: true });
    expect(
      screen.getByRole("button", { name: "Launch commercial" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "House style" })
    ).toBeInTheDocument();
  });

  it("names the picked starter's slash command and what it does", async () => {
    renderSurface();
    expect(
      screen.getByText(/Pick a skill to start from/)
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Launch commercial" })
    );
    expect(screen.getByText("/launch-commercial")).toBeInTheDocument();
    expect(
      screen.getByText("Turn a product page into a finished launch commercial.")
    ).toBeInTheDocument();

    // Pressing the picked starter again starts the project from nothing.
    await userEvent.click(
      screen.getByRole("button", { name: "Launch commercial" })
    );
    expect(screen.queryByText("/launch-commercial")).not.toBeInTheDocument();
  });

  it("shows no starter row when there are no skills", () => {
    skills = [];
    renderSurface();
    expect(
      screen.queryByText(/Pick a skill to start from/)
    ).not.toBeInTheDocument();
  });

  it("shows no estimate when no past project of the starter was priced", () => {
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
    await userEvent.click(
      screen.getByRole("button", { name: "Launch commercial" })
    );
    await userEvent.click(screen.getByRole("button", { name: "Entities · none" }));
    await userEvent.click(screen.getByText("Aurora lamp"));
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "Start" }));

    // The starter is the project's kind, which is what its spend history is
    // read back by.
    await waitFor(() =>
      expect(createProject).toHaveBeenCalledWith({
        name: "A spot for our desk lamp",
        kind: "launch-commercial"
      })
    );
    await waitFor(() =>
      expect(openProject).toHaveBeenCalledWith(
        expect.objectContaining({ id: "p9" })
      )
    );
    expect(closeTab).toHaveBeenCalledWith("project-new:new");

    // The staged turn triggers the skill the way a typed `/name` does.
    const staged = takeProjectFirstTurn("p9");
    expect(staged).not.toBeNull();
    const text = staged?.[0].type === "text" ? staged[0].text : "";
    expect(text).toBe(
      "/launch-commercial\n\nA spot for our desk lamp\n\n" +
        "Use these entities: Aurora lamp."
    );
  });

  it("starts with no starter, and then sends the prompt alone", async () => {
    renderSurface();
    await userEvent.type(
      screen.getByPlaceholderText(/30-second launch spot/),
      "A spot for our desk lamp"
    );
    await userEvent.click(screen.getByRole("button", { name: "Start" }));

    await waitFor(() =>
      expect(createProject).toHaveBeenCalledWith({
        name: "A spot for our desk lamp",
        kind: ""
      })
    );
    const staged = takeProjectFirstTurn("p9");
    const text = staged?.[0].type === "text" ? staged[0].text : "";
    expect(text).toBe("A spot for our desk lamp");
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
        kind: ""
      })
    );
  });

  // BUG F2: a configured provider does not mean a model was picked. Starting
  // anyway created the project and staged a prompt no send could deliver.
  it("refuses to start with no model selected, and stages nothing", async () => {
    selectedModel = { provider: "empty", id: "gpt-4o" };
    renderSurface();
    await userEvent.type(
      screen.getByPlaceholderText(/30-second launch spot/),
      "A spot for our desk lamp"
    );
    await userEvent.click(screen.getByRole("button", { name: "Start" }));

    expect(createProject).not.toHaveBeenCalled();
    expect(openProject).not.toHaveBeenCalled();
    expect(takeProjectFirstTurn("p9")).toBeNull();
    expect(addNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "error",
        content: expect.stringContaining("Pick a language model here")
      })
    );
  });

  // BUG F1: the refusal was a dead end — no picker on this screen, and a
  // message pointing at a composer that is not on it.
  it("carries the model picker, and opens it when Start is refused", async () => {
    selectedModel = { provider: "empty", id: "gpt-4o" };
    renderSurface();
    expect(
      screen.getByRole("button", { name: "Select a model" })
    ).toBeInTheDocument();

    await userEvent.type(
      screen.getByPlaceholderText(/30-second launch spot/),
      "A spot for our desk lamp"
    );
    await userEvent.click(screen.getByRole("button", { name: "Start" }));

    await userEvent.click(
      await screen.findByRole("button", { name: "Pick Claude" })
    );
    expect(setSelectedModel).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "anthropic", id: "claude-sonnet-5" })
    );
  });

  it("names the picked model on the chip", () => {
    selectedModel = {
      provider: "anthropic",
      id: "claude-sonnet-5",
      name: "Claude Sonnet 5"
    };
    renderSurface();
    expect(
      screen.getByRole("button", { name: "Model · Claude Sonnet 5" })
    ).toBeInTheDocument();
  });

  // BUG F2 (follow-up): closing the compose tab is what makes the staged turn
  // unreachable, so it must not close when the project group never opened.
  it("keeps the compose tab and drops the stage when the group cannot open", async () => {
    openProject.mockResolvedValue(false);
    renderSurface();
    await userEvent.type(
      screen.getByPlaceholderText(/30-second launch spot/),
      "A spot for our desk lamp"
    );
    await userEvent.click(screen.getByRole("button", { name: "Start" }));

    await waitFor(() => expect(openProject).toHaveBeenCalled());
    expect(closeTab).not.toHaveBeenCalled();
    // No orphan left in the module map for a later project to pick up.
    expect(takeProjectFirstTurn("p9")).toBeNull();
    // The prompt is still on the screen, so Start can be pressed again.
    expect(
      screen.getByPlaceholderText(/30-second launch spot/)
    ).toHaveValue("A spot for our desk lamp");
  });
  // The prompt box is the project's composer, so it carries the composer's own
  // triggers rather than making the user reach for the buttons beside it.
  it("completes a skill from `/` and starts the project on it", async () => {
    renderSurface();
    const prompt = screen.getByPlaceholderText(/30-second launch spot/);
    await userEvent.type(prompt, "/launch");

    await userEvent.click(
      await screen.findByTestId("skill-option-launch-commercial")
    );
    expect(prompt).toHaveValue("/launch-commercial ");

    await userEvent.type(prompt, "A spot for our desk lamp");
    await userEvent.click(screen.getByRole("button", { name: "Start" }));

    await waitFor(() => expect(createProject).toHaveBeenCalled());
    // Picked from the prompt, the skill is still the project's kind.
    expect(createProject).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "launch-commercial" })
    );
    const staged = takeProjectFirstTurn("p9");
    // The `/name` the user typed is the only one — the starter is not written
    // in a second time.
    expect(staged?.[0]).toEqual({
      type: "text",
      text: "/launch-commercial A spot for our desk lamp"
    });
  });

  it("writes an entity picked from `@` into the prompt as its token", async () => {
    renderSurface();
    const prompt = screen.getByPlaceholderText(/30-second launch spot/);
    await userEvent.type(prompt, "A spot lit by @auro");

    const menu = await screen.findByRole("listbox", { name: "Entities" });
    await userEvent.click(within(menu).getByText("Aurora lamp"));

    expect(prompt).toHaveValue("A spot lit by entity://e1 ");
  });
});
