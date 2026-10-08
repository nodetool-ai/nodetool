import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { Asset, Game, ModelObserver, Project, Workspace, initTestDb } from "@nodetool-ai/models";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";
import { workspaceFromRow } from "../src/lib/workflow-workspace.js";
import { getAssetAdapter } from "../src/lib/storage.js";
import { getAssetStorageKey, retrieveAssetBytes } from "../src/lib/asset-paths.js";
import { prepareGameModelBinding3D } from "@nodetool-ai/game-renderer/preparation3d";
import { getManagedWorkspaceDir } from "@nodetool-ai/config";
import { createSandboxModuleCatalog, discoverSandboxPack } from "@nodetool-ai/node-sdk";
import { getProcessSandboxModuleCatalog, setProcessSandboxModuleCatalog } from "@nodetool-ai/runtime";

const USER_ID = "game-owner";
const PROJECT_ID = "game-project";
const assetRoot = vi.hoisted(() => ({ current: "" }));
vi.mock("../src/lib/storage.js", async () => {
  const { FileStorageAdapter } = await import("@nodetool-ai/storage");
  return { getAssetAdapter: () => new FileStorageAdapter(assetRoot.current) };
});
function modelGlb(names: string[]): Uint8Array {
  const raw = new TextEncoder().encode(JSON.stringify({ asset: { version: "2.0" }, scene: 0,
    scenes: [{ nodes: names.map((_, index) => index) }], nodes: names.map((name) => ({ name })) }));
  const padded = Math.ceil(raw.length / 4) * 4;
  const bytes = new Uint8Array(20 + padded);
  bytes.fill(32, 20);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, bytes.length, true);
  view.setUint32(12, padded, true); view.setUint32(16, 0x4e4f534a, true); bytes.set(raw, 20);
  return bytes;
}

async function ownedAsset(bytes: Uint8Array, userId = USER_ID, contentType = "model/gltf-binary"): Promise<Asset> {
  const asset = await Asset.create({ user_id: userId, project_id: PROJECT_ID, parent_id: userId,
    name: "Source model", content_type: contentType, size: bytes.byteLength });
  if (!(asset instanceof Asset)) { throw new Error("Expected a source asset"); }
  await getAssetAdapter().store(getAssetStorageKey(userId, asset.id, contentType), bytes, contentType);
  return asset;
}

const createCaller = createCallerFactory(appRouter);
let workspaceDir: string;

const makeCtx = (userId: string): Context =>
  ({
    userId,
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false
  }) as Context;

