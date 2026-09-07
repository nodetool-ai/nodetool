/**
 * Where the checklist mounts, and what keeps it off every other canvas
 * (game-prd § 4.4).
 *
 * The panel is rendered by the node editor's canvas chat dock for whichever
 * workflow is open, so its gate is the whole guarantee: only a workflow whose
 * `settings.game` reads stage `done` *and* carries the build record shows a
 * checklist. A workflow that never went through the flow, one still mid-flow,
 * and one whose graph was placed by hand all render nothing.
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { GAME_EXPORT_NODE_TYPE } from "@nodetool-ai/protocol";

import mockTheme from "../../../../__mocks__/themeMock";

let settings: Record<string, unknown> = {};
const nodes = [
  { id: "check_1", type: "nodetool.game.SpriteSheet", data: { setupStepId: "player" } },
  { id: "export", type: GAME_EXPORT_NODE_TYPE, data: {} }
];
const managerState = {
  getWorkflow: () => ({ id: "w1", name: "W", settings, graph: null }),
  getNodeStore: () => ({ getState: () => ({ nodes }) })
};
jest.mock("../../../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: (selector: (state: unknown) => unknown) =>
    selector(managerState),
  useWorkflowManagerStore: () => ({ getState: () => managerState })
}));

// One completed generation per node of the focused job — the shape
// `generation_complete` and a completed `node_update` both write, keyed by
// handle. The checklist reads its rows out of this, never out of
// `outputResults` (see gameRunSummary's header).
const liveGenerations: Record<string, unknown[]> = {
  "w1:check_1": [
    {
      id: "job1",
      jobId: "job1",
      createdAt: 1,
      status: "completed",
      outputs: { output: { asset_id: "a" }, fill: { slot_id: "player" } }
    }
  ],
  "w1:export": [
    {
      id: "job1",
      jobId: "job1",
      createdAt: 1,
      status: "completed",
      outputs: {
        directory: "games/ember-run",
        archive: "games/ember-run.zip",
        verified: true
      }
    }
  ]
};
jest.mock("../../../../stores/ResultsStore", () => ({
  __esModule: true,
  default: (selector: (state: unknown) => unknown) =>
    selector({ liveGenerations })
}));
jest.mock("../../../../stores/ErrorStore", () => {
  const actual = jest.requireActual("../../../../stores/ErrorStore");
  return {
    ...actual,
    __esModule: true,
    default: (selector: (state: unknown) => unknown) => selector({ errors: {} })
  };
});
jest.mock("../../../../stores/WorkflowRunsStore", () => ({
  __esModule: true,
  default: (selector: (state: unknown) => unknown) =>
    selector({ focusedJob: { w1: "job1" } })
}));

const openTab = jest.fn();
jest.mock("../../../../stores/WorkspaceTabsStore", () => ({
  useWorkspaceTabsStore: (selector: (state: unknown) => unknown) =>
    selector({
      openTab,
      tabs: [{ type: "workflow", ref: "w1", projectId: "p9" }]
    })
}));
jest.mock("../../../../hooks/useCurrentWorkspace", () => ({
  useCurrentWorkspace: () => ({ workspaceId: "ws1" })
}));
const openProject = jest.fn();
jest.mock("../../../../hooks/useProjects", () => ({
  useOpenProject: () => openProject,
  useProjectSummaries: () => ({
    data: [{ project: { id: "p9", name: "Ember Run" } }]
  })
}));
jest.mock("../../../../hooks/game/useGameTemplates", () => ({
  useGameTemplates: () => ({
    data: [{ id: "platformer", godot: "4.3", slots: [], hooks: [] }]
  })
}));
const toolCall = jest.fn(
  async (
    _name: string,
    _args: Record<string, unknown>,
    _id: string,
    _ctx: unknown
  ) => ({ ok: true })
);
jest.mock("../../../../lib/tools/frontendTools", () => ({
  FrontendToolRegistry: {
    call: (
      name: string,
      args: Record<string, unknown>,
      id: string,
      ctx: unknown
    ) => toolCall(name, args, id, ctx)
  }
}));
jest.mock("../../../../lib/tools/frontendToolRuntimeState", () => ({
  getFrontendToolRuntimeState: () => ({})
}));

import { writeGameSetup } from "@nodetool-ai/protocol/api-schemas/workflows.js";
import { GameLandingPanel } from "../GameLandingPanel";
import { GAME_BUILD_KEY, gameBuildRecord, readGameBuild } from "../gameExtras";
import { stageProjectFirstTurn } from "../../../projects/projectAgent";

jest.mock("../../../projects/projectAgent", () => ({
  ...jest.requireActual("../../../projects/projectAgent"),
  stageProjectFirstTurn: jest.fn()
}));

const BUILD = gameBuildRecord({
  nodeCount: 6,
  issues: [],
  validationErrors: [],
  run: { started: true, error: null }
});

const DESIGN = {
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
};

const built = (
  overrides: Record<string, unknown> = {}
): Record<string, unknown> =>
  writeGameSetup(
    {},
    {
      stage: "done",
      brief: "A fox",
      template: "platformer",
      design: DESIGN,
      [GAME_BUILD_KEY]: BUILD,
      ...overrides
    }
  );

const renderPanel = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <GameLandingPanel workflowId="w1" />
    </ThemeProvider>
  );

beforeEach(() => {
  jest.clearAllMocks();
  settings = built();
});

describe("GameLandingPanel", () => {
  it("shows the checklist for a workflow the flow built", () => {
    renderPanel();
    expect(screen.getByText("Graph built")).toBeInTheDocument();
    expect(screen.getByText("games/ember-run")).toBeInTheDocument();
    expect(screen.getByText("Verified with Godot 4.3")).toBeInTheDocument();
  });

  it.each([
    ["a workflow that never went through the flow", {} as Record<string, unknown>],
    [
      "a workflow still mid-flow",
      writeGameSetup({}, { stage: "look", [GAME_BUILD_KEY]: BUILD })
    ],
    ["a graph placed by hand", built({ [GAME_BUILD_KEY]: undefined })]
  ])("renders nothing for %s", (_label, value) => {
    settings = value;
    const { container } = renderPanel();
    expect(container).toBeEmptyDOMElement();
  });

  it("opens the project file in a workspace-file tab", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole("button", { name: "Open project folder" }));
    expect(openTab).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "workspace-file",
        ref: "ws1::games/ember-run/project.godot"
      })
    );
  });

  it("stages the play-test turn on the workflow's own project", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(
      screen.getByRole("button", { name: "Play-test with the agent" })
    );
    expect(stageProjectFirstTurn).toHaveBeenCalledWith(
      "p9",
      expect.arrayContaining([
        expect.objectContaining({
          text: expect.stringContaining("games/ember-run")
        })
      ])
    );
    expect(openProject).toHaveBeenCalledWith({ id: "p9", name: "Ember Run" });
  });

  it("regenerates by running the graph that is already there", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole("button", { name: "Regenerate" }));
    expect(toolCall).toHaveBeenCalledWith(
      "ui_run_workflow",
      { workflow_id: "w1", params: {} },
      expect.any(String),
      expect.anything()
    );
  });
});

describe("readGameBuild", () => {
  it("reads back what the build wrote", () => {
    expect(readGameBuild(writeGameSetup({}, { [GAME_BUILD_KEY]: BUILD })
      ["game"] as never)).toEqual(BUILD);
  });

  it("reads a malformed record as no build, never as one", () => {
    expect(readGameBuild({ [GAME_BUILD_KEY]: { node_count: "six" } } as never)).toBeNull();
    expect(readGameBuild(null)).toBeNull();
  });
});
