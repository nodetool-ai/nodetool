import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Asset, Game, ModelObserver, Prediction, Project, Workspace, initTestDb } from "@nodetool-ai/models";
import { InMemoryStorageAdapter, assetObjectKey } from "@nodetool-ai/storage";
import { workspaceFromRow } from "@nodetool-ai/execution/service";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { GameDocument } from "@nodetool-ai/protocol";
import { createCapabilityRun, UNGATED } from "../src/capabilities/invoke.js";
import { module as gameModule } from "../src/capabilities/game.js";
import { generateImage, generateSpeech } from "../src/capabilities/media.js";
import { capabilityModuleIssues } from "../src/capabilities/registry.js";

const USER = "game-agent-owner";
const PROJECT = "game-agent-project";
let directory: string;

function run(user = USER, assetStorage?: InMemoryStorageAdapter) {
  return createCapabilityRun({
    context: { userId: user, assetStorage } as ProcessingContext,
    gate: UNGATED
  });
}

interface GameReply {
  game: { id: string; revision: string };
  document: GameDocument;
}

describe("native game capabilities", () => {
  beforeEach(async () => {
    initTestDb();
    directory = await mkdtemp(join(tmpdir(), "nodetool-game-agent-"));
    await Project.insertNew({ id: PROJECT, user_id: USER, name: "Game", kind: "game" });
    await Workspace.create({ user_id: USER, project_id: PROJECT, name: "Game files", path: directory, is_default: false });
  });
  afterEach(async () => {
    ModelObserver.clear();
    await rm(directory, { recursive: true, force: true });
  });

  it("registers its native game specs", () => {
    expect(capabilityModuleIssues("game", gameModule)).toEqual([]);
    expect(gameModule.exports.map((entry) => entry.spec.name)).toEqual([
      "create_native_game", "get_native_game", "publish_native_game",
      "install_native_game_asset", "playtest_native_game", "build_native_game",
      "edit_native_game", "capture_native_game_frame", "generate_game_asset",
      "list_example_games", "get_example_game", "install_example_game", "autoplay_native_game"
    ]);
  });

  it("creates, reopens, rejects stale edits, and playtests a pinned revision", async () => {
    const agent = run();
    const created = await agent.invoke("create_native_game", { project_id: PROJECT, name: "Room" }) as GameReply;
    expect(created.game.id).toHaveLength(32);
    expect(created.document.id).toHaveLength(32);
    const opened = await agent.invoke("get_native_game", { game_id: created.game.id, view: "full" }) as GameReply;
    expect(opened.document).toEqual(created.document);

    const changed = {
      ...opened.document,
      scenes: opened.document.scenes.map((scene) => ({ ...scene, name: "Agent room" }))
    };
    const saved = await agent.invoke("publish_native_game", {
      game_id: created.game.id,
      base_revision: created.game.revision,
      document: changed
    }) as GameReply;
    expect(saved.document.scenes[0]?.name).toBe("Agent room");
    expect(await agent.invoke("publish_native_game", {
      game_id: created.game.id,
      base_revision: created.game.revision,
      document: changed
    })).toMatchObject({ error: "Game was modified concurrently" });

    const played = await agent.invoke("playtest_native_game", {
      game_id: created.game.id,
      revision: saved.game.revision,
      inputs: [{ pressed: ["right"], ticks: 60 }],
      assertions: [{ at_tick: 0, entity_id: "player", near: { x: 0, y: 0, tolerance: 0 } }, { no_script_errors: true }]
    }) as { game_id: string; ticks: number; revision: string; assertion_results: Array<{ passed: boolean }> };
    expect(played).toMatchObject({ ticks: 60, revision: saved.game.revision });
    expect(played.assertion_results.every((result) => result.passed)).toBe(true);
    const assertedWithoutInputs = await agent.invoke("playtest_native_game", {
      game_id: created.game.id,
      assertions: [{ at_tick: 10, entity_id: "player", near: { x: 0, y: 0, tolerance: 100 } }]
    }) as { ticks: number; assertion_results: Array<{ passed: boolean }> };
    expect(assertedWithoutInputs.ticks).toBe(10);
    expect(assertedWithoutInputs.assertion_results[0]?.passed).toBe(true);
    expect(played.game_id).toHaveLength(12);
    expect((await agent.invoke("get_native_game", { game_id: played.game_id }) as GameReply).game.id).toBe(created.game.id);
    expect(await agent.invoke("playtest_native_game", {
      game_id: created.game.id,
      inputs: Array.from({ length: 18001 }, () => ({ pressed: [] }))
    })).toMatchObject({ error: expect.stringContaining("at most 18000") });
    expect(await run("stranger").invoke("get_native_game", { game_id: created.game.id })).toEqual({ error: "Game not found" });
  });

  it("edits the draft atomically, reads an outline, and captures the edited frame", async () => {
    const agent = run();
    const created = await agent.invoke("create_native_game", { project_id: PROJECT, name: "Draft room" }) as GameReply;
    const outline = await agent.invoke("get_native_game", { game_id: created.game.id }) as { outline: { scenes: unknown[] }; draft_updated_at: string };
    expect(outline.outline.scenes).toHaveLength(1);
    expect(outline).not.toHaveProperty("document");
    const invalid = await agent.invoke("edit_native_game", { game_id: created.game.id,
      ops: [{ op: "update_entity", entity_id: "missing", set: { name: "Nope" } }] }) as { issues: Array<{ op_index: number; path: unknown[] }> };
    expect(invalid.issues[0]).toMatchObject({ op_index: 0 });
    expect((await agent.invoke("get_native_game", { game_id: created.game.id, view: "full" }) as GameReply).document).toEqual(created.document);
    const editAgent = createCapabilityRun({
      context: { userId: USER, threadId: "thread-1", get: (key: string) => key === "chat_message_id" ? "message-1" : undefined } as unknown as ProcessingContext,
      gate: UNGATED
    });
    const edited = await editAgent.invoke("edit_native_game", { game_id: created.game.id,
      base_updated_at: outline.draft_updated_at,
      ops: [{ op: "add_entity", scene_id: "room", entity: { id: "new-sprite", name: "New sprite", transform2d: { x: 1, y: 1 }, sprite: { assetId: "gem", width: 1, height: 1 } } }] }) as GameReply;
    expect(edited.document.scenes[0]?.entities.some((entity) => entity.id === "new-sprite")).toBe(true);
    expect((await Game.listDraftChanges(USER, created.game.id))[0]).toMatchObject({ actor: "agent", threadId: "thread-1", messageId: "message-1" });
    const revision = await agent.invoke("get_native_game", { game_id: created.game.id, source: "revision", view: "full" }) as GameReply;
    expect(revision.document).toEqual(created.document);
    const [row] = await Workspace.listByProject(USER, PROJECT);
    if (!row) throw new Error("Project workspace missing");
    const workspace = workspaceFromRow(row);
    if (!workspace) throw new Error("Workspace storage missing");
    const captureAgent = createCapabilityRun({ context: { userId: USER, workspace } as ProcessingContext, gate: UNGATED });
    const captured = await captureAgent.invoke("capture_native_game_frame", { game_id: created.game.id, ticks: [0] }) as { frames: Array<{ tick: number; image: { path: string }; visible_entities: Array<{ id: string }> }> };
    expect(captured.frames[0]?.visible_entities).toEqual(expect.arrayContaining([expect.objectContaining({ id: "new-sprite" })]));
    const imagePath = captured.frames[0]?.image.path;
    if (!imagePath) throw new Error("Capture image path missing");
    const imageBytes = await workspace.read(imagePath);
    if (!imageBytes) throw new Error("Capture image missing");
    const image = await loadImage(Buffer.from(imageBytes));
    const canvas = createCanvas(image.width, image.height);
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    expect([...context.getImageData(288, 112, 1, 1).data].slice(0, 3)).toEqual([255, 196, 50]);
  });

  it("executes scripted behavior during agent playtests", async () => {
    const agent = run();
    const created = await agent.invoke("create_native_game", { project_id: PROJECT, name: "Scripted room" }) as GameReply;
    const document = {
      ...created.document,
      scenes: created.document.scenes.map((scene) => ({
        ...scene,
        entities: scene.entities.map((entity) => entity.id === "player"
          ? { ...entity, behaviors: [{ kind: "script" as const, source: "({state}) => ({state: {ticks: (state?.ticks ?? 0) + 1}, commands: [{kind: 'setVelocity', x: 3, y: 0}]})", maxCommands: 8, maxTickMs: 30 }] }
          : entity)
      }))
    };
    const published = await agent.invoke("publish_native_game", {
      game_id: created.game.id,
      base_revision: created.game.revision,
      document
    }) as GameReply;
    const played = await agent.invoke("playtest_native_game", {
      game_id: created.game.id,
      revision: published.game.revision,
      inputs: Array.from({ length: 10 }, () => ({ pressed: [] }))
    }) as { state: { entities: Array<{ id: string; x: number }> } };
    expect(played.state.entities.find((entity) => entity.id === "player")?.x).toBeCloseTo(0.5);
  });

  it("builds an immutable standalone player in the owned project workspace", async () => {
    const agent = run();
    const created = await agent.invoke("create_native_game", { project_id: PROJECT, name: "Room" }) as GameReply;
    const result = await agent.invoke("build_native_game", {
      game_id: created.game.id.slice(0, 12), revision: created.game.revision
    }) as { game_id: string; revision: string; build_path: string; entry_path: string; cached: boolean };
    expect(result).toMatchObject({
      game_id: created.game.id,
      revision: created.game.revision,
      build_path: `game-builds/${created.game.id}/${created.game.revision}`,
      cached: false
    });
    expect(await readFile(join(directory, result.entry_path), "utf8")).toContain("NodeTool Game");
    const builtDocument = JSON.parse(await readFile(join(directory, result.build_path, "game.json"), "utf8")) as GameDocument;
    expect(builtDocument.id).toBe(created.game.id);
    expect(builtDocument.revision).toBe(created.game.revision);
    expect(await agent.invoke("build_native_game", { game_id: created.game.id })).toMatchObject({ cached: true });
    expect(await run("stranger").invoke("build_native_game", { game_id: created.game.id })).toEqual({ error: "Game not found" });
  });

  it("installs a staged asset without replacing scene edits and rejects stale or foreign writes", async () => {
    const storage = new InMemoryStorageAdapter();
    const agent = run(USER, storage);
    const created = await agent.invoke("create_native_game", { project_id: PROJECT, name: "Room" }) as GameReply;
    const edited = await agent.invoke("publish_native_game", {
      game_id: created.game.id,
      base_revision: created.game.revision,
      document: {
        ...created.document,
        scenes: created.document.scenes.map((scene) => ({ ...scene, name: "Edited room" }))
      }
    }) as GameReply;
    const bytes = await readFile(new URL("../../base-nodes/nodetool/assets/nodetool-base/templates/game-topdown.png", import.meta.url));
    const digest = createHash("sha256").update(bytes).digest("hex");
    const [row] = await Workspace.listByProject(USER, PROJECT);
    if (!row) throw new Error("Project workspace missing");
    const workspace = workspaceFromRow(row);
    if (!workspace) throw new Error("Workspace storage missing");
    await workspace.write(`games/${created.game.id}/assets/${digest}.png`, bytes, "image/png");
    const player = edited.document.assets.player;
    if (!player) throw new Error("Player binding missing");
    const binding = { ...player, assetId: "candidate-source", digest, mediaKind: "image" as const };
    const args = {
      game_id: created.game.id.slice(0, 12),
      base_updated_at: (await agent.invoke("get_native_game", { game_id: created.game.id, view: "outline" }) as { draft_updated_at: string }).draft_updated_at,
      slot: "player",
      binding
    };
    const installed = await agent.invoke("install_native_game_asset", args) as GameReply;
    expect(installed.document.scenes[0]?.name).toBe("Edited room");
    expect(installed.document.assets.gem).toEqual(edited.document.assets.gem);
    const installedId = installed.document.assets.player?.assetId;
    expect(installedId).toMatch(/^[a-f0-9]{32}$/);
    expect(installedId).not.toBe("candidate-source");
    const asset = installedId ? await Asset.find(USER, installedId) : null;
    expect(asset?.project_id).toBe(PROJECT);
    expect(await storage.retrieve(storage.uriForKey(assetObjectKey(USER, `${installedId}.png`)))).toEqual(new Uint8Array(bytes));
    expect(installed.game.revision).toBe(edited.game.revision);
    expect(await agent.invoke("install_native_game_asset", args)).toMatchObject({ error: "Game draft was modified concurrently" });
    expect(await run("stranger", storage).invoke("install_native_game_asset", {
      ...args
    })).toEqual({ error: "Game not found" });
  });

  it("installs a staged font for a version two game", async () => {
    const storage = new InMemoryStorageAdapter();
    const agent = run(USER, storage);
    const created = await agent.invoke("create_native_game", { project_id: PROJECT, name: "Font room" }) as GameReply;
    const published = await agent.invoke("publish_native_game", { game_id: created.game.id,
      base_revision: created.game.revision, document: { ...created.document, schemaVersion: 2 } }) as GameReply;
    const bytes = await readFile(new URL("../../timeline/fonts/BebasNeue-Regular.ttf", import.meta.url));
    const digest = createHash("sha256").update(bytes).digest("hex");
    const [row] = await Workspace.listByProject(USER, PROJECT);
    if (!row) throw new Error("Project workspace missing");
    const workspace = workspaceFromRow(row);
    if (!workspace) throw new Error("Workspace storage missing");
    await workspace.write(`games/${created.game.id}/assets/${digest}.ttf`, bytes, "font/ttf");
    const installed = await agent.invoke("install_native_game_asset", { game_id: created.game.id,
      base_revision: published.game.revision, slot: "display",
      binding: { assetId: "font-candidate", digest, mediaKind: "font", fontFormat: "ttf",
        width: 1, height: 1, pivot: { x: 0.5, y: 0.5 }, sampling: "nearest", required: true } }) as GameReply;
    expect(installed.document.assets.display).toMatchObject({ digest, mediaKind: "font", fontFormat: "ttf" });
    const current = await agent.invoke("publish_native_game", { game_id: created.game.id, base_revision: published.game.revision }) as GameReply;
    const built = await agent.invoke("build_native_game", { game_id: created.game.id, revision: current.game.revision }) as { build_path: string };
    expect(await readFile(join(directory, built.build_path, "assets", `${digest}.ttf`))).toEqual(bytes);
  });

  it("keeps the candidate media format when installing JPEG and MP3 assets", async () => {
    const storage = new InMemoryStorageAdapter();
    const agent = run(USER, storage);
    const created = await agent.invoke("create_native_game", { project_id: PROJECT, name: "Media room" }) as GameReply;
    const [row] = await Workspace.listByProject(USER, PROJECT);
    if (!row) throw new Error("Project workspace missing");
    const workspace = workspaceFromRow(row);
    if (!workspace) throw new Error("Workspace storage missing");
    for (const [slot, extension, mediaKind, contentType] of [
      ["backdrop", "jpg", "image", "image/jpeg"],
      ["theme", "mp3", "audio", "audio/mpeg"]
    ] as const) {
      const bytes = new Uint8Array([1, 2, 3, slot.length]);
      const digest = createHash("sha256").update(bytes).digest("hex");
      await workspace.write(`games/${created.game.id}/assets/${digest}.${extension}`, bytes, contentType);
      const binding = { assetId: `candidate-${slot}`, digest, mediaKind, width: 1, height: 1,
        pivot: { x: 0.5, y: 0.5 }, sampling: "nearest" };
      const installed = await agent.invoke("install_native_game_asset", {
        game_id: created.game.id, base_revision: created.game.revision, slot, binding
      }) as GameReply;
      expect(installed.document.assets[slot]?.mediaKind).toBe(mediaKind);
      const assetId = installed.document.assets[slot]?.assetId;
      expect(assetId).toMatch(/^[a-f0-9]{32}$/);
      expect(await storage.retrieve(storage.uriForKey(assetObjectKey(USER, `${assetId}.${extension}`)))).toEqual(bytes);
      created.game.revision = installed.game.revision;
    }
  });

  it("generates and binds prepared image art in the draft", async () => {
    const storage = new InMemoryStorageAdapter();
    const bytes = await readFile(new URL("../../base-nodes/nodetool/assets/nodetool-base/templates/game-topdown.png", import.meta.url));
    const generated = vi.spyOn(generateImage, "impl").mockResolvedValue({ asset_uri: "asset://generated.png", generation_id: "generation-1" });
    const context = { userId: USER, assetStorage: storage, resolveAssetBytes: async () => ({ bytes }) } as unknown as ProcessingContext;
    const agent = createCapabilityRun({ context, gate: UNGATED });
    try {
      const created = await agent.invoke("create_native_game", { project_id: PROJECT, name: "Generated room" }) as GameReply;
      const result = await agent.invoke("generate_game_asset", {
        game_id: created.game.id, slot: "new-art", kind: "image", prompt: "A sprite", provider: "test", model: "test"
      }) as GameReply & { generation_id: string };
      expect(result.generation_id).toBe("generation-1");
      expect(result.document.assets["new-art"]?.assetId).toMatch(/^[a-f0-9]{32}$/);
      expect(result.game.revision).toBe(created.game.revision);
      expect(generated).toHaveBeenCalledOnce();
    } finally {
      generated.mockRestore();
    }
  });

  it("keeps the generated audio format reported by the provider", async () => {
    const storage = new InMemoryStorageAdapter();
    const bytes = new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4]);
    const generated = vi.spyOn(generateSpeech, "impl").mockResolvedValue({
      asset_uri: "asset://generated-audio", mime_type: "audio/wav", generation_id: "generation-audio"
    });
    const context = { userId: USER, assetStorage: storage, resolveAssetBytes: async () => ({ bytes }) } as unknown as ProcessingContext;
    const agent = createCapabilityRun({ context, gate: UNGATED });
    try {
      const created = await agent.invoke("create_native_game", { project_id: PROJECT, name: "Audio room" }) as GameReply;
      const result = await agent.invoke("generate_game_asset", {
        game_id: created.game.id, slot: "voice", kind: "audio", prompt: "Hello", provider: "test", model: "test"
      }) as GameReply;
      const assetId = result.document.assets.voice?.assetId;
      expect(assetId).toMatch(/^[a-f0-9]{32}$/);
      expect(await storage.retrieve(storage.uriForKey(assetObjectKey(USER, `${assetId}.wav`)))).toEqual(bytes);
    } finally {
      generated.mockRestore();
    }
  });

  it("returns a background receipt and installs its completed generation", async () => {
    const storage = new InMemoryStorageAdapter();
    const bytes = new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4]);
    const generated = vi.spyOn(generateSpeech, "impl").mockResolvedValue({
      generation_id: "queued-audio", status: "running", background: true
    });
    const context = { userId: USER, assetStorage: storage, resolveAssetBytes: async () => ({ bytes }) } as unknown as ProcessingContext;
    const agent = createCapabilityRun({ context, gate: UNGATED });
    try {
      const created = await agent.invoke("create_native_game", { project_id: PROJECT, name: "Queued audio" }) as GameReply;
      const args = { game_id: created.game.id, slot: "voice", kind: "audio", prompt: "Hello" };
      const receipt = await agent.invoke("generate_game_asset", { ...args, provider: "test", model: "test", background: true }) as Record<string, unknown>;
      expect(receipt).toMatchObject({ generation_id: "queued-audio", background: true });
      expect(receipt.next).toContain("generate_game_asset");
      const unchanged = await agent.invoke("get_native_game", { game_id: created.game.id, source: "draft", view: "full" }) as GameReply;
      expect(unchanged.document.assets.voice).toBeUndefined();

      const asset = await Asset.create({ user_id: USER, project_id: PROJECT, parent_id: USER, name: "voice.wav", content_type: "audio/wav", size: bytes.byteLength });
      if (!(asset instanceof Asset)) throw new Error("Asset creation failed");
      const prediction = await Prediction.create<Prediction>({
        user_id: USER, provider: "test", model: "test", capability: "text_to_speech",
        status: "completed", asset_ids: [asset.id]
      });
      const result = await agent.invoke("generate_game_asset", { ...args, generation_id: prediction.id }) as GameReply;
      const assetId = result.document.assets.voice?.assetId;
      expect(assetId).toMatch(/^[a-f0-9]{32}$/);
      expect(await storage.retrieve(storage.uriForKey(assetObjectKey(USER, `${assetId}.wav`)))).toEqual(bytes);
      expect(generated).toHaveBeenCalledOnce();
    } finally {
      generated.mockRestore();
    }
  });

  it("requires authorized asset bytes matching the published digest", async () => {
    const storage = new InMemoryStorageAdapter();
    const agent = run(USER, storage);
    const created = await agent.invoke("create_native_game", { project_id: PROJECT, name: "Room" }) as GameReply;
    const bytes = await readFile(new URL("../../base-nodes/nodetool/assets/nodetool-base/templates/game-topdown.png", import.meta.url));
    const digest = createHash("sha256").update(bytes).digest("hex");
    const asset = await Asset.create({
      user_id: USER, project_id: PROJECT, parent_id: USER, name: "player.png",
      content_type: "image/png", size: bytes.byteLength
    });
    if (!(asset instanceof Asset)) throw new Error("Asset creation failed");
    const player = created.document.assets.player;
    if (!player) throw new Error("Player binding missing");
    const published = await agent.invoke("publish_native_game", {
      game_id: created.game.id,
      base_revision: created.game.revision,
      document: {
        ...created.document,
        assets: { ...created.document.assets, player: { ...player, assetId: asset.id, digest } }
      }
    }) as GameReply;
    await storage.store(assetObjectKey(USER, `${asset.id}.png`), new Uint8Array([1, 2, 3]), "image/png");
    expect(await agent.invoke("build_native_game", { game_id: created.game.id })).toMatchObject({
      error: expect.stringContaining("Asset digest changed")
    });
    await storage.store(assetObjectKey(USER, `${asset.id}.png`), bytes, "image/png");
    const built = await agent.invoke("build_native_game", { game_id: created.game.id }) as { build_path: string };
    const packaged = JSON.parse(await readFile(join(directory, built.build_path, "game.json"), "utf8")) as GameDocument;
    expect(packaged.revision).toBe(published.game.revision);
    expect(packaged.assets.player?.assetId).toMatch(/^\.\/assets\/[a-f0-9]{64}\.png$/);
  });
});
