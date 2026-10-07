import { beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { AmbiguousGameIdError, Game, initTestDb } from "../src/index.js";
import { gameDocument3D } from "@nodetool-ai/protocol";
import { createTopDownRoomGame } from "@nodetool-ai/game-runtime";

const USER = "game-owner";
const PREFIX = "0123456789ab";

async function insert(id: string): Promise<Game> {
  const game = await Game.insertNew({
    id,
    userId: USER,
    projectId: "project",
    workspaceId: "workspace",
    name: "Room",
    revision: "a".repeat(32)
  });
  if (!game) throw new Error("Game insertion failed");
  return game;
}

describe("game revision pointer", () => {
  beforeEach(() => initTestDb());

  it("resolves only a unique authorized 12-character prefix", async () => {
    const first = await insert(`${PREFIX}${"1".repeat(20)}`);
    expect((await Game.findOwned(USER, PREFIX))?.id).toBe(first.id);
    expect(await Game.findOwned("other-user", PREFIX)).toBeNull();
    await insert(`${PREFIX}${"2".repeat(20)}`);
    await expect(Game.findOwned(USER, PREFIX)).rejects.toBeInstanceOf(AmbiguousGameIdError);
    expect(await Game.findOwned(USER, PREFIX.slice(0, 11))).toBeNull();
  });

  it("publishes with compare-and-swap", async () => {
    const game = await insert(`${PREFIX}${"1".repeat(20)}`);
    const next = "b".repeat(32);
    expect((await Game.publish(USER, game.id, game.current_revision, next, undefined, undefined, "First release"))?.current_revision).toBe(next);
    expect(await Game.publish(USER, game.id, game.current_revision, "c".repeat(32), undefined, undefined, "Stale release")).toBeNull();
    expect(await Game.listRevisionMessages(USER, game.id)).toEqual(new Map([[next, "First release"]]));
  });

  it("advances a future draft token when publishing without an explicit token", async () => {
    const game = await insert(`${PREFIX}${"1".repeat(20)}`);
    const futureToken = "2099-01-01T00:00:00.000Z";
    await game.update({ draft_updated_at: futureToken });
    const published = await Game.publish(USER, game.id, game.current_revision, "b".repeat(32));
    expect(published?.current_revision).toBe("b".repeat(32));
    expect(Date.parse(published?.draft_updated_at ?? "")).toBeGreaterThan(Date.parse(futureToken));
    expect(await Game.publish(USER, game.id, game.current_revision, "c".repeat(32))).toBeNull();
  });

  it("rejects an explicit empty draft token when publishing", async () => {
    const game = await insert(`${PREFIX}${"1".repeat(20)}`);
    expect(await Game.publish(USER, game.id, game.current_revision, "b".repeat(32), "")).toBeNull();
    expect((await Game.findOwned(USER, game.id))?.current_revision).toBe(game.current_revision);
  });

  it("saves and records whole-document replacements with an undo source", async () => {
    const game = await insert(`${PREFIX}${"1".repeat(20)}`);
    const original = { ...createTopDownRoomGame(game.id), revision: game.current_revision };
    const files = new Map([[`${game.source_root}/revisions/${game.current_revision}/game.json`, JSON.stringify(original)]]);
    const workspace = {
      readText: async (path: string) => files.get(path) ?? null,
      write: async (path: string, data: string) => { files.set(path, data); },
      delete: async (path: string) => files.delete(path)
    };
    const replacement = { ...original, pixelsPerUnit: 48 };
    const updated = await Game.updateDraft(USER, PREFIX, game.draft_updated_at,
      [{ op: "set_document", document: replacement }], workspace, { actor: "agent" });
    expect(updated?.document.schemaVersion === 3 ? undefined : updated?.document.pixelsPerUnit).toBe(48);
    const reopened = await Game.readDraft(USER, PREFIX, workspace);
    expect(reopened?.document.schemaVersion === 3 ? undefined : reopened?.document.pixelsPerUnit).toBe(48);
    const changes = await Game.listDraftChanges(USER, PREFIX);
    expect(changes).toHaveLength(1);
    expect(changes[0].summary).toBe("Replaced game document (1)");
    expect(changes[0].affectedEntityIds).toEqual(original.scenes[0].entities.map((entity) => entity.id));
    expect(await Game.readDraftBeforeChange(USER, PREFIX, changes[0].id, workspace)).toEqual(original);
  });

  it("applies a rebuild once against the exact preview draft", async () => {
    const game = await insert(`${PREFIX}${"1".repeat(20)}`);
    const original = { ...createTopDownRoomGame(game.id), revision: game.current_revision };
    const publishedPath = `${game.source_root}/revisions/${game.current_revision}/game.json`;
    const files = new Map([[publishedPath, JSON.stringify(original)]]);
    const workspace = {
      readText: async (path: string) => files.get(path) ?? null,
      write: async (path: string, data: string) => { files.set(path, data); },
      delete: async (path: string) => files.delete(path)
    };
    const draft = await Game.readDraft(USER, game.id, workspace);
    if (!draft) { throw new Error("Missing draft"); }
    const digest = createHash("sha256").update(JSON.stringify(draft.document)).digest("hex");
    const replacement = { ...original, pixelsPerUnit: 48 };
    expect(await Game.applyAuthoringCandidate(USER, game.id, game.draft_updated_at,
      "0".repeat(64), replacement, workspace)).toBeNull();
    expect(files.size).toBe(1);
    const saved = await Game.applyAuthoringCandidate(USER, game.id, game.draft_updated_at,
      digest, replacement, workspace);
    expect(saved?.document.schemaVersion === 3 ? undefined : saved?.document.pixelsPerUnit).toBe(48);
    expect(await Game.applyAuthoringCandidate(USER, game.id, game.draft_updated_at,
      digest, replacement, workspace)).toBeNull();
    expect(files.get(publishedPath)).toBe(JSON.stringify(original));
    const changes = await Game.listDraftChanges(USER, game.id);
    expect(changes).toHaveLength(1);
    expect(changes[0].actor).toBe("agent");
    expect(changes[0].summary).toBe("Rebuilt retained game");
    expect(await Game.readDraftBeforeChange(USER, game.id, changes[0].id, workspace)).toEqual(draft.document);
  });
  it("round-trips 3D drafts, operations, full IDs and undo without changing revisions", async () => {
    const game = await insert(`${PREFIX}${"1".repeat(20)}`);
    const original = gameDocument3D.parse({ schemaVersion: 3, engineVersion: "2", dimension: "3d", id: game.id,
      revision: game.current_revision, entrySceneId: "scene", tickRate: 60, presentation: { aspectRatio: 16 / 9, hudWidth: 1280, hudHeight: 720 },
      inputActions: [], assets: {}, scenes: [{ id: "scene", name: "Scene", activeCameraId: "camera", entities: [{
        id: "camera", transform3d: {}, camera3d: { projection: { kind: "perspective" } }
      }] }] });
    const files = new Map([[`${game.source_root}/revisions/${game.current_revision}/game.json`, JSON.stringify(original)]]);
    const workspace = {
      readText: async (path: string) => files.get(path) ?? null,
      write: async (path: string, data: string) => { files.set(path, data); },
      delete: async (path: string) => files.delete(path)
    };
    expect((await Game.readDraft(USER, PREFIX, workspace))?.document).toEqual(original);
    const updated = await Game.updateDraft(USER, PREFIX, game.draft_updated_at, [{ op: "update_entity", entity_id: "camera",
      set: { transform3d: { position: { z: 5 } } } }], workspace, { actor: "agent" });
    if (!updated || updated.document.schemaVersion !== 3) { throw new Error("3D update was not saved"); }
    expect(updated.document.id).toBe(game.id);
    expect(updated.document.revision).toBe(original.revision);
    expect(updated.document.scenes[0].entities[0].transform3d.position.z).toBe(5);
    const changes = await Game.listDraftChanges(USER, PREFIX);
    expect(changes[0].affectedEntityIds).toEqual(["camera"]);
    expect(await Game.readDraftBeforeChange(USER, PREFIX, changes[0].id, workspace)).toEqual(original);
    expect(await Game.updateDraft(USER, PREFIX, game.draft_updated_at, [{ op: "update_scene", scene_id: "scene", set: { name: "Stale" } }], workspace)).toBeNull();
    expect(await Game.readDraft("another-user", PREFIX, workspace)).toBeNull();
    const legacy = { ...createTopDownRoomGame(game.id), revision: original.revision };
    await expect(Game.replaceDraft(USER, PREFIX, updated.game.draft_updated_at, legacy, workspace)).rejects.toMatchObject({
      diagnostics: [{ code: "dimension_mismatch" }]
    });
  });

  it("F7 recovers a missing version file from the published revision and accepts the next edit", async () => {
    const game = await insert(`${PREFIX}${"1".repeat(20)}`);
    const original = { ...createTopDownRoomGame(game.id), revision: game.current_revision };
    const files = new Map([[`${game.source_root}/revisions/${game.current_revision}/game.json`, JSON.stringify(original)]]);
    const workspace = {
      readText: async (path: string) => files.get(path) ?? null,
      write: async (path: string, data: string) => { files.set(path, data); },
      delete: async (path: string) => files.delete(path)
    };
    const saved = await Game.updateDraft(USER, game.id, game.draft_updated_at,
      [{ op: "update_scene", scene_id: original.entrySceneId, set: { name: "Lost edit" } }], workspace);
    if (!saved) { throw new Error("Missing saved draft"); }
    files.delete(`${game.source_root}/drafts/${saved.game.draft_version_id}.json`);
    files.delete(`${game.source_root}/draft.json`);
    const recovered = await Game.readDraft(USER, game.id, workspace);
    expect(recovered?.document).toEqual(original);
    expect(recovered?.game.draft_updated_at).not.toBe(saved.game.draft_updated_at);
    expect(await Game.updateDraft(USER, game.id, saved.game.draft_updated_at,
      [{ op: "update_scene", scene_id: original.entrySceneId, set: { name: "Stale" } }], workspace)).toBeNull();
    const next = await Game.updateDraft(USER, game.id, recovered?.game.draft_updated_at ?? "",
      [{ op: "update_scene", scene_id: original.entrySceneId, set: { name: "Recovered edit" } }], workspace);
    expect(next?.document.scenes[0].name).toBe("Recovered edit");
  });

  it("F27 defers failed compare-and-set draft cleanup without deleting the winning draft", async () => {
    const game = await insert(`${PREFIX}${"1".repeat(20)}`);
    const original = { ...createTopDownRoomGame(game.id), revision: game.current_revision };
    const files = new Map([[`${game.source_root}/revisions/${game.current_revision}/game.json`, JSON.stringify(original)]]);
    let injectWinner = true;
    const workspace = {
      readText: async (path: string) => files.get(path) ?? null,
      write: async (path: string, data: string) => {
        files.set(path, data);
        if (injectWinner && data.includes('"name":"Losing edit"')) {
          injectWinner = false;
          await Game.updateDraft(USER, game.id, game.draft_updated_at,
            [{ op: "update_scene", scene_id: original.entrySceneId, set: { name: "Winning edit" } }], workspace);
        }
      },
      delete: async (path: string) => files.delete(path)
    };
    expect(await Game.updateDraft(USER, game.id, game.draft_updated_at,
      [{ op: "update_scene", scene_id: original.entrySceneId, set: { name: "Losing edit" } }], workspace)).toBeNull();
    expect((await Game.readDraft(USER, game.id, workspace))?.document.scenes[0].name).toBe("Winning edit");
    expect([...files.values()].some((source) => source.includes('"name":"Losing edit"'))).toBe(true);
  });

  it("F27 gives concurrent same-content attempts distinct immutable version paths", async () => {
    const game = await insert(`${PREFIX}${"1".repeat(20)}`);
    const original = { ...createTopDownRoomGame(game.id), revision: game.current_revision };
    const files = new Map([[`${game.source_root}/revisions/${game.current_revision}/game.json`, JSON.stringify(original)]]);
    let injectWinner = true;
    const attempts: string[] = [];
    const captured: { winner: Awaited<ReturnType<typeof Game.updateDraft>> } = { winner: null };
    const workspace = {
      readText: async (path: string) => files.get(path) ?? null,
      write: async (path: string, data: string) => {
        files.set(path, data);
        if (path.includes("/drafts/") && data.includes('"name":"Adopted edit"')) {
          attempts.push(path);
          if (injectWinner) {
            injectWinner = false;
            captured.winner = await Game.updateDraft(USER, game.id, game.draft_updated_at,
              [{ op: "update_scene", scene_id: original.entrySceneId, set: { name: "Adopted edit" } }], workspace);
          }
        }
      },
      delete: async (path: string) => files.delete(path)
    };
    expect(await Game.updateDraft(USER, game.id, game.draft_updated_at,
      [{ op: "update_scene", scene_id: original.entrySceneId, set: { name: "Adopted edit" } }], workspace)).toBeNull();
    expect(captured.winner).not.toBeNull();
    expect(attempts).toHaveLength(2);
    expect(new Set(attempts).size).toBe(2);
    const reopened = await Game.readDraft(USER, game.id, workspace);
    expect(reopened?.document.scenes[0].name).toBe("Adopted edit");
    expect(reopened?.game.draft_version_id).toBe(captured.winner?.game.draft_version_id);
    expect(files.has(`${game.source_root}/drafts/${captured.winner?.game.draft_version_id}.json`)).toBe(true);
  });

  it("F27 preserves an adopted draft during orphan cleanup", async () => {
    const game = await insert(`${PREFIX}${"1".repeat(20)}`);
    const original = { ...createTopDownRoomGame(game.id), revision: game.current_revision };
    const adoptedDocument = { ...original, pixelsPerUnit: 99 };
    const adoptedSource = JSON.stringify(adoptedDocument);
    const orphan = `${game.source_root}/drafts/${createHash("sha256").update(adoptedSource).digest("hex")}.json`;
    const files = new Map([
      [`${game.source_root}/revisions/${game.current_revision}/game.json`, JSON.stringify(original)],
      [orphan, adoptedSource]
    ]);
    let releaseMirror: () => void = () => undefined;
    const mirrorRelease = new Promise<void>((resolve) => { releaseMirror = resolve; });
    let markMirrorStarted: () => void = () => undefined;
    const mirrorStarted = new Promise<void>((resolve) => { markMirrorStarted = resolve; });
    let adoption: ReturnType<typeof Game.updateDraft> | undefined;
    let inspectedOrphan = false;
    const workspace = {
      readText: async (path: string) => files.get(path) ?? null,
      write: async (path: string, data: string) => {
        if (path === `${game.source_root}/draft.json` && data.includes('"pixelsPerUnit":99')) {
          markMirrorStarted();
          await mirrorRelease;
        }
        files.set(path, data);
      },
      delete: async (path: string) => {
        if (path === orphan && !adoption) { await startAdoption(); }
        return files.delete(path);
      },
      list: async (prefix: string) => {
        const entries = [...files.keys()].filter((path) => path.startsWith(prefix))
          .map((path) => ({ path, modifiedAt: path === orphan ? 0 : Date.now() }));
        inspectedOrphan ||= entries.some((entry) => entry.path === orphan);
        return entries;
      }
    };
    const startAdoption = async (): Promise<void> => {
      const current = await Game.findOwned(USER, game.id);
      if (!current) { throw new Error("Missing current draft"); }
      adoption = Game.updateDraft(USER, game.id, current.draft_updated_at,
        [{ op: "set_document", document: adoptedDocument }], workspace);
      await mirrorStarted;
    };
    let committed: Game | null = null;
    let reopened: Awaited<ReturnType<typeof Game.readDraft>> = null;
    let afterRead: Game | null = null;
    let saved: Awaited<ReturnType<typeof Game.updateDraft>> = null;
    try {
      const trigger = await Game.updateDraft(USER, game.id, game.draft_updated_at,
        [{ op: "set_document", document: { ...original, pixelsPerUnit: 48 } }], workspace);
      expect(trigger).not.toBeNull();
      if (!adoption) { await startAdoption(); }
      committed = await Game.findOwned(USER, game.id);
      reopened = await Game.readDraft(USER, game.id, workspace);
      afterRead = await Game.findOwned(USER, game.id);
    } finally {
      releaseMirror();
      saved = adoption ? await adoption : null;
    }
    expect(inspectedOrphan).toBe(true);
    expect(saved?.document).toEqual(adoptedDocument);
    expect(committed).not.toBeNull();
    expect.soft(reopened?.document).toEqual(adoptedDocument);
    expect.soft(reopened?.game.draft_updated_at).toBe(committed?.draft_updated_at);
    expect.soft(afterRead?.draft_updated_at).toBe(committed?.draft_updated_at);
  });

  it("F27 preserves a pending draft whose base token is still current despite an old modification time", async () => {
    const game = await insert(`${PREFIX}${"1".repeat(20)}`);
    const original = { ...createTopDownRoomGame(game.id), revision: game.current_revision };
    const pendingDocument = { ...original, pixelsPerUnit: 99 };
    const files = new Map([[`${game.source_root}/revisions/${game.current_revision}/game.json`, JSON.stringify(original)]]);
    let markListed: () => void = () => undefined;
    const listed = new Promise<void>((resolve) => { markListed = resolve; });
    let markWritten: () => void = () => undefined;
    const written = new Promise<void>((resolve) => { markWritten = resolve; });
    let releaseWrite: () => void = () => undefined;
    const writeRelease = new Promise<void>((resolve) => { releaseWrite = resolve; });
    let markMirrorStarted: () => void = () => undefined;
    const mirrorStarted = new Promise<void>((resolve) => { markMirrorStarted = resolve; });
    let releaseMirror: () => void = () => undefined;
    const mirrorRelease = new Promise<void>((resolve) => { releaseMirror = resolve; });
    let pendingPath: string | undefined;
    let listCalls = 0;
    let inspectedPending = false;
    const workspace = {
      readText: async (path: string) => files.get(path) ?? null,
      write: async (path: string, data: string) => {
        if (data.includes('"pixelsPerUnit":99')) {
          if (path.startsWith(`${game.source_root}/drafts/`) && !pendingPath) {
            files.set(path, data);
            pendingPath = path;
            markWritten();
            await writeRelease;
            return;
          } else if (path === `${game.source_root}/draft.json`) {
            markMirrorStarted();
            await mirrorRelease;
          }
        }
        files.set(path, data);
      },
      delete: async (path: string) => files.delete(path),
      list: async (prefix: string) => {
        if (listCalls++ === 0) {
          markListed();
          await written;
        }
        const entries = [...files.keys()].filter((path) => path.startsWith(prefix))
          .map((path) => ({ path, modifiedAt: path === pendingPath ? 0 : Date.now() }));
        inspectedPending ||= entries.some((entry) => entry.path === pendingPath && entry.modifiedAt === 0);
        return entries;
      }
    };
    const trigger = Game.updateDraft(USER, game.id, game.draft_updated_at,
      [{ op: "set_document", document: { ...original, pixelsPerUnit: 48 } }], workspace);
    let pending: ReturnType<typeof Game.updateDraft> | undefined;
    let committed: Game | null = null;
    let reopened: Awaited<ReturnType<typeof Game.readDraft>> = null;
    let afterRead: Game | null = null;
    let saved: Awaited<ReturnType<typeof Game.updateDraft>> = null;
    try {
      await listed;
      const current = await Game.findOwned(USER, game.id);
      if (!current) { throw new Error("Missing current draft"); }
      pending = Game.updateDraft(USER, game.id, current.draft_updated_at,
        [{ op: "set_document", document: pendingDocument }], workspace);
      await written;
      expect(await trigger).not.toBeNull();
      releaseWrite();
      await mirrorStarted;
      committed = await Game.findOwned(USER, game.id);
      reopened = await Game.readDraft(USER, game.id, workspace);
      afterRead = await Game.findOwned(USER, game.id);
    } finally {
      releaseWrite();
      releaseMirror();
      saved = pending ? await pending : null;
      await trigger;
    }
    expect(inspectedPending).toBe(true);
    expect(saved?.document).toEqual(pendingDocument);
    expect(committed).not.toBeNull();
    expect.soft(reopened?.document).toEqual(pendingDocument);
    expect.soft(reopened?.game.draft_updated_at).toBe(committed?.draft_updated_at);
    expect.soft(afterRead?.draft_updated_at).toBe(committed?.draft_updated_at);
  });

  it("F27 prunes old orphan drafts while preserving recent writes and retained undo sources", async () => {
    const game = await insert(`${PREFIX}${"1".repeat(20)}`);
    const original = { ...createTopDownRoomGame(game.id), revision: game.current_revision };
    const staleBase = Buffer.from("2000-01-01T00:00:00.000Z").toString("base64url");
    const oldOrphan = `${game.source_root}/drafts/${"f".repeat(64)}.${staleBase}.${"a".repeat(32)}.json`;
    const recentWrite = `${game.source_root}/drafts/${"e".repeat(64)}.${staleBase}.${"b".repeat(32)}.json`;
    const legacyOrphan = `${game.source_root}/drafts/${"d".repeat(64)}.json`;
    const files = new Map([[`${game.source_root}/revisions/${game.current_revision}/game.json`, JSON.stringify(original)],
      [oldOrphan, "old orphan"], [recentWrite, "in-flight write"], [legacyOrphan, "legacy orphan"]]);
    let inspectedOldOrphan = false;
    const workspace = {
      readText: async (path: string) => files.get(path) ?? null,
      write: async (path: string, data: string) => { files.set(path, data); },
      delete: async (path: string) => files.delete(path),
      list: async (prefix: string) => {
        const entries = [...files.keys()].filter((path) => path.startsWith(prefix))
          .map((path) => ({ path, modifiedAt: path === recentWrite ? Date.now() : 0 }));
        inspectedOldOrphan ||= entries.some((entry) => entry.path === oldOrphan);
        return entries;
      }
    };
    const saved = await Game.updateDraft(USER, game.id, game.draft_updated_at,
      [{ op: "update_scene", scene_id: original.entrySceneId, set: { name: "Retained edit" } }], workspace);
    expect(saved?.document.scenes[0].name).toBe("Retained edit");
    expect(inspectedOldOrphan).toBe(true);
    expect(files.has(oldOrphan)).toBe(false);
    expect(files.has(recentWrite)).toBe(true);
    expect(files.has(legacyOrphan)).toBe(true);
    expect(await Game.readDraft(USER, game.id, workspace)).toEqual(saved);
    const changes = await Game.listDraftChanges(USER, game.id);
    expect(await Game.readDraftBeforeChange(USER, game.id, changes[0].id, workspace)).toEqual(original);
  });

  it("reads legacy draft and undo sources with defaults while preserving SHA digest semantics and fresh recovery keys", async () => {
    const game = await insert(`${PREFIX}${"1".repeat(20)}`);
    const original = { ...createTopDownRoomGame(game.id), revision: game.current_revision };
    const scene = original.scenes[0];
    const entity = scene.entities.find((candidate) => candidate.behaviors.length === 0 && !candidate.templateOnly);
    if (!entity) { throw new Error("Missing default-only entity"); }
    const legacyEntity: Partial<typeof entity> = { ...entity };
    delete legacyEntity.templateOnly;
    delete legacyEntity.behaviors;
    const legacySource = JSON.stringify({ ...original, scenes: original.scenes.map((current) => current.id === scene.id
      ? { ...current, entities: current.entities.map((currentEntity) => currentEntity.id === entity.id ? legacyEntity : currentEntity) }
      : current) });
    const legacyDigest = createHash("sha256").update(legacySource).digest("hex");
    const legacyPath = `${game.source_root}/drafts/${legacyDigest}.json`;
    const files = new Map([
      [`${game.source_root}/revisions/${game.current_revision}/game.json`, JSON.stringify(original)],
      [legacyPath, legacySource]
    ]);
    await game.update({ draft_version_id: legacyDigest });
    const workspace = {
      readText: async (path: string) => files.get(path) ?? null,
      write: async (path: string, data: string) => { files.set(path, data); },
      delete: async (path: string) => files.delete(path),
      list: async (prefix: string) => [...files.keys()].filter((path) => path.startsWith(prefix))
        .map((path) => ({ path, modifiedAt: 0 }))
    };
    const captured = await Game.readDraft(USER, game.id, workspace);
    if (!captured) { throw new Error("Missing legacy draft"); }
    expect(captured.document).toEqual(original);
    const normalizedDigest = createHash("sha256").update(JSON.stringify(captured.document)).digest("hex");
    expect(normalizedDigest).not.toBe(legacyDigest);
    const replacement = { ...original, pixelsPerUnit: 99 };
    expect(await Game.applyAuthoringCandidate(USER, game.id, captured.game.draft_updated_at,
      legacyDigest, replacement, workspace)).toBeNull();
    const saved = await Game.applyAuthoringCandidate(USER, game.id, captured.game.draft_updated_at,
      normalizedDigest, replacement, workspace);
    if (!saved) { throw new Error("Missing saved draft"); }
    expect(saved.document).toEqual(replacement);
    expect(files.get(legacyPath)).toBe(legacySource);
    const changes = await Game.listDraftChanges(USER, game.id);
    expect(changes).toHaveLength(1);
    expect(changes[0].beforeDigest).toBe(legacyDigest);
    expect(await Game.readDraftBeforeChange(USER, game.id, changes[0].id, workspace)).toEqual(original);
    const missingPath = `${game.source_root}/drafts/${saved.game.draft_version_id}.json`;
    files.delete(missingPath);
    const recovered = await Game.readDraft(USER, game.id, workspace);
    expect(recovered?.document).toEqual(replacement);
    expect(recovered?.game.draft_version_id).not.toBe(saved.game.draft_version_id);
    expect(recovered?.game.draft_updated_at).not.toBe(saved.game.draft_updated_at);
    expect(files.has(missingPath)).toBe(false);
    expect((await Game.readDraft(USER, game.id, workspace))?.game.draft_updated_at).toBe(recovered?.game.draft_updated_at);
  });

});
