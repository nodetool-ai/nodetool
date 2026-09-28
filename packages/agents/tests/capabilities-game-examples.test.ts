import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createCanvas } from "@napi-rs/canvas";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTopDownRoomGame } from "@nodetool-ai/game-runtime";
import { Asset, Game, ModelObserver, Project, Workspace, initTestDb } from "@nodetool-ai/models";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";
import type { GameDocument } from "@nodetool-ai/protocol";
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

  it("installs the complete shipped Kindle bundle through the agent capability", async () => {
    const agent = run(USER, new InMemoryStorageAdapter());
    const source = await agent.invoke("get_example_game", { slug: "kindle", view: "full" }) as { document: GameDocument };
    const result = await agent.invoke("install_example_game", { project_id: PROJECT, slug: "kindle" }) as { game: { id: string }; document: GameDocument };
    expect(result.document.id).toBe(result.game.id);
    expect(result.document.scenes).toEqual(source.document.scenes);
    expect(Object.keys(result.document.assets)).toEqual(Object.keys(source.document.assets));
    for (const [slot, binding] of Object.entries(result.document.assets)) {
      expect(binding).toEqual({ ...source.document.assets[slot], assetId: expect.stringMatching(/^[a-f0-9]{32}$/) });
      expect(await Asset.find(USER, binding.assetId)).toMatchObject({ project_id: PROJECT });
    }
    expect(await agent.invoke("get_native_game", { game_id: result.game.id.slice(0, 12), view: "full" })).toMatchObject({ document: result.document });
  });
});
