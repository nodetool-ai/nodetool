import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { gameDesign } from "../src/api-schemas/workflows.js";
import { gameAssetManifest } from "../src/game-assets.js";
import {
  GAME_DESIGNER_SYSTEM_PROMPT,
  GAME_DESIGN_TOOL_DESCRIPTION,
  GAME_DESIGN_TOOL_NAME,
  GAME_INSPIRATION_CHIPS,
  buildGameDesignSchema,
  designSourceOf,
  parseGameDesign
} from "../src/game-design.js";

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

const platformer = manifestOf("platformer");

const enumOf = (schema: Record<string, unknown>, path: string): string[] => {
  const properties = schema["properties"] as Record<string, any>;
  return properties[path]["items"]["properties"]["slot_id"]["enum"] as string[];
};

describe("the designer contract", () => {
  it("names itself and says what it returns", () => {
    expect(GAME_DESIGN_TOOL_NAME).toBe("game_design");
    expect(GAME_DESIGN_TOOL_DESCRIPTION.length).toBeGreaterThan(0);
    expect(GAME_DESIGNER_SYSTEM_PROMPT).toContain("SUBJECT ONLY");
  });

  it("pins the manifest's slot ids so a model cannot invent one", () => {
    const schema = buildGameDesignSchema(platformer);
    expect(enumOf(schema, "slot_prompts")).toEqual(
      platformer.slots.map((slot) => slot.id)
    );
    expect(enumOf(schema, "cast")).toEqual(["player", "enemy.walker"]);
    expect(enumOf(schema, "enemies")).toEqual(["enemy.walker"]);
  });

  it("asks for at least one entry per slot it pinned", () => {
    const schema = buildGameDesignSchema(platformer);
    const properties = schema["properties"] as Record<string, any>;
    expect(properties["slot_prompts"]["minItems"]).toBe(platformer.slots.length);
    expect(properties["cast"]["minItems"]).toBe(2);
    expect(properties["enemies"]["minItems"]).toBe(1);
  });

  it("builds the source key from the template and the brief", () => {
    expect(designSourceOf("platformer", "a fox game")).toBe(
      "platformer\na fox game"
    );
  });
});

const answer = (over: Record<string, unknown> = {}) => ({
  title: "Ember Run",
  premise: "A fox runs east.",
  core_loop: "Run, jump, stomp.",
  player_verbs: ["run", "jump"],
  enemies: [
    { slot_id: "enemy.walker", name: "Husk beetle", behaviour: "Patrols." }
  ],
  level: "A ridge.",
  win: "Reach the tree.",
  lose: "Fall off.",
  cast: [
    { slot_id: "player", name: "Ember", descriptor: "A slim rust-orange fox" },
    {
      slot_id: "enemy.walker",
      name: "Husk beetle",
      descriptor: "A squat brown beetle"
    }
  ],
  slot_prompts: platformer.slots.map((slot) => ({
    slot_id: slot.id,
    prompt: `subject for ${slot.id}`
  })),
  ...over
});

describe("parseGameDesign", () => {
  it("returns a complete answer unchanged and reports no fills", () => {
    const parsed = parseGameDesign(answer(), platformer);
    expect(parsed).not.toBeNull();
    expect(parsed!.filled).toEqual([]);
    expect(parsed!.design.slot_prompts).toHaveLength(platformer.slots.length);
  });

  it("fills a slot prompt the model skipped from the manifest and reports it", () => {
    const skipped = answer({
      slot_prompts: platformer.slots
        .filter((slot) => slot.id !== "bg.far")
        .map((slot) => ({ slot_id: slot.id, prompt: `subject for ${slot.id}` }))
    });
    const parsed = parseGameDesign(skipped, platformer)!;
    expect(parsed.filled).toEqual(["slot_prompts.bg.far"]);
    const filled = parsed.design.slot_prompts.find(
      (entry) => entry.slot_id === "bg.far"
    );
    const spec = platformer.slots.find((slot) => slot.id === "bg.far")!;
    expect(filled?.prompt).toBe(spec.prompt);
  });

  it("treats a whitespace-only prompt as skipped", () => {
    const blank = answer({
      slot_prompts: platformer.slots.map((slot) => ({
        slot_id: slot.id,
        prompt: slot.id === "title" ? "   " : `subject for ${slot.id}`
      }))
    });
    const parsed = parseGameDesign(blank, platformer)!;
    expect(parsed.filled).toEqual(["slot_prompts.title"]);
  });

  it("gives a missing cast entry the slot id as its name and reports it", () => {
    const parsed = parseGameDesign(
      answer({
        cast: [
          {
            slot_id: "player",
            name: "Ember",
            descriptor: "A slim rust-orange fox"
          }
        ]
      }),
      platformer
    )!;
    expect(parsed.filled).toEqual(["cast.enemy.walker"]);
    const member = parsed.design.cast.find(
      (entry) => entry.slot_id === "enemy.walker"
    );
    const spec = platformer.slots.find((slot) => slot.id === "enemy.walker")!;
    expect(member).toEqual({
      slot_id: "enemy.walker",
      name: "enemy.walker",
      descriptor: spec.prompt
    });
  });

  it("keeps one cast entry per spritesheet slot and nothing else", () => {
    const parsed = parseGameDesign(
      answer({
        cast: [
          ...answer().cast,
          { slot_id: "tiles.ground", name: "Tiles", descriptor: "not a character" }
        ]
      }),
      platformer
    )!;
    expect(parsed.design.cast.map((entry) => entry.slot_id)).toEqual([
      "player",
      "enemy.walker"
    ]);
  });

  it("drops a prompt for a slot the manifest does not have", () => {
    const parsed = parseGameDesign(
      answer({
        slot_prompts: [
          ...answer().slot_prompts,
          { slot_id: "boss.final", prompt: "a slot this template has no place for" }
        ]
      }),
      platformer
    )!;
    expect(
      parsed.design.slot_prompts.some((entry) => entry.slot_id === "boss.final")
    ).toBe(false);
  });

  it("returns null for an answer that is not a design at all", () => {
    expect(parseGameDesign(null, platformer)).toBeNull();
    expect(parseGameDesign("a design", platformer)).toBeNull();
    expect(parseGameDesign({ title: "only a title" }, platformer)).toBeNull();
  });
});

