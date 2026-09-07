import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { gameDesign, type GameDesign } from "../src/api-schemas/workflows.js";
import { gameAssetManifest } from "../src/game-assets.js";
import { GAME_INSPIRATION_CHIPS } from "../src/game-design.js";
import {
  GAME_EXPORT_NODE_TYPE,
  GAME_MUSIC_LOOP_NODE_TYPE,
  GAME_PREVIEW_NODE_TYPE,
  GAME_PROJECT_OUTPUT_NAME,
  GAME_RESIZE_NODE_TYPE,
  GAME_SEAMLESS_IMAGE_NODE_TYPE,
  GAME_SOUND_EFFECT_NODE_TYPE,
  GAME_SPRITESHEET_NODE_TYPE,
  GAME_TEXT_TO_IMAGE_NODE_TYPE,
  GAME_TEXT_TO_MUSIC_NODE_TYPE,
  GAME_TILESET_NODE_TYPE,
  GAME_PLACEHOLDER_SENTINEL,
  gameAudioChoice,
  gameGraphPlacement,
  gameProjectDirectory,
  gameProjectSlug,
  type GameGraphChoices
} from "../src/game-graph.js";
import {
  PLAN_OUTPUT_NODE_TYPE,
  type PlanNodeLookup,
  type PlanNodeShape,
  type WorkflowPlacement
} from "../src/workflow-plan.js";

const manifestOf = (template: string) =>
  gameAssetManifest.parse(
    JSON.parse(
      readFileSync(
        fileURLToPath(
          new URL(
            `../../godot-templates/templates/${template}/manifest.json`,
            import.meta.url
          )
        ),
        "utf8"
      )
    )
  );

const SFX_NODE_TYPE = "fal.text_to_audio.ElevenLabsSoundEffectsV2";

/** The handles these node types really declare, read off their sources. */
const SHAPES: Record<string, PlanNodeShape> = {
  [GAME_TEXT_TO_IMAGE_NODE_TYPE]: {
    inputs: [
      { name: "prompt", type: "str" },
      { name: "model", type: "image_model" },
      { name: "negative_prompt", type: "str" },
      { name: "entities", type: "list[dict]" },
      { name: "aspect_ratio", type: "str" },
      { name: "resolution", type: "str" }
    ],
    outputs: [{ name: "output", type: "image" }]
  },
  [GAME_RESIZE_NODE_TYPE]: {
    inputs: [
      { name: "image", type: "image" },
      { name: "width", type: "int" },
      { name: "height", type: "int" }
    ],
    outputs: [{ name: "output", type: "image" }]
  },
  [GAME_SPRITESHEET_NODE_TYPE]: {
    inputs: [
      { name: "image", type: "image" },
      { name: "cell_width", type: "int" },
      { name: "cell_height", type: "int" },
      { name: "animations", type: "dict" },
      { name: "fps", type: "int" },
      { name: "slot_id", type: "str" },
      { name: "loop", type: "dict" }
    ],
    outputs: [
      { name: "output", type: "image" },
      { name: "fill", type: "dict" }
    ]
  },
  [GAME_TILESET_NODE_TYPE]: {
    inputs: [
      { name: "image", type: "image" },
      { name: "cell_width", type: "int" },
      { name: "cell_height", type: "int" },
      { name: "count", type: "int" },
      { name: "slot_id", type: "str" }
    ],
    outputs: [
      { name: "output", type: "image" },
      { name: "fill", type: "dict" }
    ]
  },
  [GAME_SEAMLESS_IMAGE_NODE_TYPE]: {
    inputs: [
      { name: "image", type: "image" },
      { name: "slot_id", type: "str" },
      { name: "check_x", type: "bool" },
      { name: "check_y", type: "bool" },
      { name: "threshold", type: "float" }
    ],
    outputs: [
      { name: "output", type: "image" },
      { name: "fill", type: "dict" }
    ]
  },
  [GAME_SOUND_EFFECT_NODE_TYPE]: {
    inputs: [
      { name: "audio", type: "audio" },
      { name: "slot_id", type: "str" },
      { name: "seconds", type: "float" },
      { name: "trim", type: "bool" }
    ],
    outputs: [
      { name: "output", type: "audio" },
      { name: "fill", type: "dict" }
    ]
  },
  [GAME_MUSIC_LOOP_NODE_TYPE]: {
    inputs: [
      { name: "audio", type: "audio" },
      { name: "slot_id", type: "str" },
      { name: "seconds", type: "float" },
      { name: "crossfade_ms", type: "int" },
      { name: "trim", type: "bool" }
    ],
    outputs: [
      { name: "output", type: "audio" },
      { name: "fill", type: "dict" }
    ]
  },
  [GAME_TEXT_TO_MUSIC_NODE_TYPE]: {
    inputs: [
      { name: "prompt", type: "str" },
      { name: "lyrics", type: "str" },
      { name: "model", type: "music_model" },
      { name: "duration", type: "float" }
    ],
    outputs: [{ name: "audio", type: "audio" }]
  },
  [SFX_NODE_TYPE]: {
    inputs: [
      { name: "text", type: "str" },
      { name: "duration_seconds", type: "str" },
      { name: "output_format", type: "str" }
    ],
    outputs: [{ name: "output", type: "audio" }]
  },
  [GAME_EXPORT_NODE_TYPE]: {
    inputs: [
      { name: "template", type: "str" },
      { name: "name", type: "str" },
      { name: "fills", type: "list[slot_fill]" },
      { name: "directory", type: "str" },
      { name: "verify", type: "bool" }
    ],
    outputs: [
      { name: "output", type: "dict" },
      { name: "directory", type: "str" },
      { name: "archive", type: "str" }
    ]
  },
  [PLAN_OUTPUT_NODE_TYPE]: {
    inputs: [{ name: "value", type: "any" }],
    outputs: []
  },
  [GAME_PREVIEW_NODE_TYPE]: {
    inputs: [
      { name: "value", type: "any" },
      { name: "name", type: "str" }
    ],
    outputs: [{ name: "output", type: "any" }]
  }
};