describe("native game revisions", () => {
  it("round-trips a 3D entity removal through public saveDraft without 2D operation defaults", async () => {
    const caller = createCaller(makeCtx(USER_ID));
    const created = await caller.games.create({ projectId: PROJECT_ID, name: "Wire removal", dimension: "3d" });
    if (created.document.schemaVersion !== 3) { throw new Error("Expected 3D fixture"); }
    const index = created.document.scenes[0].entities.findIndex((entity) => entity.id === "player-visual");
    const entity = created.document.scenes[0].entities[index];
    if (!entity) { throw new Error("Fixture visual missing"); }
    const removed = await caller.games.saveDraft({ id: created.game.id, baseUpdatedAt: created.game.draftUpdatedAt,
      ops: [{ op: "remove_entity", scene_id: created.document.entrySceneId, entity_id: entity.id }] });
    expect(removed.document.scenes[0].entities.some((entry) => entry.id === entity.id)).toBe(false);
    const restored = await caller.games.saveDraft({ id: created.game.id, baseUpdatedAt: removed.game.draftUpdatedAt,
      ops: [{ op: "add_entity", scene_id: created.document.entrySceneId, entity, index }] });
    expect(restored.document).toEqual(created.document);
    expect((await caller.games.getDraft({ id: created.game.id })).document).toEqual(created.document);
  });
  beforeEach(async () => {
    initTestDb();
    workspaceDir = await mkdtemp(join(tmpdir(), "nodetool-game-"));
    assetRoot.current = join(workspaceDir, "assets");
    await mkdir(assetRoot.current);
    await Project.insertNew({ id: PROJECT_ID, user_id: USER_ID, name: "Games", kind: "game" });
    await Workspace.create({
      user_id: USER_ID,
      project_id: PROJECT_ID,
      name: "Project workspace",
      path: workspaceDir,
      is_default: false
    });
  });

  afterEach(async () => {
    ModelObserver.clear();
    await rm(workspaceDir, { recursive: true, force: true });
  });

  it("maps ownership bounds and final reconciliation failures to invalid input", async () => {
    const previousCatalog = getProcessSandboxModuleCatalog();
    const pack = discoverSandboxPack(fileURLToPath(new URL("../../sandbox-packs/sandbox-game", import.meta.url)));
    if (!pack) { throw new Error("Game pack missing"); }
    setProcessSandboxModuleCatalog(createSandboxModuleCatalog([pack]));
    try {
      const caller = createCaller(makeCtx(USER_ID));
      const created = await caller.games.create({ projectId: PROJECT_ID, name: "Ownership errors" });
      const preview = await caller.games.previewAuthoring({ id: created.game.id,
        program: { source: "return inputs.document;", inputs: { document: created.document }, seed: 1 } });
      const saved = await caller.games.applyAuthoring({ id: created.game.id, candidate: preview.candidate });
      if (saved.document.schemaVersion === 3) { throw new Error("Expected 2D fixture"); }
      const entity = saved.document.scenes[0].entities[0];
      if (!entity) { throw new Error("Fixture entity missing"); }
      const invalid = [
        { op: "set_authoring_membership" as const, scene_id: saved.document.entrySceneId, entity_id: "ghost",
          membership: "detachment" as const, present: true, positions: [1] },
        { op: "set_override_membership" as const, scene_id: saved.document.entrySceneId, entity_id: entity.id,
          path: ["transform2d", "x"], override: { value: entity.transform2d.x + 1 } }
      ];
      for (const op of invalid) {
        await expect(caller.games.saveDraft({ id: created.game.id, baseUpdatedAt: saved.game.draftUpdatedAt,
          ops: [{ op: "update_scene", scene_id: saved.document.entrySceneId, set: { name: "Rejected change" } }, op]
        })).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("Op 1: authoring") });
        expect(await caller.games.getDraft({ id: created.game.id })).toEqual(saved);
      }
      const updated = await caller.games.saveDraft({ id: created.game.id, baseUpdatedAt: saved.game.draftUpdatedAt,
        ops: [{ op: "set_authoring_membership", scene_id: saved.document.entrySceneId, entity_id: "ghost",
          membership: "detachment", present: true, positions: [0] }] });
      expect(updated.document.authoring?.detached).toEqual([{ sceneId: saved.document.entrySceneId, entityId: "ghost" }]);
      expect(await caller.games.getDraft({ id: created.game.id })).toEqual(updated);
      expect(await caller.games.draftChanges({ id: created.game.id })).toContainEqual(
        expect.objectContaining({ summary: "Changed authoring membership (1)" }));
      const overridden = await caller.games.saveDraft({ id: created.game.id, baseUpdatedAt: updated.game.draftUpdatedAt,
        ops: [{ op: "set_override_membership", scene_id: saved.document.entrySceneId, entity_id: entity.id,
          path: ["transform2d", "x"], override: { value: entity.transform2d.x } }] });
      expect(overridden.document.authoring?.overrides).toContainEqual({ sceneId: saved.document.entrySceneId,
        entityId: entity.id, path: ["transform2d", "x"], value: entity.transform2d.x });
      expect(overridden.document.authoring?.program).toEqual(saved.document.authoring?.program);
      expect(overridden.document.authoring?.baseline).toEqual(saved.document.authoring?.baseline);
      expect(await caller.games.getDraft({ id: created.game.id })).toEqual(overridden);
      expect(await caller.games.draftChanges({ id: created.game.id })).toContainEqual(
        expect.objectContaining({ summary: "Changed property ownership (1)" }));
    } finally { setProcessSandboxModuleCatalog(previousCatalog); }
  });

  it("previews retained construction without writes and rejects stale or tampered applies", async () => {
    const previousCatalog = getProcessSandboxModuleCatalog();
    const pack = discoverSandboxPack(fileURLToPath(new URL("../../sandbox-packs/sandbox-game", import.meta.url)));
    if (!pack) { throw new Error("Missing retained game construction pack"); }
    setProcessSandboxModuleCatalog(createSandboxModuleCatalog([pack]));
    try {
    const caller = createCaller(makeCtx(USER_ID));
    const created = await caller.games.create({ projectId: PROJECT_ID, name: "Retained room" });
    const program = { source: "return inputs.document;", inputs: { document: created.document }, seed: 7 };
    const preview = await caller.games.previewAuthoring({ id: created.game.id.slice(0, 12), program });
    expect(preview.conflicts).toEqual([]);
    expect(preview.document.authoring?.program).toEqual(program);
    expect(await caller.games.getDraft({ id: created.game.id })).toEqual(created);
    expect(await caller.games.draftChanges({ id: created.game.id })).toEqual([]);
    await expect(createCaller(makeCtx("another-user")).games.previewAuthoring({ id: created.game.id, program }))
      .rejects.toThrow("Game not found");
    await expect(caller.games.applyAuthoring({ id: created.game.id,
      candidate: { ...preview.candidate, digest: "0".repeat(64) } })).rejects.toThrow();
    expect(await caller.games.getDraft({ id: created.game.id })).toEqual(created);
    const applied = await caller.games.applyAuthoring({ id: created.game.id, candidate: preview.candidate });
    expect(applied.document.authoring?.program).toEqual(program);
    expect(applied.game.draftUpdatedAt).not.toBe(created.game.draftUpdatedAt);
    expect((await caller.games.get({ id: created.game.id })).document.authoring).toBeUndefined();
    await expect(caller.games.applyAuthoring({ id: created.game.id, candidate: preview.candidate })).rejects.toThrow();
    const secondPreview = await caller.games.previewAuthoring({ id: created.game.id });
    await caller.games.saveDraft({ id: created.game.id, baseUpdatedAt: applied.game.draftUpdatedAt,
      ops: [{ op: "update_scene", scene_id: applied.document.entrySceneId, set: { name: "Manual edit" } }] });
    await expect(caller.games.applyAuthoring({ id: created.game.id, candidate: secondPreview.candidate })).rejects.toThrow();
    expect((await caller.games.getDraft({ id: created.game.id })).document.scenes[0].name).toBe("Manual edit");
    const current = await caller.games.getDraft({ id: created.game.id });
    const moved = await caller.games.saveDraft({ id: created.game.id, baseUpdatedAt: current.game.draftUpdatedAt,
      ops: [{ op: "update_entity", scene_id: "room", entity_id: "gem", set: { transform2d: { x: 3 } } }] });
    const removingProgram = { ...program, source: `const document = inputs.document;
      document.scenes[0].entities = document.scenes[0].entities.filter((entity) => entity.id !== "gem");
      return document;` };
    const removal = await caller.games.previewAuthoring({ id: created.game.id, program: removingProgram });
    expect(removal.conflicts).toContainEqual(expect.objectContaining({ entityId: "gem", code: "removed_overridden_entity" }));
    await expect(caller.games.applyAuthoring({ id: created.game.id, candidate: removal.candidate })).rejects.toThrow("Resolve authoring conflicts");
    const detached = await caller.games.saveDraft({ id: created.game.id, baseUpdatedAt: moved.game.draftUpdatedAt,
      ops: [{ op: "detach_entity", scene_id: "room", entity_id: "gem" }] });
    const resolved = await caller.games.previewAuthoring({ id: created.game.id, program: removingProgram });
    expect(resolved.conflicts).toEqual([]);
    const resolvedDraft = await caller.games.applyAuthoring({ id: created.game.id, candidate: resolved.candidate });
    expect(resolvedDraft.game.draftUpdatedAt).not.toBe(detached.game.draftUpdatedAt);
    if (resolvedDraft.document.schemaVersion === 3) { throw new Error("Expected 2D retained room"); }
    expect(resolvedDraft.document.scenes[0].entities.find((entity) => entity.id === "gem")?.transform2d.x).toBe(3);
    expect(resolvedDraft.document.scenes[0].name).toBe("Manual edit");
    } finally { setProcessSandboxModuleCatalog(previousCatalog); }
  });

  it("installs a staged TrueType font into a version two game", async () => {
    const caller = createCaller(makeCtx(USER_ID));
    const created = await caller.games.create({ projectId: PROJECT_ID, name: "Font room" });
    const published = await caller.games.publish({ id: created.game.id, baseRevision: created.game.revision, baseUpdatedAt: created.game.draftUpdatedAt,
      document: { ...created.document, schemaVersion: 2 } });
    const [row] = await Workspace.listByProject(USER_ID, PROJECT_ID);
    if (!row) throw new Error("Project workspace missing");
    const workspace = workspaceFromRow(row);
    if (!workspace) throw new Error("Workspace storage missing");
    const bytes = await readFile(new URL("../../timeline/fonts/BebasNeue-Regular.ttf", import.meta.url));
    const digest = createHash("sha256").update(bytes).digest("hex");
    await workspace.write(`games/${created.game.id}/assets/${digest}.ttf`, bytes, "font/ttf");
    const installed = await caller.games.installCandidate({ id: created.game.id, baseRevision: published.game.revision, baseUpdatedAt: published.game.draftUpdatedAt,
      slot: "display", binding: { assetId: "font-candidate", digest, mediaKind: "font", fontFormat: "ttf",
        width: 1, height: 1, pivot: { x: 0.5, y: 0.5 }, sampling: "nearest", required: true } });
    expect(installed.document.assets.display).toMatchObject({ digest, mediaKind: "font", fontFormat: "ttf" });
  });

  it("creates a playable native source, reopens it, rejects stale edits, and restores a revision", async () => {
    const caller = createCaller(makeCtx(USER_ID));
    const created = await caller.games.create({ projectId: PROJECT_ID, name: "Room" });
    expect(created.document.id).toBe(created.game.id);
    expect(created.document.revision).toBe(created.game.revision);
    expect(created.document.scenes[0]?.entities.length).toBeGreaterThan(0);
    expect((await caller.games.list({ projectId: PROJECT_ID })).map((game) => game.id)).toEqual([created.game.id]);
    expect(await caller.projects.documents({ id: PROJECT_ID })).toContainEqual({
      type: "game",
      ref: created.game.id,
      name: "Room",
      updatedAt: created.game.updatedAt
    });

    const opened = await caller.games.get({ id: created.game.id });
    expect(opened.document).toEqual(created.document);
    expect((await caller.games.get({ id: created.game.id.slice(0, 12) })).game.id).toBe(created.game.id);
    const edited = {
      ...opened.document,
      scenes: opened.document.scenes.map((scene) => ({ ...scene, name: "Edited room" }))
    };
    const published = await caller.games.publish({
      id: created.game.id,
      baseRevision: created.game.revision, baseUpdatedAt: created.game.draftUpdatedAt,
      document: edited
    });
    expect(published.game.revision).not.toBe(created.game.revision);
    expect((await caller.games.get({ id: created.game.id })).document.scenes[0]?.name).toBe("Edited room");
    expect((await caller.games.revisions({ id: created.game.id })).map((entry) => entry.revision).sort()).toEqual(
      [created.game.revision, published.game.revision].sort()
    );

    await expect(caller.games.publish({
      id: created.game.id,
      baseRevision: created.game.revision, baseUpdatedAt: created.game.draftUpdatedAt,
      document: edited
    })).rejects.toMatchObject({ code: "CONFLICT" });

    const restored = await caller.games.restore({
      id: created.game.id,
      baseRevision: published.game.revision, baseUpdatedAt: published.game.draftUpdatedAt,
      revision: created.game.revision
    });
    expect(restored.game.revision).not.toBe(created.game.revision);
    expect(restored.document.scenes[0]?.name).toBe(created.document.scenes[0]?.name);
    expect((await caller.games.get({ id: created.game.id, revision: published.game.revision })).document.scenes[0]?.name).toBe("Edited room");
  });

  it("rejects more than 1024 draft operations before writing", async () => {
    const caller = createCaller(makeCtx(USER_ID));
    const created = await caller.games.create({ projectId: PROJECT_ID, name: "Bounded draft" });
    const op = { op: "update_scene" as const, scene_id: created.document.scenes[0].id, set: { name: "Changed" } };
    await expect(caller.games.saveDraft({ id: created.game.id, baseUpdatedAt: created.game.draftUpdatedAt,
      ops: Array.from({ length: 1025 }, () => op) })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(await caller.games.getDraft({ id: created.game.id })).toEqual(created);
    expect(await caller.games.draftChanges({ id: created.game.id })).toEqual([]);
    const saved = await caller.games.saveDraft({ id: created.game.id, baseUpdatedAt: created.game.draftUpdatedAt,
      ops: Array.from({ length: 1024 }, () => op) });
    expect(saved.document.scenes[0].name).toBe("Changed");
  });

  it("bounds draft history bytes without returning a partial agent undo group", async () => {
    const caller = createCaller(makeCtx(USER_ID));
    const created = await caller.games.create({ projectId: PROJECT_ID, name: "Bounded history" });
    const change = (id: string, messageId: string | null, summary: string) => ({
      id, gameId: created.game.id, actor: "agent" as const, threadId: "thread", messageId,
      summary, beforeUpdatedAt: created.game.draftUpdatedAt, beforeDigest: "digest", createdAt: "now",
      ops: [{ op: "update_scene" as const, scene_id: created.document.scenes[0].id, set: { name: id } }], affectedEntityIds: []
    });
    const records = [change("new", "new-message", "New"), change("group-last", "old-message", "x".repeat(600_000)),
      change("group-first", "old-message", "x".repeat(600_000))];
    const list = vi.spyOn(Game, "listDraftChanges").mockResolvedValue(records);
    try {
      const changes = await caller.games.draftChanges({ id: created.game.id });
      expect(Buffer.byteLength(JSON.stringify(changes))).toBeLessThanOrEqual(1_048_576);
      expect(changes.map((entry) => entry.id)).toEqual(["new"]);
      expect(changes[0].ops).toEqual(records[0].ops);
    } finally { list.mockRestore(); }
  });

  it("saves draft ops without publishing and rejects stale or invalid edits", async () => {
    const caller = createCaller(makeCtx(USER_ID));
    const created = await caller.games.create({ projectId: PROJECT_ID, name: "Draft room" });
    const sceneId = created.document.scenes[0]?.id;
    if (!sceneId) throw new Error("Starter scene missing");
    const first = await caller.games.getDraft({ id: created.game.id });
    expect(first.document).toEqual(created.document);
    let observedOps: unknown[] | undefined;
    ModelObserver.subscribe((_instance, _event, meta) => { observedOps = meta?.ops; }, "Game");
    const saved = await caller.games.saveDraft({
      id: created.game.id,
      baseUpdatedAt: first.game.draftUpdatedAt,
      ops: [{ op: "update_scene", scene_id: sceneId, set: { name: "Edited draft" } }]
    });
    expect(saved.document.scenes[0]?.name).toBe("Edited draft");
    expect(observedOps).toEqual([{ tool: "update_scene", input: { op: "update_scene", scene_id: sceneId, set: { name: "Edited draft" } } }]);
    expect(saved.game.revision).toBe(created.game.revision);
    expect(saved.game.draftUpdatedAt).not.toBe(first.game.draftUpdatedAt);
    expect((await caller.games.get({ id: created.game.id })).document.scenes[0]?.name).toBe(created.document.scenes[0]?.name);
    expect((await caller.games.getDraft({ id: created.game.id })).document.scenes[0]?.name).toBe("Edited draft");
    const changes = await caller.games.draftChanges({ id: created.game.id });
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ actor: "user", beforeUpdatedAt: first.game.draftUpdatedAt });
    expect(await caller.games.draftBeforeChange({ id: created.game.id, changeId: changes[0].id })).toEqual(created.document);
    await expect(caller.games.saveDraft({
      id: created.game.id, baseUpdatedAt: first.game.draftUpdatedAt,
      ops: [{ op: "update_scene", scene_id: sceneId, set: { name: "Stale" } }]
    })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(caller.games.saveDraft({
      id: created.game.id, baseUpdatedAt: saved.game.draftUpdatedAt,
      ops: [{ op: "update_scene", scene_id: "missing", set: { name: "Invalid" } }]
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect((await caller.games.getDraft({ id: created.game.id })).document.scenes[0]?.name).toBe("Edited draft");
    expect(await caller.games.revisions({ id: created.game.id })).toHaveLength(1);
    const published = await caller.games.publish({ id: created.game.id, baseRevision: created.game.revision, message: "Room finished" });
    expect(published.document.scenes[0]?.name).toBe("Edited draft");
    expect((await caller.games.getDraft({ id: created.game.id })).document.scenes[0]?.name).toBe("Edited draft");
    expect(await caller.games.draftChanges({ id: created.game.id })).toEqual([]);
    expect((await caller.games.revisions({ id: created.game.id })).find((item) => item.revision === published.game.revision)?.message)
      .toBe("Room finished");
  });

  it("restores a revision into the draft without publishing it", async () => {
    const caller = createCaller(makeCtx(USER_ID));
    const created = await caller.games.create({ projectId: PROJECT_ID, name: "Restore room" });
    const sceneId = created.document.scenes[0]?.id;
    if (!sceneId) throw new Error("Starter scene missing");
    const edited = await caller.games.saveDraft({
      id: created.game.id, baseUpdatedAt: created.game.draftUpdatedAt,
      ops: [{ op: "update_scene", scene_id: sceneId, set: { name: "Changed" } }]
    });
    const restored = await caller.games.restoreDraft({
      id: created.game.id, baseUpdatedAt: edited.game.draftUpdatedAt, revision: created.game.revision
    });
    expect(restored.document.scenes[0]?.name).toBe(created.document.scenes[0]?.name);
    expect(restored.game.revision).toBe(created.game.revision);
    expect(await caller.games.revisions({ id: created.game.id })).toHaveLength(1);
    expect((await caller.games.draftChanges({ id: created.game.id }))[0]?.summary).toBe("Restored a revision");
  });

  it.each(["2d", "3d"] as const)("F6 requires explicit revision restore after losing a %s draft", async (dimension) => {
    const caller = createCaller(makeCtx(USER_ID));
    const created = await caller.games.create({ projectId: PROJECT_ID, name: "Lost draft", dimension });
    const saved = await caller.games.saveDraft({ id: created.game.id, baseUpdatedAt: created.game.draftUpdatedAt,
      ops: [{ op: "update_scene", scene_id: created.document.entrySceneId, set: { name: "Unpublished edit" } }] });
    const game = await Game.findOwned(USER_ID, created.game.id);
    const [row] = await Workspace.listByProject(USER_ID, PROJECT_ID);
    const workspace = row && workspaceFromRow(row);
    if (!game || !workspace) { throw new Error("Saved game workspace missing"); }
    await workspace.delete(`${game.source_root}/drafts/${game.draft_version_id}.json`);
    await workspace.delete(`${game.source_root}/draft.json`);
    await expect(caller.games.getDraft({ id: created.game.id })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    const recovery = await caller.games.get({ id: created.game.id });
    expect(recovery.game.draftUpdatedAt).toBe(saved.game.draftUpdatedAt);
    expect(recovery.document).toEqual(created.document);
    await expect(caller.games.restoreDraft({ id: created.game.id, baseUpdatedAt: created.game.draftUpdatedAt,
      revision: created.game.revision })).rejects.toMatchObject({ code: "CONFLICT" });
    const restored = await caller.games.restoreDraft({ id: created.game.id, baseUpdatedAt: recovery.game.draftUpdatedAt,
      revision: created.game.revision });
    expect(restored.document).toEqual(created.document);
    expect(restored.game.revision).toBe(created.game.revision);
    expect(restored.game.draftUpdatedAt).not.toBe(saved.game.draftUpdatedAt);
    expect(await caller.games.getDraft({ id: created.game.id })).toEqual(restored);
    const changes = await caller.games.draftChanges({ id: created.game.id });
    expect(changes).toHaveLength(2);
    expect(changes[0].summary).toBe("Restored a revision after draft source loss");
    await expect(caller.games.draftBeforeChange({ id: created.game.id, changeId: changes[0].id }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("keeps the winning draft when concurrent writers share a base timestamp", async () => {
    const caller = createCaller(makeCtx(USER_ID));
    const created = await caller.games.create({ projectId: PROJECT_ID, name: "Concurrent room" });
    const sceneId = created.document.scenes[0]?.id;
    if (!sceneId) throw new Error("Starter scene missing");
    const results = await Promise.allSettled(["First", "Second"].map((name) =>
      caller.games.saveDraft({ id: created.game.id, baseUpdatedAt: created.game.draftUpdatedAt,
        ops: [{ op: "update_scene", scene_id: sceneId, set: { name } }] })));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const winner = results.find((result) => result.status === "fulfilled");
    if (!winner || winner.status !== "fulfilled") throw new Error("No winning draft write");
    expect((await caller.games.getDraft({ id: created.game.id })).document.scenes[0]?.name)
      .toBe(winner.value.document.scenes[0]?.name);
  });

  it("keeps game source owner scoped", async () => {
    const owner = createCaller(makeCtx(USER_ID));
    const other = createCaller(makeCtx("another-user"));
    const created = await owner.games.create({ projectId: PROJECT_ID, name: "Private room" });
    await expect(other.games.get({ id: created.game.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(other.games.list({ projectId: PROJECT_ID })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("creates a project game workspace when the user's default workspace is custom", async () => {
    const prior = process.env["NODETOOL_WORKSPACES_DIR"];
    process.env["NODETOOL_WORKSPACES_DIR"] = join(workspaceDir, "managed");
    try {
      await Workspace.create({
        user_id: USER_ID,
        name: "Custom default",
        path: workspaceDir,
        is_default: true
      });
      const secondProject = "game-project-without-workspace";
      await Project.insertNew({ id: secondProject, user_id: USER_ID, name: "Another game", kind: "game" });
      const created = await createCaller(makeCtx(USER_ID)).games.create({ projectId: secondProject, name: "Room" });
      const row = await Workspace.find(USER_ID, created.game.workspaceId);
      expect(row?.path).toContain(getManagedWorkspaceDir(USER_ID));
      expect(row?.project_id).toBe(secondProject);
    } finally {
      if (prior === undefined) delete process.env["NODETOOL_WORKSPACES_DIR"];
      else process.env["NODETOOL_WORKSPACES_DIR"] = prior;
    }
  });

  it("installs only staged candidate bytes and keeps scene edits", async () => {
    const caller = createCaller(makeCtx(USER_ID));
    const created = await caller.games.create({ projectId: PROJECT_ID, name: "Room" });
    const edited = {
      ...created.document,
      scenes: created.document.scenes.map((scene) => ({ ...scene, name: "My room" }))
    };
    const published = await caller.games.publish({
      id: created.game.id,
      baseRevision: created.game.revision, baseUpdatedAt: created.game.draftUpdatedAt,
      document: edited
    });
    const [row] = await Workspace.listByProject(USER_ID, PROJECT_ID);
    if (!row) throw new Error("Project workspace missing");
    const workspace = workspaceFromRow(row);
    if (!workspace) throw new Error("Workspace storage missing");
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const digest = createHash("sha256").update(bytes).digest("hex");
    await workspace.write(`games/${created.game.id}/assets/${digest}.png`, bytes, "image/png");
    const binding = {
      assetId: "candidate-source",
      digest,
      width: 32,
      height: 32,
      pivot: { x: 0.5, y: 0.5 },
      sampling: "nearest" as const
    };
    const installed = await caller.games.installCandidate({
      id: created.game.id,
      baseRevision: published.game.revision, baseUpdatedAt: published.game.draftUpdatedAt,
      baseUpdatedAt: published.game.draftUpdatedAt,
      slot: "player",
      binding
    });
    expect(installed.document.scenes[0]?.name).toBe("My room");
    expect(installed.document.assets.player?.digest).toBe(digest);
    expect(installed.document.assets.gem).toEqual(published.document.assets.gem);

    await expect(caller.games.installCandidate({
      id: created.game.id,
      baseRevision: published.game.revision, baseUpdatedAt: published.game.draftUpdatedAt,
      baseUpdatedAt: published.game.draftUpdatedAt,
      slot: "player",
      binding
    })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(caller.games.installCandidate({
      id: created.game.id,
      baseRevision: installed.game.revision,
      baseUpdatedAt: installed.game.draftUpdatedAt,
      slot: "player",
      binding: { ...binding, digest: "0".repeat(64) }
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("keeps staged JPEG and MP3 formats while binding them to the draft", async () => {
    const caller = createCaller(makeCtx(USER_ID));
    const created = await caller.games.create({ projectId: PROJECT_ID, name: "Media room" });
    const [row] = await Workspace.listByProject(USER_ID, PROJECT_ID);
    if (!row) throw new Error("Project workspace missing");
    const workspace = workspaceFromRow(row);
    if (!workspace) throw new Error("Workspace storage missing");
    let updatedAt = created.game.draftUpdatedAt;
    for (const media of [
      { extension: "jpg", contentType: "image/jpeg", mediaKind: "image" as const, slot: "player" },
      { extension: "mp3", contentType: "audio/mpeg", mediaKind: "audio" as const, slot: "sfx.collect" }
    ]) {
      const bytes = new Uint8Array([1, 2, 3, media.extension.length]);
      const digest = createHash("sha256").update(bytes).digest("hex");
      await workspace.write(`games/${created.game.id}/assets/${digest}.${media.extension}`, bytes, media.contentType);
      const installed = await caller.games.installCandidate({
        id: created.game.id, baseRevision: created.game.revision, baseUpdatedAt: updatedAt,
        slot: media.slot,
        binding: { assetId: `candidate-${media.extension}`, digest, mediaKind: media.mediaKind,
          width: 1, height: 1, pivot: { x: 0.5, y: 0.5 }, sampling: "nearest" }
      });
      updatedAt = installed.game.draftUpdatedAt;
      const asset = await Asset.find(USER_ID, installed.document.assets[media.slot]?.assetId ?? "");
      expect(asset?.content_type).toBe(media.contentType);
      expect(installed.game.revision).toBe(created.game.revision);
    }
    expect(await caller.games.revisions({ id: created.game.id })).toHaveLength(1);
  });
  it("creates, edits, publishes and restores 3D revisions through short game IDs", async () => {
    const caller = createCaller(makeCtx(USER_ID));
    const created = await caller.games.create({ projectId: PROJECT_ID, name: "Exploration", dimension: "3d" });
    expect(created.document).toMatchObject({ schemaVersion: 3, engineVersion: "2", dimension: "3d", id: created.game.id });
    expect((await caller.games.get({ id: created.game.id.slice(0, 12) })).document).toEqual(created.document);
    const saved = await caller.games.saveDraft({ id: created.game.id.slice(0, 12), baseUpdatedAt: created.game.draftUpdatedAt,
      ops: [{ op: "update_entity", entity_id: "player", set: { transform3d: { position: { x: 2 } } } }] });
    if (saved.document.schemaVersion !== 3) { throw new Error("Expected a 3D draft"); }
    expect(saved.document.id).toBe(created.game.id);
    expect(saved.document.scenes[0].entities.find((entity) => entity.id === "player")?.transform3d.position.x).toBe(2);
    await expect(caller.games.saveDraft({ id: created.game.id, baseUpdatedAt: created.game.draftUpdatedAt,
      ops: [{ op: "update_entity", entity_id: "player", set: { name: "Stale" } }] })).rejects.toMatchObject({ code: "CONFLICT" });
    const published = await caller.games.publish({ id: created.game.id, baseRevision: created.game.revision });
    expect(published.document.schemaVersion).toBe(3);
    const restored = await caller.games.restore({ id: created.game.id, baseRevision: published.game.revision, baseUpdatedAt: published.game.draftUpdatedAt, revision: created.game.revision });
    if (restored.document.schemaVersion !== 3) { throw new Error("Expected a 3D revision"); }
    expect(restored.document.scenes[0].entities.find((entity) => entity.id === "player")?.transform3d.position.x).toBe(0);
    await expect(createCaller(makeCtx("other-user")).games.get({ id: created.game.id.slice(0, 12) })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(caller.games.create({ projectId: PROJECT_ID, name: "Mismatch", dimension: "2d", document: created.document })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("prepares owned models through the editor install endpoint without mutating source bytes", async () => {
    const caller = createCaller(makeCtx(USER_ID));
    const created = await caller.games.create({ projectId: PROJECT_ID, name: "Owned model scene", dimension: "3d" });
    const original = modelGlb(["Visual"]);
    const source = await ownedAsset(original);
    const sourceDigest = createHash("sha256").update(original).digest("hex");
    const installed = await caller.games.installAsset({ id: created.game.id.slice(0, 12),
      assetId: source.id.slice(0, 12), slot: "character", baseUpdatedAt: created.game.draftUpdatedAt,
      expectedDigest: sourceDigest });
    if (installed.document.schemaVersion !== 3) { throw new Error("Expected a 3D draft"); }
    const binding = installed.document.assets.character;
    expect(binding).toMatchObject({ mediaKind: "model", sourceAssetId: source.id, sourceDigest, nodeIds: ["node:0", "node:1"] });
    expect(binding.assetId).toHaveLength(32);
    expect(binding.assetId).not.toBe(source.id);
    const bytes = await retrieveAssetBytes(getAssetAdapter(), USER_ID, binding.assetId, "model/gltf-binary");
    if (!bytes) { throw new Error("Installed model bytes missing"); }
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(binding.digest);
    expect(binding.digest).not.toBe(sourceDigest);
    expect(await retrieveAssetBytes(getAssetAdapter(), USER_ID, source.id, source.content_type)).toEqual(Buffer.from(original));
    const [row] = await Workspace.listByProject(USER_ID, PROJECT_ID);
    const workspace = row && workspaceFromRow(row);
    expect(await workspace?.read(`games/${created.game.id}/assets/${binding.digest}.glb`)).toEqual(new Uint8Array(bytes));

    const edited = modelGlb(["Visual", "Edited"]);
    await getAssetAdapter().store(getAssetStorageKey(USER_ID, source.id, source.content_type), edited, source.content_type);
    await expect(caller.games.installAsset({ id: created.game.id, assetId: source.id, slot: "character",
      baseUpdatedAt: created.game.draftUpdatedAt })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(caller.games.installAsset({ id: created.game.id, assetId: source.id, slot: "character",
      baseUpdatedAt: installed.game.draftUpdatedAt, expectedDigest: sourceDigest })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const reinstalled = await caller.games.installAsset({ id: created.game.id, assetId: source.id, slot: "character",
      baseUpdatedAt: installed.game.draftUpdatedAt });
    expect(reinstalled.document.assets.character).toMatchObject({ sourceAssetId: source.id, nodeIds: ["node:0", "node:1", "node:2"] });
    expect(reinstalled.document.assets.character.digest).not.toBe(binding.digest);
    expect(await retrieveAssetBytes(getAssetAdapter(), USER_ID, binding.assetId, "model/gltf-binary")).toEqual(bytes);
    expect(await retrieveAssetBytes(getAssetAdapter(), USER_ID, source.id, source.content_type)).toEqual(Buffer.from(edited));
    await expect(createCaller(makeCtx("other-user")).games.installAsset({ id: created.game.id,
      assetId: source.id, slot: "character" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const foreign = await ownedAsset(original, "other-user");
    await expect(caller.games.installAsset({ id: created.game.id, assetId: foreign.id, slot: "character" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("resolves glTF dependencies only through explicitly mapped owned assets", async () => {
    const caller = createCaller(makeCtx(USER_ID));
    const created = await caller.games.create({ projectId: PROJECT_ID, name: "glTF scene", dimension: "3d" });
    const source = await ownedAsset(new TextEncoder().encode(JSON.stringify({ asset: { version: "2.0" },
      buffers: [{ byteLength: 12, uri: "geometry.bin" }], scenes: [{ nodes: [0] }], nodes: [{ name: "Visual" }] })), USER_ID, "model/gltf+json");
    await expect(caller.games.installAsset({ id: created.game.id, assetId: source.id, slot: "model" }))
      .rejects.toThrow("Unresolved authorized model dependency: geometry.bin");
    const foreign = await ownedAsset(new Uint8Array(12), "other-user", "application/octet-stream");
    await expect(caller.games.installAsset({ id: created.game.id, assetId: source.id, slot: "model",
      dependencyAssetIds: { "geometry.bin": foreign.id } })).rejects.toThrow("Model dependency asset not found");
    const geometry = await ownedAsset(new Uint8Array(12), USER_ID, "application/octet-stream");
    const installed = await caller.games.installAsset({ id: created.game.id, assetId: source.id, slot: "model",
      baseUpdatedAt: created.game.draftUpdatedAt, dependencyAssetIds: { "geometry.bin": geometry.id.slice(0, 12) },
      importSettings: { scale: 2, forward: "+x", origin: "ground" } });
    expect(installed.document.assets.model).toMatchObject({ mediaKind: "model", sourceAssetId: source.id,
      importSettings: { scale: 2, forward: "+x", origin: "ground" } });
    const bytes = await retrieveAssetBytes(getAssetAdapter(), USER_ID, installed.document.assets.model.assetId, "model/gltf-binary");
    if (!bytes) { throw new Error("Installed GLB missing"); }
    expect((await prepareGameModelBinding3D(bytes, { assetId: "verify" })).ok).toBe(true);
  });

  it("cleans up a prepared model asset when the draft changes during installation", async () => {
    const caller = createCaller(makeCtx(USER_ID));
    const created = await caller.games.create({ projectId: PROJECT_ID, name: "Racing model", dimension: "3d" });
    const source = await ownedAsset(modelGlb(["Visual"]));
    const createSpy = vi.spyOn(Asset, "create");
    const updateSpy = vi.spyOn(Game, "updateDraft").mockResolvedValueOnce(null);
    try {
      await expect(caller.games.installAsset({ id: created.game.id, assetId: source.id, slot: "model",
        baseUpdatedAt: created.game.draftUpdatedAt })).rejects.toMatchObject({ code: "CONFLICT" });
      expect(createSpy).toHaveBeenCalledTimes(1);
      const installed = await createSpy.mock.results[0].value;
      if (!(installed instanceof Asset)) { throw new Error("Expected allocated model asset"); }
      expect(await Asset.find(USER_ID, installed.id)).toBeNull();
      expect(await retrieveAssetBytes(getAssetAdapter(), USER_ID, installed.id, installed.content_type)).toBeNull();
      expect((await caller.games.get({ id: created.game.id })).document.assets.model).toBeUndefined();
    } finally {
      createSpy.mockRestore(); updateSpy.mockRestore();
    }
  });

  it("preserves the existing owned image install contract for 2D games", async () => {
    const caller = createCaller(makeCtx(USER_ID));
    const created = await caller.games.create({ projectId: PROJECT_ID, name: "Image scene" });
    const bytes = await sharp({ create: { width: 2, height: 3, channels: 4, background: "#ffffff" } }).png().toBuffer();
    const source = await ownedAsset(bytes, USER_ID, "image/png");
    const installed = await caller.games.installAsset({ id: created.game.id, assetId: source.id.slice(0, 12), slot: "player",
      baseUpdatedAt: created.game.draftUpdatedAt });
    expect(installed.document.assets.player).toMatchObject({ assetId: source.id, width: 2, height: 3,
      digest: createHash("sha256").update(bytes).digest("hex"), sampling: "nearest" });
    expect(installed.document.assets.player.mediaKind).not.toBe("model");
  });

  it("verifies staged GLB bytes and derives canonical 3D model metadata before installation", async () => {
    const caller = createCaller(makeCtx(USER_ID));
    const created = await caller.games.create({ projectId: PROJECT_ID, name: "Model scene", dimension: "3d" });
    const [row] = await Workspace.listByProject(USER_ID, PROJECT_ID);
    const workspace = row && workspaceFromRow(row);
    if (!workspace) { throw new Error("Workspace missing"); }
    const raw = new TextEncoder().encode(JSON.stringify({ asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: "Visual" }] }));
    const padded = Math.ceil(raw.length / 4) * 4;
    const bytes = new Uint8Array(20 + padded);
    bytes.fill(32, 20);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, bytes.length, true);
    view.setUint32(12, padded, true); view.setUint32(16, 0x4e4f534a, true); bytes.set(raw, 20);
    const prepared = await prepareGameModelBinding3D(bytes, { assetId: "candidate-model" });
    if (!prepared.ok) { throw new Error("Fixture GLB did not prepare"); }
    await workspace.write(`games/${created.game.id}/assets/${prepared.binding.digest}.glb`, bytes, "model/gltf-binary");
    const installed = await caller.games.installCandidate({ id: created.game.id, baseUpdatedAt: created.game.draftUpdatedAt, slot: "character-model",
      binding: { ...prepared.binding, nodeIds: ["untrusted-node"], triangles: 200_000 } });
    expect(installed.document.assets["character-model"]).toMatchObject({ nodeIds: ["node:0"], triangles: 0, mediaKind: "model" });
    const asset = await Asset.find(USER_ID, installed.document.assets["character-model"].assetId);
    expect(asset?.content_type).toBe("model/gltf-binary");
    expect(installed.document.assets["character-model"].assetId).toHaveLength(32);
    const invalid = new TextEncoder().encode("invalid GLB");
    const digest = createHash("sha256").update(invalid).digest("hex");
    await workspace.write(`games/${created.game.id}/assets/${digest}.glb`, invalid, "model/gltf-binary");
    await expect(caller.games.installCandidate({ id: created.game.id, slot: "invalid", binding: { ...prepared.binding, digest } })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("derives collider bounds and rejects malformed triangle artifacts", async () => {
    const caller = createCaller(makeCtx(USER_ID));
    const created = await caller.games.create({ projectId: PROJECT_ID, name: "Collider scene", dimension: "3d" });
    const [row] = await Workspace.listByProject(USER_ID, PROJECT_ID);
    const workspace = row && workspaceFromRow(row);
    if (!workspace) { throw new Error("Workspace missing"); }
    const bytes = new TextEncoder().encode(JSON.stringify({ vertices: [0, 0, 0, 2, 0, 0, 0, 3, 0], indices: [0, 1, 2] }));
    const digest = createHash("sha256").update(bytes).digest("hex");
    await workspace.write(`games/${created.game.id}/assets/${digest}.json`, bytes, "application/json");
    const binding = { mediaKind: "collider" as const, assetId: "candidate-collider", digest, preparationVersion: "1", shape: "triangleMesh" as const,
      bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } }, vertices: 1, triangles: 0 };
    const installed = await caller.games.installCandidate({ id: created.game.id, slot: "terrain", binding });
    expect(installed.document.assets.terrain).toMatchObject({ vertices: 3, triangles: 1, bounds: { max: { x: 2, y: 3, z: 0 } } });
    const malformed = new TextEncoder().encode(JSON.stringify({ vertices: [0, 0, 0, 2, 0, 0, 0, 3, 0], indices: [0, 1, 3] }));
    const badDigest = createHash("sha256").update(malformed).digest("hex");
    await workspace.write(`games/${created.game.id}/assets/${badDigest}.json`, malformed, "application/json");
    await expect(caller.games.installCandidate({ id: created.game.id, slot: "invalid", binding: { ...binding, digest: badDigest } })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("F6 requires a draft token before explicit publish or restore can discard unpublished edits", async () => {
    const caller = createCaller(makeCtx(USER_ID));
    const created = await caller.games.create({ projectId: PROJECT_ID, name: "Protected draft" });
    const saved = await caller.games.saveDraft({ id: created.game.id, baseUpdatedAt: created.game.draftUpdatedAt,
      ops: [{ op: "update_scene", scene_id: created.document.entrySceneId, set: { name: "Unpublished edit" } }] });
    await expect(caller.games.publish({ id: created.game.id, baseRevision: created.game.revision,
      document: created.document })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(Reflect.apply(caller.games.restore, undefined, [{ id: created.game.id, baseRevision: created.game.revision,
      revision: created.game.revision }])).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(await caller.games.getDraft({ id: created.game.id })).toEqual(saved);
  });

  it("F20 reports a successful publish when its post-commit mirror write fails", async () => {
    const caller = createCaller(makeCtx(USER_ID));
    const created = await caller.games.create({ projectId: PROJECT_ID, name: "Committed release" });
    const [row] = await Workspace.listByProject(USER_ID, PROJECT_ID);
    const workspace = row && workspaceFromRow(row);
    if (!workspace) { throw new Error("Workspace missing"); }
    const originalWrite = workspace.write;
    const spy = vi.spyOn(Object.getPrototypeOf(workspace), "write").mockImplementation(async (...args: Parameters<typeof workspace.write>) => {
      if (args[0].endsWith("/draft.json")) { throw new Error("Storage unavailable after commit"); }
      return originalWrite.apply(workspace, args);
    });
    try {
      const published = await caller.games.publish({ id: created.game.id, baseRevision: created.game.revision });
      expect(published.game.revision).not.toBe(created.game.revision);
      expect((await caller.games.get({ id: created.game.id })).game.revision).toBe(published.game.revision);
    } finally { spy.mockRestore(); }
  });

  it("preserves the publication conflict when losing-revision cleanup fails", async () => {
    const caller = createCaller(makeCtx(USER_ID));
    const created = await caller.games.create({ projectId: PROJECT_ID, name: "Losing publication" });
    const [row] = await Workspace.listByProject(USER_ID, PROJECT_ID);
    const workspace = row && workspaceFromRow(row);
    if (!workspace) { throw new Error("Workspace missing"); }
    const attemptedPaths: string[] = [];
    const originalDelete = workspace.delete;
    const readDraft = Game.readDraft;
    let injectEdit = true;
    const readDraftSpy = vi.spyOn(Game, "readDraft").mockImplementation(async (...args) => {
      const captured = await readDraft.apply(Game, args);
      if (injectEdit && captured) {
        injectEdit = false;
        await caller.games.saveDraft({ id: created.game.id, baseUpdatedAt: captured.game.draft_updated_at,
          ops: [{ op: "update_scene", scene_id: created.document.entrySceneId, set: { name: "Winning draft" } }] });
      }
      return captured;
    });
    const deleteSpy = vi.spyOn(Object.getPrototypeOf(workspace), "delete").mockImplementation(async (...args: Parameters<typeof workspace.delete>) => {
      if (args[0].includes("/revisions/")) {
        attemptedPaths.push(args[0]);
        throw new Error("Losing-revision cleanup failure");
      }
      return originalDelete.apply(workspace, args);
    });
    try {
      await expect(caller.games.publish({ id: created.game.id, baseRevision: created.game.revision }))
        .rejects.toMatchObject({ code: "CONFLICT", message: "Game was modified concurrently" });
      expect(attemptedPaths).toHaveLength(1);
      expect(attemptedPaths[0]).toMatch(/\/revisions\/[a-f0-9]{32}\/game\.json$/);
      expect(attemptedPaths[0]).not.toContain(created.game.revision);
      expect((await caller.games.get({ id: created.game.id })).game.revision).toBe(created.game.revision);
      expect((await caller.games.getDraft({ id: created.game.id })).document.scenes[0]?.name).toBe("Winning draft");
    } finally {
      readDraftSpy.mockRestore();
      deleteSpy.mockRestore();
    }
  });

  it("F26 returns INVALID_INPUT for invalid restored documents and rejected draft operations", async () => {
    const caller = createCaller(makeCtx(USER_ID));
    const created = await caller.games.create({ projectId: PROJECT_ID, name: "Validation errors" });
    const [row] = await Workspace.listByProject(USER_ID, PROJECT_ID);
    const workspace = row && workspaceFromRow(row);
    if (!workspace) { throw new Error("Workspace missing"); }
    await workspace.write(`games/${created.game.id}/revisions/${created.game.revision}/game.json`,
      JSON.stringify({ ...created.document, entrySceneId: "missing" }), "application/json");
    await expect(caller.games.restoreDraft({ id: created.game.id, baseUpdatedAt: created.game.draftUpdatedAt,
      revision: created.game.revision })).rejects.toMatchObject({ code: "BAD_REQUEST", cause: { apiCode: "INVALID_INPUT" } });
    await workspace.write(`games/${created.game.id}/revisions/${created.game.revision}/game.json`, JSON.stringify(created.document), "application/json");
    await expect(caller.games.saveDraft({ id: created.game.id, baseUpdatedAt: created.game.draftUpdatedAt,
      ops: [{ op: "update_scene", scene_id: "missing", set: { name: "Invalid" } }] })).rejects.toMatchObject({ code: "BAD_REQUEST", cause: { apiCode: "INVALID_INPUT" } });
  });

  it("F27 bounds stored revision files while retaining the live revision", async () => {
    const caller = createCaller(makeCtx(USER_ID));
    const created = await caller.games.create({ projectId: PROJECT_ID, name: "Revision retention" });
    const [row] = await Workspace.listByProject(USER_ID, PROJECT_ID);
    const workspace = row && workspaceFromRow(row);
    if (!workspace) { throw new Error("Workspace missing"); }
    for (let index = 0; index < 104; index++) {
      const revision = index.toString(16).padStart(32, "0");
      await workspace.write(`games/${created.game.id}/revisions/${revision}/game.json`,
        JSON.stringify({ ...created.document, revision }), "application/json");
    }
    const published = await caller.games.publish({ id: created.game.id, baseRevision: created.game.revision });
    const revisions = await caller.games.revisions({ id: created.game.id });
    expect(revisions).toHaveLength(100);
    expect(revisions.some((entry) => entry.revision === published.game.revision && entry.current)).toBe(true);
    expect((await caller.games.get({ id: created.game.id })).document.revision).toBe(published.game.revision);
  });

  it("F19 rejects publishing unseen draft changes after a document was validated", async () => {
    const caller = createCaller(makeCtx(USER_ID));
    const created = await caller.games.create({ projectId: PROJECT_ID, name: "Validated release" });
    const digest = createHash("sha256").update(JSON.stringify(created.document)).digest("hex");
    const saved = await caller.games.saveDraft({ id: created.game.id, baseUpdatedAt: created.game.draftUpdatedAt,
      ops: [{ op: "update_scene", scene_id: created.document.entrySceneId, set: { name: "Unseen agent edit" } }] });
    await expect(caller.games.publish({ id: created.game.id, baseRevision: created.game.revision,
      expectedDigest: digest })).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await caller.games.get({ id: created.game.id })).game.revision).toBe(created.game.revision);
    expect(await caller.games.getDraft({ id: created.game.id })).toEqual(saved);
  });

});
