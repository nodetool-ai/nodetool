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

const createStoryboard = jest.fn(async () => ({
  id: "b7",
  projectId: "p9",
  name: "A spot for our desk lamp"
}));
jest.mock("../../../hooks/storyboard/useStoryboards", () => ({
  useExampleStoryboards: () => ({ data: [], isLoading: false }),
  useCreateStoryboard: () => ({ mutateAsync: createStoryboard })
}));

// The flow's real host runs the board's server sync and agent bridge; this
// suite only asks whether the surface swapped itself for it.
jest.mock("../../setup/storyboard/StoryboardSetupHost", () => ({
  __esModule: true,
  default: ({ boardId }: { boardId: string }) => (
    <div data-testid="setup-flow">{boardId}</div>
  )
}));

const closeTab = jest.fn();
const openTab = jest.fn();
jest.mock("../../../stores/WorkspaceTabsStore", () => ({
  ...jest.requireActual("../../../stores/WorkspaceTabsStore"),
  useWorkspaceTabsStore: <T,>(
    selector: (s: { closeTab: jest.Mock; openTab: jest.Mock }) => T
  ) => selector({ closeTab, openTab })
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

  // A pill is a shortcut for typing the command: the prompt stays the one
  // record of what the agent is handed.
  it("writes the picked starter into the prompt, and says what it does", async () => {
    renderSurface();
    const prompt = screen.getByPlaceholderText(/30-second launch spot/);
    expect(
      screen.getByText(/Pick a skill to start from/)
    ).toBeInTheDocument();

    await userEvent.type(prompt, "A spot for our desk lamp");
    const pill = screen.getByRole("button", { name: "Launch commercial" });
    await userEvent.click(pill);
    expect(prompt).toHaveValue("/launch-commercial A spot for our desk lamp");
    expect(pill).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByText("Turn a product page into a finished launch commercial.")
    ).toBeInTheDocument();
    // The caret is back in the box, so the user keeps typing.
    expect(prompt).toHaveFocus();

    // Pressing the picked starter again takes the command out.
    await userEvent.click(pill);
    expect(prompt).toHaveValue("A spot for our desk lamp");
    expect(pill).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.getByText(/Pick a skill to start from/)
    ).toBeInTheDocument();
  });

  it("swaps one starter for another in place", async () => {
    renderSurface();
    const prompt = screen.getByPlaceholderText(/30-second launch spot/);
    await userEvent.click(
      screen.getByRole("button", { name: "Launch commercial" })
    );
    await userEvent.click(screen.getByRole("button", { name: "House style" }));
    expect(prompt).toHaveValue("/house-style ");
    expect(
      screen.getByRole("button", { name: "Launch commercial" })
    ).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.getByRole("button", { name: "House style" })
    ).toHaveAttribute("aria-pressed", "true");
  });

  // BUG: a starter picked from `/` stayed the project's kind after its command
  // was deleted from the prompt, and a hand-typed one never counted at all.
  it("lights the pill for a hand-typed command and clears it when deleted", async () => {
    renderSurface();
    const prompt = screen.getByPlaceholderText(/30-second launch spot/);
    await userEvent.type(prompt, "/house-style{Escape} our lamp");
    expect(
      screen.getByRole("button", { name: "House style" })
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByText("Our house grade and typography.")
    ).toBeInTheDocument();

    await userEvent.clear(prompt);
    await userEvent.type(prompt, "our lamp");
    expect(
      screen.getByRole("button", { name: "House style" })
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("folds the row past eight starters, keeping the picked one in view", async () => {
    skills = Array.from({ length: 12 }, (_, index) => ({
      id: `s${index}`,
      name: `skill-${String.fromCharCode(97 + index)}`,
      description: `Skill ${index}.`,
      updatedAt: "",
      system: true
    }));
    renderSurface();
    const row = screen.getByRole("group", { name: "Start from a skill" });
    expect(within(row).getAllByRole("button")).toHaveLength(9);
    expect(
      within(row).queryByRole("button", { name: "Skill l" })
    ).not.toBeInTheDocument();

    // Typed from `/`, a hidden starter is shown lit rather than left folded.
    await userEvent.type(
      screen.getByPlaceholderText(/30-second launch spot/),
      "/skill-l{Escape} our lamp"
    );
    expect(
      within(row).getByRole("button", { name: "Skill l" })
    ).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(within(row).getByRole("button", { name: "3 more" }));
    expect(within(row).getAllByRole("button")).toHaveLength(13);
    await userEvent.click(
      within(row).getByRole("button", { name: "Show fewer" })
    );
    expect(within(row).getAllByRole("button")).toHaveLength(10);
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
    await userEvent.click(
      screen.getByRole("button", { name: "Launch commercial" })
    );
    await userEvent.type(
      screen.getByPlaceholderText(/30-second launch spot/),
      "A spot for our desk lamp"
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

    // The staged turn is the prompt as written, command and all, plus the
    // entities picked from the button.
    const staged = takeProjectFirstTurn("p9");
    expect(staged).not.toBeNull();
    const text = staged?.[0].type === "text" ? staged[0].text : "";
    expect(text).toBe(
      "/launch-commercial A spot for our desk lamp\n\n" +
        "Use these entities: Aurora lamp."
    );
  });

  it("starts on Ctrl+Enter, and keeps Enter for a new line", async () => {
    renderSurface();
    const prompt = screen.getByPlaceholderText(/30-second launch spot/);
    await userEvent.type(prompt, "A spot for our desk lamp{Enter}warm");
    expect(createProject).not.toHaveBeenCalled();
    expect(prompt).toHaveValue("A spot for our desk lamp\nwarm");

    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    await waitFor(() =>
      expect(createProject).toHaveBeenCalledWith({
        name: "A spot for our desk lamp",
        kind: ""
      })
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

  // D2 — explicit entry only. Whatever is in the prompt box, `Start` is the
  // project agent's door and the flow's is the card.
  it.each([
    ["a plain prompt", "A spot for our desk lamp"],
    ["a `/skill` prompt", "/launch-commercial A spot for our desk lamp"]
  ])("starts the project agent for %s and never mounts the flow", async (
    _name,
    typed
  ) => {
    renderSurface();
    await userEvent.type(
      screen.getByPlaceholderText(/30-second launch spot/),
      typed
    );
    await userEvent.click(screen.getByRole("button", { name: "Start" }));

    await waitFor(() => expect(createProject).toHaveBeenCalled());
    expect(openProject).toHaveBeenCalled();
    expect(createStoryboard).not.toHaveBeenCalled();
    expect(screen.queryByTestId("setup-flow")).not.toBeInTheDocument();
  });

  it("opens the storyboard flow on the card, carrying the typed prompt", async () => {
    renderSurface();
    await userEvent.type(
      screen.getByPlaceholderText(/30-second launch spot/),
      "A spot for our desk lamp"
    );
    await userEvent.click(
      screen.getByRole("button", {
        name: /^Storyboard From a sentence to a rendered board/
      })
    );

    await waitFor(() =>
      expect(createProject).toHaveBeenCalledWith({
        name: "A spot for our desk lamp",
        kind: "storyboard"
      })
    );
    expect(createStoryboard).toHaveBeenCalledWith({
      name: "A spot for our desk lamp",
      projectId: "p9",
      document: expect.objectContaining({
        brief: "A spot for our desk lamp",
        setupStage: "idea"
      })
    });
    // The tab is the flow now, and the project agent was never started.
    expect(await screen.findByTestId("setup-flow")).toHaveTextContent("b7");
    expect(openProject).not.toHaveBeenCalled();
  });

  it("names the phase that turns each unbuilt flow on", () => {
    renderSurface();
    const cards = screen.getByRole("group", {
      name: "Guided creation flows"
    });
    const off = [
      ["Video", "Video ships in phase P6."],
      ["Script", "Script ships in phase P7."],
      ["Image", "Image ships in phase P8."],
      ["Workflow", "Workflow ships in phase P9."]
    ] as const;
    for (const [title, reason] of off) {
      const card = within(cards).getByRole("button", {
        name: new RegExp(`^${title} `)
      });
      expect(card).toHaveAttribute("aria-disabled", "true");
      expect(card).toHaveAttribute("title", reason);
    }
    expect(
      within(cards).getByRole("button", { name: /^Storyboard / })
    ).not.toHaveAttribute("aria-disabled");
  });
});