/** The checker node placed for one slot: the one with a `fill` handle. */
const checkerFor = (
  placement: { nodes: readonly { id: string; type: string; setupStepId?: string }[] },
  slotId: string
) =>
  placement.nodes.find(
    (node) =>
      node.setupStepId === slotId &&
      node.type !== GAME_PREVIEW_NODE_TYPE &&
      Boolean(SHAPES[node.type]?.outputs.find((out) => out.name === "fill"))
  )!;

/** The slot ids whose checker feeds the export node's `fills` input, in order. */
const fillSources = (
  placement: {
    nodes: readonly { id: string; type: string; setupStepId?: string }[];
    edges: readonly {
      source: string;
      target: string;
      targetHandle: string;
    }[];
  },
  exportId: string
): string[] =>
  placement.edges
    .filter((edge) => edge.target === exportId && edge.targetHandle === "fills")
    .map(
      (edge) =>
        placement.nodes.find((node) => node.id === edge.source)?.setupStepId ?? ""
    );

const lookupWithout =
  (...missing: string[]): PlanNodeLookup =>
  (type) =>
    missing.includes(type) ? null : (SHAPES[type] ?? null);

const lookup = lookupWithout();

const choices = (over: Partial<GameGraphChoices> = {}): GameGraphChoices => ({
  imageModel: { type: "image_model", provider: "fal_ai", id: "fal-ai/flux/schnell" },
  sfxNodeType: SFX_NODE_TYPE,
  musicModel: { type: "music_model", provider: "replicate", id: "meta/musicgen" },
  style: { name: "16-bit console", descriptor: "16-bit console pixel art" },
  projectName: "Ember Run",
  directory: gameProjectDirectory("Ember Run"),
  verify: true,
  ...over
});

const chipDesign = (template: string): GameDesign =>
  gameDesign.parse(
    GAME_INSPIRATION_CHIPS.find((chip) => chip.template === template)!.design
  );

const platformer = manifestOf("platformer");
const design = chipDesign("platformer");

const typesOf = (placement: WorkflowPlacement, slotId: string): string[] =>
  placement.nodes
    .filter((node) => node.setupStepId === slotId)
    .map((node) => node.type);

