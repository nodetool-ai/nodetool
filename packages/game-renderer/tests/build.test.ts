import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { createTopDownRoomGame } from "@nodetool-ai/game-runtime";
import { afterEach, describe, expect, it } from "vitest";
import { buildStandaloneGame } from "../src/build.js";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("standalone game build", () => {
  it("bundles the player and rewrites authorized media to content-addressed paths", async () => {
    const directory = await mkdtemp(join(tmpdir(), "nodetool-game-export-"));
    directories.push(directory);
    const outputDir = join(directory, "build");
    const game = createTopDownRoomGame("game-export");
    const sourceId = "a".repeat(32);
    game.assets.player!.assetId = sourceId;
    const canvas = createCanvas(2, 2);
    canvas.getContext("2d").fillRect(0, 0, 2, 2);
    const bytes = canvas.toBuffer("image/png");
    const digest = createHash("sha256").update(bytes).digest("hex");
    game.assets.player!.digest = digest;
    const build = await buildStandaloneGame({
      document: game,
      outputDir,
      resolveAsset: async (id) => id === sourceId ? { bytes, mimeType: "image/png" } : null,
    });
    const exported = JSON.parse(await readFile(build.gamePath, "utf8"));
    expect(exported.assets.player.assetId).toBe(`./assets/${digest}.png`);
    expect(exported.assets.player.digest).toBe(digest);
    expect(exported.assets.gem.assetId).toBe("builtin:gem");
    expect(JSON.stringify(exported)).not.toContain(sourceId);
    expect(await readdir(outputDir)).toEqual(expect.arrayContaining(["assets", "game.json", "index.html", "player-v1.js", "style.css", "emscripten-module.wasm"]));
    expect((await readFile(join(outputDir, "emscripten-module.wasm"))).length).toBeGreaterThan(0);
    expect(await readFile(join(outputDir, "assets", `${digest}.png`))).toEqual(bytes);
    expect((await readFile(build.playerPath)).length).toBeGreaterThan(0);
  });

  it("rejects missing non-builtin assets without publishing a partial build", async () => {
    const directory = await mkdtemp(join(tmpdir(), "nodetool-game-export-"));
    directories.push(directory);
    const outputDir = join(directory, "build");
    const game = createTopDownRoomGame("game-export");
    game.assets.player!.assetId = "a".repeat(32);
    await expect(buildStandaloneGame({ document: game, outputDir, resolveAsset: async () => null })).rejects.toThrow("Missing asset for player");
    await expect(readdir(outputDir)).rejects.toThrow();
  });
});
