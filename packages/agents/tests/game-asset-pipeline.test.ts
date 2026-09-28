import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ModelObserver, Project, Workspace, initTestDb } from "@nodetool-ai/models";
import { gameAssetBinding, gameDocument } from "@nodetool-ai/protocol";
import { createLocalWorkspace, MemoryCache, ProcessingContext } from "@nodetool-ai/runtime";
import { InMemoryStorageAdapter, assetObjectKey } from "@nodetool-ai/storage";
import { createCapabilityRun, UNGATED } from "../src/capabilities/invoke.js";
import type { CapabilityExport, CapabilityRun } from "../src/capabilities/types.js";
import { generateImage } from "../src/capabilities/media.js";
import { toolForCapabilityName } from "../src/capabilities/lazy-tool.js";
import { GAME_ASSET_NODE_RUNNER_CONTEXT_KEY, type GameAssetNodeRunner } from "../src/capabilities/game-asset-source.js";

const USER = "game-asset-owner";
const PROJECT = "game-asset-project";
let directory: string;

function documentOf(result: unknown) {
  if (typeof result !== "object" || !result || !("document" in result)) throw new Error(JSON.stringify(result));
  return gameDocument.parse(result.document);
}

async function setup(capabilities: readonly CapabilityExport[] = []) {
  const storage = new InMemoryStorageAdapter();
  const workspace = createLocalWorkspace(directory);
  const context = new ProcessingContext({ jobId: "game-asset-test", userId: USER,
    cache: new MemoryCache(), workspace, assetStorage: storage });
  const run = createCapabilityRun({ context, gate: UNGATED, capabilities });
  const document = documentOf(await run.invoke("create_native_game", { project_id: PROJECT, name: "Asset room" }));
  return { run, context, workspace, storage, id: document.id };
}

async function imported(run: CapabilityRun, id: string, kind: string, slot: string, input_file: string, preparation?: unknown) {
  return run.invoke("generate_game_asset", { game_id: id, kind, slot, input_file,
    ...(preparation === undefined ? {} : { preparation }) });
}