describe("gameGraphPlacement", () => {
  it("builds one chain per slot kind, with nothing left to report", () => {
    const placement = gameGraphPlacement(platformer, design, choices(), lookup);
    expect(placement.issues).toEqual([]);

    expect(typesOf(placement, "player")).toEqual([
      GAME_TEXT_TO_IMAGE_NODE_TYPE,
      GAME_RESIZE_NODE_TYPE,
      GAME_SPRITESHEET_NODE_TYPE,
      GAME_PREVIEW_NODE_TYPE
    ]);
    expect(typesOf(placement, "tiles.ground")).toEqual([
      GAME_TEXT_TO_IMAGE_NODE_TYPE,
      GAME_RESIZE_NODE_TYPE,
      GAME_TILESET_NODE_TYPE,
      GAME_PREVIEW_NODE_TYPE
    ]);
    expect(typesOf(placement, "bg.far")).toEqual([
      GAME_TEXT_TO_IMAGE_NODE_TYPE,
      GAME_RESIZE_NODE_TYPE,
      GAME_SEAMLESS_IMAGE_NODE_TYPE,
      GAME_PREVIEW_NODE_TYPE
    ]);
    expect(typesOf(placement, "sfx.jump")).toEqual([
      SFX_NODE_TYPE,
      GAME_SOUND_EFFECT_NODE_TYPE,
      GAME_PREVIEW_NODE_TYPE
    ]);
    expect(typesOf(placement, "music.level")).toEqual([
      GAME_TEXT_TO_MUSIC_NODE_TYPE,
      GAME_MUSIC_LOOP_NODE_TYPE,
      GAME_PREVIEW_NODE_TYPE
    ]);
  });

  it("configures the generator from the slot and the choices", () => {
    const placement = gameGraphPlacement(platformer, design, choices(), lookup);
    const generator = placement.nodes.find(
      (node) =>
        node.setupStepId === "player" && node.type === GAME_TEXT_TO_IMAGE_NODE_TYPE
    )!;
    expect(generator.properties["model"]).toEqual(choices().imageModel);
    expect(generator.properties["aspect_ratio"]).toBe("16:9");
    expect(generator.properties["resolution"]).toBe("1K");
    expect(generator.properties["entities"]).toEqual([
      {
        type: "entity",
        kind: "style",
        name: "16-bit console",
        descriptor: "16-bit console pixel art"
      },
      {
        type: "entity",
        kind: "character",
        name: "Ember",
        descriptor: expect.stringContaining("fox")
      }
    ]);
    expect(String(generator.properties["prompt"])).toContain(
      "16-bit console pixel art"
    );

    const resize = placement.nodes.find(
      (node) => node.setupStepId === "player" && node.type === GAME_RESIZE_NODE_TYPE
    )!;
    expect(resize.properties).toMatchObject({ width: 256, height: 128 });

    const checker = placement.nodes.find(
      (node) => node.type === GAME_SPRITESHEET_NODE_TYPE
    )!;
    expect(checker.properties).toMatchObject({
      slot_id: "player",
      cell_width: 32,
      cell_height: 32,
      fps: 8,
      animations: { idle: 4, run: 8, jump: 2, hurt: 2 }
    });
  });

  it("asks for a resolution that covers the slot's short edge", () => {
    const placement = gameGraphPlacement(platformer, design, choices(), lookup);
    const title = placement.nodes.find(
      (node) =>
        node.setupStepId === "title" && node.type === GAME_TEXT_TO_IMAGE_NODE_TYPE
    )!;
    expect(title.properties["resolution"]).toBe("2K");
  });

  it("matches the sound-effect node's own handle names and types", () => {
    const placement = gameGraphPlacement(platformer, design, choices(), lookup);
    const generator = placement.nodes.find((node) => node.type === SFX_NODE_TYPE)!;
    expect(Object.keys(generator.properties).sort()).toEqual([
      "duration_seconds",
      "text"
    ]);
    expect(generator.properties["duration_seconds"]).toBe("0.4");
  });

  it("omits an audio chain the creator did not choose, and says nothing about it", () => {
    const placement = gameGraphPlacement(
      platformer,
      design,
      choices({ sfxNodeType: null, musicModel: null }),
      lookup
    );
    expect(placement.issues).toEqual([]);
    expect(typesOf(placement, "sfx.jump")).toEqual([]);
    expect(typesOf(placement, "music.level")).toEqual([]);
    const exportNode = placement.nodes.find(
      (node) => node.type === GAME_EXPORT_NODE_TYPE
    )!;
    expect(fillSources(placement, exportNode.id)).toEqual([
      "player",
      "enemy.walker",
      "tiles.ground",
      "bg.far",
      "title"
    ]);
  });

  it("feeds the export node's fills list from every checker's stamped output", () => {
    const placement = gameGraphPlacement(platformer, design, choices(), lookup);
    const exportNode = placement.nodes.find(
      (node) => node.type === GAME_EXPORT_NODE_TYPE
    )!;
    expect(exportNode.dynamicProperties).toBeUndefined();
    expect(exportNode.properties).toMatchObject({
      template: "platformer",
      name: "Ember Run",
      directory: "games/ember-run",
      verify: true
    });

    // One edge per slot, all onto the one list input the kernel folds.
    expect(fillSources(placement, exportNode.id)).toEqual(
      platformer.slots.map((slot) => slot.id)
    );
    for (const slot of platformer.slots) {
      const checker = checkerFor(placement, slot.id);
      expect(
        placement.edges.filter(
          (edge) => edge.source === checker.id && edge.target === exportNode.id
        )
      ).toEqual([
        {
          source: checker.id,
          sourceHandle: "output",
          target: exportNode.id,
          targetHandle: "fills"
        }
      ]);
    }

    // Nothing else reaches the export node.
    const checkerIds = new Set(
      platformer.slots.map((slot) => checkerFor(placement, slot.id).id)
    );
    for (const edge of placement.edges.filter(
      (candidate) => candidate.target === exportNode.id
    )) {
      expect(checkerIds.has(edge.source)).toBe(true);
    }
  });

  it("lands the export result on an Output named project", () => {
    const placement = gameGraphPlacement(platformer, design, choices(), lookup);
    const output = placement.nodes.find(
      (node) => node.type === PLAN_OUTPUT_NODE_TYPE
    )!;
    expect(output.properties["name"]).toBe(GAME_PROJECT_OUTPUT_NAME);
    expect(output.setupStepId).toBeUndefined();
    expect(
      placement.edges.some(
        (edge) => edge.target === output.id && edge.targetHandle === "value"
      )
    ).toBe(true);
  });

  it("reports an unknown node type and places nothing for that slot", () => {
    const placement = gameGraphPlacement(
      platformer,
      design,
      choices(),
      lookupWithout(GAME_TILESET_NODE_TYPE)
    );
    expect(typesOf(placement, "tiles.ground")).toEqual([]);
    expect(placement.issues).toEqual([
      expect.stringContaining(GAME_TILESET_NODE_TYPE)
    ]);
    const exportNode = placement.nodes.find(
      (node) => node.type === GAME_EXPORT_NODE_TYPE
    )!;
    expect(fillSources(placement, exportNode.id)).not.toContain("tiles.ground");
  });

  it("reports a missing export node and places no output", () => {
    const placement = gameGraphPlacement(
      platformer,
      design,
      choices(),
      lookupWithout(GAME_EXPORT_NODE_TYPE)
    );
    expect(placement.issues).toEqual([
      expect.stringContaining(GAME_EXPORT_NODE_TYPE)
    ]);
    expect(
      placement.nodes.some((node) => node.type === PLAN_OUTPUT_NODE_TYPE)
    ).toBe(false);
  });

  it("omits a sound-effect chain whose generator has no prompt input", () => {
    const noPrompt: PlanNodeLookup = (type) =>
      type === SFX_NODE_TYPE
        ? { inputs: [], outputs: [{ name: "output", type: "audio" }] }
        : (SHAPES[type] ?? null);
    const placement = gameGraphPlacement(platformer, design, choices(), noPrompt);
    expect(typesOf(placement, "sfx.jump")).toEqual([]);
    expect(placement.issues.some((issue) => issue.includes("prompt input"))).toBe(
      true
    );
  });

  it("omits a sound-effect chain whose generator has no audio output", () => {
    const noAudio: PlanNodeLookup = (type) =>
      type === SFX_NODE_TYPE
        ? {
            inputs: [{ name: "prompt", type: "str" }],
            outputs: [{ name: "output", type: "str" }]
          }
        : (SHAPES[type] ?? null);
    const placement = gameGraphPlacement(platformer, design, choices(), noAudio);
    expect(typesOf(placement, "sfx.jump")).toEqual([]);
    expect(placement.issues.some((issue) => issue.includes("audio output"))).toBe(
      true
    );
  });

  // Every placement this builder can produce, so a dangling edge cannot slip in
  // behind a case nobody wrote a test for.
  const CASES: [string, WorkflowPlacement][] = [
    ["platformer, everything chosen", gameGraphPlacement(platformer, design, choices(), lookup)],
    [
      "platformer, placeholder audio",
      gameGraphPlacement(
        platformer,
        design,
        choices({ sfxNodeType: null, musicModel: null }),
        lookup
      )
    ],
    [
      "platformer, no style",
      gameGraphPlacement(platformer, design, choices({ style: null }), lookup)
    ],
    [
      "topdown chip",
      gameGraphPlacement(manifestOf("topdown"), chipDesign("topdown"), choices(), lookup)
    ],
    [
      "shmup chip",
      gameGraphPlacement(manifestOf("shmup"), chipDesign("shmup"), choices(), lookup)
    ],
    [
      "tileset node missing",
      gameGraphPlacement(
        platformer,
        design,
        choices(),
        lookupWithout(GAME_TILESET_NODE_TYPE)
      )
    ],
    [
      "resize node missing",
      gameGraphPlacement(
        platformer,
        design,
        choices(),
        lookupWithout(GAME_RESIZE_NODE_TYPE)
      )
    ],
    [
      "preview node missing",
      gameGraphPlacement(
        platformer,
        design,
        choices(),
        lookupWithout(GAME_PREVIEW_NODE_TYPE)
      )
    ],
    [
      "export node missing",
      gameGraphPlacement(
        platformer,
        design,
        choices(),
        lookupWithout(GAME_EXPORT_NODE_TYPE)
      )
    ],
    [
      "output node missing",
      gameGraphPlacement(
        platformer,
        design,
        choices(),
        lookupWithout(PLAN_OUTPUT_NODE_TYPE)
      )
    ]
  ];

  for (const [name, placement] of CASES) {
    it(`${name}: no edge references a node that was not placed`, () => {
      const placed = new Set(placement.nodes.map((node) => node.id));
      for (const edge of placement.edges) {
        expect(placed.has(edge.source), `source ${edge.source}`).toBe(true);
        expect(placed.has(edge.target), `target ${edge.target}`).toBe(true);
      }
    });

    it(`${name}: node ids are unique and every slot node names its slot`, () => {
      expect(new Set(placement.nodes.map((node) => node.id)).size).toBe(
        placement.nodes.length
      );
      for (const node of placement.nodes) {
        if (
          node.type === GAME_EXPORT_NODE_TYPE ||
          node.type === PLAN_OUTPUT_NODE_TYPE
        ) {
          expect(node.setupStepId).toBeUndefined();
        } else {
          expect(node.setupStepId).toBeTruthy();
        }
      }
    });
  }
});

