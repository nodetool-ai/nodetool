import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { gameAssetManifest, type GameSlotSpec } from "../src/game-assets.js";
import { nearSquareGrid, slotCast, slotPrompt } from "../src/game-slot-prompt.js";
import type { Entity } from "../src/creative.js";

const manifest = gameAssetManifest.parse(
  JSON.parse(
    readFileSync(
      fileURLToPath(
        new URL("../fixtures/game-assets/platformer.manifest.json", import.meta.url)
      ),
      "utf8"
    )
  )
);

const slot = (id: string): GameSlotSpec => {
  const found = manifest.slots.find((s) => s.id === id);
  if (!found) throw new Error(`fixture has no slot ${id}`);
  return found;
};

const entity = (over: Partial<Entity> & Pick<Entity, "id" | "kind" | "name">): Entity => ({
  type: "entity",
  descriptor: `${over.name} descriptor`,
  ...over
});

const CAVE_PIXEL = entity({
  id: "style-1",
  kind: "style",
  name: "Cave Pixel",
  descriptor: "8-bit cave palette, four-colour ramps, hard pixel edges"
});
const PIP = entity({
  id: "char-1",
  kind: "character",
  name: "Pip",
  descriptor: "a small round explorer in a yellow helmet"
});

describe("slotPrompt canvas", () => {
  it("sizes a spritesheet as longest animation by animation count", () => {
    // player: cell 32x32, animations idle 4, run 8, jump 2, hurt 2.
    const { width, height } = slotPrompt(slot("player"), null, []);
    expect(width).toBe(8 * 32);
    expect(height).toBe(4 * 32);
  });

  it("sizes a tileset as the near-square grid of count cells", () => {
    // tiles.ground: cell 16x16, count 12 -> 4x3.
    const { width, height } = slotPrompt(slot("tiles.ground"), null, []);
    expect(nearSquareGrid(12)).toEqual({ columns: 4, rows: 3 });
    expect(width).toBe(4 * 16);
    expect(height).toBe(3 * 16);
  });

  it("takes an image slot's declared size", () => {
    const { width, height } = slotPrompt(slot("bg.far"), null, []);
    expect([width, height]).toEqual([960, 540]);
  });

  it("gives an audio slot no canvas", () => {
    for (const id of ["sfx.jump", "music.level"]) {
      const { width, height } = slotPrompt(slot(id), null, []);
      expect([width, height], id).toEqual([0, 0]);
    }
  });

  it("keeps a near-square grid square-ish and large enough for any count", () => {
    for (let count = 1; count <= 64; count++) {
      const { columns, rows } = nearSquareGrid(count);
      expect(columns * rows, `count ${count}`).toBeGreaterThanOrEqual(count);
      expect(Math.abs(columns - rows), `count ${count}`).toBeLessThanOrEqual(1);
    }
  });
});

describe("slotPrompt checker bag", () => {
  it("gives a spritesheet the cell, animations and fps", () => {
    expect(slotPrompt(slot("player"), null, []).checker).toEqual({
      slot_id: "player",
      cell_width: 32,
      cell_height: 32,
      animations: { idle: 4, run: 8, jump: 2, hurt: 2 },
      fps: 8
    });
  });

  it("gives a tileset the cell and count", () => {
    expect(slotPrompt(slot("tiles.ground"), null, []).checker).toEqual({
      slot_id: "tiles.ground",
      cell_width: 16,
      cell_height: 16,
      count: 12
    });
  });

  it("turns an image slot's seamless axes into the checker's checks", () => {
    expect(slotPrompt(slot("bg.far"), null, []).checker).toEqual({
      slot_id: "bg.far",
      check_x: true,
      check_y: false
    });
    expect(slotPrompt(slot("title"), null, []).checker).toEqual({
      slot_id: "title",
      check_x: false,
      check_y: false
    });
  });

  it("gives an audio slot its target length", () => {
    expect(slotPrompt(slot("sfx.jump"), null, []).checker).toEqual({
      slot_id: "sfx.jump",
      seconds: 0.4
    });
    expect(slotPrompt(slot("music.level"), null, []).checker).toEqual({
      slot_id: "music.level",
      seconds: 60
    });
  });

  it("copies the animations rather than aliasing the slot", () => {
    const spec = slot("player");
    const bag = slotPrompt(spec, null, []).checker as {
      animations: Record<string, number>;
    };
    bag.animations.idle = 99;
    expect((spec as { animations: Record<string, number> }).animations.idle).toBe(4);
  });
});

