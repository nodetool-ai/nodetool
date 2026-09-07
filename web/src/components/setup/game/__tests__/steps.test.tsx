/**
 * The Game flow's four step bodies (game-prd § 4.1–§ 4.3).
 *
 * What is asserted: the copy Appendix A fixes, the template cards' meta line
 * read from the live manifest rather than hardcoded, the inline template and
 * blank-export pickers of step 1, the design review writing every edit
 * straight back, and the Look step's rows — including that keeping the
 * placeholder audio is a tile a creator can pick, not an absent choice (D27).
 */
import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import type { GameDesign } from "@nodetool-ai/protocol/api-schemas/workflows.js";

import mockTheme from "../../../../__mocks__/themeMock";

// Card art and style tiles are stored locators; the real resolver needs a
// QueryClient this suite has no use for.
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
// The `Add your own style` path is the storyboard dialog plus one model call;
// this suite only has to know the tile is offered.
jest.mock("../useGameCustomStyle", () => ({
  __esModule: true,
  useGameCustomStyle: () => ({
    saving: false,
    error: null,
    clearError: jest.fn(),
    addStyle: jest.fn()
  })
}));

import { GameIdeaStep } from "../IdeaStep";
import { GameTemplateStep } from "../TemplateStep";
import { GameReviewStep } from "../ReviewStep";
import { GameLookStep, GAME_PLACEHOLDER_TILE_ID } from "../LookStep";
import type { GameTemplate } from "../../../../hooks/game/useGameTemplates";

const PLATFORMER: GameTemplate = {
  id: "platformer",
  godot: "4.3",
  slots: [
    {
      id: "player",
      kind: "spritesheet",
      cell: [32, 32],
      animations: { idle: 2, run: 4 },
      fps: 8
    },
    { id: "tiles.ground", kind: "tileset", cell: [16, 16], count: 9, solid: "all" },
    { id: "sfx.jump", kind: "sfx", seconds: 0.4 },
    { id: "music.level", kind: "music", seconds: 30, loop: true }
  ],
  hooks: ["scripts/player.gd", "scripts/level.gd"]
};

const wrap = (node: React.ReactElement) =>
  render(<ThemeProvider theme={mockTheme}>{node}</ThemeProvider>);

describe("GameIdeaStep", () => {
  const renderStep = (
    props: Partial<React.ComponentProps<typeof GameIdeaStep>> = {}
  ) => {
    const onBriefChange = jest.fn();
    const onStartFromTemplate = jest.fn();
    const onExportBlank = jest.fn();
    const onOpenTutorial = jest.fn();
    wrap(
      <GameIdeaStep
        brief=""
        onBriefChange={onBriefChange}
        templates={[PLATFORMER]}
        onStartFromTemplate={onStartFromTemplate}
        onExportBlank={onExportBlank}
        onOpenTutorial={onOpenTutorial}
        {...props}
      />
    );
    return { onBriefChange, onStartFromTemplate, onExportBlank, onOpenTutorial };
  };

  it("asks the question and offers the three other ways in", () => {
    renderStep();
    expect(
      screen.getByRole("heading", { name: "What's your game?" })
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(
        "One sentence is enough: who you play, what you do, and what stops you."
      )
    ).toBeInTheDocument();
    const column = screen.getByRole("list", { name: "Other ways to start" });
    expect(
      within(column).getByText("Start from a template")
    ).toBeInTheDocument();
    expect(
      within(column).getByText("Export a blank template")
    ).toBeInTheDocument();
    expect(within(column).getByText("Tutorial")).toBeInTheDocument();
  });

  it("picks a template inline and moves straight to the design", async () => {
    const user = userEvent.setup();
    const { onStartFromTemplate } = renderStep();
    await user.click(screen.getByText("Start from a template"));
    await user.click(screen.getByRole("button", { name: /^Platformer/ }));
    expect(onStartFromTemplate).toHaveBeenCalledWith("platformer");
  });

  it("exports a blank template from its own picker", async () => {
    const user = userEvent.setup();
    const { onExportBlank, onStartFromTemplate } = renderStep();
    await user.click(screen.getByText("Export a blank template"));
    await user.click(screen.getByRole("button", { name: /^Platformer/ }));
    expect(onExportBlank).toHaveBeenCalledWith("platformer");
    expect(onStartFromTemplate).not.toHaveBeenCalled();
  });

  it("writes the brief as it is typed", async () => {
    const user = userEvent.setup();
    const { onBriefChange } = renderStep();
    await user.type(screen.getByRole("textbox"), "A");
    expect(onBriefChange).toHaveBeenCalledWith("A");
  });
});

