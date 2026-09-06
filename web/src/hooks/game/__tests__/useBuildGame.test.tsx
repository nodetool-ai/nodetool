/**
 * The build (game-prd § 5.4, criterion 5).
 *
 * What is asserted: the placement is replayed through the node tools in order,
 * each slot's node carries its slot id and the export node its dynamic inputs,
 * the terminal stage is written as soon as the nodes are down, and the run
 * only starts on a graph that both validates and had nothing left unplaced.
 */
import { act, renderHook } from "@testing-library/react";
import type { GameAssetManifest } from "@nodetool-ai/protocol";
import type { GameDesign } from "@nodetool-ai/protocol/api-schemas/workflows.js";

const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
let graphValidation: { errors: string[] } = { errors: [] };
let runThrows: Error | null = null;
jest.mock("../../../lib/tools/frontendTools", () => ({
  FrontendToolRegistry: {
    call: jest.fn(async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name === "ui_get_graph") {
        return { validation: graphValidation };
      }
      if (name === "ui_run_workflow" && runThrows) {
        throw runThrows;
      }
      return { ok: true };
    })
  }
}));
jest.mock("../../../lib/tools/frontendToolRuntimeState", () => ({
  getFrontendToolRuntimeState: () => ({})
}));

let settings: Record<string, unknown> = {};
const managerState = {
  getWorkflow: () => ({ id: "w1", name: "W", settings, graph: null }),
  getNodeStore: () => undefined,
  updateWorkflow: jest.fn((workflow: { settings: unknown }) => {
    settings = workflow.settings as Record<string, unknown>;
  }),
  saveWorkflow: jest.fn(async () => {})
};
jest.mock("../../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: (selector: (state: unknown) => unknown) =>
    selector(managerState),
  useWorkflowManagerStore: () => ({ getState: () => managerState })
}));

const image = (name: string) => ({ name, type: { type: "image" } });
let metadata: Record<string, unknown> = {};
jest.mock("../../../stores/MetadataStore", () => ({
  __esModule: true,
  default: Object.assign(
    (selector: (state: unknown) => unknown) => selector({ metadata }),
    { getState: () => ({ metadata }) }
  )
}));

import { readGameSetup } from "@nodetool-ai/protocol/api-schemas/workflows.js";
import { readGameBuild } from "../../../components/setup/game/gameExtras";
import { useBuildGame, type BuildGameResult } from "../useBuildGame";

const REGISTRY: Record<string, unknown> = {
  "nodetool.image.TextToImage": {
    node_type: "nodetool.image.TextToImage",
    properties: [image("image"), { name: "prompt", type: { type: "str" } }],
    outputs: [image("output")]
  },
  "nodetool.image.ResizeImage": {
    node_type: "nodetool.image.ResizeImage",
    properties: [image("image")],
    outputs: [image("output")]
  },
  "nodetool.game.SpriteSheet": {
    node_type: "nodetool.game.SpriteSheet",
    properties: [image("image")],
    outputs: [image("output"), { name: "fill", type: { type: "dict" } }]
  },
  "nodetool.game.ExportGodotProject": {
    node_type: "nodetool.game.ExportGodotProject",
    supports_dynamic_inputs: true,
    properties: [{ name: "template", type: { type: "str" } }],
    outputs: [{ name: "output", type: { type: "dict" } }]
  },
  "nodetool.workflows.base_node.Preview": {
    node_type: "nodetool.workflows.base_node.Preview",
    properties: [{ name: "value", type: { type: "any" } }],
    outputs: []
  },
  "nodetool.output.Output": {
    node_type: "nodetool.output.Output",
    properties: [{ name: "value", type: { type: "any" } }],
    outputs: []
  }
};

const MANIFEST: GameAssetManifest = {
  version: 1,
  template: "platformer",
  godot: "4.3",
  slots: [
    {
      id: "player",
      kind: "spritesheet",
      cell: [32, 32],
      animations: { idle: 2 },
      fps: 8
    }
  ],
  hooks: []
};

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
  slot_prompts: [{ slot_id: "player", prompt: "a fox running" }]
};

