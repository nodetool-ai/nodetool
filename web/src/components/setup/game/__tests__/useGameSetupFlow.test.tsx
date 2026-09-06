/**
 * The Game flow config: three stepper entries for four stages, resume by
 * stage, and the two gates this phase turns on (game-prd § 8, criteria 2, 3
 * and 4).
 *
 * What is asserted: a workflow at each stage renders that step, `Write the
 * design` runs the designer and places nothing, `Continue to look` names the
 * first missing cast entry or slot prompt, and `Build your game` is the only
 * action that reaches the build.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@mui/material/styles";
import type { GameDesign } from "@nodetool-ai/protocol/api-schemas/workflows.js";

import mockTheme from "../../../../__mocks__/themeMock";

jest.mock("../../../../hooks/useResolvedMediaUri");
jest.mock("../../../model_menu/LanguageModelMenuDialog", () => ({
  __esModule: true,
  default: ({ open }: { open: boolean }) =>
    open ? <div>model dialog</div> : null
}));
jest.mock("../../../../hooks/useModelsByProvider", () => ({
  __esModule: true,
  useLanguageModelsByProvider: () => ({ models: [], isLoading: false })
}));
jest.mock("../useGameCustomStyle", () => ({
  __esModule: true,
  useGameCustomStyle: () => ({
    saving: false,
    error: null,
    clearError: jest.fn(),
    addStyle: jest.fn()
  })
}));

// The designer and the build are the flow's two calls out. What each writes is
// pinned by its own suite; here only what the flow asks for matters.
const designGame = jest.fn(
  async (_input: { brief: string; manifest: { template: string } }): Promise<
    string | null
  > => null
);
jest.mock("../../../../hooks/game/useDesignGame", () => {
  const actual = jest.requireActual("../../../../hooks/game/useDesignGame");
  return {
    ...actual,
    useDesignGame: () => ({
      designGame,
      designing: false,
      error: null,
      filled: []
    })
  };
});

const buildGame = jest.fn(async (_input: unknown) => ({
  nodeCount: 6,
  issues: [] as string[],
  validationErrors: [] as string[],
  run: { started: true, error: null as string | null }
}));
jest.mock("../../../../hooks/game/useBuildGame", () => ({
  useBuildGame: () => ({ buildGame, building: false, result: null })
}));

const PLATFORMER = {
  id: "platformer",
  godot: "4.3",
  slots: [
    {
      id: "player",
      kind: "spritesheet" as const,
      cell: [32, 32] as [number, number],
      animations: { idle: 2 },
      fps: 8
    },
    { id: "sfx.jump", kind: "sfx" as const, seconds: 0.4 }
  ],
  hooks: ["scripts/player.gd"]
};
jest.mock("../../../../hooks/game/useGameTemplates", () => {
  const actual = jest.requireActual("../../../../hooks/game/useGameTemplates");
  return {
    ...actual,
    useGameTemplates: () => ({ data: [PLATFORMER], isLoading: false })
  };
});
jest.mock("../../../../hooks/game/useGameStylePresets", () => ({
  useGameStylePresets: () => ({
    data: [
      {
        entityId: "e-8bit",
        presetId: "pixel-8bit",
        name: "8-bit",
        descriptor: "8-bit pixel art",
        thumbnail: "package://nodetool-base/styles/game-pixel-8bit.png"
      }
    ]
  })
}));
jest.mock("../../../../serverState/useEntities", () => ({
  useEntities: () => ({ data: [] })
}));

let settings: Record<string, unknown> = {};
const saveWorkflow = jest.fn(async () => {});
const updateWorkflow = jest.fn((workflow: { settings: unknown }) => {
  settings = workflow.settings as Record<string, unknown>;
});
const managerState = {
  getWorkflow: () => ({ id: "w1", name: "W", settings, graph: null }),
  getNodeStore: () => undefined,
  updateWorkflow,
  saveWorkflow
};
jest.mock("../../../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: (selector: (state: unknown) => unknown) =>
    selector(managerState),
  useWorkflowManagerStore: () => ({ getState: () => managerState })
}));

import {
  readGameSetup,
  writeGameSetup
} from "@nodetool-ai/protocol/api-schemas/workflows.js";
import useCanvasChatDockStore from "../../../../stores/CanvasChatDockStore";
import { SetupFlow } from "../../SetupFlow";
import { useGameSetupFlow, firstMissingDesignField } from "../useGameSetupFlow";
import type { GameRowAvailability } from "../useGameSetupFlow";

const DESIGN: GameDesign = {
  title: "Ember Run",
  premise: "p",
  core_loop: "c",
  player_verbs: [],
  enemies: [],
  level: "l",
  win: "w",
  lose: "x",
  cast: [{ slot_id: "player", name: "Ember", descriptor: "a slim fox" }],
  slot_prompts: [
    { slot_id: "player", prompt: "a fox running" },
    { slot_id: "sfx.jump", prompt: "a hop" }
  ]
};

const availability = (label: string): GameRowAvailability => ({
  label,
  tiles: [{ id: "fal_ai:m1", title: "Model one", description: "fal_ai" }],
  status: "ready",
  onRetry: jest.fn(),
  capability: "text_to_image",
  emptyMessage: "No provider."
});

const Harness = ({ onFinish }: { onFinish?: () => void }) => {
  const config = useGameSetupFlow({
    workflowId: "w1",
    defaultDesignerModel: { provider: "openai", id: "gpt-5" },
    imageRow: availability("Image model"),
    sfxRow: {
      ...availability("Sound effects"),
      placeholderLabel: "Keep the placeholder sounds"
    },
    musicRow: {
      ...availability("Music"),
      placeholderLabel: "Keep the placeholder music"
    },
    chosenModel: (row, tileId) => ({ type: `${row}_model`, id: tileId }),
    onOpenTutorial: jest.fn(),
    onFinish
  });
  return <SetupFlow config={config} />;
};

const renderFlow = (props: Parameters<typeof Harness>[0] = {}) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ThemeProvider theme={mockTheme}>
        <Harness {...props} />
      </ThemeProvider>
    </QueryClientProvider>
  );

beforeEach(() => {
  jest.clearAllMocks();
  settings = {};
  designGame.mockResolvedValue(null);
  useCanvasChatDockStore.setState({ conversationCollapsed: true });
});

describe("useGameSetupFlow", () => {
  it("renders nothing for a workflow that never went through the flow", () => {
    settings = {};
    const { container } = renderFlow();
    expect(container.querySelector("[data-setup-flow]")).toBeNull();
  });

  it.each([
    ["idea", "What's your game?"],
    ["template", "Choose your game's loop"],
    ["review", "Your design"],
    ["look", "Choose the look and the models"]
  ])("resumes stage %s at its own step", (stage, heading) => {
    settings = writeGameSetup(
      {},
      {
        stage: stage as "idea",
        brief: "A fox platformer",
        template: "platformer",
        design: DESIGN,
        style_entity_id: "e-8bit",
        image_model: "fal_ai:m1",
        project_name: "Ember Run"
      }
    );
    renderFlow();
    expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
  });

  it("blocks step 1 until the premise is written", async () => {
    settings = writeGameSetup({}, { stage: "idea", brief: "" });
    renderFlow();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    expect(screen.getByText("Describe your game")).toBeInTheDocument();
  });

  it("blocks the design until a template is picked, and says so", () => {
    settings = writeGameSetup({}, { stage: "template", brief: "A fox" });
    renderFlow();
    expect(
      screen.getByRole("button", { name: "Write the design" })
    ).toBeDisabled();
    expect(screen.getByText("Pick a template")).toBeInTheDocument();
  });

  it("writes the design and places nothing (criterion 3)", async () => {
    const user = userEvent.setup();
    settings = writeGameSetup(
      {},
      { stage: "template", brief: "A fox", template: "platformer" }
    );
    renderFlow();
    await user.click(screen.getByRole("button", { name: "Write the design" }));
    await waitFor(() => expect(designGame).toHaveBeenCalled());
    expect(designGame.mock.calls[0][0]).toMatchObject({
      brief: "A fox",
      manifest: { template: "platformer" }
    });
    expect(buildGame).not.toHaveBeenCalled();
  });

  it("keeps a design that still answers the brief and template", () => {
    settings = writeGameSetup(
      {},
      {
        stage: "template",
        brief: "A fox",
        template: "platformer",
        design: DESIGN,
        design_source: "platformer\nA fox"
      }
    );
    renderFlow();
    expect(
      screen.getByRole("button", { name: "Continue to your design" })
    ).toBeEnabled();
    expect(
      screen.getByText("Your design is unchanged — this keeps it.")
    ).toBeInTheDocument();
  });

  // Criterion 4: the reason names the first thing that is missing.
  it("blocks Continue to look on an empty cast descriptor, and names it", () => {
    settings = writeGameSetup(
      {},
      {
        stage: "review",
        brief: "A fox",
        template: "platformer",
        design: {
          ...DESIGN,
          cast: [{ slot_id: "player", name: "Ember", descriptor: "  " }]
        }
      }
    );
    renderFlow();
    expect(
      screen.getByRole("button", { name: "Continue to look" })
    ).toBeDisabled();
    expect(
      screen.getByText("Your design still needs a descriptor for Ember")
    ).toBeInTheDocument();
  });

  it("blocks Continue to look on an empty slot prompt, and names the slot", () => {
    settings = writeGameSetup(
      {},
      {
        stage: "review",
        brief: "A fox",
        template: "platformer",
        design: {
          ...DESIGN,
          slot_prompts: [{ slot_id: "player", prompt: "a fox running" }]
        }
      }
    );
    renderFlow();
    expect(
      screen.getByText("Your design still needs a prompt for sfx.jump")
    ).toBeInTheDocument();
  });

  it("lets a complete design continue to the look", async () => {
    const user = userEvent.setup();
    settings = writeGameSetup(
      {},
      {
        stage: "review",
        brief: "A fox",
        template: "platformer",
        design: DESIGN
      }
    );
    renderFlow();
    await user.click(screen.getByRole("button", { name: "Continue to look" }));
    // The stage is the only completion signal: the shell writes it, and the
    // mounted host re-reads it on the next render.
    await waitFor(() => expect(readGameSetup(settings)?.stage).toBe("look"));
    expect(buildGame).not.toHaveBeenCalled();
  });

  it("blocks the build until a style is chosen", () => {
    settings = writeGameSetup(
      {},
      {
        stage: "look",
        brief: "A fox",
        template: "platformer",
        design: DESIGN,
        image_model: "fal_ai:m1",
        project_name: "Ember Run"
      }
    );
    renderFlow();
    expect(
      screen.getByRole("button", { name: "Build your game" })
    ).toBeDisabled();
    expect(screen.getByText("Pick a style")).toBeInTheDocument();
  });

  it("builds from the design, the manifest and the chosen look", async () => {
    const user = userEvent.setup();
    const onFinish = jest.fn();
    settings = writeGameSetup(
      {},
      {
        stage: "look",
        brief: "A fox",
        template: "platformer",
        design: DESIGN,
        style_entity_id: "e-8bit",
        image_model: "fal_ai:m1",
        project_name: "Ember Run"
      }
    );
    renderFlow({ onFinish });
    await user.click(screen.getByRole("button", { name: "Build your game" }));
    await waitFor(() => expect(buildGame).toHaveBeenCalled());
    expect(buildGame.mock.calls[0][0]).toMatchObject({
      manifest: { template: "platformer" },
      design: { title: "Ember Run" },
      choices: {
        style: { name: "8-bit", descriptor: "8-bit pixel art" },
        // Nothing was chosen for either audio row, so the template's own files
        // are kept (D27).
        sfxNodeType: null,
        musicModel: null,
        directory: "games/ember-run",
        verify: true
      }
    });
    await waitFor(() => expect(onFinish).toHaveBeenCalled());
    // The landing is the agent panel with the checklist at the top of it, and
    // that panel starts collapsed — the build opens it.
    expect(
      useCanvasChatDockStore.getState().conversationCollapsed
    ).toBe(false);
  });
});

describe("firstMissingDesignField", () => {
  it("reports nothing for a complete design", () => {
    expect(
      firstMissingDesignField(DESIGN, [{ id: "player" }, { id: "sfx.jump" }])
    ).toBeNull();
  });

  it("reads the cast before the slots, in the review's own order", () => {
    expect(
      firstMissingDesignField(
        { ...DESIGN, cast: [{ slot_id: "player", name: "", descriptor: "" }] },
        [{ id: "nothing" }]
      )
    ).toBe("a name for player");
  });
});
