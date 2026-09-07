/**
 * The four headless Game-flow capabilities (game-prd § 5.7, criterion 8).
 *
 * Every criterion has to be reachable with no editor open, so this suite drives
 * the whole journey on a stored row: write the brief and the template, design
 * the game, fix a slot prompt the designer left empty, build the graph, and
 * check what the row holds afterwards.
 *
 * Two rules carry the phase and both are asserted here: `design_game` places no
 * node and, with no provider, falls back to the shipped chip whose brief this
 * is (so a keyless install walks the flow), and `build_game` refuses a design
 * with an empty cast descriptor or slot prompt rather than placing a chain that
 * generates nothing (criterion 4).
 */

import { describe, it, expect, beforeEach } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import { Workflow, initTestDb } from "@nodetool-ai/models";
import {
  GAME_INSPIRATION_CHIPS,
  GAME_PLACEHOLDER_SENTINEL
} from "@nodetool-ai/protocol";
import { readGameSetup } from "@nodetool-ai/protocol/api-schemas/workflows.js";
import { getTemplate } from "@nodetool-ai/godot-templates";
import { createCapabilityRun, UNGATED } from "../src/capabilities/invoke.js";
import { capabilityCategoryFor } from "../src/capabilities/registry.js";

const CHIP = GAME_INSPIRATION_CHIPS[0];

/** One node's metadata, in the shape `planNodeShape` reads. */
function meta(
  nodeType: string,
  properties: Array<[string, string]>,
  outputs: Array<[string, string]>,
  extra: Record<string, unknown> = {}
) {
  return {
    node_type: nodeType,
    title: nodeType,
    description: nodeType,
    namespace: nodeType.split(".").slice(0, -1).join("."),
    properties: properties.map(([name, type]) => ({
      name,
      type: { type, type_args: [] }
    })),
    outputs: outputs.map(([name, type]) => ({
      name,
      type: { type, type_args: [] }
    })),
    ...extra
  };
}

const METADATA: Record<string, unknown> = {
  "nodetool.image.TextToImage": meta(
    "nodetool.image.TextToImage",
    [
      ["model", "image_model"],
      ["prompt", "str"],
      ["aspect_ratio", "str"],
      ["resolution", "str"],
      ["entities", "list"]
    ],
    [["output", "image"]],
    { inline_fields: ["prompt"] }
  ),
  "nodetool.image.ResizeImage": meta(
    "nodetool.image.ResizeImage",
    [
      ["image", "image"],
      ["mode", "str"],
      ["width", "int"],
      ["height", "int"]
    ],
    [["output", "image"]],
    { input_fields: ["image"] }
  ),
  "nodetool.audio.TextToMusic": meta(
    "nodetool.audio.TextToMusic",
    [
      ["model", "music_model"],
      ["prompt", "str"],
      ["duration", "float"]
    ],
    [["audio", "audio"]]
  ),
  "nodetool.game.SpriteSheet": meta(
    "nodetool.game.SpriteSheet",
    [
      ["image", "image"],
      ["cell_width", "int"],
      ["cell_height", "int"],
      ["animations", "dict"],
      ["fps", "int"],
      ["slot_id", "str"]
    ],
    [
      ["output", "image"],
      ["fill", "dict"]
    ],
    { input_fields: ["image"] }
  ),
  "nodetool.game.Tileset": meta(
    "nodetool.game.Tileset",
    [
      ["image", "image"],
      ["cell_width", "int"],
      ["cell_height", "int"],
      ["count", "int"],
      ["slot_id", "str"]
    ],
    [
      ["output", "image"],
      ["fill", "dict"]
    ],
    { input_fields: ["image"] }
  ),
  "nodetool.game.SeamlessImage": meta(
    "nodetool.game.SeamlessImage",
    [
      ["image", "image"],
      ["slot_id", "str"],
      ["check_x", "bool"],
      ["check_y", "bool"]
    ],
    [
      ["output", "image"],
      ["fill", "dict"]
    ],
    { input_fields: ["image"] }
  ),
  "nodetool.game.MusicLoop": meta(
    "nodetool.game.MusicLoop",
    [
      ["audio", "audio"],
      ["slot_id", "str"],
      ["seconds", "float"]
    ],
    [
      ["output", "audio"],
      ["fill", "dict"]
    ],
    { input_fields: ["audio"] }
  ),
  "nodetool.game.ExportGodotProject": meta(
    "nodetool.game.ExportGodotProject",
    [
      ["template", "str"],
      ["name", "str"],
      ["fills", "list[slot_fill]"],
      ["directory", "str"],
      ["verify", "bool"]
    ],
    [
      ["output", "dict"],
      ["directory", "str"],
      ["verified", "bool"],
      ["archive", "str"]
    ],
    { input_fields: ["fills"] }
  ),
  "nodetool.workflows.base_node.Preview": meta(
    "nodetool.workflows.base_node.Preview",
    [
      ["value", "any"],
      ["name", "str"]
    ],
    []
  ),
  "nodetool.output.Output": meta(
    "nodetool.output.Output",
    [
      ["value", "any"],
      ["name", "str"]
    ],
    []
  )
};

