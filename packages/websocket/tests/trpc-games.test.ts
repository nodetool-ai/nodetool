import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ModelObserver, Project, Workspace, initTestDb } from "@nodetool-ai/models";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";
import { workspaceFromRow } from "../src/lib/workflow-workspace.js";
import { getManagedWorkspaceDir } from "@nodetool-ai/config";

const USER_ID = "game-owner";
const PROJECT_ID = "game-project";
const assetRoot = vi.hoisted(() => ({ current: "" }));
vi.mock("../src/lib/storage.js", async () => {
  const { FileStorageAdapter } = await import("@nodetool-ai/storage");
  return { getAssetAdapter: () => new FileStorageAdapter(assetRoot.current) };
});
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
      baseRevision: created.game.revision,
      document: edited
    });
    expect(published.game.revision).not.toBe(created.game.revision);
    expect((await caller.games.get({ id: created.game.id })).document.scenes[0]?.name).toBe("Edited room");
    expect((await caller.games.revisions({ id: created.game.id })).map((entry) => entry.revision).sort()).toEqual(
      [created.game.revision, published.game.revision].sort()
    );

    await expect(caller.games.publish({
      id: created.game.id,
      baseRevision: created.game.revision,
      document: edited
    })).rejects.toMatchObject({ code: "CONFLICT" });

    const restored = await caller.games.restore({
      id: created.game.id,
      baseRevision: published.game.revision,
      revision: created.game.revision
    });
    expect(restored.game.revision).not.toBe(created.game.revision);
    expect(restored.document.scenes[0]?.name).toBe(created.document.scenes[0]?.name);
    expect((await caller.games.get({ id: created.game.id, revision: published.game.revision })).document.scenes[0]?.name).toBe("Edited room");
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
      baseRevision: created.game.revision,
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
      baseRevision: published.game.revision,
      slot: "player",
      binding
    });
    expect(installed.document.scenes[0]?.name).toBe("My room");
    expect(installed.document.assets.player?.digest).toBe(digest);
    expect(installed.document.assets.gem).toEqual(published.document.assets.gem);

    await expect(caller.games.installCandidate({
      id: created.game.id,
      baseRevision: published.game.revision,
      slot: "player",
      binding
    })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(caller.games.installCandidate({
      id: created.game.id,
      baseRevision: installed.game.revision,
      slot: "player",
      binding: { ...binding, digest: "0".repeat(64) }
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
