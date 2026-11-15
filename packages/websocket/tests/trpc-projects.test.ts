/**
 * projects router — ownership, the document gather, and the derived rollup.
 *
 * Real DB, real models: a project is a name over rows that already carry its
 * id, so what `get` returns is only as good as the read-back it derives.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtemp,
  mkdir,
  writeFile,
  access,
  readFile,
  rm
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  initTestDb,
  Asset,
  Game,
  LOOSE_PROJECT_ID,
  ModelObserver,
  Prediction,
  Project,
  Script,
  Storyboard,
  Thread,
  TimelineSequence,
  Workflow,
  Workspace
} from "@nodetool-ai/models";
import {
  migrateProjectFolders,
  nodetoolDirFromRow,
  setWorkspaceCloudStorage,
  workspaceFromRow
} from "@nodetool-ai/execution/service";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

const createCallerFor = createCallerFactory(appRouter);

function makeCtx(userId: string): Context {
  return {
    userId,
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false
  } as Context;
}

const caller = (userId = "user-1") => createCallerFor(makeCtx(userId));

describe("projects router", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  it("names one agent thread per project, and refuses another user's", async () => {
    const project = await caller().projects.create({ name: "Aurora" });

    const { threadId } = await caller().projects.thread({ id: project.id });
    expect(threadId).toBeTruthy();
    expect((await caller().projects.thread({ id: project.id })).threadId).toBe(
      threadId
    );
    // The project carries it, so the overview can open the thread without
    // asking for it again.
    expect(
      (await caller().projects.get({ id: project.id })).project.threadId
    ).toBe(threadId);

    await expect(
      caller("user-2").projects.thread({ id: project.id })
    ).rejects.toThrow();
  });

  it("creates, lists, updates and deletes", async () => {
    const created = await caller().projects.create({
      name: "Aurora Launch Spot",
      kind: "spot"
    });
    expect(created.name).toBe("Aurora Launch Spot");

    expect((await caller().projects.list({})).map((p) => p.id)).toEqual(
      expect.arrayContaining([created.id, "personal:user-1"])
    );

    const renamed = await caller().projects.update({
      id: created.id,
      name: "Aurora"
    });
    expect(renamed.name).toBe("Aurora");
    expect(renamed.kind).toBe("spot");

    await caller().projects.delete({ id: created.id });
    expect((await caller().projects.list({})).map((p) => p.id)).toEqual([
      "personal:user-1"
    ]);
  });

  it("validates saved tabs with their project-owned resource lookup", async () => {
    const project = await caller().projects.create({ name: "Aurora" });
    const other = await caller().projects.create({ name: "Other" });
    const workflow = await Workflow.create<Workflow>({
      user_id: "user-1",
      project_id: project.id,
      name: "Flow"
    });
    const chat = await Thread.create<Thread>({
      user_id: "user-1",
      project_id: project.id,
      title: "Chat"
    });
    const foreign = await Workflow.create<Workflow>({
      user_id: "user-1",
      project_id: other.id,
      name: "Other flow"
    });
    const directory = await mkdtemp(join(tmpdir(), "nodetool-tab-restore-"));
    await writeFile(join(directory, "kept.txt"), "kept");
    const workspace = await Workspace.create<Workspace>({
      user_id: "user-1",
      project_id: project.id,
      name: "Files",
      path: directory
    });

    try {
      await expect(
        caller().projects.restoreTabs({
          id: project.id,
          tabs: [
            { type: "workflow", ref: workflow.id, title: "Flow" },
            { type: "chat", ref: chat.id, title: "Chat" },
            {
              type: "workspace-file",
              ref: `${workspace.id}::kept.txt`,
              title: "Kept"
            },
            {
              type: "workspace-file",
              ref: `${workspace.id}::missing.txt`,
              title: "Missing file"
            },
            { type: "workflow", ref: foreign.id, title: "Other flow" },
            { type: "workflow", ref: "missing", title: "Missing" }
          ]
        })
      ).resolves.toEqual([
        { type: "workflow", ref: workflow.id, title: "Flow" },
        { type: "chat", ref: chat.id, title: "Chat" },
        {
          type: "workspace-file",
          ref: `${workspace.id}::kept.txt`,
          title: "Kept"
        }
      ]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("restores only document tabs whose asset belongs to the project and caller", async () => {
    const project = await caller().projects.create({ name: "Documents" });
    const owned = await Asset.create<Asset>({
      user_id: "user-1",
      project_id: project.id,
      name: "owned.pdf",
      content_type: "application/pdf"
    });
    const foreign = await Asset.create<Asset>({
      user_id: "user-2",
      project_id: project.id,
      name: "foreign.pdf",
      content_type: "application/pdf"
    });
    const elsewhere = await Asset.create<Asset>({
      user_id: "user-1",
      project_id: "elsewhere",
      name: "other.pdf",
      content_type: "application/pdf"
    });
    const kept = {
      type: "document" as const,
      ref: `asset://${owned.id}`,
      title: "Owned PDF"
    };
    await expect(
      caller().projects.restoreTabs({
        id: project.id,
        tabs: [
          kept,
          {
            type: "document",
            ref: `asset://${foreign.id}`,
            title: "Foreign PDF"
          },
          {
            type: "document",
            ref: `asset://${elsewhere.id}`,
            title: "Other project PDF"
          },
          { type: "document", ref: "asset://missing", title: "Missing PDF" }
        ]
      })
    ).resolves.toEqual([kept]);
  });

  it("removes files from project workspaces", async () => {
    const project = await caller().projects.create({ name: "Aurora" });
    const directory = await mkdtemp(join(tmpdir(), "nodetool-project-delete-"));
    const file = join(directory, "draft.txt");
    await writeFile(file, "draft");
    await Workspace.create<Workspace>({
      user_id: "user-1",
      project_id: project.id,
      name: "Project files",
      path: directory
    });

    try {
      await caller().projects.delete({ id: project.id });
      await expect(access(file)).rejects.toThrow();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("archives projects outside the normal list and restores them", async () => {
    const project = await caller().projects.create({ name: "Aurora" });
    const archived = await caller().projects.archive({ id: project.id });
    expect(archived.archivedAt).toEqual(expect.any(String));
    expect(
      (await caller().projects.list({})).map((item) => item.id)
    ).not.toContain(project.id);
    expect(
      (await caller().projects.archived({})).map((item) => item.id)
    ).toContain(project.id);

    const restored = await caller().projects.restore({ id: project.id });
    expect(restored.archivedAt).toBeNull();
    expect((await caller().projects.list({})).map((item) => item.id)).toContain(
      project.id
    );
  });

  it("makes deletion idempotent and refuses Personal", async () => {
    const project = await caller().projects.create({ name: "Aurora" });
    await expect(caller().projects.delete({ id: project.id })).resolves.toEqual(
      { ok: true }
    );
    await expect(caller().projects.delete({ id: project.id })).resolves.toEqual(
      { ok: true }
    );
    await expect(
      caller().projects.delete({ id: "personal:user-1" })
    ).rejects.toThrow(/Personal cannot be deleted/i);
  });

  it("hides another user's project behind not-found", async () => {
    const theirs = await caller("user-2").projects.create({
      name: "Theirs",
      kind: ""
    });
    await expect(caller().projects.get({ id: theirs.id })).rejects.toThrow(
      /not found/i
    );
    await expect(
      caller().projects.update({ id: theirs.id, name: "Mine" })
    ).rejects.toThrow(/not found/i);
    await expect(caller().projects.delete({ id: theirs.id })).rejects.toThrow(
      /not found/i
    );
  });

  it("refuses a reserved, blank or already-taken id", async () => {
    await expect(
      caller().projects.create({ id: LOOSE_PROJECT_ID, name: "Loose" })
    ).rejects.toThrow();
    await expect(
      caller().projects.create({ id: "", name: "Blank" })
    ).rejects.toThrow();
    await expect(
      caller().projects.create({ id: "   ", name: "Whitespace" })
    ).rejects.toThrow();
    // Nothing was written under the reserved id.
    expect((await caller().projects.list({})).map((p) => p.id)).toEqual([
      "personal:user-1"
    ]);

    const theirs = await caller("user-2").projects.create({
      id: "shared-id",
      name: "Theirs"
    });
    // Another user's id answers as a missing one does: create must not tell a
    // caller which ids exist outside what they own.
    await expect(
      caller().projects.create({ id: "shared-id", name: "Mine now" })
    ).rejects.toThrow(/not found/i);
    // The conflict left their row alone — no upsert rewrote its owner.
    expect(
      (await caller("user-2").projects.get({ id: theirs.id })).project.name
    ).toBe("Theirs");
    expect((await caller().projects.list({})).map((p) => p.id)).toEqual([
      "personal:user-1"
    ]);
  });

  it("answers a repeated create of the caller's own id with the same project", async () => {
    const first = await caller().projects.create({
      id: "mine",
      name: "Aurora"
    });
    const again = await caller().projects.create({
      id: "mine",
      name: "Ignored"
    });
    // The repeat's name is discarded: a create is not a rename.
    expect(again).toEqual(first);
    expect(again.name).toBe("Aurora");
  });

  it("trims a padded id rather than storing one nothing can address", async () => {
    const created = await caller().projects.create({
      id: "  padded  ",
      name: "Aurora"
    });
    expect(created.id).toBe("padded");
    expect((await caller().projects.get({ id: "padded" })).project.name).toBe(
      "Aurora"
    );
    // And the trimmed form is the same project, not a second one.
    expect(
      (await caller().projects.create({ id: "padded", name: "Again" })).id
    ).toBe("padded");
    expect(await caller().projects.list({})).toHaveLength(2);
  });

  it("deletes a project's documents rather than returning them to Personal", async () => {
    const project = await caller().projects.create({ name: "Aurora" });
    const board = await Storyboard.create<Storyboard>({
      user_id: "user-1",
      project_id: project.id,
      name: "Board"
    });
    const script = await Script.create<Script>({
      user_id: "user-1",
      project_id: project.id,
      name: "VO"
    });

    await caller().projects.delete({ id: project.id });

    expect(await Storyboard.findById(board.id)).toBeNull();
    expect(await Script.findById(script.id)).toBeNull();
  });

  it("returns each document with its status and the project's spend", async () => {
    const project = await caller().projects.create({
      name: "Aurora",
      kind: "spot"
    });
    const board = await Storyboard.create<Storyboard>({
      user_id: "user-1",
      project_id: project.id,
      name: "Board",
      document: JSON.stringify({
        screenplay: null,
        shots: [
          {
            type: "shot",
            id: "a",
            index: 0,
            action: "wide",
            status: "draft",
            keyframe: { type: "image", uri: "asset://1" }
          },
          { type: "shot", id: "b", index: 1, action: "close", status: "draft" }
        ],
        brief: "",
        style: "",
        entityIds: [],
        aspectRatio: "16:9",
        directorModel: null,
        imageModel: null,
        videoModel: null
      })
    });
    await Prediction.create<Prediction>({
      user_id: "user-1",
      project_id: project.id,
      document_id: board.id,
      cost: 0.5,
      metadata: { capability: "text_to_image" }
    });

    const detail = await caller().projects.get({ id: project.id });
    expect(detail.project.name).toBe("Aurora");
    expect(detail.documents).toEqual([
      {
        type: "storyboard",
        ref: board.id,
        name: "Board",
        updatedAt: board.updated_at,
        status: { kind: "storyboard", shots: 2, stills: 1, clips: 0 },
        spendUsd: 0.5,
        unpricedCount: 0,
        thumbnails: [{ uri: "asset://1", asset_id: null }],
        preview: null
      }
    ]);
    expect(detail.spend.totalUsd).toBeCloseTo(0.5, 6);
    expect(detail.spend.byCategory).toContainEqual({
      category: "stills",
      usd: 0.5,
      unpricedCount: 0
    });

    // The start page's paged read returns the same card, without the rollup.
    const page = await caller().projects.documentPage({
      id: project.id,
      offset: 0,
      limit: 4
    });
    expect(page).toEqual({
      documents: detail.documents,
      total: 1,
      partial: false
    });
    await expect(
      caller("user-2").projects.documentPage({ id: project.id })
    ).rejects.toThrow("Project not found");

    const refs = await caller().projects.documents({ id: project.id });
    expect(refs).toEqual([
      {
        type: "storyboard",
        ref: board.id,
        name: "Board",
        updatedAt: board.updated_at
      }
    ]);
  });

  it("returns one rollup per project in summaries", async () => {
    const aurora = await caller().projects.create({ name: "Aurora", kind: "" });
    await caller().projects.create({ name: "Meridian", kind: "" });
    await Storyboard.create<Storyboard>({
      user_id: "user-1",
      project_id: aurora.id,
      name: "Board"
    });
    // Another user's project must not appear in this user's list.
    await caller("user-2").projects.create({ name: "Theirs", kind: "" });

    const summaries = await caller().projects.summaries({});
    expect(summaries.map((s) => s.project.name).sort()).toEqual([
      "Aurora",
      "Meridian",
      "Personal"
    ]);
    const auroraSummary = summaries.find((s) => s.project.id === aurora.id);
    expect(auroraSummary?.documents.map((d) => d.name)).toEqual(["Board"]);
  });

  it("summaries survive a timeline with midi tracks and missing names", async () => {
    const aurora = await caller().projects.create({ name: "Aurora", kind: "" });
    await TimelineSequence.create<TimelineSequence>({
      user_id: "user-1",
      project_id: aurora.id,
      name: "Cut",
      document: JSON.stringify({
        tracks: [
          { id: "t1", type: "midi", index: 0, visible: true, locked: false },
          {
            id: "t2",
            name: "Video",
            type: "video",
            index: 1,
            visible: true,
            locked: false
          }
        ],
        clips: [],
        markers: []
      })
    });

    const summaries = await caller().projects.summaries({});
    const auroraSummary = summaries.find((s) => s.project.id === aurora.id);
    expect(auroraSummary?.documents.map((d) => d.name)).toEqual(["Cut"]);
    expect(auroraSummary?.documents[0]?.preview).toEqual({
      kind: "timeline",
      durationMs: 0,
      tracks: [
        { type: "midi", name: "", clips: [] },
        { type: "video", name: "Video", clips: [] }
      ]
    });
  });

  it("lists the documents in no project, and moves one in and back out", async () => {
    const project = await caller().projects.create({
      name: "Aurora",
      kind: ""
    });
    const loose = await Script.create<Script>({
      user_id: "user-1",
      name: "Scratch VO"
    });
    await Script.create<Script>({ user_id: "user-2", name: "Theirs" });

    expect(await caller().projects.unassigned({})).toEqual([]);

    await caller().projects.assignDocument({
      projectId: project.id,
      type: "script",
      ref: loose.id
    });
    expect(await caller().projects.unassigned({})).toEqual([]);
    expect(
      (await caller().projects.documents({ id: project.id })).map((d) => d.ref)
    ).toEqual([loose.id]);

    await caller().projects.assignDocument({
      projectId: LOOSE_PROJECT_ID,
      type: "script",
      ref: loose.id
    });
    expect(await caller().projects.unassigned({})).toEqual([]);
  });

  it("refuses a move into a project the caller does not own, and of a document they do not own", async () => {
    const theirs = await caller("user-2").projects.create({
      name: "Theirs",
      kind: ""
    });
    const mine = await Script.create<Script>({
      user_id: "user-1",
      name: "Mine"
    });
    await expect(
      caller().projects.assignDocument({
        projectId: theirs.id,
        type: "script",
        ref: mine.id
      })
    ).rejects.toThrow(/not found/i);

    const project = await caller().projects.create({
      name: "Aurora",
      kind: ""
    });
    const notMine = await Script.create<Script>({
      user_id: "user-2",
      name: "Theirs"
    });
    await expect(
      caller().projects.assignDocument({
        projectId: project.id,
        type: "script",
        ref: notMine.id
      })
    ).rejects.toThrow(/not found/i);
  });
});

describe("projects router: project folders", () => {
  const ENV_KEYS = [
    "PROJECTS_DIR",
    "NODETOOL_WORKSPACE_STORAGE",
    "NODETOOL_ENV"
  ] as const;
  let saved: Record<string, string | undefined> = {};
  let root = "";

  /** Point new project folders at `path`, as the operator's environment does. */
  function setProjectsDir(path: string): void {
    process.env["PROJECTS_DIR"] = path;
  }

  function useCloud(): void {
    process.env["NODETOOL_WORKSPACE_STORAGE"] = "cloud";
    setWorkspaceCloudStorage(new InMemoryStorageAdapter());
  }

  async function folderRow(projectId: string): Promise<Workspace> {
    const project = await Project.get<Project>(projectId);
    const row = await Workspace.find("user-1", project?.workspace_id ?? "");
    if (!row) throw new Error("project has no folder");
    return row;
  }

  function filesOf(row: Workspace) {
    const workspace = workspaceFromRow(row);
    if (!workspace) throw new Error("no workspace for row");
    return workspace;
  }

  async function manifest(workspaceId: string): Promise<unknown> {
    const row = await Workspace.find("user-1", workspaceId);
    // Read the way NodeTool writes it: the folder's own workspace refuses
    // every path in `.nodetool/`.
    const nodetoolDir = row ? nodetoolDirFromRow(row) : null;
    const text = await nodetoolDir?.readText("project.json");
    return text ? JSON.parse(text) : null;
  }

  beforeEach(async () => {
    saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
    root = await mkdtemp(join(tmpdir(), "nodetool-project-folders-"));
    setProjectsDir(join(root, "NodeTool"));
    initTestDb();
  });

  afterEach(async () => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    setWorkspaceCloudStorage(null);
    ModelObserver.clear();
    await rm(root, { recursive: true, force: true });
  });

  it("creates <PROJECTS_DIR>/<name>/.nodetool/project.json, suffixing a taken name", async () => {
    const first = await caller().projects.create({ name: "My Film" });
    const second = await caller().projects.create({ name: "My Film" });

    expect(first.folder).toEqual({
      workspace_id: expect.any(String),
      path: join(root, "NodeTool", "My Film"),
      origin: "created",
      is_accessible: true
    });
    expect(second.folder?.path).toBe(join(root, "NodeTool", "My Film 2"));
    const written = JSON.parse(
      await readFile(
        join(root, "NodeTool", "My Film", ".nodetool", "project.json"),
        "utf8"
      )
    ) as unknown;
    expect(written).toEqual({
      format: "nodetool.project",
      version: 1,
      id: first.id,
      name: "My Film"
    });
    expect(
      (await caller().projects.get({ id: first.id })).project.folder?.path
    ).toBe(join(root, "NodeTool", "My Film"));
  });

  it("fails a create whose folder cannot be written and keeps no project row", async () => {
    await writeFile(join(root, "blocker"), "not a directory");
    setProjectsDir(join(root, "blocker", "projects"));

    await expect(
      caller().projects.create({ id: "unwritable", name: "Unwritable" })
    ).rejects.toThrow(/project folder/i);

    expect(await Project.get("unwritable")).toBeNull();
    expect(await Workspace.listByProject("user-1", "unwritable")).toEqual([]);
    expect((await caller().projects.list({})).map((p) => p.name)).toEqual([
      "Personal"
    ]);
  });

  it("gives a cloud project a virtual folder whose manifest reads through the workspace", async () => {
    process.env["NODETOOL_WORKSPACE_STORAGE"] = "cloud";
    setWorkspaceCloudStorage(new InMemoryStorageAdapter());

    const project = await caller().projects.create({ name: "Cloud Film" });

    expect(project.folder).toEqual({
      workspace_id: expect.any(String),
      path: null,
      origin: "created",
      is_accessible: true
    });
    const stored = await Project.get<Project>(project.id);
    expect(await manifest(stored?.workspace_id ?? "")).toEqual({
      format: "nodetool.project",
      version: 1,
      id: project.id,
      name: "Cloud Film"
    });
  });

  it("reports the folder the migration assigned, and Personal's default workspace", async () => {
    const defaultRow = await Workspace.ensureDefault("user-1");
    await writeFile(join(defaultRow.path, "draft.md"), "kept");
    const legacy = await Project.insertNew({ user_id: "user-1", name: "Legacy" });
    const olderDir = join(root, "older");
    const older = await Workspace.create<Workspace>({
      user_id: "user-1",
      project_id: legacy?.id,
      name: "older",
      path: olderDir,
      created_at: "2026-01-01T00:00:00.000Z"
    });
    await Workspace.create<Workspace>({
      user_id: "user-1",
      project_id: legacy?.id,
      name: "newer",
      path: join(root, "newer"),
      created_at: "2026-02-01T00:00:00.000Z"
    });
    await mkdir(olderDir, { recursive: true });
    await Project.ensurePersonal("user-1");

    await migrateProjectFolders();

    const listed = await caller().projects.list({});
    const byName = new Map(listed.map((p) => [p.name, p]));
    expect(byName.get("Legacy")?.folder).toEqual({
      workspace_id: expect.any(String),
      path: olderDir,
      origin: "created",
      is_accessible: true
    });
    expect(byName.get("Personal")?.folder?.path).toBe(defaultRow.path);
    expect(await readFile(join(defaultRow.path, "draft.md"), "utf8")).toBe(
      "kept"
    );
    expect(await manifest(older.id)).toMatchObject({ id: legacy?.id });
  });

  it("never makes a game's workspace a project folder", async () => {
    const legacy = await Project.insertNew({ user_id: "user-1", name: "Legacy" });
    const gameDir = join(root, "game");
    const plainDir = join(root, "plain");
    await mkdir(gameDir, { recursive: true });
    await mkdir(plainDir, { recursive: true });
    const gameRow = await Workspace.create<Workspace>({
      user_id: "user-1",
      project_id: legacy?.id,
      name: "game",
      path: gameDir,
      created_at: "2026-01-01T00:00:00.000Z"
    });
    await Game.insertNew({
      id: "a".repeat(32),
      userId: "user-1",
      projectId: legacy?.id ?? "",
      workspaceId: gameRow.id,
      name: "Game",
      revision: "b".repeat(32)
    });
    await Workspace.create<Workspace>({
      user_id: "user-1",
      project_id: legacy?.id,
      name: "plain",
      path: plainDir,
      created_at: "2026-02-01T00:00:00.000Z"
    });

    await migrateProjectFolders();

    const detail = await caller().projects.get({ id: legacy?.id ?? "" });
    expect(detail.project.folder?.path).toBe(plainDir);
  });

  it.each(["local", "cloud"] as const)(
    "keeps a new game out of the project folder (%s)",
    async (mode) => {
      if (mode === "cloud") useCloud();
      const project = await caller().projects.create({ name: "With game" });
      const folder = await folderRow(project.id);

      const created = await caller().games.create({
        projectId: project.id,
        name: "Room"
      });

      const game = await Game.findOwned("user-1", created.game.id);
      const gameRow = await Workspace.find("user-1", game?.workspace_id ?? "");
      expect(gameRow?.id).not.toBe(folder.id);
      expect(gameRow?.path).not.toBe(folder.path);
      expect(gameRow?.isManaged()).toBe(true);
      // Only the manifest, which listings leave out with the rest of `.nodetool/`.
      expect(await filesOf(folder).list("", { recursive: true })).toEqual([]);
      expect(await manifest(folder.id)).toMatchObject({ id: project.id });
    }
  );

  it("gives Personal its own folder when a Personal game uses the default workspace", async () => {
    // A Personal from before project folders, which has none yet.
    const personal = await Project.insertNew({
      id: "personal:user-1",
      user_id: "user-1",
      name: "Personal",
      kind: "personal"
    });
    if (!personal) throw new Error("insert failed");
    const defaultRow = await Workspace.ensureDefault("user-1");
    defaultRow.project_id = personal.id;
    await defaultRow.save();
    await Game.insertNew({
      id: "c".repeat(32),
      userId: "user-1",
      projectId: personal.id,
      workspaceId: defaultRow.id,
      name: "Personal game",
      revision: "d".repeat(32)
    });
    const before = await Workspace.find("user-1", defaultRow.id);

    const listed = await caller().projects.list({});

    const folder = listed.find((p) => p.isPersonal)?.folder;
    expect(folder?.path).toBe(join(root, "NodeTool", "Personal"));
    expect(folder?.origin).toBe("created");
    expect(await Workspace.find("user-1", defaultRow.id)).toEqual(before);
  });

  it.each(["local", "cloud"] as const)(
    "keeps the project folder's files when the project is deleted (%s)",
    async (mode) => {
      if (mode === "cloud") useCloud();
      const project = await caller().projects.create({ name: "Doomed" });
      const folder = await folderRow(project.id);
      await filesOf(folder).write("footage/take.txt", "keep");
      const extra = await Workspace.create<Workspace>({
        user_id: "user-1",
        project_id: project.id,
        name: "extra",
        path:
          mode === "cloud"
            ? "workspaces/user-1/extra"
            : await mkdtemp(join(root, "extra-"))
      });
      await filesOf(extra).write("scratch.txt", "wipe");

      await caller().projects.delete({ id: project.id });

      expect(await filesOf(folder).readText("footage/take.txt")).toBe("keep");
      expect(await filesOf(extra).exists("scratch.txt")).toBe(false);
    }
  );

  it("hides server paths from callers of a production server", async () => {
    process.env["NODETOOL_ENV"] = "production";
    process.env["NODETOOL_WORKSPACE_STORAGE"] = "local";

    const created = await caller().projects.create({ name: "Hosted" });
    expect(created.folder).toEqual({
      workspace_id: expect.any(String),
      path: null,
      origin: "created",
      is_accessible: true
    });

    await writeFile(join(root, "blocker"), "not a directory");
    setProjectsDir(join(root, "blocker", "projects"));
    const failure = caller().projects.create({ name: "Blocked" });
    await expect(failure).rejects.toThrow("Could not create the project folder");
    await expect(failure).rejects.not.toThrow(root);
  });

  it("names the failing path to a local caller", async () => {
    await writeFile(join(root, "blocker"), "not a directory");
    setProjectsDir(join(root, "blocker", "projects"));

    await expect(caller().projects.create({ name: "Blocked" })).rejects.toThrow(
      join(root, "blocker")
    );
  });

  it("gives Personal a folder the first time it is listed", async () => {
    const listed = await caller().projects.list({});
    const personal = listed.find((p) => p.isPersonal);
    const defaultRow = await Workspace.getDefault("user-1");

    expect(personal?.folder?.path).toBe(defaultRow?.path);
    expect(defaultRow?.project_id).toBe(personal?.id);
  });
});
