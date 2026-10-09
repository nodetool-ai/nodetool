import { mkdtemp, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Game, ModelObserver, Project, Workspace, initTestDb } from "@nodetool-ai/models";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";
import { workspaceFromRow } from "@nodetool-ai/execution/service";
import { recordStagedGameCandidate } from "@nodetool-ai/game-nodes";
import type { ProcessingContext, Workspace as RunWorkspace } from "@nodetool-ai/runtime";
import type { GameDocument } from "@nodetool-ai/protocol";
import { createCapabilityRun, UNGATED } from "../src/capabilities/invoke.js";

const USER = "asset-browser-owner";
const PROJECT = "asset-browser-project";
let directory: string;

function run(user = USER, assetStorage?: InMemoryStorageAdapter) {
  return createCapabilityRun({ context: { userId: user, assetStorage } as ProcessingContext, gate: UNGATED });
}

interface GameReply { game: { id: string; revision: string }; document: GameDocument; draft_updated_at: string }
interface BrowseReply {
  dimension: string;
  draft_updated_at: string;
  assets: { slot: string; usedBy: { entityId?: string }[] }[];
  scenes: { id: string; assets: string[] }[];
  candidates: { digest: string; media_kind: string; bound_slots: string[]; slot?: string; prompt?: string; recorded: boolean }[];
  slot_requests: Record<string, { kind: string; prompt: string; preparation?: unknown; source: string }>;
}

async function gameWorkspace(gameId: string): Promise<RunWorkspace> {
  const game = await Game.findOwned(USER, gameId);
  const row = game ? await Workspace.find(USER, game.workspace_id) : null;
  const workspace = row ? workspaceFromRow(row) : null;
  if (!workspace) throw new Error("game workspace missing");
  return workspace;
}

async function png(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 4, background: { r: 10, g: 200, b: 30, alpha: 1 } } }).png().toBuffer();
}

const sha = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

describe("browse_native_game_assets", () => {
  beforeEach(async () => {
    initTestDb();
    directory = await mkdtemp(join(tmpdir(), "nodetool-asset-browser-"));
    await Project.insertNew({ id: PROJECT, user_id: USER, name: "Game", kind: "game" });
    await Workspace.create({ user_id: USER, project_id: PROJECT, name: "Game files", path: directory, is_default: false });
  });
  afterEach(async () => {
    ModelObserver.clear();
    await rm(directory, { recursive: true, force: true });
  });

  it("returns the catalog, staged candidates and template slot requests of a draft", async () => {
    const agent = run();
    const created = await agent.invoke("create_native_game", { project_id: PROJECT, name: "Room" }) as GameReply;
    const workspace = await gameWorkspace(created.game.id);
    const staged = await png(64, 32);
    await workspace.write(`games/${created.game.id}/assets/${sha(staged)}.png`, staged, "image/png");
    await recordStagedGameCandidate(workspace, `games/${created.game.id}`, { digest: sha(staged), slot: "player", prompt: "a fox", source: "generate" });

    const browsed = await agent.invoke("browse_native_game_assets", { game_id: created.game.id }) as BrowseReply;
    expect(browsed.dimension).toBe("2d");
    expect(browsed.assets.map((entry) => entry.slot)).toEqual(["gem", "player", "sfx.collect", "wall"]);
    expect(browsed.assets.find((entry) => entry.slot === "wall")?.usedBy.map((reference) => reference.entityId))
      .toEqual(["wall-left", "wall-right", "wall-top", "wall-bottom"]);
    expect(browsed.candidates).toEqual([expect.objectContaining({ digest: sha(staged), media_kind: "image", bound_slots: [],
      slot: "player", prompt: "a fox", recorded: true })]);
    expect(browsed.slot_requests.player).toMatchObject({ kind: "image", source: "template", preparation: { sheet: { cols: 4, rows: 2 } } });
    expect(browsed.slot_requests.player.prompt).toContain("top-down player character");
    expect(browsed.slot_requests["sfx.collect"]).toMatchObject({ kind: "sfx", source: "template" });

    const filtered = await agent.invoke("browse_native_game_assets", { game_id: created.game.id, kind: "audio", query: "gem" }) as BrowseReply;
    expect(filtered.assets.map((entry) => entry.slot)).toEqual(["sfx.collect"]);
    expect(filtered.candidates).toEqual([]);
    expect(await run("stranger").invoke("browse_native_game_assets", { game_id: created.game.id })).toEqual({ error: "Game draft not found" });
  });

  it("derives an installable binding for an unrecorded candidate and installs it in place", async () => {
    const storage = new InMemoryStorageAdapter();
    const agent = run(USER, storage);
    const created = await agent.invoke("create_native_game", { project_id: PROJECT, name: "Room" }) as GameReply;
    const workspace = await gameWorkspace(created.game.id);
    const staged = await png(48, 48);
    await workspace.write(`games/${created.game.id}/assets/${sha(staged)}.png`, staged, "image/png");

    expect(await agent.invoke("browse_native_game_assets", { game_id: created.game.id, digest: "nope" }))
      .toEqual({ error: "digest must be a 64-character hex digest" });
    expect(await agent.invoke("browse_native_game_assets", { game_id: created.game.id, digest: "0".repeat(64) }))
      .toEqual({ error: "No staged candidate has that digest" });
    const picked = await agent.invoke("browse_native_game_assets", { game_id: created.game.id, digest: sha(staged), slot: "gem" }) as
      { binding: Record<string, unknown>; draft_updated_at: string };
    expect(picked.binding).toEqual({ assetId: `staged:${sha(staged)}`, digest: sha(staged), mediaKind: "image", width: 48, height: 48,
      pivot: created.document.assets.gem.pivot, sampling: created.document.assets.gem.sampling });

    const installed = await agent.invoke("install_native_game_asset", { game_id: created.game.id, slot: "gem",
      binding: picked.binding, base_updated_at: picked.draft_updated_at }) as GameReply;
    expect(installed.document.assets.gem).toMatchObject({ digest: sha(staged), width: 48, height: 48 });
    const after = await agent.invoke("browse_native_game_assets", { game_id: created.game.id }) as BrowseReply;
    expect(after.candidates.find((entry) => entry.digest === sha(staged))?.bound_slots).toEqual(["gem"]);
  });

  it("returns the binding staging recorded rather than re-deriving it", async () => {
    const agent = run();
    const created = await agent.invoke("create_native_game", { project_id: PROJECT, name: "Room" }) as GameReply;
    const workspace = await gameWorkspace(created.game.id);
    const staged = await png(32, 32);
    const binding = { assetId: "gem-source", digest: sha(staged), mediaKind: "image", width: 32, height: 32,
      pivot: { x: 0.5, y: 0.9 }, sampling: "linear", provenance: "template:topdown:gem" };
    await workspace.write(`games/${created.game.id}/assets/${sha(staged)}.png`, staged, "image/png");
    await recordStagedGameCandidate(workspace, `games/${created.game.id}`, { digest: sha(staged), slot: "gem", binding, source: "stage" });
    const picked = await agent.invoke("browse_native_game_assets", { game_id: created.game.id, digest: sha(staged) }) as
      { binding: unknown; candidate: { slot: string } };
    expect(picked.binding).toEqual(binding);
    expect(picked.candidate.slot).toBe("gem");
  });
});
