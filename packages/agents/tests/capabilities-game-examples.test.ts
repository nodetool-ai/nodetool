import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createCanvas } from "@napi-rs/canvas";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createTopDownRoomGame } from "@nodetool-ai/game-runtime";
import { Asset, Game, ModelObserver, Project, Workspace, initTestDb } from "@nodetool-ai/models";
import { assetObjectKey, InMemoryStorageAdapter } from "@nodetool-ai/storage";
import { gameDocument3D, type AnyGameDocument as GameDocument } from "@nodetool-ai/protocol";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { createCapabilityRun, UNGATED } from "../src/capabilities/invoke.js";

const USER = "game-example-owner";
const PROJECT = "game-example-project";
let directory: string;

function run(user = USER, assetStorage?: InMemoryStorageAdapter) {
  return createCapabilityRun({ context: { userId: user, assetStorage } as ProcessingContext, gate: UNGATED });
}

describe("agent example games", () => {
  beforeEach(async () => {
    initTestDb();
    directory = await mkdtemp(join(tmpdir(), "nodetool-game-examples-"));
    await Project.insertNew({ id: PROJECT, user_id: USER, name: "Games", kind: "game" });
    await Workspace.create({ user_id: USER, project_id: PROJECT, name: "Files", path: directory, is_default: false });
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    ModelObserver.clear();
    await rm(directory, { recursive: true, force: true });
  });

  it("discovers Kindle and reads its outline and full builder source", async () => {
    const agent = run();
    const listed = await agent.invoke("list_example_games", { query: "kindle" });
    expect(listed).toMatchObject({ examples: [{ slug: "kindle", name: "Kindle" }] });
    const outline = await agent.invoke("get_example_game", { slug: "kindle" });
    expect(outline).toMatchObject({ slug: "kindle", name: "Kindle", outline: { scenes: expect.any(Array) } });
    expect(outline).not.toHaveProperty("document");
    const full = await agent.invoke("get_example_game", { slug: "kindle", view: "full" }) as { document: GameDocument };
    expect(full.document.scenes.flatMap((scene) => scene.entities).length).toBeGreaterThan(100);
    expect(Object.values(full.document.assets).every((asset) => asset.assetId.startsWith("package://"))).toBe(true);
    expect(await agent.invoke("get_example_game", { slug: "../kindle", view: "full" })).toMatchObject({ error: expect.any(String) });
  });

  it("installs the example media into an owned project and accepts its returned id", async () => {
    const gamesDir = join(directory, "examples", "games");
    const assetsDir = join(directory, "assets", "nodetool-base", "games", "fixture");
    await mkdir(gamesDir, { recursive: true });
    await mkdir(assetsDir, { recursive: true });
    const bytes = createCanvas(2, 2).toBuffer("image/png");
    const digest = createHash("sha256").update(bytes).digest("hex");
    await writeFile(join(assetsDir, "sprite.png"), bytes);
    const document = createTopDownRoomGame("example-fixture");
    for (const binding of Object.values(document.assets)) {
      binding.assetId = "package://nodetool-base/games/fixture/sprite.png";
      binding.digest = digest;
    }
    await writeFile(join(gamesDir, "fixture.game.json"), JSON.stringify({ name: "Fixture", description: "Install fixture", controls: "Arrows", posterUri: "package://nodetool-base/games/fixture/sprite.png", document }));
    vi.stubEnv("NODETOOL_EXAMPLE_GAMES_DIR", gamesDir);
    const storage = new InMemoryStorageAdapter();
    const agent = run(USER, storage);
    const result = await agent.invoke("install_example_game", { project_id: PROJECT, slug: "fixture" }) as { game: { id: string }; document: GameDocument };
    expect(result.game.id).toHaveLength(32);
    expect(result.document.id).toBe(result.game.id);
    for (const binding of Object.values(result.document.assets)) {
      expect(binding.assetId).toMatch(/^[a-f0-9]{32}$/);
      expect(await Asset.find(USER, binding.assetId)).toMatchObject({ project_id: PROJECT });
    }
    expect(await agent.invoke("get_native_game", { game_id: result.game.id.slice(0, 12), view: "full" })).toMatchObject({ document: result.document });
    expect(await run("stranger", storage).invoke("install_example_game", { project_id: PROJECT, slug: "fixture" })).toEqual({ error: "Project not found" });
    expect(await Game.listByProject(USER, PROJECT)).toHaveLength(1);
  });

  it.each(["kindle", "blacksite", "signal-forge"])("installs the complete shipped %s bundle through the agent capability", async (slug) => {
    const agent = run(USER, new InMemoryStorageAdapter());
    const source = await agent.invoke("get_example_game", { slug, view: "full" }) as { document: GameDocument };
    const result = await agent.invoke("install_example_game", { project_id: PROJECT, slug }) as { game: { id: string }; document: GameDocument };
    expect(result.document.schemaVersion).toBe(source.document.schemaVersion);
    expect(result.document.id).toBe(result.game.id);
    expect(result.document.scenes).toEqual(source.document.scenes);
    expect(Object.keys(result.document.assets)).toEqual(Object.keys(source.document.assets));
    for (const [slot, binding] of Object.entries(result.document.assets)) {
      expect(binding).toEqual({ ...source.document.assets[slot], assetId: expect.stringMatching(/^[a-f0-9]{32}$/) });
      expect(await Asset.find(USER, binding.assetId)).toMatchObject({ project_id: PROJECT });
      if (binding.mediaKind === "model") {
        expect(await Asset.find(USER, binding.sourceAssetId ?? binding.assetId)).toMatchObject({ project_id: PROJECT });
      }
    }
    expect(await agent.invoke("get_native_game", { game_id: result.game.id.slice(0, 12), view: "full" })).toMatchObject({ document: result.document });
  });

  it("plays and replays Signal Forge using its installed prepared collider bytes", async () => {
    // Match the native game integration suites' budget scaling on shared runners.
    vi.stubEnv("NODETOOL_GAME_SCRIPT_BUDGET_SCALE", "5");
    const storage = new InMemoryStorageAdapter();
    const agent = run(USER, storage);
    const installed = z.object({ game: z.object({ id: z.string() }), document: gameDocument3D }).parse(
      await agent.invoke("install_example_game", { project_id: PROJECT, slug: "signal-forge" }));
    const binding = installed.document.assets["forge-static-collisions"];
    if (binding?.mediaKind !== "collider") { throw new Error("Signal Forge prepared collider is missing"); }
    expect(await agent.invoke("playtest_native_game", { game_id: installed.game.id.slice(0, 12), seed: 1,
      inputs: [{ pressed: [], ticks: 120 }], restore_at_tick: 60,
      assertions: [{ no_script_errors: true }, { replay_matches: true }] }))
      .toMatchObject({ dimension: "3d", ticks: 120, replay_matches: true, route_complete: true, script_error: null });
    expect(await Asset.find(USER, binding.assetId)).toMatchObject({ project_id: PROJECT, content_type: "application/json" });
    const key = assetObjectKey(USER, `${binding.assetId}.json`);
    const original = await readFile(new URL("../../game-runtime/samples/signal-forge/assets/4083a3fff3aeda59dc2b9d8bc35f2789.json", import.meta.url));
    expect(await storage.retrieve(storage.uriForKey(key))).toEqual(new Uint8Array(original));
    await storage.store(key, new Uint8Array([0]), "application/json");
    expect(await agent.invoke("playtest_native_game", { game_id: installed.game.id.slice(0, 12), inputs: [{ pressed: [], ticks: 1 }] }))
      .toMatchObject({ code: "game3d_preparation_failed", error: expect.stringContaining("missing or changed") });
  }, 30_000);
});
