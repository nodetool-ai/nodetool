/**
 * The game slot nodes fill the contract in @nodetool-ai/protocol/game-assets:
 * the fill they stamp on the image must pass `checkSlotFill` against the
 * template manifest, and every rejection (wrong sheet size, too few frames,
 * a hard edge on an image that must tile) must actually fire.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import sharp from "sharp";
import {
  SLOT_METADATA_KEY,
  checkSlotFill,
  gameAssetManifest,
  type GameSlotSpec,
  type ImageFill,
  type SpritesheetFill,
  type TilesetFill
} from "@nodetool-ai/protocol";
import {
  GAME_NODES,
  SeamlessImageNode,
  SpriteSheetNode,
  TilesetNode
} from "@nodetool-ai/image-nodes";

const manifestPath = fileURLToPath(
  new URL(
    "../../protocol/fixtures/game-assets/platformer.manifest.json",
    import.meta.url
  )
);
const manifest = gameAssetManifest.parse(
  JSON.parse(readFileSync(manifestPath, "utf8"))
);

function slot(id: string): GameSlotSpec {
  const spec = manifest.slots.find((s) => s.id === id);
  if (!spec) throw new Error(`fixture has no slot ${id}`);
  return spec;
}

async function runNode(
  suffix: string,
  inputs: Record<string, unknown>,
  context?: unknown
): Promise<Record<string, unknown>> {
  const Cls = GAME_NODES.find((n) =>
    (n as unknown as { nodeType: string }).nodeType.endsWith(suffix)
  );
  expect([SpriteSheetNode, TilesetNode, SeamlessImageNode]).toContain(Cls);
  if (!Cls) throw new Error(`Node ending with "${suffix}" not found`);
  const node = new (Cls as unknown as {
    new (): {
      assign(p: Record<string, unknown>): void;
      process(ctx?: unknown): Promise<Record<string, unknown>>;
    };
  })();
  node.assign(inputs);
  return node.process(context);
}

/** An RGB PNG image ref whose pixel (x, y) is chosen by `pixel`. */
async function makeImage(
  w: number,
  h: number,
  pixel: (x: number, y: number) => [number, number, number]
): Promise<Record<string, unknown>> {
  const pixels = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = pixel(x, y);
      pixels.set([r, g, b], (y * w + x) * 3);
    }
  }
  const buf = await sharp(pixels, { raw: { width: w, height: h, channels: 3 } })
    .png()
    .toBuffer();
  return { type: "image", data: buf.toString("base64"), uri: "" };
}

const noise = (x: number, y: number): [number, number, number] => [
  (x * 17 + y * 3) % 256,
  (x * 5 + y * 23) % 256,
  (x * 11 + y * 7) % 256
];

function stamped(result: Record<string, unknown>): unknown {
  const output = result.output as { metadata: Record<string, unknown> };
  return output.metadata[SLOT_METADATA_KEY];
}

describe("nodetool.game.SpriteSheet", () => {
  const player = slot("player");
  if (player.kind !== "spritesheet") throw new Error("player is a spritesheet");

  it("fills the fixture player slot from a 256x64 sheet", async () => {
    const image = await makeImage(256, 64, noise);
    const result = await runNode(".SpriteSheet", {
      image,
      cell_width: 32,
      cell_height: 32,
      animations: player.animations,
      fps: player.fps,
      slot_id: player.id
    });
    const fill = result.fill as SpritesheetFill;
    expect(checkSlotFill(player, fill)).toEqual([]);
    expect(fill.columns).toBe(8);
    expect(fill.rows).toBe(2);
    expect(fill.animations).toEqual({
      idle: { from: 0, to: 3, fps: 8, loop: true },
      run: { from: 4, to: 11, fps: 8, loop: true },
      jump: { from: 12, to: 13, fps: 8, loop: false },
      hurt: { from: 14, to: 15, fps: 8, loop: false }
    });
    expect(stamped(result)).toEqual(fill);
  });

  it("accepts the animations as a JSON string and honours loop overrides", async () => {
    const image = await makeImage(256, 64, noise);
    const result = await runNode(".SpriteSheet", {
      image,
      cell_width: 32,
      cell_height: 32,
      animations: JSON.stringify(player.animations),
      loop: { jump: true, idle: false },
      fps: 8,
      slot_id: player.id
    });
    const fill = result.fill as SpritesheetFill;
    expect(fill.animations.jump.loop).toBe(true);
    expect(fill.animations.idle.loop).toBe(false);
    expect(fill.animations.hurt.loop).toBe(false);
  });

  it("checkSlotFill rejects the player fill offered to another slot", async () => {
    const image = await makeImage(256, 64, noise);
    const result = await runNode(".SpriteSheet", {
      image,
      cell_width: 32,
      cell_height: 32,
      animations: player.animations,
      fps: 8,
      slot_id: "enemy.walker"
    });
    expect(
      checkSlotFill(slot("enemy.walker"), result.fill as SpritesheetFill)
    ).toEqual(["animation walk missing", "animation die missing"]);
  });

  it("throws when the sheet is not a multiple of the cell", async () => {
    const image = await makeImage(250, 64, noise);
    await expect(
      runNode(".SpriteSheet", {
        image,
        cell_width: 32,
        cell_height: 32,
        animations: player.animations,
        fps: 8,
        slot_id: player.id
      })
    ).rejects.toThrow(/Sprite Sheet: image 250x64 is not a multiple of cell 32x32/);
  });

  it("throws when the animations need more frames than the sheet holds", async () => {
    const image = await makeImage(128, 64, noise);
    await expect(
      runNode(".SpriteSheet", {
        image,
        cell_width: 32,
        cell_height: 32,
        animations: player.animations,
        fps: 8,
        slot_id: player.id
      })
    ).rejects.toThrow(/Sprite Sheet: animations need 16 frames, sheet holds 8/);
  });

  it("throws on an empty animation list and a bad slot id", async () => {
    const image = await makeImage(64, 32, noise);
    await expect(
      runNode(".SpriteSheet", {
        image,
        cell_width: 32,
        cell_height: 32,
        animations: {},
        fps: 8,
        slot_id: "player"
      })
    ).rejects.toThrow(/at least one animation/);
    await expect(
      runNode(".SpriteSheet", {
        image,
        cell_width: 32,
        cell_height: 32,
        animations: { idle: 2 },
        fps: 8,
        slot_id: "Player"
      })
    ).rejects.toThrow(/Sprite Sheet: fill failed validation/);
  });
});

