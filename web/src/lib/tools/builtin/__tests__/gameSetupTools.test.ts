/**
 * @jest-environment jsdom
 *
 * The `ui_game_*` tools (game-prd § 5.7, criterion 8).
 *
 * Every criterion has to be reachable through these four as well as through
 * the flow, so this suite drives the same journey headlessly: write the brief
 * and the template, store a design, fill the cast entry the designer skipped,
 * build the graph, and see the slot id land on the node.
 */
import { z } from "zod";

import { FrontendToolRegistry } from "../../frontendTools";
import type { FrontendToolState } from "../../frontendTools";
import { readGameSetup } from "@nodetool-ai/protocol/api-schemas/workflows.js";
import type { NodeMetadata } from "../../../../stores/ApiTypes";
import "../gameSetup";

const WORKFLOW = "w1";

const image = (name: string) => ({ name, type: { type: "image" } });

const METADATA = {
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
  "nodetool.output.Output": {
    node_type: "nodetool.output.Output",
    properties: [{ name: "value", type: { type: "any" } }],
    outputs: []
  }
} as unknown as Record<string, NodeMetadata>;

const MANIFEST = {
  version: 1 as const,
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
  hooks: ["scripts/player.gd"]
};

const DESIGN = {
  title: "Ember Run",
  premise: "A fox runs east.",
  core_loop: "Run and jump.",
  player_verbs: ["run"],
  enemies: [],
  level: "A ridge.",
  win: "Reach the tree.",
  lose: "Take three hits.",
  cast: [{ slot_id: "player", name: "Ember", descriptor: "A slim fox." }],
  slot_prompts: [{ slot_id: "player", prompt: "Ember running" }]
};

let settings: Record<string, unknown> = {};
const nodeToolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
const saveWorkflow = jest.fn(async () => {});

/** The node tools the build replays through, recorded rather than executed. */
const recordNodeTool = (name: `ui_${string}`) =>
  FrontendToolRegistry.register({
    name,
    description: name,
    parameters: z.object({}).passthrough(),
    async execute(args) {
      nodeToolCalls.push({ name, args: args as Record<string, unknown> });
      return { ok: true };
    }
  });

const state = (): FrontendToolState =>
  ({
    nodeMetadata: METADATA,
    currentWorkflowId: WORKFLOW,
    getWorkflow: () => ({ id: WORKFLOW, name: "W", settings, graph: null }),
    getNodeStore: () => undefined,
    updateWorkflow: (workflow: { settings: unknown }) => {
      settings = workflow.settings as Record<string, unknown>;
    },
    saveWorkflow
  }) as unknown as FrontendToolState;

let seq = 0;
const call = (name: string, args: Record<string, unknown> = {}) =>
  FrontendToolRegistry.call(name, args, `g${++seq}`, { getState: state });

let unregister: Array<() => boolean> = [];

beforeEach(() => {
  settings = {};
  nodeToolCalls.length = 0;
  saveWorkflow.mockClear();
  unregister = [
    recordNodeTool("ui_add_node"),
    recordNodeTool("ui_update_node_data"),
    recordNodeTool("ui_connect_nodes")
  ];
});

afterEach(() => {
  for (const remove of unregister) {
    remove();
  }
});

describe("ui_game_set_setup", () => {
  it("writes the brief, template, look and stage, and persists them", async () => {
    await call("ui_game_set_setup", {
      brief: "A fox platformer",
      template: "platformer",
      style_entity_id: "e-8bit",
      image_model: "fal_ai:m1",
      project_name: "Ember Run",
      stage: "template"
    });
    expect(readGameSetup(settings)).toMatchObject({
      brief: "A fox platformer",
      template: "platformer",
      style_entity_id: "e-8bit",
      image_model: "fal_ai:m1",
      project_name: "Ember Run",
      stage: "template"
    });
    expect(saveWorkflow).toHaveBeenCalledTimes(1);
  });

  it("leaves the Workflow flow's own settings alone", async () => {
    settings = { setup: { stage: "review" }, hide_ui: true };
    await call("ui_game_set_setup", { brief: "b" });
    expect(settings["setup"]).toEqual({ stage: "review" });
    expect(settings["hide_ui"]).toBe(true);
  });

  it("refuses a call that sets nothing", async () => {
    await expect(call("ui_game_set_setup", {})).rejects.toThrow(
      "Nothing to set"
    );
  });
});

describe("ui_game_design", () => {
  it("stores the design and moves to the review, placing no node", async () => {
    await call("ui_game_set_setup", {
      brief: "A fox platformer",
      template: "platformer",
      stage: "template"
    });
    const result = (await call("ui_game_design", {
      design: DESIGN,
      slot_ids: ["player"]
    })) as { nodes_placed: number; missing: string[] };

    expect(readGameSetup(settings)?.stage).toBe("review");
    expect(readGameSetup(settings)?.design?.title).toBe("Ember Run");
    expect(readGameSetup(settings)?.design_source).toBe(
      "platformer\nA fox platformer"
    );
    expect(result.nodes_placed).toBe(0);
    expect(result.missing).toEqual([]);
    expect(nodeToolCalls).toEqual([]);
  });

  it("reports the slots the design still has no prompt for", async () => {
    await call("ui_game_set_setup", { template: "platformer" });
    const result = (await call("ui_game_design", {
      design: DESIGN,
      slot_ids: ["player", "tiles.ground"]
    })) as { missing: string[] };
    expect(result.missing).toEqual(["slot_prompts.tiles.ground"]);
  });

  it("refuses a design with no template to write it for", async () => {
    await expect(call("ui_game_design", { design: DESIGN })).rejects.toThrow(
      "No template chosen"
    );
  });
});

