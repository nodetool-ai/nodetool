import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  checkFilledManifest,
  checkSlotFill,
  filledManifest,
  gameAssetManifest,
  type FilledManifest,
  type GameAssetManifest
} from "../src/game-assets.js";

const fixture = (name: string): unknown =>
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`../fixtures/game-assets/${name}`, import.meta.url)),
      "utf8"
    )
  );

const manifest = gameAssetManifest.parse(fixture("platformer.manifest.json"));
const filled = filledManifest.parse(fixture("platformer.filled.json"));

const clone = <T>(v: T): T => structuredClone(v);

describe("game asset manifest", () => {
  it("parses the platformer fixture", () => {
    expect(manifest.slots).toHaveLength(8);
    expect(manifest.hooks).toContain("scripts/player.gd");
  });

  it("rejects duplicate slot ids", () => {
    const m = clone(fixture("platformer.manifest.json")) as GameAssetManifest;
    m.slots.push({ ...m.slots[0] });
    expect(gameAssetManifest.safeParse(m).success).toBe(false);
  });

  it("rejects an unknown slot kind", () => {
    const m = clone(fixture("platformer.manifest.json")) as { slots: unknown[] };
    m.slots.push({ id: "x", kind: "font", size: [1, 1] });
    expect(gameAssetManifest.safeParse(m).success).toBe(false);
  });

  it("rejects a spritesheet slot with no animations", () => {
    const m = clone(fixture("platformer.manifest.json")) as GameAssetManifest;
    const player = m.slots[0];
    if (player.kind === "spritesheet") {
      player.animations = {};
    }
    expect(gameAssetManifest.safeParse(m).success).toBe(false);
  });
});

describe("filled manifest", () => {
  it("parses the platformer fixture and it fills the manifest", () => {
    expect(filled.slots).toHaveLength(8);
    expect(checkFilledManifest(manifest, filled)).toEqual({});
  });

  it("rejects a fill whose slot_id disagrees with the entry", () => {
    const f = clone(fixture("platformer.filled.json")) as FilledManifest;
    f.slots[0].fill.slot_id = "enemy.walker";
    expect(filledManifest.safeParse(f).success).toBe(false);
  });

  it("reports unfilled, extra, and duplicate slots", () => {
    const f = clone(filled);
    const [player, ...rest] = f.slots;
    f.slots = [
      ...rest,
      { ...rest[0] },
      {
        slot_id: "extra",
        asset: player.asset,
        fill: { kind: "sfx", slot_id: "extra", seconds: 1 }
      }
    ];
    const problems = checkFilledManifest(manifest, f);
    expect(problems.player).toEqual(["unfilled"]);
    expect(problems["enemy.walker"]).toEqual(["filled twice"]);
    expect(problems.extra).toEqual(["not in manifest"]);
  });
});

describe("checkSlotFill", () => {
  const spec = (id: string) => {
    const s = manifest.slots.find((x) => x.id === id);
    if (!s) throw new Error(id);
    return s;
  };
  const fill = (id: string) => {
    const s = filled.slots.find((x) => x.slot_id === id);
    if (!s) throw new Error(id);
    return clone(s.fill);
  };

  it("accepts every fixture fill", () => {
    for (const slot of manifest.slots) {
      expect(checkSlotFill(slot, fill(slot.id))).toEqual([]);
    }
  });

  it("stops at a kind mismatch", () => {
    const f = fill("sfx.jump");
    f.slot_id = "player";
    expect(checkSlotFill(spec("player"), f)).toEqual([
      "kind sfx is not spritesheet"
    ]);
  });

  it("rejects a sprite sheet with the wrong cell size", () => {
    const f = fill("player");
    if (f.kind === "spritesheet") f.cell = [16, 16];
    expect(checkSlotFill(spec("player"), f)).toEqual(["cell 16x16 is not 32x32"]);
  });

  it("rejects a sprite sheet missing or short on an animation", () => {
    const f = fill("player");
    if (f.kind === "spritesheet") {
      delete f.animations.hurt;
      f.animations.run = { from: 4, to: 9, fps: 8, loop: true };
    }
    expect(checkSlotFill(spec("player"), f)).toEqual([
      "animation run has 6 frames, wants 8",
      "animation hurt missing"
    ]);
  });

  it("rejects an animation that runs off the sheet", () => {
    const f = fill("player");
    if (f.kind === "spritesheet") f.rows = 1;
    const problems = checkSlotFill(spec("player"), f);
    expect(problems).toContain(
      "animation run ends at frame 11, sheet holds 8"
    );
  });

  it("rejects a tileset with too few tiles or too small a grid", () => {
    const f = fill("tiles.ground");
    if (f.kind === "tileset") f.count = 10;
    expect(checkSlotFill(spec("tiles.ground"), f)).toEqual([
      "10 tiles, wants 12"
    ]);
    const g = fill("tiles.ground");
    if (g.kind === "tileset") g.rows = 2;
    expect(checkSlotFill(spec("tiles.ground"), g)).toEqual([
      "12 tiles do not fit 4x2"
    ]);
  });

  it("rejects a background that is not seamless where asked", () => {
    const f = fill("bg.far");
    if (f.kind === "image") f.seamless_x = false;
    expect(checkSlotFill(spec("bg.far"), f)).toEqual(["not seamless on x"]);
  });

  it("rejects audio outside the duration tolerance", () => {
    const f = fill("sfx.jump");
    if (f.kind === "sfx") f.seconds = 1.0;
    expect(checkSlotFill(spec("sfx.jump"), f)).toEqual([
      "1s is not within 0.1s of 0.4s"
    ]);
  });

  it("rejects music that does not loop when the slot wants a loop", () => {
    const f = fill("music.level");
    if (f.kind === "music") f.loop = false;
    expect(checkSlotFill(spec("music.level"), f)).toEqual(["not a loop"]);
  });
});