describe("nodetool.game.Tileset", () => {
  const ground = slot("tiles.ground");

  it("fills the fixture tiles.ground slot from a 64x48 sheet", async () => {
    const image = await makeImage(64, 48, noise);
    const result = await runNode(".Tileset", {
      image,
      cell_width: 16,
      cell_height: 16,
      count: 12,
      slot_id: ground.id
    });
    const fill = result.fill as TilesetFill;
    expect(checkSlotFill(ground, fill)).toEqual([]);
    expect(fill).toMatchObject({ columns: 4, rows: 3, count: 12 });
    expect(stamped(result)).toEqual(fill);
  });

  it("throws when the count exceeds the grid or the sheet is off-cell", async () => {
    await expect(
      runNode(".Tileset", {
        image: await makeImage(64, 48, noise),
        cell_width: 16,
        cell_height: 16,
        count: 13,
        slot_id: ground.id
      })
    ).rejects.toThrow(/Tileset: 13 tiles do not fit 4x3/);
    await expect(
      runNode(".Tileset", {
        image: await makeImage(60, 48, noise),
        cell_width: 16,
        cell_height: 16,
        count: 12,
        slot_id: ground.id
      })
    ).rejects.toThrow(/Tileset: image 60x48 is not a multiple of cell 16x16/);
  });
});

