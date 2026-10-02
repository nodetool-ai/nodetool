import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdtemp, readFile, readdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { build as bundle } from "esbuild";
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
    game.assets.player!.sampling = "linear";
    const build = await buildStandaloneGame({
      document: game,
      outputDir,
      resolveAsset: async (id) => id === sourceId ? { bytes, mimeType: "image/png" } : null,
    });
    const exported = JSON.parse(await readFile(build.gamePath, "utf8"));
    expect(exported.assets.player.assetId).toBe(`./assets/${digest}.png`);
    expect(exported.assets.player.digest).toBe(digest);
    expect(exported.assets.player.sampling).toBe("linear");
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

  it("rejects a transparent LUT before publishing", async () => {
    const directory = await mkdtemp(join(tmpdir(), "nodetool-game-lut-export-"));
    directories.push(directory);
    const game = createTopDownRoomGame("lut-export");
    game.schemaVersion = 2;
    game.renderEffects = [{ kind: "lut", assetId: "grade", size: 2, intensity: 1, required: true,
      domainMin: [0, 0, 0], domainMax: [1, 1, 1] }];
    const canvas = createCanvas(4, 2);
    canvas.getContext("2d").fillRect(0, 0, 2, 2);
    const bytes = canvas.toBuffer("image/png");
    const sourceId = "c".repeat(32);
    game.assets.grade = { assetId: sourceId, digest: createHash("sha256").update(bytes).digest("hex"),
      mediaKind: "image", width: 4, height: 2, pivot: { x: 0.5, y: 0.5 }, sampling: "nearest" };
    await expect(buildStandaloneGame({ document: game, outputDir: join(directory, "build"),
      resolveAsset: async (id) => id === sourceId ? { bytes, mimeType: "image/png" } : null })).rejects.toThrow("must be opaque");
    await expect(readdir(join(directory, "build"))).rejects.toThrow();
  });

  it("exports a scene-owned music asset for offline playback", async () => {
    const directory = await mkdtemp(join(tmpdir(), "nodetool-game-music-export-"));
    directories.push(directory);
    const game = createTopDownRoomGame("music-export");
    game.schemaVersion = 2;
    game.scenes[0].music = { assetId: "music", volume: 0.5, fadeInTicks: 30, fadeOutTicks: 30 };
    const bytes = Buffer.from("RIFF0000WAVE");
    const sourceId = "b".repeat(32);
    const digest = createHash("sha256").update(bytes).digest("hex");
    game.assets.music = { assetId: sourceId, digest, mediaKind: "audio", width: 1, height: 1,
      pivot: { x: 0.5, y: 0.5 }, sampling: "nearest" };
    const built = await buildStandaloneGame({ document: game, outputDir: join(directory, "build"),
      resolveAsset: async (id) => id === sourceId ? { bytes, mimeType: "audio/wav" } : null });
    const exported = JSON.parse(await readFile(built.gamePath, "utf8"));
    expect(exported.scenes[0].music).toEqual({ assetId: "music", volume: 0.5, fadeInTicks: 30, fadeOutTicks: 30 });
    expect(exported.assets.music.assetId).toBe(`./assets/${digest}.wav`);
    expect(await readFile(join(built.outputDir, "assets", `${digest}.wav`))).toEqual(bytes);
  });
});

it("exports from a flattened backend using its staged player bundle", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nodetool-packaged-game-export-"));
  directories.push(directory);
  const game = createTopDownRoomGame("packaged-export");
  const staged = await buildStandaloneGame({ document: game, outputDir: join(directory, "staged"), resolveAsset: async () => null });
  await copyFile(staged.playerPath, join(directory, "player-v1.js"));
  await symlink(resolve("../../node_modules"), join(directory, "node_modules"), "junction");
  const backend = join(directory, "server.mjs");
  await bundle({ entryPoints: [resolve("src/build.ts")], outfile: backend,
    bundle: true, platform: "node", format: "esm", packages: "external" });
  const output = join(directory, "export");
  const script = `import { readFile } from "node:fs/promises";
    import { buildStandaloneGame } from ${JSON.stringify(pathToFileURL(backend).href)};
    const document = JSON.parse(await readFile(${JSON.stringify(staged.gamePath)}, "utf8"));
    await buildStandaloneGame({ document, outputDir: ${JSON.stringify(output)}, resolveAsset: async () => null });`;
  await promisify(execFile)(process.execPath, ["--conditions=nodetool-dev", "--import=tsx", "--input-type=module", "-e", script]);
  expect(await readFile(join(output, "player-v1.js"))).toEqual(await readFile(staged.playerPath));
  expect(JSON.parse(await readFile(join(output, "game.json"), "utf8")).id).toBe(game.id);
});
