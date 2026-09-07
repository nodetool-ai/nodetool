/**
 * The landing checklist and what it reads (game-prd § 4.4, criterion 7).
 *
 * The rule this suite exists for: `Verified with Godot 4.3` shows only when
 * the export node reported `verified: true`. A run that has not answered, a
 * server without Godot, a `verified` that is any other value — all of them read
 * as not verified, and the reason is shown instead (D28).
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { GAME_EXPORT_NODE_TYPE } from "@nodetool-ai/protocol";

import mockTheme from "../../../../__mocks__/themeMock";
import {
  GameLandingChecklist,
  gameFailureMessage
} from "../GameLandingChecklist";
import { summarizeGameRun, type GameRunSummary } from "../gameRunSummary";
import {
  gameArchiveDownloadPath,
  gamePlayTestTurn,
  gameProjectFileRef
} from "../nextSteps";
import type { BuildGameResult } from "../../../../hooks/game/useBuildGame";

const CLEAN: BuildGameResult = {
  nodeCount: 6,
  issues: [],
  validationErrors: [],
  run: { started: true, error: null }
};

const NODES = [
  { id: "gen_1", type: "nodetool.image.TextToImage", slotId: "player" },
  { id: "check_1", type: "nodetool.game.SpriteSheet", slotId: "player" },
  { id: "check_2", type: "nodetool.game.Tileset", slotId: "tiles.ground" },
  { id: "export", type: GAME_EXPORT_NODE_TYPE, slotId: null }
];

const summarize = (
  outputs: Record<string, Record<string, unknown>>,
  errors: Record<string, string> = {}
): GameRunSummary =>
  summarizeGameRun({
    nodes: NODES,
    outputsFor: (nodeId) => outputs[nodeId],
    errorFor: (nodeId) => errors[nodeId]
  });

const renderChecklist = (run: GameRunSummary, result = CLEAN) => {
  const onOpenFolder = jest.fn();
  const onDownload = jest.fn();
  const onPlayTest = jest.fn();
  const onRegenerate = jest.fn();
  render(
    <ThemeProvider theme={mockTheme}>
      <GameLandingChecklist
        result={result}
        run={run}
        godot="4.3"
        onOpenFolder={onOpenFolder}
        onDownload={onDownload}
        onPlayTest={onPlayTest}
        onRegenerate={onRegenerate}
      />
    </ThemeProvider>
  );
  return { onOpenFolder, onDownload, onPlayTest, onRegenerate };
};

describe("summarizeGameRun", () => {
  it("counts a slot as checked once any node of its chain answered", () => {
    const run = summarize({ check_1: { output: { asset_id: "a" } } });
    expect(run).toMatchObject({ checked: 1, total: 2 });
  });

  it("reads the export node's directory and archive", () => {
    const run = summarize({
      export: {
        directory: "games/ember-run",
        archive: "games/ember-run.zip",
        verified: true
      }
    });
    expect(run.directory).toBe("games/ember-run");
    expect(run.archive).toBe("games/ember-run.zip");
  });

  // Criterion 7, at its own level: nothing but `verified: true` is verified.
  it.each([
    ["nothing yet", undefined],
    ["a run that has not exported", { directory: "games/x" }],
    ["verified false", { directory: "games/x", verified: false }],
    ["a truthy non-boolean", { directory: "games/x", verified: "yes" }],
    ["a truthy number", { directory: "games/x", verified: 1 }]
  ])("does not report %s as verified", (_label, outputs) => {
    const run = summarize(outputs === undefined ? {} : { export: outputs });
    expect(run.verified).toBe(false);
  });

  it("reports verified only for verified: true", () => {
    expect(summarize({ export: { verified: true } }).verified).toBe(true);
  });

  it("carries the reason a skipped verification gave", () => {
    const run = summarize({
      export: {
        directory: "games/x",
        verified: false,
        verification: { reason: "No Godot binary on this server" }
      }
    });
    expect(run.verificationReason).toBe("No Godot binary on this server");
  });

  it("names a failed node by the slot it was filling", () => {
    const run = summarize({}, { gen_1: "the provider refused" });
    expect(run.failures).toEqual([
      { nodeId: "gen_1", slotId: "player", error: "the provider refused" }
    ]);
  });
});

describe("GameLandingChecklist", () => {
  it("shows the graph, the assets and the export directory", () => {
    renderChecklist(
      summarize({
        check_1: { asset_id: "a" },
        check_2: { asset_id: "b" },
        export: {
          directory: "games/ember-run",
          archive: "games/ember-run.zip",
          verified: true
        }
      })
    );
    expect(screen.getByText("6 nodes placed")).toBeInTheDocument();
    expect(screen.getByText("2 of 2")).toBeInTheDocument();
    expect(screen.getByText("games/ember-run")).toBeInTheDocument();
    expect(screen.getByText("Verified with Godot 4.3")).toBeInTheDocument();
  });

  // Criterion 7, at the surface: a run with no `verified: true` says where the
  // creator has to look instead, and never shows green.
  it("never shows Verified without verified: true", () => {
    renderChecklist(
      summarize({
        export: { directory: "games/ember-run", verified: false }
      })
    );
    expect(screen.queryByText("Verified with Godot 4.3")).toBeNull();
    expect(
      screen.getByText(
        "Godot not found on this server — open the folder in Godot 4.3 to verify"
      )
    ).toBeInTheDocument();
  });

  it("offers the four next steps once the project is on disk", async () => {
    const user = userEvent.setup();
    const { onOpenFolder, onDownload, onPlayTest, onRegenerate } =
      renderChecklist(
        summarize({
          export: {
            directory: "games/ember-run",
            archive: "games/ember-run.zip",
            verified: true
          }
        })
      );
    await user.click(screen.getByRole("button", { name: "Open project folder" }));
    await user.click(screen.getByRole("button", { name: "Download project" }));
    await user.click(
      screen.getByRole("button", { name: "Play-test with the agent" })
    );
    await user.click(screen.getByRole("button", { name: "Regenerate" }));
    expect(onOpenFolder).toHaveBeenCalled();
    expect(onDownload).toHaveBeenCalled();
    expect(onPlayTest).toHaveBeenCalled();
    expect(onRegenerate).toHaveBeenCalled();
  });

  it("holds the folder and the download until the export answered", () => {
    renderChecklist(summarize({}));
    expect(
      screen.getByRole("button", { name: "Open project folder" })
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Download project" })
    ).toBeDisabled();
  });

  it("puts a validation error in front of the next steps", () => {
    renderChecklist(summarize({}), {
      ...CLEAN,
      validationErrors: ["Node export: no template"]
    });
    expect(
      screen.getByText("This needs a fix before it plays")
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Download project" })).toBeNull();
  });
});

describe("gameFailureMessage", () => {
  it("is null on a clean build with a clean run", () => {
    expect(gameFailureMessage(CLEAN, summarize({}))).toBeNull();
  });

  it("names the slot a failed node was filling", () => {
    const message = gameFailureMessage(
      CLEAN,
      summarize({}, { gen_1: "the provider refused" })
    );
    expect(message).toContain("player: the provider refused");
  });

  it("reports an unplaced chain before a failed asset", () => {
    const message = gameFailureMessage(
      { ...CLEAN, issues: ["the export node is not in the registry"] },
      summarize({}, { gen_1: "boom" })
    );
    expect(message).toContain("the export node is not in the registry");
  });
});

describe("next steps", () => {
  it("builds the workspace-file ref for the project file", () => {
    expect(gameProjectFileRef("ws1", "games/ember-run")).toBe(
      "ws1::games/ember-run/project.godot"
    );
  });

  it("builds the workspace download path for the archive", () => {
    expect(gameArchiveDownloadPath("ws1", "games/ember-run.zip")).toBe(
      "/api/workspaces/ws1/download/games/ember-run.zip"
    );
  });

  it("hands the agent the design and the directory, not the files", () => {
    const [content] = gamePlayTestTurn(
      {
        title: "Ember Run",
        premise: "A fox runs east.",
        core_loop: "Run and jump.",
        player_verbs: [],
        enemies: [],
        level: "",
        win: "Reach the tree.",
        lose: "Take three hits.",
        cast: [],
        slot_prompts: []
      },
      "games/ember-run"
    );
    expect(content.type).toBe("text");
    expect(content).toHaveProperty(
      "text",
      expect.stringContaining("games/ember-run")
    );
    expect(content).toHaveProperty(
      "text",
      expect.stringContaining("Ember Run")
    );
  });
});
