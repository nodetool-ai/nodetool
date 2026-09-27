import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { SLOT_METADATA_KEY } from "@nodetool-ai/protocol";
import { createLocalWorkspace, MemoryCache, ProcessingContext } from "@nodetool-ai/runtime";
import { getNativeTemplate, LoadGameTemplateNode, resolveFills, SlotPromptNode, StageGameAssetsNode } from "../src/index.js";
import { imagePreparationSettings, prepareGameImage } from "../src/image-preparation.js";

const dirs: string[] = [];
function context(): ProcessingContext {
  const dir = mkdtempSync(join(tmpdir(), "nodetool-native-game-"));
  dirs.push(dir);
  return new ProcessingContext({ jobId: "native-game-test", userId: "tester", cache: new MemoryCache(), workspace: createLocalWorkspace(dir) });
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("native game nodes", () => {
  it("loads the playable top-down template manifest", async () => {
    const node = new LoadGameTemplateNode({ template: "topdown" });
    const result = await node.process();
    expect(result.manifest.engineVersion).toBe("1");
    expect(result.slots.map((slot) => slot.id)).toEqual(["player", "wall", "gem", "sfx.collect"]);
  });

  it("turns a template slot into generation inputs", async () => {
    const slot = getNativeTemplate("topdown").manifest.slots[0];
    const node = new SlotPromptNode({ slot, style: null, cast: [] });
    const result = await node.process();
    expect(result.kind).toBe(slot.kind);
    expect(result.prompt.length).toBeGreaterThan(0);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
    expect(result.checker).toBeDefined();
  });

  it("rejects a bare layout fill with wiring advice", () => {
    expect(() => resolveFills("topdown", [{ kind: "sfx", slot_id: "sfx.collect", seconds: 0.4 }])).toThrow("output handle");
  });

  it("stages checked bytes by content digest without changing a game document", async () => {
    const ctx = context();
    const gameId = "a".repeat(32);
    const bytes = await sharp({ create: { width: 32, height: 32, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } }).png().toBuffer();
    const fill = { kind: "spritesheet", slot_id: "gem", cell: [32, 32], columns: 1, rows: 1, animations: { idle: { from: 0, to: 0, fps: 8, loop: true } } };
    const node = new StageGameAssetsNode({ game_id: gameId, template: "topdown", fills: [{ type: "image", asset_id: "gem-asset", data: bytes, metadata: { [SLOT_METADATA_KEY]: fill } }],
      preparation: { gem: { sampling: "linear" } }, reference_asset_id: "shared-style" });
    const result = await node.process(ctx);
    const staged = await ctx.workspace?.read(result.paths[0]);
    expect(result.bindings.gem.digest).toBe(createHash("sha256").update(staged ?? new Uint8Array()).digest("hex"));
    expect(result.paths).toEqual([`games/${gameId}/assets/${result.bindings.gem.digest}.png`]);
    expect((await sharp(staged).metadata()).width).toBe(32);
    expect(result.bindings.gem).toMatchObject({ sampling: "linear", referenceAssetId: "shared-style",
      originalDimensions: { width: 32, height: 32 } });
    expect(await ctx.workspace?.exists(`games/${gameId}/game.json`)).toBe(false);
  });

  it("prepares deterministic, trimmed image bytes with stable crop metadata", async () => {
    const pixels = Buffer.alloc(4 * 4 * 4);
    pixels.fill(255, (1 * 4 + 2) * 4, (1 * 4 + 3) * 4);
    const bytes = await sharp(pixels, { raw: { width: 4, height: 4, channels: 4 } }).png().toBuffer();
    const settings = imagePreparationSettings.parse({ trimAlpha: true, sampling: "linear", pivot: { x: 0.25, y: 0.75 } });
    const first = await prepareGameImage(bytes, settings);
    const second = await prepareGameImage(bytes, settings);
    expect(createHash("sha256").update(first.bytes).digest("hex")).toBe(createHash("sha256").update(second.bytes).digest("hex"));
    expect(first).toMatchObject({ width: 1, height: 1, trim: { sourceWidth: 4, sourceHeight: 4, x: 2, y: 1 } });
  });

  it("mirrors edge pixels across both tile seams", async () => {
    const source = Buffer.from([255, 0, 0, 255, 0, 0, 255, 255]);
    const bytes = await sharp(source, { raw: { width: 2, height: 1, channels: 4 } }).png().toBuffer();
    const prepared = await prepareGameImage(bytes, imagePreparationSettings.parse({ mirrorX: true }));
    const output = await sharp(prepared.bytes).raw().toBuffer();
    expect(prepared.width).toBe(4);
    expect([output[0], output[4], output[8], output[12]]).toEqual([255, 0, 0, 255]);
    expect([output[2], output[6], output[10], output[14]]).toEqual([0, 255, 255, 0]);
  });

  it("rejects candidate dimensions that disagree with the checked fill", async () => {
    const ctx = context();
    const bytes = await sharp({ create: { width: 2, height: 2, channels: 4, background: "white" } }).png().toBuffer();
    const fill = { kind: "spritesheet", slot_id: "gem", cell: [32, 32], columns: 1, rows: 1,
      animations: { idle: { from: 0, to: 0, fps: 8, loop: true } } };
    const node = new StageGameAssetsNode({ game_id: "d".repeat(32), template: "topdown",
      fills: [{ type: "image", asset_id: "gem-asset", data: bytes, metadata: { [SLOT_METADATA_KEY]: fill } }] });
    await expect(node.process(ctx)).rejects.toThrow("expected 32x32");
  });

  it("stages a TrueType font with a content digest", async () => {
    const ctx = context();
    const bytes = readFileSync(join(process.cwd(), "../timeline/fonts/BebasNeue-Regular.ttf"));
    const file = join(dirs.at(-1) ?? "", "display.ttf");
    await ctx.workspace?.write("display.ttf", bytes);
    const node = new StageGameAssetsNode({ game_id: "e".repeat(32), template: "topdown", fills: [],
      fonts: { display: pathToFileURL(file).href } });
    const result = await node.process(ctx);
    expect(result.bindings.display).toMatchObject({ mediaKind: "font", fontFormat: "ttf", required: true });
    expect(await ctx.workspace?.read(result.paths[0])).toEqual(new Uint8Array(bytes));
  });

  it("refuses candidate media for a slot absent from the native template", async () => {
    const ctx = context();
    const node = new StageGameAssetsNode({ game_id: "b".repeat(32), template: "topdown", fills: [{ type: "image", asset_id: "other", data: new Uint8Array([1]), metadata: { [SLOT_METADATA_KEY]: { kind: "image", slot_id: "other", size: [1, 1], seamless_x: false, seamless_y: false } } }] });
    await expect(node.process(ctx)).rejects.toThrow("Unknown template slot other");
    expect(getNativeTemplate("topdown").id).toBe("topdown");
  });
});
