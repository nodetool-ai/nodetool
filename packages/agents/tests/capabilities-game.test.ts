import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Asset, ModelObserver, Project, Workspace, initTestDb } from "@nodetool-ai/models";
import { InMemoryStorageAdapter, assetObjectKey } from "@nodetool-ai/storage";
import { workspaceFromRow } from "@nodetool-ai/execution/service";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { GameDocument } from "@nodetool-ai/protocol";
import { createCapabilityRun, UNGATED } from "../src/capabilities/invoke.js";
import { module as gameModule } from "../src/capabilities/game.js";
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

  it("registers its six specs", () => {
    expect(capabilityModuleIssues("game", gameModule)).toEqual([]);
    expect(gameModule.exports.map((entry) => entry.spec.name)).toEqual([
      "create_native_game", "get_native_game", "publish_native_game",
      "install_native_game_asset", "playtest_native_game", "build_native_game"
    ]);
  });

  it("creates, reopens, rejects stale edits, and playtests a pinned revision", async () => {
    const agent = run();
    const created = await agent.invoke("create_native_game", { project_id: PROJECT, name: "Room" }) as GameReply;
    expect(created.game.id).toHaveLength(32);
    expect(created.document.id).toHaveLength(32);
    const opened = await agent.invoke("get_native_game", { game_id: created.game.id }) as GameReply;
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
      inputs: Array.from({ length: 60 }, () => ({ pressed: ["right"] }))
    }) as { game_id: string; ticks: number; revision: string };
    expect(played).toMatchObject({ ticks: 60, revision: saved.game.revision });
    expect(played.game_id).toHaveLength(12);
    expect((await agent.invoke("get_native_game", { game_id: played.game_id }) as GameReply).game.id).toBe(created.game.id);
    expect(await agent.invoke("playtest_native_game", {
      game_id: created.game.id,
      inputs: Array.from({ length: 601 }, () => ({ pressed: [] }))
    })).toMatchObject({ error: expect.stringContaining("at most 600") });
    expect(await run("stranger").invoke("get_native_game", { game_id: created.game.id })).toEqual({ error: "Game not found" });
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
      base_revision: edited.game.revision,
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
    expect(await agent.invoke("install_native_game_asset", args)).toMatchObject({ error: "Game was modified concurrently" });
    expect(await run("stranger", storage).invoke("install_native_game_asset", {
      ...args, base_revision: installed.game.revision
    })).toEqual({ error: "Game not found" });
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