describe("ui_game_update_design", () => {
  beforeEach(async () => {
    await call("ui_game_set_setup", {
      brief: "A fox platformer",
      template: "platformer"
    });
  });

  it("patches one section without touching the rest", async () => {
    await call("ui_game_design", { design: DESIGN });
    await call("ui_game_update_design", { win: "Light the ember tree." });
    const design = readGameSetup(settings)?.design;
    expect(design?.win).toBe("Light the ember tree.");
    expect(design?.premise).toBe("A fox runs east.");
  });

  it("fills a cast entry the designer skipped", async () => {
    await call("ui_game_design", {
      design: {
        ...DESIGN,
        cast: [{ slot_id: "player", name: "", descriptor: "" }]
      }
    });
    await call("ui_game_update_design", {
      cast: [{ slot_id: "player", name: "Ember", descriptor: "A slim fox." }]
    });
    expect(readGameSetup(settings)?.design?.cast).toEqual([
      { slot_id: "player", name: "Ember", descriptor: "A slim fox." }
    ]);
  });

  it("adds a cast entry for a slot the design has none for", async () => {
    await call("ui_game_design", { design: { ...DESIGN, cast: [] } });
    await call("ui_game_update_design", {
      cast: [{ slot_id: "player", name: "Ember", descriptor: "A slim fox." }]
    });
    expect(readGameSetup(settings)?.design?.cast).toHaveLength(1);
  });

  it("sets a slot prompt the design was missing", async () => {
    await call("ui_game_design", { design: DESIGN });
    await call("ui_game_update_design", {
      slot_prompts: [{ slot_id: "tiles.ground", prompt: "autumn soil" }]
    });
    expect(readGameSetup(settings)?.design?.slot_prompts).toEqual([
      { slot_id: "player", prompt: "Ember running" },
      { slot_id: "tiles.ground", prompt: "autumn soil" }
    ]);
  });

  it("refuses to patch a workflow with no design", async () => {
    await expect(
      call("ui_game_update_design", { win: "x" })
    ).rejects.toThrow("has no game design");
  });
});

describe("ui_game_build", () => {
  const build = (overrides: Record<string, unknown> = {}) =>
    call("ui_game_build", {
      manifest: MANIFEST,
      image_model: { type: "image_model", provider: "fal_ai", id: "m1" },
      style: { name: "8-bit", descriptor: "8-bit pixel art" },
      ...overrides
    });

  beforeEach(async () => {
    await call("ui_game_set_setup", {
      brief: "A fox platformer",
      template: "platformer",
      project_name: "Ember Run"
    });
  });

  // Criterion 4, through the tools: an empty cast entry blocks the build and
  // the refusal names what to fix and with which tool.
  it("refuses a design whose cast or prompts are still empty", async () => {
    await call("ui_game_design", {
      design: {
        ...DESIGN,
        cast: [{ slot_id: "player", name: "Ember", descriptor: "  " }]
      }
    });
    await expect(build()).rejects.toThrow(
      /cast\.player\.descriptor.*ui_game_update_design/s
    );
    expect(nodeToolCalls).toEqual([]);
  });

  it("places the chain, the export node and the output", async () => {
    await call("ui_game_design", { design: DESIGN });
    const result = (await build()) as {
      nodes_placed: number;
      issues: string[];
      directory: string;
    };
    expect(result.issues).toEqual([]);
    // Generate, resize, check, export and the output — no Preview in this
    // registry, so the chain is four plus the output.
    expect(result.nodes_placed).toBe(5);
    expect(result.directory).toBe("games/ember-run");
    expect(readGameSetup(settings)?.stage).toBe("done");
  });

  it("carries the slot id onto the nodes it placed", async () => {
    await call("ui_game_design", { design: DESIGN });
    await build();
    const slots = nodeToolCalls
      .filter((call_) => call_.name === "ui_update_node_data")
      .map(
        (call_) =>
          (call_.args["data"] as Record<string, unknown>)["setupStepId"]
      )
      .filter((value) => value !== undefined);
    expect(slots).toEqual(["player", "player", "player"]);
  });

  it("feeds the export node one dynamic input named by the slot", async () => {
    await call("ui_game_design", { design: DESIGN });
    await build();
    const exportUpdate = nodeToolCalls.find(
      (call_) =>
        call_.name === "ui_update_node_data" &&
        call_.args["node_id"] === "export"
    );
    const data = exportUpdate?.args["data"] as Record<string, unknown>;
    expect(data["dynamic_properties"]).toEqual({ player: "" });
  });

  it("keeps the template's placeholder audio when no model is chosen (D27)", async () => {
    await call("ui_game_design", {
      design: {
        ...DESIGN,
        slot_prompts: [
          ...DESIGN.slot_prompts,
          { slot_id: "sfx.jump", prompt: "a hop" }
        ]
      }
    });
    const result = (await build({
      manifest: {
        ...MANIFEST,
        slots: [
          ...MANIFEST.slots,
          { id: "sfx.jump", kind: "sfx", seconds: 0.4 }
        ]
      }
    })) as { issues: string[] };
    // The audio slot is skipped without an issue: it is a choice, not a gap.
    expect(result.issues).toEqual([]);
    expect(
      nodeToolCalls.some((call_) =>
        JSON.stringify(call_.args).includes("sfx.jump")
      )
    ).toBe(false);
  });
});
