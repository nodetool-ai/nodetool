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
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@mui/material/styles";
import { GAME_EXPORT_NODE_TYPE } from "@nodetool-ai/protocol";

import mockTheme from "../../../../__mocks__/themeMock";

let settings: Record<string, unknown> = {};
const nodes = [
  { id: "check_1", type: "nodetool.game.SpriteSheet", data: { setupStepId: "player" } },
  { id: "export", type: GAME_EXPORT_NODE_TYPE, data: {} }
];
const saveWorkflow = jest.fn(async () => {});
const updateWorkflow = jest.fn((workflow: { settings: unknown }) => {
  settings = workflow.settings as Record<string, unknown>;
});
const managerState = {
  getWorkflow: () => ({ id: "w1", name: "W", settings, graph: null }),
  getNodeStore: () => ({
    getState: () => ({
      nodes,
      getWorkflow: () => ({ id: "w1", name: "W", settings, graph: null })
    })
  }),
  updateWorkflow,
  saveWorkflow
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
const CHECKED = {
  id: "job1",
  jobId: "job1",
  createdAt: 1,
  status: "completed",
  outputs: { output: { asset_id: "a" }, fill: { slot_id: "player" } }
};
const EXPORTED = {
  id: "job1",
  jobId: "job1",
  createdAt: 1,
  status: "completed",
  outputs: {
    directory: "games/ember-run",
    archive: "games/ember-run.zip",
    verified: true
  }
};
const liveGenerations: Record<string, unknown[]> = {};
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
// Mutated per test: a focused job is a run this session is watching, and an
// empty map is what a reload leaves behind.
const focusedJob: Record<string, string> = { w1: "job1" };
jest.mock("../../../../stores/WorkflowRunsStore", () => ({
  __esModule: true,
  default: (selector: (state: unknown) => unknown) => selector({ focusedJob })
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

import {
  readGameSetup,
  writeGameSetup
} from "@nodetool-ai/protocol/api-schemas/workflows.js";
import { GameLandingPanel } from "../GameLandingPanel";
import {
  GAME_BUILD_KEY,
  gameBuildRecord,
  readGameBuild,
  readGameExport
} from "../gameExtras";
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
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ThemeProvider theme={mockTheme}>
        <GameLandingPanel workflowId="w1" />
      </ThemeProvider>
    </QueryClientProvider>
  );

/** What the document keeps of the run the checklist above just finished. */
const EXPORT = {
  job_id: "job1",
  directory: "games/ember-run",
  archive: "games/ember-run.zip",
  verified: true,
  verification_reason: null,
  checked: 1,
  total: 1
};

/** A reload: both run stores are in memory only, so both come back empty. */
const afterReload = () => {
  delete focusedJob["w1"];
  for (const key of Object.keys(liveGenerations)) {
    delete liveGenerations[key];
  }
};

beforeEach(() => {
  jest.clearAllMocks();
  settings = built();
  focusedJob["w1"] = "job1";
  liveGenerations["w1:check_1"] = [CHECKED];
  liveGenerations["w1:export"] = [EXPORTED];
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

  // Both run stores are in memory only, so a reload leaves the checklist with
  // nothing to read. The outcome the run persisted is what brings it back.
  it("restores a finished export after a reload", () => {
    settings = built({ [GAME_BUILD_KEY]: { ...BUILD, export: EXPORT } });
    afterReload();
    renderPanel();

    expect(screen.getByText("games/ember-run")).toBeInTheDocument();
    expect(screen.getByText("Verified with Godot 4.3")).toBeInTheDocument();
    expect(screen.getByText("1 of 1")).toBeInTheDocument();
    for (const name of [
      "Open project folder",
      "Download project",
      "Play-test with the agent"
    ]) {
      expect(screen.getByRole("button", { name })).toBeEnabled();
    }
  });

  it("writes the finished export onto the document, once, keyed by job", () => {
    renderPanel();
    expect(readGameExport(readGameSetup(settings))).toMatchObject({
      job_id: "job1",
      directory: "games/ember-run",
      archive: "games/ember-run.zip",
      verified: true,
      checked: 1,
      total: 1
    });
    expect(saveWorkflow).toHaveBeenCalledTimes(1);
  });

  // A re-run is this workflow's live state, however green the last one was.
  it("shows the new run rather than the last one once one starts", () => {
    settings = built({ [GAME_BUILD_KEY]: { ...BUILD, export: EXPORT } });
    afterReload();
    focusedJob["w1"] = "job2";
    renderPanel();

    expect(screen.getByText("Waiting for the export node")).toBeInTheDocument();
    expect(screen.queryByText("games/ember-run")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Open project folder" })
    ).toBeDisabled();
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