describe("GAME_INSPIRATION_CHIPS", () => {
  it("offers one chip per shipped template, with unique ids", () => {
    expect(GAME_INSPIRATION_CHIPS.map((chip) => chip.template)).toEqual([
      "platformer",
      "topdown",
      "shmup"
    ]);
    expect(new Set(GAME_INSPIRATION_CHIPS.map((chip) => chip.id)).size).toBe(3);
  });

  for (const chip of GAME_INSPIRATION_CHIPS) {
    const manifest = manifestOf(chip.template);

    it(`${chip.id}: the pinned design parses`, () => {
      expect(gameDesign.safeParse(chip.design).success).toBe(true);
    });

    it(`${chip.id}: covers its manifest completely with nothing to fill`, () => {
      const parsed = parseGameDesign(chip.design, manifest);
      expect(parsed).not.toBeNull();
      expect(parsed!.filled).toEqual([]);
    });

    it(`${chip.id}: one prompt per slot, one cast entry per spritesheet slot, one enemy per enemy slot`, () => {
      expect(chip.design.slot_prompts.map((entry) => entry.slot_id).sort()).toEqual(
        manifest.slots.map((slot) => slot.id).sort()
      );
      expect(chip.design.cast.map((entry) => entry.slot_id).sort()).toEqual(
        manifest.slots
          .filter((slot) => slot.kind === "spritesheet")
          .map((slot) => slot.id)
          .sort()
      );
      expect(chip.design.enemies.map((entry) => entry.slot_id).sort()).toEqual(
        manifest.slots
          .filter((slot) => slot.id.startsWith("enemy"))
          .map((slot) => slot.id)
          .sort()
      );
    });

    it(`${chip.id}: every field a creator reads is written, not blank`, () => {
      for (const value of [
        chip.brief,
        chip.design.title,
        chip.design.premise,
        chip.design.core_loop,
        chip.design.level,
        chip.design.win,
        chip.design.lose
      ]) {
        expect(value.trim().length).toBeGreaterThan(0);
      }
      expect(chip.design.player_verbs.length).toBeGreaterThan(0);
      for (const entry of chip.design.slot_prompts) {
        expect(entry.prompt.trim().length).toBeGreaterThan(0);
      }
      for (const entry of chip.design.cast) {
        expect(entry.name.trim().length).toBeGreaterThan(0);
        expect(entry.descriptor.trim().length).toBeGreaterThan(0);
      }
    });

    it(`${chip.id}: no slot prompt carries style or sheet boilerplate`, () => {
      const banned = [
        "sprite sheet",
        "spritesheet",
        "tileset",
        "pixel art",
        "8-bit",
        "16-bit",
        "seamless",
        "transparent background"
      ];
      for (const entry of chip.design.slot_prompts) {
        const prompt = entry.prompt.toLowerCase();
        for (const word of banned) {
          expect(
            prompt.includes(word),
            `${chip.id}/${entry.slot_id} contains "${word}"`
          ).toBe(false);
        }
      }
    });
  }
});