describe("gameProjectSlug", () => {
  it("makes a directory-safe segment out of a title", () => {
    expect(gameProjectSlug("Ember Run")).toBe("ember-run");
    expect(gameProjectSlug("  The Green Key!  ")).toBe("the-green-key");
    expect(gameProjectSlug("Downpour: Neon City")).toBe("downpour-neon-city");
    expect(gameProjectSlug("Café Noir")).toBe("cafe-noir");
    expect(gameProjectSlug("../../etc/passwd")).toBe("etc-passwd");
  });

  it("falls back to game rather than to an empty segment", () => {
    expect(gameProjectSlug("")).toBe("game");
    expect(gameProjectSlug("!!!")).toBe("game");
  });

  it("exports under games/", () => {
    expect(gameProjectDirectory("Ember Run")).toBe("games/ember-run");
    expect(gameProjectDirectory("")).toBe("games/game");
  });
});

describe("gameAudioChoice", () => {
  it("reads the placeholder tile as nothing to generate", () => {
    expect(gameAudioChoice(GAME_PLACEHOLDER_SENTINEL)).toBeNull();
  });

  it("reads an absent or blank answer as the placeholder too", () => {
    expect(gameAudioChoice(undefined)).toBeNull();
    expect(gameAudioChoice(null)).toBeNull();
    expect(gameAudioChoice("   ")).toBeNull();
  });

  it("hands a real model id or node type through, trimmed", () => {
    expect(gameAudioChoice("replicate:meta/musicgen")).toBe(
      "replicate:meta/musicgen"
    );
    expect(gameAudioChoice("  fal.text_to_audio.SoundEffect  ")).toBe(
      "fal.text_to_audio.SoundEffect"
    );
  });
});
