import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { gameAssetManifest, type GameSlotSpec } from "../src/game-assets.js";
import {
  GAME_IMAGE_ASPECT_RATIOS,
  closestGameAspectRatio,
  gameSlotPrompt
} from "../src/game-flow-prompt.js";

const repoFile = (relative: string): string =>
  fileURLToPath(new URL(`../../../${relative}`, import.meta.url));

const manifestOf = (template: string) =>
  gameAssetManifest.parse(
    JSON.parse(
      readFileSync(
        repoFile(`packages/godot-templates/templates/${template}/manifest.json`),
        "utf8"
      )
    )
  );

const TEMPLATES = ["platformer", "topdown", "shmup"] as const;

const STYLE = {
  descriptor:
    "16-bit console pixel art on a 32px cell, four-shade ramps, transparent background for sprites, flat lighting, no text, no watermark"
};

const CAST = [
  { slot_id: "player", name: "Ember", descriptor: "A slim rust-orange fox" },
  {
    slot_id: "enemy.walker",
    name: "Husk beetle",
    descriptor: "A squat dark brown beetle"
  }
];

/** Every slot of every shipped manifest, pinned. */
const EXPECTED: Record<
  string,
  Record<string, { width?: number; height?: number; aspectRatio?: string }>
> = {
  platformer: {
    player: { width: 256, height: 128, aspectRatio: "16:9" },
    "enemy.walker": { width: 192, height: 64, aspectRatio: "21:9" },
    "tiles.ground": { width: 64, height: 48, aspectRatio: "4:3" },
    "bg.far": { width: 960, height: 540, aspectRatio: "16:9" },
    "sfx.jump": {},
    "sfx.hurt": {},
    "music.level": {},
    title: { width: 1920, height: 1080, aspectRatio: "16:9" }
  },
  topdown: {
    player: { width: 192, height: 96, aspectRatio: "16:9" },
    "enemy.chaser": { width: 192, height: 64, aspectRatio: "21:9" },
    "tiles.floor": { width: 64, height: 48, aspectRatio: "4:3" },
    "sfx.hit": {},
    "sfx.step": {},
    "music.level": {},
    title: { width: 1920, height: 1080, aspectRatio: "16:9" }
  },
  shmup: {
    player: { width: 64, height: 96, aspectRatio: "2:3" },
    "enemy.drone": { width: 128, height: 64, aspectRatio: "16:9" },
    "bg.space": { width: 960, height: 540, aspectRatio: "16:9" },
    "sfx.shoot": {},
    "sfx.explode": {},
    "music.level": {},
    title: { width: 1920, height: 1080, aspectRatio: "16:9" }
  }
};