describe("GameTemplateStep", () => {
  it("reads the meta line off the manifest rather than a fixed number", () => {
    wrap(
      <GameTemplateStep
        templates={[PLATFORMER]}
        selectedId={null}
        onSelect={jest.fn()}
        designerModel={{ provider: "openai", id: "gpt-5" }}
        onDesignerModelChange={jest.fn()}
      />
    );
    expect(
      screen.getByRole("heading", { name: "Choose your game's loop" })
    ).toBeInTheDocument();
    expect(screen.getByText("4 slots · 2 hook scripts")).toBeInTheDocument();
    expect(
      screen.getByText("Run, jump and stomp across a side-scrolling level.")
    ).toBeInTheDocument();
  });

  it("names the model the design will be written with", () => {
    wrap(
      <GameTemplateStep
        templates={[PLATFORMER]}
        selectedId="platformer"
        onSelect={jest.fn()}
        designerModel={null}
        onDesignerModelChange={jest.fn()}
      />
    );
    expect(screen.getByText("Design with")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /select designer model/i })
    ).toBeInTheDocument();
  });
});

const DESIGN: GameDesign = {
  title: "Ember Run",
  premise: "A fox runs east.",
  core_loop: "Run, jump, stomp.",
  player_verbs: ["run", "jump"],
  enemies: [
    { slot_id: "enemy.walker", name: "Husk beetle", behaviour: "Paces a platform." }
  ],
  level: "A ridge in three beats.",
  win: "Reach the tree.",
  lose: "Take three hits.",
  cast: [{ slot_id: "player", name: "Ember", descriptor: "A slim young fox." }],
  slot_prompts: [{ slot_id: "player", prompt: "Ember running" }]
};

describe("GameReviewStep", () => {
  const renderStep = (
    props: Partial<React.ComponentProps<typeof GameReviewStep>> = {}
  ) => {
    const onDesignChange = jest.fn();
    wrap(
      <GameReviewStep
        design={DESIGN}
        slots={PLATFORMER.slots}
        onDesignChange={onDesignChange}
        onRedesign={jest.fn()}
        {...props}
      />
    );
    return { onDesignChange };
  };

  it("shows every section of the design, with the slot sizes as meta", () => {
    renderStep();
    expect(screen.getByDisplayValue("Ember Run")).toBeInTheDocument();
    expect(screen.getByDisplayValue("A fox runs east.")).toBeInTheDocument();
    expect(screen.getByDisplayValue("run, jump")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Husk beetle")).toBeInTheDocument();
    expect(screen.getByDisplayValue("A slim young fox.")).toBeInTheDocument();
    // 32px cells, two animations, four frames on the longest row.
    expect(screen.getByText("spritesheet · 128×64 px")).toBeInTheDocument();
    expect(screen.getByText("sfx · 0.4s")).toBeInTheDocument();
  });

  it("writes an edited field straight back onto the design", async () => {
    const user = userEvent.setup();
    const { onDesignChange } = renderStep();
    await user.type(screen.getByDisplayValue("Ember Run"), "!");
    expect(onDesignChange).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Ember Run!" })
    );
  });

  it("adds a prompt for a slot the design has none for", async () => {
    const user = userEvent.setup();
    const { onDesignChange } = renderStep();
    await user.type(
      screen.getByLabelText("tiles.ground prompt"),
      "g"
    );
    expect(onDesignChange).toHaveBeenCalledWith(
      expect.objectContaining({
        slot_prompts: expect.arrayContaining([
          { slot_id: "tiles.ground", prompt: "g" }
        ])
      })
    );
  });

  it("says which lines the designer skipped and the template filled", () => {
    renderStep({ filled: ["slot_prompts.tiles.ground"] });
    expect(
      screen.getByText(/filled from the template: slot_prompts.tiles.ground/)
    ).toBeInTheDocument();
  });

  it("offers Re-design", () => {
    renderStep();
    expect(
      screen.getByRole("button", { name: "Re-design" })
    ).toBeInTheDocument();
  });
});