describe("nodetool.game.SeamlessImage", () => {
  const bgFar = slot("bg.far");
  if (bgFar.kind !== "image") throw new Error("bg.far is an image");
  const [w, h] = bgFar.size;

  /** Periodic in x (wraps at the edge) and hard-edged in y. */
  const tileableX = (x: number, y: number): [number, number, number] => {
    const t = (x / w) * Math.PI * 2;
    const v = Math.round(127 + 120 * Math.sin(t));
    return [v, (v + 40) % 256, y < h / 2 ? 20 : 235];
  };

  /** A hard seam on x: black left half, white right half. */
  const hardEdgeX = (x: number): [number, number, number] =>
    x < w / 2 ? [0, 0, 0] : [255, 255, 255];

  it("reports seamless_x true for a tileable image and passes the slot", async () => {
    const image = await makeImage(w, h, tileableX);
    const result = await runNode(".SeamlessImage", {
      image,
      slot_id: bgFar.id,
      check_x: true,
      check_y: true,
      threshold: 12
    });
    const fill = result.fill as ImageFill;
    expect(fill).toEqual({
      kind: "image",
      slot_id: "bg.far",
      size: [w, h],
      seamless_x: true,
      seamless_y: false
    });
    expect(checkSlotFill(bgFar, fill)).toEqual([]);
    expect(stamped(result)).toEqual(fill);
  });

  it("reports seamless_x false for a hard-edged image and fails the slot", async () => {
    const image = await makeImage(w, h, hardEdgeX);
    const result = await runNode(".SeamlessImage", {
      image,
      slot_id: bgFar.id,
      check_x: true,
      check_y: false
    });
    const fill = result.fill as ImageFill;
    expect(fill.seamless_x).toBe(false);
    expect(checkSlotFill(bgFar, fill)).toEqual(["not seamless on x"]);
  });

  it("reports seamless_y true when the rows wrap, independent of x", async () => {
    const image = await makeImage(64, 64, (x, y) => [
      x < 32 ? 0 : 255,
      Math.round(127 + 120 * Math.sin((y / 64) * Math.PI * 2)),
      0
    ]);
    const result = await runNode(".SeamlessImage", {
      image,
      slot_id: "title",
      check_x: true,
      check_y: true
    });
    const fill = result.fill as ImageFill;
    expect(fill.seamless_x).toBe(false);
    expect(fill.seamless_y).toBe(true);
  });

  it("does not claim an axis it was told not to check", async () => {
    const image = await makeImage(64, 64, () => [50, 60, 70]);
    const result = await runNode(".SeamlessImage", {
      image,
      slot_id: "title",
      check_x: false,
      check_y: false
    });
    const fill = result.fill as ImageFill;
    expect(fill.seamless_x).toBe(false);
    expect(fill.seamless_y).toBe(false);
  });

  it("size mismatch against the slot is caught by checkSlotFill", async () => {
    const image = await makeImage(64, 64, tileableX);
    const result = await runNode(".SeamlessImage", {
      image,
      slot_id: bgFar.id,
      check_x: true
    });
    expect(checkSlotFill(bgFar, result.fill as ImageFill)).toContain(
      "size 64x64 is not 960x540"
    );
  });

  it("stores the stamped sheet as an asset when the context can create one", async () => {
    const player = slot("player");
    if (player.kind !== "spritesheet") throw new Error("player is a spritesheet");
    const image = await makeImage(256, 64, noise);
    const calls: Array<Record<string, unknown>> = [];
    const context = {
      hasModelInterface: (name: string) => name === "createAsset",
      createAsset: async (args: Record<string, unknown>) => {
        calls.push(args);
        return { id: "asset-player" };
      }
    };
    const result = await runNode(
      ".SpriteSheet",
      {
        image,
        cell_width: 32,
        cell_height: 32,
        animations: player.animations,
        fps: player.fps,
        slot_id: player.id
      },
      context
    );
    const output = result.output as { asset_id?: string; uri?: string };
    expect(output.asset_id).toBe("asset-player");
    expect(output.uri).toBe("asset://asset-player.png");
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe("player.png");
    expect(calls[0].contentType).toBe("image/png");
    expect(calls[0].content).toBeInstanceOf(Uint8Array);
    expect((calls[0].metadata as Record<string, unknown>)[SLOT_METADATA_KEY]).toEqual(result.fill);
  });

  it("reads a stored asset through the asset resolver, not the temporary store", async () => {
    const inline = await makeImage(64, 32, noise);
    const png = Buffer.from(inline.data as string, "base64");
    const retrieved: string[] = [];
    const resolved: string[] = [];
    const context = {
      resolveAssetBytes: async (uri: string) => {
        resolved.push(uri);
        return { bytes: new Uint8Array(png), attempts: [] };
      },
      storage: {
        retrieve: async (key: string) => {
          retrieved.push(key);
          return null;
        }
      }
    };
    const result = await runNode(
      ".Tileset",
      {
        image: { type: "image", uri: "asset://stored-tiles.png", asset_id: "stored-tiles" },
        cell_width: 16,
        cell_height: 16,
        count: 8,
        slot_id: "tiles.ground"
      },
      context
    );
    expect(resolved).toEqual(["asset://stored-tiles.png"]);
    expect(retrieved).toEqual([]);
    const fill = result.fill as TilesetFill;
    expect([fill.columns, fill.rows]).toEqual([4, 2]);
  });

  it("re-encodes a WebP generation as PNG before stamping and storing it", async () => {
    const pixels = Buffer.alloc(64 * 32 * 3);
    for (let i = 0; i < 64 * 32; i++) {
      const [r, g, b] = noise(i % 64, Math.floor(i / 64));
      pixels.set([r, g, b], i * 3);
    }
    const webp = await sharp(pixels, { raw: { width: 64, height: 32, channels: 3 } })
      .webp()
      .toBuffer();
    expect(webp.subarray(8, 12).toString("ascii")).toBe("WEBP");
    const calls: Array<Record<string, unknown>> = [];
    const context = {
      hasModelInterface: (name: string) => name === "createAsset",
      createAsset: async (args: Record<string, unknown>) => {
        calls.push(args);
        return { id: "asset-title" };
      }
    };
    const result = await runNode(
      ".SeamlessImage",
      {
        image: { type: "image", data: webp.toString("base64"), uri: "" },
        slot_id: "title",
        check_x: false,
        check_y: false
      },
      context
    );
    const output = result.output as { data: Uint8Array; uri: string };
    expect(Buffer.from(output.data.subarray(0, 8))).toEqual(PNG_MAGIC);
    expect(output.uri).toBe("asset://asset-title.png");
    expect(calls[0].name).toBe("title.png");
    expect(calls[0].contentType).toBe("image/png");
    expect(Buffer.from((calls[0].content as Uint8Array).subarray(0, 8))).toEqual(PNG_MAGIC);
    const meta = await sharp(Buffer.from(output.data)).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["png", 64, 32]);
  });
});

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
