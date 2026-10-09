import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { ModelObserver, Project, Workspace, initTestDb } from "@nodetool-ai/models";
import { stagedGameCandidateRecordPath } from "@nodetool-ai/protocol";
import type { Workspace as RunWorkspace } from "@nodetool-ai/runtime";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";
import { workspaceFromRow } from "../src/lib/workflow-workspace.js";

const USER_ID = "asset-browser-owner";
const PROJECT_ID = "asset-browser-project";
const assetRoot = vi.hoisted(() => ({ current: "" }));
const scripted = vi.hoisted(() => ({ generate: null as null | ((run: { invoke: (name: string, args: Record<string, unknown>) => Promise<unknown> }, args: Record<string, unknown>) => Promise<unknown>) }));

vi.mock("../src/lib/storage.js", async (original) => {
  const { FileStorageAdapter } = await import("@nodetool-ai/storage");
  return { ...await original<typeof import("../src/lib/storage.js")>(), getAssetAdapter: () => new FileStorageAdapter(assetRoot.current) };
});
vi.mock("../src/configured-providers.js", async (original) => ({
  ...await original<typeof import("../src/configured-providers.js")>(),
  loadConfiguredProviders: async () => ({})
}));
// generate_game_asset reaches a media provider. The router's own work (records, sibling
// binding, conflict checks) is what these tests cover, so the generation step is scripted.
vi.mock("@nodetool-ai/agents", async (original) => {
  const actual = await original<typeof import("@nodetool-ai/agents")>();
  return {
    ...actual,
    createCapabilityRun: (options: Parameters<typeof actual.createCapabilityRun>[0]) => {
      const run = actual.createCapabilityRun(options);
      const invoke = run.invoke.bind(run);
      run.invoke = async (name: string, args: Record<string, unknown>) =>
        name === "generate_game_asset" && scripted.generate ? scripted.generate({ invoke }, args) : invoke(name, args);
      return run;
    }
  };
});

const createCaller = createCallerFactory(appRouter);
const makeCtx = (userId: string): Context => ({
  userId, registry: {} as never, apiOptions: { metadataRoots: [], registry: {} as never } as never,
  pythonBridge: {} as never, getPythonBridgeReady: () => false
}) as Context;
const sha = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");
const png = (width: number, height: number, red: number): Promise<Buffer> =>
  sharp({ create: { width, height, channels: 4, background: { r: red, g: 20, b: 30, alpha: 1 } } }).png().toBuffer();

let directory: string;

async function projectWorkspace(): Promise<RunWorkspace> {
  const [row] = await Workspace.listByProject(USER_ID, PROJECT_ID);
  const workspace = row ? workspaceFromRow(row) : null;
  if (!workspace) { throw new Error("project workspace missing"); }
  return workspace;
}

