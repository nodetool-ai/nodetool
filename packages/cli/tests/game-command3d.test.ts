import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gameSnapshot3D } from "@nodetool-ai/protocol";
import { createNative3DGame, createTopDownRoomGame, validateGame } from "@nodetool-ai/game-runtime";
import { prepareGameModelBinding3D } from "@nodetool-ai/game-renderer/preparation3d";
import { registerGameCommands } from "../src/commands/game.js";

let directory: string;
let gamePath: string;
let output: string;
let originalExitCode: typeof process.exitCode;

async function run(command: string, ...args: string[]): Promise<Record<string, unknown>> {
  output = "";
  const program = new Command();
  registerGameCommands(program);
  await program.parseAsync(["node", "nodetool", "game", command, gamePath, "--json", ...args]);
  return JSON.parse(output.trim());
}

function closedGlb(): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify({ asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: "Model" }] }));
  const padded = Math.ceil(json.length / 4) * 4;
  const bytes = new Uint8Array(20 + padded); bytes.fill(32, 20);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, bytes.length, true);
  view.setUint32(12, padded, true); view.setUint32(16, 0x4e4f534a, true); bytes.set(json, 20);
  return bytes;
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "nodetool-cli-game3d-"));
  gamePath = join(directory, "game.json");
  await writeFile(gamePath, JSON.stringify(createNative3DGame("a".repeat(32))));
  output = ""; originalExitCode = process.exitCode;
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => { output += String(chunk); return true; });
  vi.spyOn(console, "log").mockImplementation((value) => { output += `${String(value)}\n`; });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks(); process.exitCode = originalExitCode;
  await rm(directory, { recursive: true, force: true });
});