describe("slotPrompt text", () => {
  it("names the grid and every animation's frame range", () => {
    const { prompt } = slotPrompt(slot("player"), null, []);
    expect(prompt).toContain("the player character, side view, facing right");
    expect(prompt).toContain("256x128 pixels");
    expect(prompt).toContain("8x4 grid of 32x32 frames");
    expect(prompt).toContain("frames 0-3 are idle");
    expect(prompt).toContain("frames 4-11 are run");
    expect(prompt).toContain("frames 12-13 are jump");
    expect(prompt).toContain("frames 14-15 are hurt");
  });

  it("names the tile grid and the tile count", () => {
    const { prompt } = slotPrompt(slot("tiles.ground"), null, []);
    expect(prompt).toContain("64x48 pixels");
    expect(prompt).toContain("4x3 grid of 16x16 tiles");
    expect(prompt).toContain("12 distinct tiles");
  });

  it("asks for the seamless axis the slot declares, and only that one", () => {
    expect(slotPrompt(slot("bg.far"), null, []).prompt).toContain(
      "left and right edges match"
    );
    expect(slotPrompt(slot("bg.far"), null, []).prompt).not.toContain(
      "top and bottom edges match"
    );
    expect(slotPrompt(slot("title"), null, []).prompt).not.toContain(
      "Tiles seamlessly"
    );
  });

  it("asks audio for the slot's length and a seamless loop only for music", () => {
    expect(slotPrompt(slot("sfx.jump"), null, []).prompt).toContain(
      "0.4 seconds"
    );
    expect(slotPrompt(slot("sfx.jump"), null, []).prompt).not.toContain("looping");
    expect(slotPrompt(slot("music.level"), null, []).prompt).toContain(
      "60 seconds, looping with no audible seam"
    );
  });

  it("falls back to the slot id when the template wrote no prompt", () => {
    const bare: GameSlotSpec = { ...slot("bg.far"), prompt: undefined };
    expect(slotPrompt(bare, null, []).prompt).toContain("the bg.far asset");
  });
});

describe("slotPrompt entity seasoning", () => {
  it("applies the style to every slot, audio included", () => {
    for (const spec of manifest.slots) {
      expect(slotPrompt(spec, CAVE_PIXEL, []).prompt, spec.id).toContain(
        "Cave Pixel: 8-bit cave palette"
      );
    }
  });

  it("applies a cast member the template's own prompt never names", () => {
    // The platformer's player slot reads "the player character": name matching
    // would drop Pip from the very sheet Pip is for.
    const named = slotPrompt(slot("player"), CAVE_PIXEL, [PIP]).prompt;
    expect(named).toContain("Pip: a small round explorer");
    expect(named).toContain("Cave Pixel: 8-bit cave palette");
  });

  it("keeps the style ahead of the cast in the injected block", () => {
    const prompt = slotPrompt(slot("player"), CAVE_PIXEL, [PIP]).prompt;
    expect(prompt.indexOf("Cave Pixel:")).toBeLessThan(prompt.indexOf("Pip:"));
  });

  it("does not apply the same entity twice when it is both style and cast", () => {
    const prompt = slotPrompt(slot("player"), CAVE_PIXEL, [CAVE_PIXEL, PIP]).prompt;
    const hits = prompt.split("Cave Pixel: 8-bit cave palette").length - 1;
    expect(hits).toBe(1);
  });

  it("leaves the prompt unseasoned when nothing applies", () => {
    const plain = slotPrompt(slot("music.level"), null, []).prompt;
    expect(plain).not.toContain("Consistency references");
  });

  it("puts the style first and drops a repeat of it from the cast", () => {
    expect(slotCast(CAVE_PIXEL, [PIP, CAVE_PIXEL]).map((e) => e.id)).toEqual([
      "style-1",
      "char-1"
    ]);
    expect(slotCast(null, [PIP]).map((e) => e.id)).toEqual(["char-1"]);
    expect(slotCast(null, []).map((e) => e.id)).toEqual([]);
  });
});