const registry = {
  has: (type: string) => type in METADATA,
  getMetadata: (type: string) => METADATA[type],
  validateNode: () => []
} as unknown as NodeRegistry;

const context = { userId: "u1" } as unknown as ProcessingContext;

const run = () =>
  createCapabilityRun({ context, gate: UNGATED, nodeRegistry: registry });

const makeWorkflow = () =>
  Workflow.create<Workflow>({
    user_id: "u1",
    name: "G",
    description: "",
    access: "private",
    graph: { nodes: [], edges: [] },
    run_mode: "workflow"
  });

const reload = async (id: string) =>
  readGameSetup(((await Workflow.get(id)) as Workflow | null)?.settings);

/** The row at the look step, designed from the chip and ready to build. */
async function designedWorkflow(): Promise<string> {
  const row = await makeWorkflow();
  await run().invoke("set_game_setup", {
    workflow_id: row.id,
    brief: CHIP.brief,
    template: CHIP.template,
    image_model: "fal_ai:fal-ai/flux/schnell",
    project_name: "Ember Run",
    stage: "template"
  });
  await run().invoke("design_game", { workflow_id: row.id });
  return row.id;
}

beforeEach(() => initTestDb());

describe("capability shape", () => {
  it("carries the four wire names and the gate's categories", () => {
    for (const name of [
      "set_game_setup",
      "design_game",
      "update_game_design",
      "build_game"
    ]) {
      expect(capabilityCategoryFor(name)).toBe("write");
    }
  });
});

describe("set_game_setup", () => {
  it("round-trips every field it writes", async () => {
    const row = await makeWorkflow();
    const result = (await run().invoke("set_game_setup", {
      workflow_id: row.id,
      brief: CHIP.brief,
      template: "platformer",
      style_entity_id: "style-1",
      image_model: "fal_ai:fal-ai/flux/schnell",
      sfx_node_type: "nodetool.audio.TextToSpeech",
      music_model: "replicate:meta/musicgen",
      project_name: "Ember Run",
      stage: "look"
    })) as { game: Record<string, unknown> };
    expect(result.game).toMatchObject({
      brief: CHIP.brief,
      template: "platformer",
      style_entity_id: "style-1",
      image_model: "fal_ai:fal-ai/flux/schnell",
      sfx_node_type: "nodetool.audio.TextToSpeech",
      music_model: "replicate:meta/musicgen",
      project_name: "Ember Run",
      stage: "look"
    });
    expect(await reload(row.id)).toMatchObject({ stage: "look" });
  });

  it("leaves a field it was not given alone", async () => {
    const row = await makeWorkflow();
    await run().invoke("set_game_setup", {
      workflow_id: row.id,
      brief: CHIP.brief,
      template: "platformer"
    });
    await run().invoke("set_game_setup", { workflow_id: row.id, stage: "look" });
    expect(await reload(row.id)).toMatchObject({
      brief: CHIP.brief,
      template: "platformer",
      stage: "look"
    });
  });

  it("keeps the other settings keys", async () => {
    const row = await makeWorkflow();
    await Workflow.updateFieldsIfUnchanged(row.id, row.updated_at, {
      settings: { hide_ui: true }
    });
    const fresh = (await Workflow.get(row.id)) as Workflow;
    await run().invoke("set_game_setup", {
      workflow_id: fresh.id,
      brief: CHIP.brief
    });
    const settings = ((await Workflow.get(row.id)) as Workflow).settings as
      | Record<string, unknown>
      | undefined;
    expect(settings?.["hide_ui"]).toBe(true);
  });

  it("refuses a workflow that is not yours", async () => {
    const row = await makeWorkflow();
    const other = createCapabilityRun({
      context: { userId: "u2" } as unknown as ProcessingContext,
      gate: UNGATED,
      nodeRegistry: registry
    });
    expect(
      await other.invoke("set_game_setup", { workflow_id: row.id, brief: "x" })
    ).toMatchObject({ error: expect.stringContaining("not yours") });
  });

  it("says what it could have written when given nothing", async () => {
    const row = await makeWorkflow();
    expect(
      await run().invoke("set_game_setup", { workflow_id: row.id })
    ).toMatchObject({ error: expect.stringContaining("Nothing to set") });
  });
});