describe("GameLookStep", () => {
  const row = (
    label: string,
    overrides: Partial<React.ComponentProps<typeof GameLookStep>["image"]> = {}
  ) => ({
    label,
    tiles: [{ id: "fal_ai:m1", title: "Model one", description: "fal_ai" }],
    status: "ready" as const,
    onRetry: jest.fn(),
    selectedId: null,
    onSelect: jest.fn(),
    capability: "text_to_image" as const,
    emptyMessage: "No provider.",
    ...overrides
  });

  const renderStep = (
    props: Partial<React.ComponentProps<typeof GameLookStep>> = {}
  ) => {
    const onStyleChange = jest.fn();
    const onProjectNameChange = jest.fn();
    wrap(
      <GameLookStep
        slots={PLATFORMER.slots}
        presets={[
          {
            entityId: "e-8bit",
            presetId: "pixel-8bit",
            name: "8-bit",
            descriptor: "8-bit pixel art",
            thumbnail: "package://nodetool-base/styles/game-pixel-8bit.png"
          }
        ]}
        styleEntityId={null}
        onStyleChange={onStyleChange}
        designerModel={{ provider: "openai", id: "gpt-5" }}
        image={row("Image model")}
        sfx={row("Sound effects", {
          placeholderLabel: "Keep the placeholder sounds",
          selectedId: GAME_PLACEHOLDER_TILE_ID
        })}
        music={row("Music", {
          placeholderLabel: "Keep the placeholder music",
          selectedId: GAME_PLACEHOLDER_TILE_ID
        })}
        projectName="Ember Run"
        onProjectNameChange={onProjectNameChange}
        {...props}
      />
    );
    return { onStyleChange, onProjectNameChange };
  };

  it("asks the question Appendix A fixes", () => {
    renderStep();
    expect(
      screen.getByRole("heading", { name: "Choose the look and the models" })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "One style and one image model for every sprite, tile and background, so the game reads as one game."
      )
    ).toBeInTheDocument();
  });

  it("offers the placeholder as the first tile of each audio row (D27)", () => {
    renderStep();
    const sounds = screen.getByRole("radiogroup", { name: "Sound effects" });
    expect(
      within(sounds).getByRole("radio", { name: /Keep the placeholder sounds/ })
    ).toBeChecked();
    const music = screen.getByRole("radiogroup", { name: "Music" });
    expect(
      within(music).getByRole("radio", { name: /Keep the placeholder music/ })
    ).toBeChecked();
  });

  it("names what the build will generate, and says when it cannot price it", () => {
    renderStep();
    const disclosure = screen.getByRole("region", { name: "Before you build" });
    expect(disclosure).toHaveTextContent(
      "Generates 2 images, then exports the project"
    );
    expect(disclosure).toHaveTextContent(
      "Cost unknown until the first asset returns"
    );
  });

  it("has no placeholder tile on the image row, which is required", () => {
    renderStep();
    const images = screen.getByRole("radiogroup", { name: "Image model" });
    expect(
      within(images).queryByRole("radio", { name: /Keep the placeholder/ })
    ).toBeNull();
  });

  it("prompts for a provider when nothing offers an image model", () => {
    renderStep({ image: row("Image model", { status: "empty", tiles: [] }) });
    expect(
      screen.getByRole("button", { name: "Connect a provider" })
    ).toBeInTheDocument();
  });

  it("writes the project name as it is typed", async () => {
    const user = userEvent.setup();
    const { onProjectNameChange } = renderStep();
    await user.type(screen.getByLabelText("Project name"), "!");
    expect(onProjectNameChange).toHaveBeenCalledWith("Ember Run!");
  });
});
