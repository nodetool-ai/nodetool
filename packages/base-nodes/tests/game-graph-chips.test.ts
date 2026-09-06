/**
 * Criterion 5 of game-prd § 8: every shipped inspiration chip's design builds a
 * graph that fills every slot its template needs and passes the same static
 * check `validate_workflow` runs.
 *
 * It lives here because it needs the real node registry, and this is the
 * package that has one. The builder names real nodes — `nodetool.image.TextToImage`,
 * `nodetool.image.ResizeImage`, the five `nodetool.game` checkers and
 * `nodetool.game.ExportGodotProject` — so a node renamed or dropped has to fail
 * here rather than in front of a creator on their first click.
 *
 * Validation is not the whole bar: a graph can validate and export a project
 * with holes in it. `issues` being empty is the other half, and the game-nodes
 * suite grades what the export node actually writes.
 */

import { describe, expect, it } from "vitest";
import { NodeRegistry, validateGraph } from "@nodetool-ai/node-sdk";
import {
  GAME_INSPIRATION_CHIPS,
  gameGraphPlacement,
  gameProjectDirectory,
  planNodeShape,
  type GameGraphChoices,
  type WorkflowPlacement
} from "@nodetool-ai/protocol";
import { getTemplate } from "@nodetool-ai/godot-templates";
import { registerBaseNodes } from "../src/index.js";

const registry = new NodeRegistry();
registerBaseNodes(registry);

const lookup = (nodeType: string) => {
  const meta = registry.getMetadata(nodeType);
  return meta ? planNodeShape(meta) : null;
};

/** The models and style the Look step (game-prd § 4.3) would have chosen. */
const IMAGE_MODEL = {
  type: "image_model",
  provider: "fake",
  id: "fake",
  name: "fake",
  path: null
};

const MUSIC_MODEL = {
  type: "music_model",
  provider: "fake",
  id: "fake-music",
  name: "fake-music",
  path: null
};

const STYLE = {
  name: "16-bit console",
  descriptor: "16-bit console pixel art on a 32px cell, four-shade ramps"
};

function choicesFor(
  projectName: string,
  overrides: Partial<GameGraphChoices> = {}
): GameGraphChoices {
  return {
    imageModel: IMAGE_MODEL,
    sfxNodeType: null,
    musicModel: null,
    style: STYLE,
    projectName,
    directory: gameProjectDirectory(projectName),
    verify: true,
    ...overrides
  };
}

function validate(placement: WorkflowPlacement) {
  const graph = {
    nodes: placement.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      data: node.properties,
      ui_properties: { position: node.position, setup_step_id: node.setupStepId },
      dynamic_properties: node.dynamicProperties ?? {},
      dynamic_outputs: {}
    })),
    edges: placement.edges.map((edge, index) => ({ id: `e${index}`, ...edge }))
  };
  return validateGraph(graph, {
    has: (type: string) => registry.has(type),
    getMetadata: (type: string) => registry.getMetadata(type),
    validateNode: (
      descriptor: Parameters<typeof registry.validateNode>[0],
      handles: Parameters<typeof registry.validateNode>[1]
    ) => registry.validateNode(descriptor, handles)
  });
}

const errorsOf = (report: ReturnType<typeof validate>) =>
  report.issues
    .filter((issue) => issue.severity === "error")
    .map((issue) => issue.message);

describe("shipped game inspiration chips", () => {
  it("ships one chip per shipped template", () => {
    expect(GAME_INSPIRATION_CHIPS.map((chip) => chip.template)).toEqual([
      "platformer",
      "topdown",
      "shmup"
    ]);
  });

  for (const chip of GAME_INSPIRATION_CHIPS) {
    const manifest = getTemplate(chip.template).manifest;

    it(`"${chip.brief}" builds every visual slot with nothing left unwired`, () => {
      const placement = gameGraphPlacement(
        manifest,
        chip.design,
        choicesFor(chip.design.title),
        lookup
      );
      expect(placement.issues).toEqual([]);
      // Audio is placeholder-kept here (D27); every other slot gets a chain.
      const visual = manifest.slots.filter(
        (slot) => slot.kind !== "sfx" && slot.kind !== "music"
      );
      const exported = placement.nodes.find(
        (node) => node.type === "nodetool.game.ExportGodotProject"
      );
      expect(Object.keys(exported?.dynamicProperties ?? {}).sort()).toEqual(
        visual.map((slot) => slot.id).sort()
      );
    });

    it(`"${chip.brief}" builds a graph that validates`, () => {
      const placement = gameGraphPlacement(
        manifest,
        chip.design,
        choicesFor(chip.design.title),
        lookup
      );
      const report = validate(placement);
      expect(errorsOf(report)).toEqual([]);
      expect(report.ok).toBe(true);
    });

    it(`"${chip.brief}" feeds the export node from every checker it placed`, () => {
      const placement = gameGraphPlacement(
        manifest,
        chip.design,
        choicesFor(chip.design.title),
        lookup
      );
      // A checker whose fill reaches no export input is the R6 shape exactly:
      // the graph validates, the run generates art, and the project has a hole.
      const intoExport = new Set(
        placement.edges
          .filter((edge) => edge.target === "export")
          .map((edge) => edge.source)
      );
      for (const node of placement.nodes) {
        if (!node.type.startsWith("nodetool.game.")) continue;
        if (node.type === "nodetool.game.ExportGodotProject") continue;
        expect(intoExport.has(node.id), node.id).toBe(true);
      }
    });
  }

  it("builds the music chain when a music model is chosen", () => {
    const chip = GAME_INSPIRATION_CHIPS[0];
    const manifest = getTemplate(chip.template).manifest;
    const placement = gameGraphPlacement(
      manifest,
      chip.design,
      choicesFor(chip.design.title, { musicModel: MUSIC_MODEL }),
      lookup
    );
    expect(placement.issues).toEqual([]);
    expect(placement.nodes.map((node) => node.type)).toContain(
      "nodetool.audio.TextToMusic"
    );
    expect(placement.nodes.map((node) => node.type)).toContain(
      "nodetool.game.MusicLoop"
    );
    const music = manifest.slots.filter((slot) => slot.kind === "music");
    expect(music.length).toBeGreaterThan(0);
    const exported = placement.nodes.find(
      (node) => node.type === "nodetool.game.ExportGodotProject"
    );
    for (const slot of music) {
      expect(Object.keys(exported?.dynamicProperties ?? {})).toContain(slot.id);
    }
    expect(errorsOf(validate(placement))).toEqual([]);
  });

  it("reports a slot whose node type the registry lost, and places nothing for it", () => {
    const chip = GAME_INSPIRATION_CHIPS[0];
    const manifest = getTemplate(chip.template).manifest;
    const placement = gameGraphPlacement(
      manifest,
      chip.design,
      choicesFor(chip.design.title),
      (type) => (type === "nodetool.image.ResizeImage" ? null : lookup(type))
    );
    expect(placement.issues.length).toBeGreaterThan(0);
    expect(placement.nodes.map((node) => node.type)).not.toContain(
      "nodetool.image.TextToImage"
    );
  });
});