describe("game asset preparation and kinds", () => {
  beforeEach(async () => {
    initTestDb();
    directory = await mkdtemp(join(tmpdir(), "nodetool-game-asset-"));
    await Project.insertNew({ id: PROJECT, user_id: USER, name: "Game", kind: "game" });
    await Workspace.create({ user_id: USER, project_id: PROJECT, name: "Game files", path: directory, is_default: false });
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    ModelObserver.clear();
    await rm(directory, { recursive: true, force: true });
  });

  it("imports a pose atlas and returns frame bindings usable in one document edit", async () => {
    const { run, workspace, id, storage } = await setup();
    const pixels = Buffer.alloc(8 * 4 * 4);
    pixels.set([255, 0, 0, 255], (1 * 8 + 1) * 4);
    pixels.set([0, 255, 0, 255], (0 * 8 + 6) * 4);
    await workspace.write("poses.png", await sharp(pixels, { raw: { width: 8, height: 4, channels: 4 } }).png().toBuffer());
    const result = await imported(run, id.slice(0, 12), "image", "hero", "poses.png", { sheet: { cols: 2, rows: 1, baseline: 3 } });
    const document = documentOf(result);
    const primary = document.assets["hero"];
    expect(primary.frame).toEqual({ x: 0, y: 0, width: 4, height: 4 });
    expect(primary.pivot).toEqual({ x: 0.5, y: 1 });
    if (typeof result !== "object" || !result || !("bindings" in result)) throw new Error("Missing frame bindings");
    const { z } = await import("zod");
    const bindings = z.record(z.string(), gameAssetBinding).parse(result.bindings);
    expect(Object.keys(bindings)).toEqual(["hero.frame.0", "hero.frame.1"]);
    expect(bindings["hero.frame.1"].assetId).toBe(primary.assetId);
    const edited = documentOf(await run.invoke("edit_native_game", { game_id: id,
      ops: Object.entries(bindings).map(([slot, binding]) => ({ op: "bind_asset", slot, binding })) }));
    expect(edited.assets["hero.frame.1"].frame).toEqual({ x: 4, y: 0, width: 4, height: 4 });
    const bytes = await storage.retrieve(storage.uriForKey(assetObjectKey(USER, `${primary.assetId}.png`)));
    expect((await sharp(bytes).metadata()).width).toBe(8);
  });

  it("imports a texture and returns the 16 tile edge bindings", async () => {
    const { run, workspace, id } = await setup();
    await workspace.write("stone.png", await sharp({ create: { width: 4, height: 4, channels: 4, background: "gray" } }).png().toBuffer());
    const result = await imported(run, id, "image", "stone", "stone.png", { tileset: { tileWidth: 4, tileHeight: 4, edges: 1 } });
    expect(documentOf(result).assets["stone"]).toMatchObject({ width: 16, height: 16 });
    if (typeof result !== "object" || !result || !("bindings" in result)) throw new Error("Missing tile bindings");
    expect(Object.keys(result.bindings ?? {})).toHaveLength(16);
  });

  it("creates a packed LUT without requesting a model", async () => {
    const { run, id, storage } = await setup();
    const generation = vi.spyOn(generateImage, "impl");
    const result = await run.invoke("generate_game_asset", { game_id: id, kind: "image", slot: "grade", preparation: { lut: { size: 2 } } });
    const binding = documentOf(result).assets["grade"];
    expect([binding.width, binding.height]).toEqual([4, 2]);
    expect(generation).not.toHaveBeenCalled();
    expect(await storage.retrieve(storage.uriForKey(assetObjectKey(USER, `${binding.assetId}.png`)))).not.toBeNull();
  });

  it("imports a real font and rejects a font signature without a table directory", async () => {
    const { run, workspace, id, storage } = await setup();
    const bytes = await readFile(join(process.cwd(), "../timeline/fonts/BebasNeue-Regular.ttf"));
    await workspace.write("display.ttf", bytes);
    const result = await imported(run, id, "font", "display", "display.ttf");
    const binding = documentOf(result).assets["display"];
    expect(binding).toMatchObject({ mediaKind: "font", fontFormat: "ttf" });
    expect(await storage.retrieve(storage.uriForKey(assetObjectKey(USER, `${binding.assetId}.ttf`)))).toEqual(new Uint8Array(bytes));
    const copy = documentOf(await imported(run, id, "font", "display-copy", `asset://${binding.assetId.slice(0, 12)}.ttf`));
    expect(copy.assets["display-copy"].digest).toBe(binding.digest);
    await workspace.write("invalid.ttf", new Uint8Array([0, 1, 0, 0]));
    expect(await imported(run, id, "font", "invalid", "invalid.ttf")).toEqual({ error: "input_file must contain a valid TrueType or OpenType font" });
  });

  it("generates SFX through the registered node runner with its real inputs", async () => {
    const wav = Buffer.from("RIFF0000WAVE", "ascii");
    const outputAssetId = "f".repeat(32);
    const impl = vi.fn(async () => ({ audio: { type: "audio", asset_id: outputAssetId,
      uri: `/api/storage/${outputAssetId}.wav` } }));
    const runner: CapabilityExport = { spec: { name: "run_node", description: "Test node runner", category: "execute", inputSchema: { type: "object" } }, impl };
    const { run, id, storage } = await setup([runner]);
    await storage.store(assetObjectKey(USER, `${outputAssetId}.wav`), wav, "audio/wav");
    const result = await run.invoke("generate_game_asset", { game_id: id, kind: "sfx", slot: "jump",
      node_type: "fal.text_to_audio.ElevenLabsSoundEffectsV2", params: { text: "short jump pop", duration_seconds: 0.5 } });
    const binding = documentOf(result).assets["jump"];
    expect(binding.mediaKind).toBe("audio");
    expect(impl).toHaveBeenCalledWith(run, { node_type: "fal.text_to_audio.ElevenLabsSoundEffectsV2", inputs: { text: "short jump pop", duration_seconds: 0.5 } });
    expect(await storage.retrieve(storage.uriForKey(assetObjectKey(USER, `${binding.assetId}.wav`)))).toEqual(new Uint8Array(wav));
  });

  it("imports MP3 SFX and refuses unsupported font or arbitrary URL generation", async () => {
    const { run, workspace, id } = await setup();
    await workspace.write("jump.mp3", Buffer.from("ID3example", "ascii"));
    expect(documentOf(await imported(run, id, "sfx", "jump", "jump.mp3")).assets["jump"].mediaKind).toBe("audio");
    expect(await run.invoke("generate_game_asset", { game_id: id, kind: "font", slot: "font", prompt: "Generate a font" }))
      .toEqual({ error: "Font assets require input_file naming an owned TTF or OTF asset or workspace file" });
    expect(await imported(run, id, "font", "font", "https://example.com/display.ttf"))
      .toEqual({ error: "input_file must be an owned asset URI or workspace-relative path" });
    expect(await run.invoke("generate_game_asset", { game_id: id, kind: "sfx", slot: "boom", prompt: "An explosion" }))
      .toMatchObject({ error: expect.stringContaining("node_type") });
  });

  it("uses the live gated node runner when SFX is called through the lazy tool belt", async () => {
    const wav = Buffer.from("RIFF0000WAVE", "ascii");
    const impl = vi.fn(async () => ({ audio: { type: "audio", data: wav } }));
    const runner: CapabilityExport = { spec: { name: "run_node", description: "Test node runner", category: "execute", inputSchema: { type: "object" } }, impl };
    const { run, context, id } = await setup([runner]);
    const hostRunner: GameAssetNodeRunner = (args) => run.invoke("run_node", args);
    context.set(GAME_ASSET_NODE_RUNNER_CONTEXT_KEY, hostRunner);
    const result = await toolForCapabilityName("generate_game_asset").process(context, {
      game_id: id, kind: "sfx", slot: "landing", node_type: "fal.text_to_audio.ElevenLabsSoundEffectsV2",
      params: { text: "soft landing thud" }
    });
    expect(documentOf(result).assets["landing"].mediaKind).toBe("audio");
    expect(impl).toHaveBeenCalledWith(run, { node_type: "fal.text_to_audio.ElevenLabsSoundEffectsV2", inputs: { text: "soft landing thud" } });
  });

  it("preserves a host permission denial and leaves the game unchanged", async () => {
    const impl = vi.fn(async () => ({ audio: { type: "audio", data: Buffer.from("RIFF0000WAVE", "ascii") } }));
    const runner: CapabilityExport = { spec: { name: "run_node", description: "Test node runner", category: "execute", inputSchema: { type: "object" } }, impl };
    const { context, id, run } = await setup();
    const liveRun = createCapabilityRun({ context, gate: { ...UNGATED, mode: "plan" }, capabilities: [runner] });
    const hostRunner: GameAssetNodeRunner = (args) => liveRun.invoke("run_node", args);
    context.set(GAME_ASSET_NODE_RUNNER_CONTEXT_KEY, hostRunner);
    const result = await toolForCapabilityName("generate_game_asset").process(context, {
      game_id: id, kind: "sfx", slot: "landing", node_type: "fal.text_to_audio.ElevenLabsSoundEffectsV2", params: { text: "landing" }
    });
    expect(result).toEqual({ error: "blocked_in_plan_mode",
      message: "Cannot run `run_node` in plan mode — only read-only tools are allowed. Produce a concrete plan instead and let the user switch out of plan mode to execute it." });
    expect(impl).not.toHaveBeenCalled();
    const current = documentOf(await run.invoke("get_native_game", { game_id: id, view: "full" }));
    expect(current.assets["landing"]).toBeUndefined();
  });

  it("explains how to import SFX when a lazy tool has no host node runner", async () => {
    const { context, id } = await setup();
    expect(await toolForCapabilityName("generate_game_asset").process(context, {
      game_id: id, kind: "sfx", slot: "landing", node_type: "fal.text_to_audio.ElevenLabsSoundEffectsV2", params: { text: "landing" }
    })).toEqual({ error: "This host has no sound-effect node runner. Generate the sound with run_node in the app and import its asset URI through input_file." });
  });
});