describe("design_game", () => {
  it("designs from the pinned chip when no model is given, and places no node", async () => {
    const row = await makeWorkflow();
    await run().invoke("set_game_setup", {
      workflow_id: row.id,
      brief: CHIP.brief,
      template: CHIP.template
    });
    const result = (await run().invoke("design_game", {
      workflow_id: row.id
    })) as {
      stage: string;
      design: { title: string; slot_prompts: Array<{ slot_id: string }> };
      filled_from_manifest: string[];
      nodes_placed: number;
    };
    expect(result.stage).toBe("review");
    expect(result.design.title).toBe(CHIP.design.title);
    expect(result.nodes_placed).toBe(0);
    // The chip covers its whole template, so nothing is filled from it.
    expect(result.filled_from_manifest).toEqual([]);
    const manifest = getTemplate(CHIP.template).manifest;
    expect(result.design.slot_prompts.map((entry) => entry.slot_id).sort()).toEqual(
      manifest.slots.map((slot) => slot.id).sort()
    );
    const saved = await reload(row.id);
    expect(saved?.stage).toBe("review");
    expect(saved?.design_source).toBe(`${CHIP.template}\n${CHIP.brief}`);
    // Criterion 3's sibling: the design is text, the graph is untouched.
    expect(((await Workflow.get(row.id)) as Workflow).graph).toEqual({
      nodes: [],
      edges: []
    });
  });

  it("fills a slot the supplied design skipped, and reports it", async () => {
    const row = await makeWorkflow();
    await run().invoke("set_game_setup", {
      workflow_id: row.id,
      brief: CHIP.brief,
      template: CHIP.template
    });
    const result = (await run().invoke("design_game", {
      workflow_id: row.id,
      design: {
        ...CHIP.design,
        slot_prompts: CHIP.design.slot_prompts.filter(
          (entry) => entry.slot_id !== "title"
        )
      }
    })) as { filled_from_manifest: string[] };
    expect(result.filled_from_manifest).toContain("slot_prompts.title");
  });

  it("says what it needs when the brief matches no chip and no model was given", async () => {
    const row = await makeWorkflow();
    await run().invoke("set_game_setup", {
      workflow_id: row.id,
      brief: "a game about nothing in particular",
      template: "platformer"
    });
    expect(
      await run().invoke("design_game", { workflow_id: row.id })
    ).toMatchObject({ error: expect.stringContaining("provider and model") });
  });

  it("refuses to design before a template is picked", async () => {
    const row = await makeWorkflow();
    await run().invoke("set_game_setup", { workflow_id: row.id, brief: "x" });
    expect(
      await run().invoke("design_game", { workflow_id: row.id })
    ).toMatchObject({ error: expect.stringContaining("no game template") });
  });
});

describe("update_game_design", () => {
  it("merges a cast entry and a slot prompt by slot_id", async () => {
    const id = await designedWorkflow();
    const result = (await run().invoke("update_game_design", {
      workflow_id: id,
      title: "Ember Dash",
      cast: [{ slot_id: "player", name: "Vix" }],
      slot_prompts: [{ slot_id: "title", prompt: "a title card" }]
    })) as {
      design: {
        title: string;
        cast: Array<{ slot_id: string; name: string; descriptor: string }>;
        slot_prompts: Array<{ slot_id: string; prompt: string }>;
      };
    };
    expect(result.design.title).toBe("Ember Dash");
    const player = result.design.cast.find((c) => c.slot_id === "player");
    expect(player?.name).toBe("Vix");
    // A merge keeps the field it was not given.
    expect(player?.descriptor).toBe(
      CHIP.design.cast.find((c) => c.slot_id === "player")?.descriptor
    );
    expect(
      result.design.slot_prompts.find((p) => p.slot_id === "title")?.prompt
    ).toBe("a title card");
    expect((await reload(id))?.design?.title).toBe("Ember Dash");
  });

  it("reports the gap it left when a prompt is emptied", async () => {
    const id = await designedWorkflow();
    const result = (await run().invoke("update_game_design", {
      workflow_id: id,
      slot_prompts: [{ slot_id: "title", prompt: "  " }]
    })) as { gaps: string[] };
    expect(result.gaps).toEqual(['slot "title" has no prompt']);
  });

  it("refuses before there is a design", async () => {
    const row = await makeWorkflow();
    expect(
      await run().invoke("update_game_design", {
        workflow_id: row.id,
        title: "x"
      })
    ).toMatchObject({ error: expect.stringContaining("no game design") });
  });
});