const build = async (
  manifest: GameAssetManifest = MANIFEST
): Promise<BuildGameResult> => {
  const { result } = renderHook(() => useBuildGame("w1"));
  let built: BuildGameResult | undefined;
  await act(async () => {
    built = await result.current.buildGame({
      manifest,
      design: DESIGN,
      choices: {
        imageModel: { type: "image_model", id: "m", provider: "fal_ai" },
        sfxNodeType: null,
        musicModel: null,
        style: { name: "8-bit", descriptor: "8-bit pixel art" },
        projectName: "Ember Run",
        directory: "games/ember-run",
        verify: true
      }
    });
  });
  if (!built) {
    throw new Error("buildGame did not resolve");
  }
  return built;
};

beforeEach(() => {
  jest.clearAllMocks();
  calls.length = 0;
  settings = {};
  metadata = { ...REGISTRY };
  graphValidation = { errors: [] };
  runThrows = null;
});

describe("buildGame", () => {
  it("opens the editor, then places the nodes and the edges", async () => {
    await build();
    expect(calls[0].name).toBe("ui_open_workflow");
    const names = calls.map((call) => call.name);
    // Generate, resize, check and preview for the one slot, then the export
    // node and the output the project lands on.
    expect(names.filter((name) => name === "ui_add_node").length).toBe(6);
    expect(names.indexOf("ui_connect_nodes")).toBeGreaterThan(
      names.lastIndexOf("ui_add_node")
    );
    expect(names[names.length - 2]).toBe("ui_get_graph");
    expect(names[names.length - 1]).toBe("ui_run_workflow");
  });

  it("carries the slot id onto every node of that slot's chain", async () => {
    await build();
    const updates = calls.filter((call) => call.name === "ui_update_node_data");
    const slotIds = updates
      .map((call) => (call.args["data"] as Record<string, unknown>)["setupStepId"])
      .filter((value) => value !== undefined);
    expect(slotIds).toEqual(["player", "player", "player", "player"]);
  });

  it("declares one dynamic input per slot on the export node", async () => {
    await build();
    const exportUpdate = calls.find(
      (call) =>
        call.name === "ui_update_node_data" &&
        call.args["node_id"] === "export"
    );
    const data = exportUpdate?.args["data"] as Record<string, unknown>;
    expect(data["dynamic_properties"]).toEqual({ player: "" });
  });

  it("writes the terminal stage once the nodes are placed", async () => {
    await build();
    expect(readGameSetup(settings)?.stage).toBe("done");
  });

  // The landing checklist outlives the flow's own surface, so what the build
  // came out as is stored on the document rather than held in memory.
  it("persists the build record on settings.game", async () => {
    graphValidation = { errors: ["Node export: no template"] };
    await build();
    expect(readGameBuild(readGameSetup(settings))).toEqual({
      node_count: 6,
      issues: [],
      validation_errors: ["Node export: no template"],
      run_started: false,
      run_error: null
    });
  });

  it("does not run a graph that failed validation, and reports the errors", async () => {
    graphValidation = { errors: ["Node export: no template"] };
    const result = await build();
    expect(result.validationErrors).toEqual(["Node export: no template"]);
    expect(calls.some((call) => call.name === "ui_run_workflow")).toBe(false);
    expect(result.run.started).toBe(false);
  });

  it("does not run a graph the builder could not finish", async () => {
    metadata = { ...REGISTRY };
    delete metadata["nodetool.game.ExportGodotProject"];
    const result = await build();
    expect(result.issues.join(" ")).toContain("writes no project");
    expect(calls.some((call) => call.name === "ui_run_workflow")).toBe(false);
    expect(result.run.started).toBe(false);
  });

  it("reports a refused run instead of throwing out of the build", async () => {
    runThrows = new Error("no worker available");
    const result = await build();
    expect(result.run).toEqual({
      started: false,
      error: "no worker available"
    });
    expect(readGameSetup(settings)?.stage).toBe("done");
  });

  // The blank-template path: no slots, so the graph is the export node and its
  // output, and the project comes out with the template's placeholder art.
  it("places only the export node and its output for a blank template", async () => {
    const result = await build({ ...MANIFEST, slots: [] });
    expect(result.nodeCount).toBe(2);
    expect(result.issues).toEqual([]);
    expect(result.run.started).toBe(true);
  });
});
