import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Game, ModelObserver, Project, Workspace, initTestDb } from "@nodetool-ai/models";
import { discoverSandboxCatalog, shippedPackSearchPaths } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { createChatCodeActSession } from "../src/codeact/chat-codeact.js";
import { createCapabilityRun, UNGATED } from "../src/capabilities/invoke.js";
import { gameSpecs } from "../src/capabilities/game.specs.js";

const USER = "sandbox-game-owner";
const PROJECT = "sandbox-game-project";
const PACK = "@nodetool-ai/sandbox-game";
let directory: string;

describe("the game builder through the in-app capability boundary", () => {
  beforeEach(async () => {
    initTestDb();
    directory = await mkdtemp(join(tmpdir(), "nodetool-sandbox-game-"));
    await Project.insertNew({ id: PROJECT, user_id: USER, name: "Game", kind: "game" });
    await Workspace.create({ user_id: USER, project_id: PROJECT, name: "Game files", path: directory, is_default: false });
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    ModelObserver.clear();
    await rm(directory, { recursive: true, force: true });
  });

  it("discovers a staged pack, saves one whole draft and refuses a stale replacement", async () => {
    const staged = join(directory, "_sandbox");
    const target = join(staged, ...PACK.split("/"));
    const source = fileURLToPath(new URL("../../sandbox-packs/sandbox-game", import.meta.url));
    for (const file of ["package.json", "SKILL.md", "sandbox/index.js"]) {
      const destination = join(target, file);
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(join(source, file), destination);
    }
    vi.stubEnv("NODETOOL_SHIPPED_PACKS_DIR", staged);
    const host = discoverSandboxCatalog(shippedPackSearchPaths());
    expect(host.failures).toEqual([]);
    expect(host.catalog.summaries().map((summary) => summary.specifier)).toEqual([PACK]);

    // The chat action routes through the real ownership and draft-write capabilities.
    const context = { userId: USER, sandboxModuleCatalog: host.catalog } as unknown as ProcessingContext;
    const agent = createCapabilityRun({ context, gate: UNGATED });
    const session = createChatCodeActSession({
      tools: gameSpecs,
      context,
      sandboxModuleCatalog: host.catalog,
      executeTool: (call) => agent.invoke(call.name, call.args)
    });
    const observation = JSON.parse(await session.executeAction({ code: `
      import { game, entity, registerAssets, fill, plank, saveGame } from "${PACK}";
      const document = game();
      const entities = document.scenes[0].entities;
      entities.push(entity("camera", 0, 0, { camera2d: { width: 16, height: 9 } }));
      registerAssets(document, { stone: { assetId: "builtin:wall", digest: "builtin:wall-v1", width: 32, height: 32 } });
      const tiles = [];
      fill(tiles, 0, -2, 86, 40);
      plank(tiles, 2, 5, 6, { oneWay: true });
      entities.push(entity("terrain", 0, 0, { tilemap: { assetId: "stone", tiles, solid: true } }));
      for (let i = 0; i < 115; i += 1) {
        entities.push(entity("item-" + i, i, 0));
      }
      return await saveGame({ name: "Built in chat", document }, { games: nodetool.games, project_id: "${PROJECT}" });
    ` }));
    expect(observation.ok, JSON.stringify(observation)).toBe(true);
    expect(observation.toolCalls).toBe(2);
    const savedId = observation.result.game_id;
    const row = await Game.findOwned(USER, savedId);
    expect(row?.id).toHaveLength(32);
    const read = await agent.invoke("get_native_game", { game_id: savedId, view: "full" });
    expect(read).toMatchObject({ document: { id: row?.id, revision: row?.current_revision, entrySceneId: "level" } });
    const changes = await Game.listDraftChanges(USER, savedId);
    expect(changes).toHaveLength(1);
    expect(changes[0].summary).toBe("Replaced game document (1)");
    const full = read as { document: { scenes: Array<{ entities: Array<{ tilemap?: { tiles: unknown[] } }> }> } };
    expect(full.document.scenes[0].entities).toHaveLength(117);
    expect(full.document.scenes[0].entities[1].tilemap?.tiles).toHaveLength(3446);

    const conflict = JSON.parse(await session.executeAction({ code: `
      import { game, saveGame } from "${PACK}";
      return await saveGame({ document: game({ pixelsPerUnit: 96 }) }, {
        games: nodetool.games, game_id: "${savedId}", base_updated_at: "stale"
      });
    ` }));
    expect(conflict.ok).toBe(false);
    expect(conflict.error).toContain("Game draft was modified concurrently");
    expect(await agent.invoke("get_native_game", { game_id: savedId, view: "full" })).toEqual(read);
    expect(await agent.invoke("get_native_game", { game_id: savedId, view: "full" })).toMatchObject({ document: { pixelsPerUnit: 32 } });
  });
});