describe("build_game", () => {
  it("builds the slot graph and writes it on the row", async () => {
    const id = await designedWorkflow();
    const result = (await run().invoke("build_game", {
      workflow_id: id
    })) as {
      saved: boolean;
      stage: string;
      node_count: number;
      directory: string;
      issues: string[];
      graph: { nodes: Array<{ type: string; id: string }> };
    };
    expect(result.issues).toEqual([]);
    expect(result.saved).toBe(true);
    expect(result.stage).toBe("done");
    expect(result.directory).toBe("games/ember-run");
    const types = result.graph.nodes.map((node) => node.type);
    expect(types).toContain("nodetool.game.ExportGodotProject");
    expect(types).toContain("nodetool.image.TextToImage");
    expect(result.node_count).toBe(result.graph.nodes.length);
    expect((await reload(id))?.stage).toBe("done");
    const graph = ((await Workflow.get(id)) as Workflow).graph as {
      nodes: unknown[];
    };
    expect(graph.nodes.length).toBe(result.node_count);
  });

  it("does not touch the row when save is false", async () => {
    const id = await designedWorkflow();
    await run().invoke("build_game", { workflow_id: id, save: false });
    expect((await reload(id))?.stage).toBe("review");
    expect(((await Workflow.get(id)) as Workflow).graph).toEqual({
      nodes: [],
      edges: []
    });
  });

  it("refuses a design with an empty slot prompt, naming it", async () => {
    const id = await designedWorkflow();
    await run().invoke("update_game_design", {
      workflow_id: id,
      slot_prompts: [{ slot_id: "title", prompt: "" }]
    });
    const result = (await run().invoke("build_game", {
      workflow_id: id
    })) as { error: string; gaps: string[] };
    expect(result.error).toContain('slot "title" has no prompt');
    expect(result.gaps).toEqual(['slot "title" has no prompt']);
    expect((await reload(id))?.stage).toBe("review");
  });

  it("refuses without an image model rather than picking one", async () => {
    const row = await makeWorkflow();
    await run().invoke("set_game_setup", {
      workflow_id: row.id,
      brief: CHIP.brief,
      template: CHIP.template
    });
    await run().invoke("design_game", { workflow_id: row.id });
    expect(await run().invoke("build_game", { workflow_id: row.id })).toMatchObject(
      { error: expect.stringContaining("No image model is chosen") }
    );
  });

  // What the Look step saves when the creator keeps the template's own audio:
  // the placeholder tile id, on both rows. It is an answer, not an absence, so
  // the headless builder has to read it as one (D27).
  it("builds a browser setup that kept the placeholder audio", async () => {
    const id = await designedWorkflow();
    await run().invoke("set_game_setup", {
      workflow_id: id,
      sfx_node_type: GAME_PLACEHOLDER_SENTINEL,
      music_model: GAME_PLACEHOLDER_SENTINEL
    });
    const result = (await run().invoke("build_game", {
      workflow_id: id
    })) as {
      issues: string[];
      graph: { nodes: Array<{ type: string }> };
    };
    expect(result.issues).toEqual([]);
    const types = result.graph.nodes.map((node) => node.type);
    expect(types).toContain("nodetool.game.ExportGodotProject");
    expect(types).not.toContain("nodetool.audio.TextToMusic");
    expect(types).not.toContain("nodetool.game.MusicLoop");
    expect(types).not.toContain(GAME_PLACEHOLDER_SENTINEL);
    expect(types).not.toContain("nodetool.game.SoundEffect");
  });

  it("adds the music chain when a music model is chosen", async () => {
    const id = await designedWorkflow();
    await run().invoke("set_game_setup", {
      workflow_id: id,
      music_model: "replicate:meta/musicgen"
    });
    const result = (await run().invoke("build_game", {
      workflow_id: id
    })) as { issues: string[]; graph: { nodes: Array<{ type: string }> } };
    expect(result.issues).toEqual([]);
    expect(result.graph.nodes.map((node) => node.type)).toContain(
      "nodetool.audio.TextToMusic"
    );
  });
});
