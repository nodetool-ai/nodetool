import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createNative3DGame } from "@nodetool-ai/game-runtime";
import type { GameDocument3D } from "@nodetool-ai/protocol";
import { registerGameCommands } from "../src/commands/game.js";

let directory: string;
let output: string;
let originalExitCode: typeof process.exitCode;
let originalAssetsDir: string | undefined;

async function bench(path: string, ...args: string[]): Promise<Record<string, unknown>> {
  output = "";
  const program = new Command();
  registerGameCommands(program);
  await program.parseAsync(["node", "nodetool", "game", "bench", path, "--json", "--ticks", "4", "--warmup", "2", ...args]);
  return JSON.parse(output.trim()) as Record<string, unknown>;
}

/** A 3D game whose floor uses a prepared triangle-mesh collider stored under `assetId`. */
function colliderGame(assetId: string): { document: GameDocument3D; bytes: Uint8Array } {
  const document = createNative3DGame("b".repeat(32));
  const bytes = new TextEncoder().encode(JSON.stringify({ vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1], indices: [0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3] }));
  document.assets.terrain = { mediaKind: "collider", assetId, digest: createHash("sha256").update(bytes).digest("hex"), required: true,
    preparationVersion: "1", shape: "triangleMesh", bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } }, vertices: 4, triangles: 4 };
  const floor = document.scenes[0].entities.find((entity) => entity.id === "floor");
  if (!floor) { throw new Error("Floor missing"); }
  floor.collider3d = { kind: "triangleMesh", assetId: "terrain", offset: { x: 0, y: 0, z: 0 }, rotation: [0, 0, 0, 1],
    sensor: false, category: 1, mask: 65535, friction: 0.5, restitution: 0 };
  return { document, bytes };
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "nodetool-cli-game-bench-"));
  output = "";
  originalExitCode = process.exitCode;
  originalAssetsDir = process.env.NODETOOL_PACKAGE_ASSETS_DIR;
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => { output += String(chunk); return true; });
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(console, "log").mockImplementation((value) => { output += `${String(value)}\n`; });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  process.exitCode = originalExitCode;
  if (originalAssetsDir === undefined) { delete process.env.NODETOOL_PACKAGE_ASSETS_DIR; } else { process.env.NODETOOL_PACKAGE_ASSETS_DIR = originalAssetsDir; }
  await rm(directory, { recursive: true, force: true });
});

describe("game bench on real game files", () => {
  it("loads a prepared collider from --assets-dir and replays a route", async () => {
    const assetId = "c".repeat(32);
    const { document, bytes } = colliderGame(assetId);
    const assets = join(directory, "assets");
    await mkdir(assets);
    await writeFile(join(assets, `${assetId}.json`), bytes);
    const gamePath = join(directory, "game.json");
    await writeFile(gamePath, JSON.stringify(document));
    const routePath = join(directory, "route.json");
    await writeFile(routePath, JSON.stringify(Array.from({ length: 3 }, () => ({ pressed: ["jump"], justPressed: [], axes: { moveX: 1 } }))));
    expect(await bench(gamePath)).toMatchObject({ error: expect.stringContaining("Prepared collider") });
    const report = await bench(gamePath, "--assets-dir", assets, "--inputs", routePath);
    expect(report).toMatchObject({ documentId: "b".repeat(32), ticks: 4, warmupTicks: 2, inputTicks: 3 });
  });

  it("unwraps a shipped example file and resolves package:// assets", async () => {
    const { document, bytes } = colliderGame("package://nodetool-base/games/demo/terrain-collider.json");
    const packages = join(directory, "packages");
    await mkdir(join(packages, "nodetool-base", "games", "demo"), { recursive: true });
    await writeFile(join(packages, "nodetool-base", "games", "demo", "terrain-collider.json"), bytes);
    process.env.NODETOOL_PACKAGE_ASSETS_DIR = packages;
    const gamePath = join(directory, "example.game.json");
    await writeFile(gamePath, JSON.stringify({ name: "Demo", description: "A shipped example", document }));
    expect(await bench(gamePath)).toMatchObject({ documentId: "b".repeat(32), inputTicks: 0 });
  });

  it("rejects a package:// path that leaves the asset directory", async () => {
    const { document } = colliderGame("package://nodetool-base/../../secret.json");
    process.env.NODETOOL_PACKAGE_ASSETS_DIR = join(directory, "packages");
    await mkdir(join(directory, "packages", "nodetool-base"), { recursive: true });
    await writeFile(join(directory, "secret.json"), "{}");
    const gamePath = join(directory, "game.json");
    await writeFile(gamePath, JSON.stringify(document));
    expect(await bench(gamePath)).toMatchObject({ error: expect.stringContaining("escapes the asset directory") });
  });
});
