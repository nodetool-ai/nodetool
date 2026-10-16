import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32 } from "node:zlib";
import { createCanvas } from "@napi-rs/canvas";
import { createNative3DGame, createTopDownRoomGame, validateGame, validateGame3D } from "@nodetool-ai/game-runtime";
import { afterEach, describe, expect, it } from "vitest";
import { buildStandaloneGame } from "../src/build.js";
import { buildStandaloneGame3D } from "../src/build3d.js";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});
async function output(): Promise<{ root: string; outputDir: string }> {
  const root = await mkdtemp(join(tmpdir(), "game-export-media-"));
  directories.push(root);
  return { root, outputDir: join(root, "build") };
}
const digest = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

function invalidPngPayload(): Buffer {
  const bytes = createCanvas(2, 2).toBuffer("image/png");
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    if (bytes.toString("ascii", offset + 4, offset + 8) === "IDAT") {
      bytes.fill(0, offset + 8, offset + 8 + length);
      bytes.writeUInt32BE(crc32(bytes.subarray(offset + 4, offset + 8 + length)), offset + 8 + length);
      return bytes;
    }
    offset += length + 12;
  }
  throw new Error("PNG control contains no image data");
}

describe("standalone export media decoding", () => {
  it("rejects a correctly hashed header-only ordinary 2D image", async () => {
    const paths = await output();
    const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const game = createTopDownRoomGame("malformed-image");
    const player = game.assets.player;
    if (!player) { throw new Error("The template has no player image control"); }
    game.assets.player = { ...player, assetId: "malformed-image", digest: digest(bytes) };
    expect(validateGame(game).valid).toBe(true);
    await expect(buildStandaloneGame({ document: game, outputDir: paths.outputDir,
      resolveAsset: async () => ({ bytes, mimeType: "image/png" }) })).rejects.toThrow(/image|decode/i);
    expect(await readdir(paths.root)).toEqual([]);
  });

  it("rejects correctly hashed PNG chunks whose compressed pixels cannot decode in 3D", async () => {
    const paths = await output();
    const bytes = invalidPngPayload();
    const game = createNative3DGame("malformed-pixels");
    game.assets.image = { assetId: "malformed-image", digest: digest(bytes), mediaKind: "image", required: true,
      format: "png", width: 2, height: 2, byteLength: bytes.length, preparationVersion: "1" };
    expect(validateGame3D(game).valid).toBe(true);
    await expect(buildStandaloneGame3D({ document: game, outputDir: paths.outputDir,
      resolveAsset: async () => ({ bytes, mimeType: "image/png" }) })).rejects.toThrow(/image|decode/i);
    expect(await readdir(paths.root)).toEqual([]);
  });

  it("rejects a correctly hashed header-only 3D font", async () => {
    const paths = await output();
    const bytes = Buffer.from([0, 1, 0, 0]);
    const game = createNative3DGame("malformed-font");
    game.assets.font = { assetId: "malformed-font", digest: digest(bytes), mediaKind: "font", required: true, fontFormat: "ttf" };
    expect(validateGame3D(game).valid).toBe(true);
    await expect(buildStandaloneGame3D({ document: game, outputDir: paths.outputDir,
      resolveAsset: async () => ({ bytes, mimeType: "font/ttf" }) })).rejects.toThrow(/font|decode/i);
    expect(await readdir(paths.root)).toEqual([]);
  });

  it.each(["2d", "3d"])("rejects a correctly hashed undecodable audio header in %s", async (dimension) => {
    const paths = await output();
    const bytes = Buffer.from("RIFF0000WAVE");
    const asset = { bytes, mimeType: "audio/wav" };
    if (dimension === "3d") {
      const game = createNative3DGame("malformed-audio");
      game.assets.audio = { assetId: "malformed-audio", digest: digest(bytes), mediaKind: "audio", required: true };
      expect(validateGame3D(game).valid).toBe(true);
      await expect(buildStandaloneGame3D({ document: game, outputDir: paths.outputDir,
        resolveAsset: async () => asset })).rejects.toThrow(/audio|decode/i);
    } else {
      const game = createTopDownRoomGame("malformed-audio");
      game.assets.audio = { assetId: "malformed-audio", digest: digest(bytes), mediaKind: "audio", width: 1, height: 1,
        pivot: { x: 0.5, y: 0.5 }, sampling: "nearest" };
      expect(validateGame(game).valid).toBe(true);
      await expect(buildStandaloneGame({ document: game, outputDir: paths.outputDir,
        resolveAsset: async () => asset })).rejects.toThrow(/audio|decode/i);
    }
    expect(await readdir(paths.root)).toEqual([]);
  });

  it.each(["png", "jpeg", "webp"] as const)("preserves valid %s image bytes in both dimensions", async (format) => {
    const canvas = createCanvas(2, 2);
    canvas.getContext("2d").fillRect(0, 0, 2, 2);
    const bytes = canvas.toBuffer(`image/${format}`);
    const hash = digest(bytes);
    const two = await output();
    const game2d = createTopDownRoomGame("valid-image");
    game2d.assets.image = { assetId: "valid-image", digest: hash, mediaKind: "image", width: 2, height: 2,
      pivot: { x: 0.5, y: 0.5 }, sampling: "nearest" };
    await buildStandaloneGame({ document: game2d, outputDir: two.outputDir,
      resolveAsset: async () => ({ bytes, mimeType: `image/${format}` }) });
    expect(await readFile(join(two.outputDir, "assets", `${hash}.${format === "jpeg" ? "jpg" : format}`))).toEqual(bytes);
    const three = await output();
    const game3d = createNative3DGame("valid-image");
    game3d.assets.image = { assetId: "valid-image", digest: hash, mediaKind: "image", required: true,
      format, width: 2, height: 2, byteLength: bytes.length, preparationVersion: "1" };
    await buildStandaloneGame3D({ document: game3d, outputDir: three.outputDir,
      resolveAsset: async () => ({ bytes, mimeType: `image/${format}` }) });
    expect(await readFile(join(three.outputDir, "assets", `${hash}.${format}`))).toEqual(bytes);
  });

  it("preserves valid 3D font bytes", async () => {
    const paths = await output();
    const bytes = await readFile(new URL("../../timeline/fonts/BebasNeue-Regular.ttf", import.meta.url));
    const game = createNative3DGame("valid-font");
    game.assets.font = { assetId: "valid-font", digest: digest(bytes), mediaKind: "font", required: true, fontFormat: "ttf" };
    await buildStandaloneGame3D({ document: game, outputDir: paths.outputDir,
      resolveAsset: async () => ({ bytes, mimeType: "font/ttf" }) });
    expect(await readFile(join(paths.outputDir, "assets", `${digest(bytes)}.ttf`))).toEqual(bytes);
  });
});