describe("native 3D game CLI commands", () => {
  it("preserves the complete legacy validation failure report", async () => {
    const legacy = createTopDownRoomGame("a".repeat(32)); legacy.entrySceneId = "missing";
    await writeFile(gamePath, JSON.stringify(legacy));
    expect(await run("validate")).toEqual(JSON.parse(JSON.stringify(validateGame(legacy))));
    expect(process.exitCode).toBe(1);
  });

  it("validates dimension and rejects unsupported engine versions", async () => {
    expect(await run("validate")).toMatchObject({ valid: true, document: { dimension: "3d" } });
    await writeFile(gamePath, JSON.stringify({ ...createNative3DGame("a".repeat(32)), engineVersion: "future" }));
    expect(await run("validate")).toMatchObject({ valid: false, diagnostics: [{ code: "unsupported_engine_version" }] });
    expect(process.exitCode).toBe(1);
  });

  it("runs analog recordings with spatial assertions and exact physics replay", async () => {
    const inputs = join(directory, "inputs.json");
    await writeFile(inputs, JSON.stringify(Array.from({ length: 30 }, () => ({ pressed: [], axes: { moveZ: -1 }, look: { x: 0.1, y: 0 } }))));
    const assertions = join(directory, "assertions.json");
    await writeFile(assertions, JSON.stringify({ ticks: [{ tick: 0, sceneId: "level", entities: [{ id: "player", x: 0, y: 1, z: 3, grounded: false, active: true }], events: [] }] }));
    const report = await run("simulate", "--ticks", "30", "--inputs", inputs, "--assertions", assertions, "--verify-replay");
    expect(report).toMatchObject({ dimension: "3d", ok: true, replay: { resumeTick: 15, verified: true }, snapshot: { tick: 30, physics: { encoding: "base64" } } });
    expect(report.state_hash).toMatch(/^[a-f0-9]{64}$/);
    const snapshot = gameSnapshot3D.parse(report.snapshot);
    expect(snapshot.entities.find((entity) => entity.id === "player")?.transform.position.z).toBeLessThan(3);
    expect(process.exitCode).toBe(originalExitCode);
  });

  it("simulates an animation graph driven by setAnimParam and verifies replay", async () => {
    const document = createNative3DGame("a".repeat(32));
    document.assets.hero = { mediaKind: "model", assetId: "hero", digest: "hero-digest", required: true, format: "glb", preparationVersion: "1",
      bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 2, z: 1 } }, nodeIds: ["node:0"], clipIds: ["clip:0", "clip:1", "clip:2"],
      geometryBytes: 1, textureBytes: 0, triangles: 1, supportedExtensions: [] };
    document.animationGraphs = { locomotion: { parameters: { speed: { kind: "float", default: 0 }, jump: { kind: "trigger" } }, layers: [{ id: "base", mode: "override", weight: 1, initialState: "move",
      states: { move: { motion: { kind: "blend1d", parameter: "speed", points: [{ value: 0, clip: "idle" }, { value: 2, clip: "walk" }, { value: 6, clip: "run" }] }, speed: 1, loop: true },
        jump: { motion: { kind: "clip", clip: "run" }, speed: 1, loop: false } },
      transitions: [{ from: "*", to: "jump", conditions: [{ parameter: "jump", op: "set" }], durationTicks: 8 }, { from: "jump", to: "move", conditions: [], exitTicks: 12, durationTicks: 8 }] }] } };
    const visual = document.scenes[0].entities.find((entity) => entity.id === "player-visual");
    if (!visual) { throw new Error("Player visual fixture is missing"); }
    delete visual.primitive;
    visual.model = { assetId: "hero", castShadow: true, receiveShadow: true };
    visual.animator3d = { clips: { idle: "clip:0", walk: "clip:1", run: "clip:2" }, playbackRate: 1, loop: true, transitionTicks: 6, graph: "locomotion" };
    visual.behaviors = [{ kind: "script", maxTickMs: 50, maxCommands: 4,
      source: "input=>({state:null,commands:[{kind:'setAnimParam',name:'speed',value:Math.min(6,input.tick/10)},...(input.tick%20===10?[{kind:'setAnimParam',name:'jump',value:true}]:[])]})" }];
    await writeFile(gamePath, JSON.stringify(document));
    const report = await run("simulate", "--ticks", "60", "--verify-replay");
    expect(report).toMatchObject({ ok: true, replay: { resumeTick: 30, verified: true } });
    const snapshot = gameSnapshot3D.parse(report.snapshot);
    expect(snapshot.entities.find((entity) => entity.id === "player-visual")?.animationGraph).toMatchObject({ graphId: "locomotion", parameters: { speed: 5.9, jump: false } });
  });

  it("simulates named collision layers whose matrix lets debris fall through the floor", async () => {
    const document = createNative3DGame("a".repeat(32));
    document.collisionLayers = ["world", "debris"];
    document.collisionMatrix = [["world", "debris"]];
    for (const entity of document.scenes[0].entities) {
      if (entity.id === "floor" && entity.collider3d) { entity.collider3d.layer = "world"; }
      if (entity.id === "crate" && entity.collider3d) { entity.collider3d.layer = "debris"; }
    }
    await writeFile(gamePath, JSON.stringify(document));
    expect(await run("validate")).toMatchObject({ valid: true });
    const report = await run("simulate", "--ticks", "60", "--verify-replay");
    expect(report).toMatchObject({ ok: true, replay: { verified: true } });
    const crate = gameSnapshot3D.parse(report.snapshot).entities.find((entity) => entity.id === "crate");
    expect(crate?.transform.position.y).toBeLessThan(-1);
  });

  it("reports failed z/grounded assertions and rejects misspelled 3D event fields", async () => {
    const assertions = join(directory, "assertions.json");
    await writeFile(assertions, JSON.stringify({ ticks: [{ tick: 0, entities: [{ id: "player", z: 99, grounded: true }] }] }));
    expect(await run("simulate", "--ticks", "0", "--assertions", assertions)).toMatchObject({ ok: false, failures: [
      { path: "entities.player.z" }, { path: "entities.player.grounded" }
    ] });
    await writeFile(assertions, JSON.stringify({ ticks: [{ tick: 1, events: [{ kind: "contact", sceneId: "level", entityId: "player", otherId: "floor", phase: "enter", sensor: false, normal: { x: 0, y: 1, z: 0 }, nromal: 1 }] }] }));
    expect(await run("simulate", "--ticks", "1", "--assertions", assertions)).toMatchObject({ error: expect.stringContaining("nromal") });
  });

  it("resolves prepared collider files and rejects changed artifact bytes", async () => {
    const document = createNative3DGame("a".repeat(32));
    const vertices = [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1];
    const indices = [0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3];
    const bytes = new TextEncoder().encode(JSON.stringify({ vertices, indices }));
    const assetId = "c".repeat(32);
    document.assets.terrain = { mediaKind: "collider", assetId, digest: createHash("sha256").update(bytes).digest("hex"), required: true,
      preparationVersion: "1", shape: "triangleMesh", bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } }, vertices: 4, triangles: 4 };
    const floor = document.scenes[0].entities.find((entity) => entity.id === "floor");
    if (!floor) { throw new Error("Floor missing"); }
    floor.collider3d = { kind: "triangleMesh", assetId: "terrain", offset: { x: 0, y: 0, z: 0 }, rotation: [0, 0, 0, 1],
      sensor: false, category: 1, mask: 65535, friction: 0.5, restitution: 0 };
    await writeFile(gamePath, JSON.stringify(document));
    const assets = join(directory, "assets"); await mkdir(assets); await writeFile(join(assets, `${assetId}.json`), bytes);
    expect(await run("simulate", "--ticks", "2", "--assets-dir", assets, "--verify-replay")).toMatchObject({ ok: true, replay: { verified: true } });
    await writeFile(join(assets, `${assetId}.json`), new TextEncoder().encode(`${new TextDecoder().decode(bytes)} `));
    expect(await run("simulate", "--ticks", "1", "--assets-dir", assets)).toMatchObject({ error: "Prepared collider digest mismatch" });
  });

  it("captures actual WebGL2 pixels with the same committed simulation hash", async () => {
    const played = await run("simulate", "--ticks", "3");
    const imagePath = join(directory, "frame.png");
    const captured = await run("capture", "--ticks", "3", "--out", imagePath, "--scale", "0.5");
    expect(captured).toMatchObject({ dimension: "3d", path: resolve(imagePath), tick: 3, capabilities: { backend: "webgl2" }, state_hash: played.state_hash });
    expect((await readFile(imagePath)).byteLength).toBeGreaterThan(100);
    expect(await run("capture", "--ticks", "1", "--out", imagePath, "--backend", "webgpu")).toMatchObject({ error: "3D capture backend must be webgl2" });
  });

  it("exports prepared local GLB assets and rejects unsafe resource file paths", async () => {
    const bytes = closedGlb(); const assetId = "b".repeat(32);
    const prepared = await prepareGameModelBinding3D(bytes, { assetId });
    if (!prepared.ok) { throw new Error("Fixture failed model preparation"); }
    const document = createNative3DGame("a".repeat(32)); document.assets.model = prepared.binding;
    await writeFile(gamePath, JSON.stringify(document));
    const assets = join(directory, "assets"); await mkdir(assets); await writeFile(join(assets, `${assetId}.glb`), bytes);
    const outputDir = join(directory, "build");
    const built = await run("build", "--out", outputDir, "--assets-dir", assets);
    expect(built.outputDir).toBe(resolve(outputDir));
    const manifest = JSON.parse(await readFile(join(outputDir, "manifest.json"), "utf8"));
    expect(manifest).toMatchObject({ dimension: "3d", sourceRevision: document.revision });
    expect(manifest.files[`assets/${createHash("sha256").update(bytes).digest("hex")}.glb`]).toHaveLength(64);
    document.assets.model.assetId = "../outside";
    await writeFile(gamePath, JSON.stringify(document));
    expect(await run("build", "--out", join(directory, "unsafe-build"), "--assets-dir", assets)).toMatchObject({ error: expect.stringContaining("full 32-character resource ID") });
  });
});