describe("game asset browser routes", () => {
  beforeEach(async () => {
    initTestDb();
    directory = await mkdtemp(join(tmpdir(), "nodetool-asset-browser-"));
    assetRoot.current = join(directory, "storage");
    await mkdir(assetRoot.current);
    await Project.insertNew({ id: PROJECT_ID, user_id: USER_ID, name: "Games", kind: "game" });
    await Workspace.create({ user_id: USER_ID, project_id: PROJECT_ID, name: "Files", path: directory, is_default: false });
    scripted.generate = null;
  });
  afterEach(async () => {
    ModelObserver.clear();
    await rm(directory, { recursive: true, force: true });
  });

  it("lists staged candidates and replaces a sliced sheet in place, frames included", async () => {
    const caller = createCaller(makeCtx(USER_ID));
    const created = await caller.games.create({ projectId: PROJECT_ID, name: "Room" });
    if (created.document.schemaVersion === 3) { throw new Error("Expected a 2D game"); }
    const player = created.document.assets.player;
    const sliced = await caller.games.saveDraft({ id: created.game.id, baseUpdatedAt: created.game.draftUpdatedAt, ops: [
      { op: "bind_asset", slot: "player.frame.0", binding: { ...player, frame: { x: 0, y: 0, width: 1, height: 1 } } }
    ] });
    const workspace = await projectWorkspace();
    const staged = await png(player.width, player.height, 200);
    await workspace.write(`games/${created.game.id}/assets/${sha(staged)}.png`, staged, "image/png");

    const browsed = await caller.games.assetBrowser({ id: created.game.id });
    expect(browsed.dimension).toBe("2d");
    expect(browsed.candidate_workspace_id).toBe(created.game.workspaceId);
    expect(browsed.candidates).toEqual([expect.objectContaining({ digest: sha(staged), media_kind: "image", bound_slots: [], recorded: false })]);
    expect(browsed.slot_requests.player).toMatchObject({ kind: "image", source: "template" });

    await expect(caller.games.installStagedCandidate({ id: created.game.id, baseUpdatedAt: created.game.draftUpdatedAt,
      slot: "player", digest: sha(staged) })).rejects.toMatchObject({ code: "CONFLICT" });
    const installed = await caller.games.installStagedCandidate({ id: created.game.id, baseUpdatedAt: sliced.game.draftUpdatedAt,
      slot: "player", digest: sha(staged) });
    if (installed.document.schemaVersion === 3) { throw new Error("Expected a 2D game"); }
    const replaced = installed.document.assets.player;
    expect(replaced).toMatchObject({ digest: sha(staged), width: player.width, height: player.height });
    expect(installed.document.assets["player.frame.0"]).toEqual({ ...replaced, frame: { x: 0, y: 0, width: 1, height: 1 } });
    await expect(caller.games.installStagedCandidate({ id: created.game.id, baseUpdatedAt: installed.game.draftUpdatedAt,
      slot: "player", digest: "0".repeat(64) })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(createCaller(makeCtx("stranger")).games.assetBrowser({ id: created.game.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("generates through generate_game_asset, records the prompt, and binds the returned frames", async () => {
    const caller = createCaller(makeCtx(USER_ID));
    const created = await caller.games.create({ projectId: PROJECT_ID, name: "Room" });
    const workspace = await projectWorkspace();
    const sheet = await png(64, 32, 90);
    const requests: Record<string, unknown>[] = [];
    scripted.generate = async (run, args) => {
      requests.push(args);
      const digest = sha(sheet);
      await workspace.write(`games/${created.game.id}/assets/${digest}.png`, sheet, "image/png");
      const binding = { assetId: `generated:${digest}`, digest, mediaKind: "image", width: 64, height: 32,
        pivot: { x: 0.5, y: 0.5 }, sampling: "nearest", frame: { x: 0, y: 0, width: 32, height: 32 } };
      const installed = await run.invoke("install_native_game_asset", { game_id: args["game_id"], slot: args["slot"], binding }) as
        { document: { assets: Record<string, Record<string, unknown>> } };
      const asset = installed.document.assets[String(args["slot"])];
      return { ...installed, bindings: { [`${args["slot"]}.frame.0`]: { ...asset, frame: { x: 0, y: 0, width: 32, height: 32 } },
        [`${args["slot"]}.frame.1`]: { ...asset, frame: { x: 32, y: 0, width: 32, height: 32 } } } };
    };

    await expect(caller.games.generateAsset({ id: created.game.id, baseUpdatedAt: "stale", slot: "player", kind: "image",
      prompt: "a fox" })).rejects.toMatchObject({ code: "CONFLICT" });
    const generated = await caller.games.generateAsset({ id: created.game.id, baseUpdatedAt: created.game.draftUpdatedAt,
      slot: "player", kind: "image", prompt: "a red fox", preparation: { sheet: { cols: 2, rows: 1 } } });
    expect(requests).toEqual([{ game_id: created.game.id, slot: "player", kind: "image", prompt: "a red fox", preparation: { sheet: { cols: 2, rows: 1 } } }]);
    expect(generated.stagedDigest).toBe(sha(sheet));
    if (generated.document.schemaVersion === 3) { throw new Error("Expected a 2D game"); }
    expect(generated.document.assets["player.frame.1"]).toMatchObject({ digest: sha(sheet), frame: { x: 32, y: 0, width: 32, height: 32 } });
    const record = JSON.parse(await workspace.readText(stagedGameCandidateRecordPath(`games/${created.game.id}`, sha(sheet))) ?? "{}");
    expect(record).toMatchObject({ digest: sha(sheet), slot: "player", prompt: "a red fox", source: "generate" });

    const browsed = await caller.games.assetBrowser({ id: created.game.id });
    expect(browsed.slot_requests.player).toMatchObject({ prompt: "a red fox", source: "recorded" });
    expect(browsed.candidates.find((entry) => entry.digest === sha(sheet))).toMatchObject({ recorded: true, prompt: "a red fox" });

    scripted.generate = async () => ({ error: "No text_to_image model is available; pass provider and model" });
    await expect(caller.games.generateAsset({ id: created.game.id, baseUpdatedAt: generated.game.draftUpdatedAt,
      slot: "gem", kind: "image", prompt: "a gem" })).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("No text_to_image model") });
  });
});