describe("gameSlotPrompt", () => {
  for (const template of TEMPLATES) {
    const manifest = manifestOf(template);

    it(`covers every ${template} slot with the expectation table`, () => {
      expect(manifest.slots.map((slot) => slot.id).sort()).toEqual(
        Object.keys(EXPECTED[template]).sort()
      );
    });

    for (const slot of manifest.slots) {
      const expected = EXPECTED[template][slot.id];

      it(`${template} / ${slot.id} (${slot.kind}) gets the size the checker will demand`, () => {
        const built = gameSlotPrompt(slot, "the subject", STYLE, CAST);
        expect(built.width).toBe(expected.width);
        expect(built.height).toBe(expected.height);
        expect(built.aspectRatio).toBe(expected.aspectRatio);
        expect(built.prompt.startsWith("the subject")).toBe(true);
      });

      it(`${template} / ${slot.id} carries the style descriptor only where a picture is generated`, () => {
        const built = gameSlotPrompt(slot, "the subject", STYLE, CAST);
        const visual = slot.kind !== "sfx" && slot.kind !== "music";
        expect(built.prompt.includes(STYLE.descriptor)).toBe(visual);
      });

      it(`${template} / ${slot.id} carries a cast descriptor only when the cast names it`, () => {
        const built = gameSlotPrompt(slot, "the subject", STYLE, CAST);
        const member = CAST.find((entry) => entry.slot_id === slot.id);
        for (const entry of CAST) {
          expect(built.prompt.includes(entry.descriptor)).toBe(
            entry === member
          );
        }
      });
    }
  }

  it("names where each animation sits on a sprite sheet", () => {
    const manifest = manifestOf("platformer");
    const player = manifest.slots.find((slot) => slot.id === "player")!;
    const built = gameSlotPrompt(player, "Ember from the side", STYLE, CAST);
    expect(built.prompt).toContain("frames 0-3 are idle");
    expect(built.prompt).toContain("frames 4-11 are run");
    expect(built.prompt).toContain("frames 12-13 are jump");
    expect(built.prompt).toContain("frames 14-15 are hurt");
    expect(built.prompt).toContain("Transparent background");
  });

  it("asks a tileset for a near-square grid of the manifest's tile count", () => {
    const manifest = manifestOf("platformer");
    const tiles = manifest.slots.find((slot) => slot.id === "tiles.ground")!;
    const built = gameSlotPrompt(tiles, "autumn ground", STYLE, []);
    expect(built.columns).toBe(4);
    expect(built.rows).toBe(3);
    expect(built.prompt).toContain(
      "a 4x3 grid of 16x16 tiles, 12 distinct tiles"
    );
  });

  it("names the axis an image slot must tile on, and only that axis", () => {
    const platformer = manifestOf("platformer");
    const bgFar = platformer.slots.find((slot) => slot.id === "bg.far")!;
    const built = gameSlotPrompt(bgFar, "a far ridge", STYLE, []);
    expect(built.prompt).toContain("the left and right edges match");
    expect(built.prompt).not.toContain("the top and bottom edges match");

    const shmup = manifestOf("shmup");
    const bgSpace = shmup.slots.find((slot) => slot.id === "bg.space")!;
    const space = gameSlotPrompt(bgSpace, "a city from above", STYLE, []);
    expect(space.prompt).toContain("the top and bottom edges match");
    expect(space.prompt).not.toContain("the left and right edges match");
  });

  it("puts the requested length in an audio prompt and no size on the result", () => {
    const manifest = manifestOf("platformer");
    const jump = manifest.slots.find((slot) => slot.id === "sfx.jump")!;
    const music = manifest.slots.find((slot) => slot.id === "music.level")!;
    expect(gameSlotPrompt(jump, "a soft hop", STYLE, []).prompt).toContain(
      "Sound effect: 0.4 seconds"
    );
    expect(gameSlotPrompt(music, "a woodland theme", STYLE, []).prompt).toContain(
      "Music: 60 seconds, looping"
    );
    expect(gameSlotPrompt(jump, "a soft hop", STYLE, []).width).toBeUndefined();
    expect(gameSlotPrompt(music, "a theme", STYLE, []).aspectRatio).toBeUndefined();
  });

  it("falls back to the slot's own subject when the design says nothing", () => {
    const manifest = manifestOf("platformer");
    const player = manifest.slots.find((slot) => slot.id === "player")!;
    expect(
      gameSlotPrompt(player, "  ", STYLE, []).prompt.startsWith(
        "the player character, side view, facing right"
      )
    ).toBe(true);

    // A slot the template left without a subject falls back to naming itself,
    // rather than opening the prompt with the sheet geometry.
    const bare: GameSlotSpec = {
      id: "player",
      kind: "spritesheet",
      cell: [32, 32],
      fps: 8,
      animations: { idle: 1 }
    };
    expect(
      gameSlotPrompt(bare, "", null, []).prompt.startsWith("the player asset")
    ).toBe(true);
  });
});

describe("closestGameAspectRatio", () => {
  it("returns the exact entry when the slot is one of them", () => {
    expect(closestGameAspectRatio(1920, 1080)).toBe("16:9");
    expect(closestGameAspectRatio(512, 512)).toBe("1:1");
    expect(closestGameAspectRatio(1080, 1920)).toBe("9:16");
  });

  it("is symmetric: flipping the slot flips the ratio", () => {
    expect(closestGameAspectRatio(192, 64)).toBe("21:9");
    expect(closestGameAspectRatio(64, 192)).toBe("9:16");
  });

  it("matches the aspect-ratio list nodetool.image.TextToImage actually offers", () => {
    // The generator's list lives in image-nodes, which sits above protocol in
    // the package graph and cannot be imported here. Read it instead, so this
    // fails the day the node's table changes rather than the day a creator
    // gets a rejected aspect ratio.
    const source = readFileSync(
      repoFile("packages/image-nodes/src/nodes/image.ts"),
      "utf8"
    );
    const block = /const IMAGE_ASPECT_RATIOS[^{]*\{([^}]*)\}/.exec(source);
    expect(block).not.toBeNull();
    const names = [...block![1].matchAll(/"([^"]+)":/g)].map((m) => m[1]);
    expect(names.length).toBeGreaterThan(0);
    expect(names).toEqual(Object.keys(GAME_IMAGE_ASPECT_RATIOS));
  });
});
