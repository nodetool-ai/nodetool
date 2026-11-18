/**
 * Timelines as files in the project folder (PRD T5), through the server's own
 * write paths: the tRPC timeline router, the resources router, version
 * restore, the move and the copy of a document between projects. Each saves
 * through the `TimelineSequence` model, which writes
 * `Timelines/<name>.timeline.json`.
 *
 * The folders are real project folders, resolved the way the server resolves
 * them, as local directories and as key prefixes in object storage.
 */
import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ModelObserver,
  TimelineSequence,
  TimelineSequenceVersion,
  Workspace as WorkspaceRow,
  initTestDb
} from "@nodetool-ai/models";
import {
  FileStorageAdapter,
  InMemoryStorageAdapter,
  type StorageAdapter
} from "@nodetool-ai/storage";
import {
  ProcessingContext,
  createLocalWorkspace,
  type Workspace
} from "@nodetool-ai/runtime";
import { UNGATED, createCapabilityRun } from "@nodetool-ai/agents";

const mocks = vi.hoisted(() => ({ adapter: null as StorageAdapter | null }));

vi.mock("@nodetool-ai/asset-services/storage", async (orig) => {
  const actual =
    await orig<typeof import("@nodetool-ai/asset-services/storage")>();
  return { ...actual, getAssetAdapter: () => mocks.adapter };
});

import {
  setWorkspaceCloudStorage,
  workspaceFromRow
} from "@nodetool-ai/execution/service";
import { ProjectAssetStorageAdapter } from "@nodetool-ai/asset-services/project-asset-storage";
import { saveProjectAsset } from "@nodetool-ai/asset-services/project-asset";
import { reconcileDocumentFiles } from "@nodetool-ai/project-services/document-file-sync";
import {
  cancelProjectReconciles,
  flushProjectReconciles,
  reconcileProjectOnOpen
} from "@nodetool-ai/project-services/project-index";
import { timelineFileAdapter } from "@nodetool-ai/project-services/timeline-file";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";
import { lookupExternalAssetPath } from "../src/lib/external-asset-lookup.js";
import { copyProjectDocument } from "../src/lib/project-document-copy.js";
import {
  projectWithFolder,
  useProjectFolders,
  type ProjectFolderFixture
} from "./project-folder-fixture.js";
import { KEPT_REVISION_LABEL } from "../src/lib/document-save-rules.js";

const createCaller = createCallerFactory(appRouter);
const USER = "1";
const PATH = "Timelines/Fox.timeline.json";

function makeCtx(): Context {
  return {
    userId: USER,
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false
  } as Context;
}

const TRACK = {
  id: "v1",
  name: "Video",
  type: "video" as const,
  index: 0,
  visible: true,
  locked: false
};

/** A document with one full-frame shape clip named `name`. */
function documentWith(name: string): {
  tracks: Array<typeof TRACK>;
  clips: Array<Record<string, unknown>>;
  markers: never[];
} {
  return {
    tracks: [TRACK],
    clips: [
      {
        id: "c1",
        trackId: "v1",
        name,
        startMs: 0,
        durationMs: 1000,
        mediaType: "shape",
        shapeStyle: { kind: "rect", fill: "#0000ff", x: 0, y: 0, width: 1, height: 1 },
        sourceType: "imported",
        status: "generated",
        locked: false,
        versions: []
      }
    ],
    markers: []
  };
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** The project's folder, unobserved: writes through it are another app's. */
function folderOf(row: WorkspaceRow): Workspace {
  const workspace = workspaceFromRow(row);
  if (!workspace) throw new Error("no workspace for row");
  return workspace;
}

async function timelineFiles(row: WorkspaceRow): Promise<string[]> {
  const entries = await folderOf(row)
    .list("Timelines")
    .catch(() => []);
  return entries.map((entry) => entry.path).sort();
}

interface TimelineFileJson {
  id: string;
  fps: number;
  duration_ms: number;
  document: { clips: Array<{ name?: string; currentAssetId?: string }> };
}

async function fileOf(row: WorkspaceRow, filePath: string): Promise<TimelineFileJson> {
  const text = await folderOf(row).readText(filePath);
  return JSON.parse(text ?? "{}") as TimelineFileJson;
}

async function clipNameInFile(row: WorkspaceRow, filePath: string): Promise<unknown> {
  return (await fileOf(row, filePath)).document.clips[0]?.name;
}

async function reload(id: string): Promise<TimelineSequence> {
  const found = await TimelineSequence.findById(id);
  if (!found) throw new Error(`timeline ${id} is gone`);
  return found;
}

function clipName(row: TimelineSequence): unknown {
  return row.toDocument().clips[0]?.name;
}

/** Create a timeline named Fox whose one clip is named `name`. */
async function createFox(
  caller: ReturnType<typeof createCaller>,
  projectId: string,
  name: string
): Promise<{ id: string; updatedAt: string }> {
  const created = await caller.timeline.create({ projectId, name: "Fox" });
  const saved = await caller.timeline.update({
    id: created.id,
    baseUpdatedAt: created.updatedAt,
    document: documentWith(name)
  });
  return { id: created.id, updatedAt: saved.updatedAt };
}

/** Change the clip name in the file as a text editor would. */
async function editOnDisk(row: WorkspaceRow, from: string, to: string): Promise<void> {
  const text = (await folderOf(row).readText(PATH)) ?? "";
  expect(text).toContain(`"${from}"`);
  await folderOf(row).write(PATH, text.replace(`"${from}"`, `"${to}"`));
}

let folders: ProjectFolderFixture;
let tmpDir: string;

beforeEach(async () => {
  initTestDb();
  folders = await useProjectFolders([USER]);
  tmpDir = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "timeline-files-"))
  );
  vi.stubEnv("NODETOOL_ENV", "development");
  vi.stubEnv("NODETOOL_STORAGE_BACKEND", "file");
  vi.stubEnv("NODETOOL_LOCAL_FILE_ROOTS", "*");
});

afterEach(async () => {
  await flushProjectReconciles();
  cancelProjectReconciles();
  vi.unstubAllEnvs();
  ModelObserver.clear();
  setWorkspaceCloudStorage(null);
  mocks.adapter = null;
  await folders.cleanup();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe.each(["local", "cloud"] as const)(
  "timeline files through the server's write paths (%s)",
  (mode) => {
    beforeEach(() => {
      vi.stubEnv("NODETOOL_WORKSPACE_STORAGE", mode);
      if (mode === "local") {
        mocks.adapter = new FileStorageAdapter(path.join(tmpDir, "storage"), {
          externalPathLookup: lookupExternalAssetPath
        });
        setWorkspaceCloudStorage(null);
      } else {
        // The server hands project folders the asset store itself, so one
        // bucket holds both. `initWorkspaceStorage` does the same.
        const adapter = new ProjectAssetStorageAdapter(new InMemoryStorageAdapter());
        mocks.adapter = adapter;
        setWorkspaceCloudStorage(adapter);
      }
    });

    it("writes, renames and deletes the file as the timeline is created, saved, renamed and deleted", async () => {
      const { project, folder } = await projectWithFolder(USER, "Film");
      const caller = createCaller(makeCtx());

      const created = await caller.timeline.create({
        projectId: project.id,
        name: "Fox",
        fps: 24
      });
      expect(await timelineFiles(folder)).toEqual([PATH]);
      expect(await fileOf(folder, PATH)).toMatchObject({ id: created.id, fps: 24 });

      // The editor's save.
      const saved = await caller.timeline.update({
        id: created.id,
        baseUpdatedAt: created.updatedAt,
        document: documentWith("saved")
      });
      expect(await clipNameInFile(folder, PATH)).toBe("saved");
      expect((await fileOf(folder, PATH)).duration_ms).toBe(1000);

      // A save with a new name: the file is renamed.
      await caller.timeline.update({
        id: created.id,
        baseUpdatedAt: saved.updatedAt,
        name: "Arctic fox",
        document: documentWith("renamed")
      });
      const renamed = "Timelines/Arctic fox.timeline.json";
      expect(await timelineFiles(folder)).toEqual([renamed]);
      expect(await clipNameInFile(folder, renamed)).toBe("renamed");
      const stored = await reload(created.id);
      expect(stored.file_path).toBe(renamed);
      expect(stored.file_hash).toBe(
        sha256((await folderOf(folder).readText(renamed)) ?? "")
      );

      // None of these saves reads as an outside edit.
      expect(
        await reconcileDocumentFiles([timelineFileAdapter], project.id, USER)
      ).toMatchObject({ unchanged: 1, imported: [], created: [], renamed: [] });
      expect((await reload(created.id)).revision).toBe(stored.revision);

      await caller.timeline.delete({ id: created.id });
      expect(await timelineFiles(folder)).toEqual([]);
    });

    it("an outside edit raises revision, and a client holding the old revision is refused on write", async () => {
      const { project, folder } = await projectWithFolder(USER, "Film");
      const caller = createCaller(makeCtx());
      const fox = await createFox(caller, project.id, "first");
      // What an open editor and an editing widget hold.
      const held = await caller.timeline.get({ id: fox.id });
      const heldRef = (
        await caller.resources.read({ ref: { kind: "timeline", id: fox.id } })
      ).ref;

      await editOnDisk(folder, "first", "edited on disk");
      reconcileProjectOnOpen(project.id, USER);
      await flushProjectReconciles();

      const current = await reload(fox.id);
      expect(clipName(current)).toBe("edited on disk");
      expect(current.revision).toBe((heldRef.revision ?? 0) + 1);
      expect(current.updated_at).not.toBe(held.updatedAt);
      // The previous document is kept as a version.
      const versions = await TimelineSequenceVersion.listForTimeline(fox.id, {
        saveType: "manual"
      });
      // createFox's save carried no editing instance, so it kept the empty
      // timeline first.
      expect(versions.map((version) => version.name)).toEqual([
        "Before file edit",
        KEPT_REVISION_LABEL
      ]);

      // The editor's save names the state it loaded and is refused.
      await expect(
        caller.timeline.update({
          id: fox.id,
          baseUpdatedAt: held.updatedAt,
          document: documentWith("stale save")
        })
      ).rejects.toThrow("Timeline has been modified since last load");
      // So is a write that carries the old revision.
      await expect(
        caller.resources.update({ ref: heldRef, name: "Stale" })
      ).rejects.toMatchObject({ code: "CONFLICT" });
      const kept = await reload(fox.id);
      expect(clipName(kept)).toBe("edited on disk");
      expect(kept.name).toBe("Fox");
      expect(await clipNameInFile(folder, PATH)).toBe("edited on disk");

      // After a reload both writes go through.
      const fresh = await caller.timeline.get({ id: fox.id });
      expect(fresh.clips[0]?.name).toBe("edited on disk");
      const saved = await caller.timeline.update({
        id: fox.id,
        baseUpdatedAt: fresh.updatedAt,
        document: documentWith("saved after reload")
      });
      expect(saved.clips[0]?.name).toBe("saved after reload");
      const freshRef = (
        await caller.resources.read({ ref: { kind: "timeline", id: fox.id } })
      ).ref;
      expect(freshRef.revision).toBe(current.revision + 1);
      await caller.resources.update({ ref: freshRef, name: "Arctic fox" });
      expect(await timelineFiles(folder)).toEqual([
        "Timelines/Arctic fox.timeline.json"
      ]);
    });

    it("restores a version to the row and the file, and the next reconcile keeps it", async () => {
      const { project, folder } = await projectWithFolder(USER, "Film");
      const caller = createCaller(makeCtx());
      const fox = await createFox(caller, project.id, "first");
      const version = await caller.timeline.versions.create({ id: fox.id });
      const second = await caller.timeline.update({
        id: fox.id,
        baseUpdatedAt: fox.updatedAt,
        document: documentWith("second")
      });
      const beforeRestore = await reload(fox.id);
      expect(second.clips[0]?.name).toBe("second");

      await caller.timeline.versions.restore({
        id: fox.id,
        version: version.version
      });
      const versionsAfterRestore = await TimelineSequenceVersion.listForTimeline(
        fox.id
      );

      const restored = await reload(fox.id);
      expect(clipName(restored)).toBe("first");
      expect(await clipNameInFile(folder, PATH)).toBe("first");
      expect(restored.file_hash).toBe(
        sha256((await folderOf(folder).readText(PATH)) ?? "")
      );
      // The restore raised revision, so an open editor reloads.
      expect(restored.revision).toBe(beforeRestore.revision + 1);
      await expect(
        caller.timeline.update({
          id: fox.id,
          baseUpdatedAt: second.updatedAt,
          document: documentWith("stale save")
        })
      ).rejects.toThrow("Timeline has been modified since last load");

      const report = await reconcileDocumentFiles(
        [timelineFileAdapter],
        project.id,
        USER
      );

      // The reconcile does not read the restore as an outside edit.
      expect(report).toMatchObject({ unchanged: 1, imported: [], written: [] });
      const after = await reload(fox.id);
      expect(clipName(after)).toBe("first");
      expect(after.updated_at).toBe(restored.updated_at);
      expect(after.revision).toBe(restored.revision);
      expect(
        (await TimelineSequenceVersion.listForTimeline(fox.id)).map((v) => v.id)
      ).toEqual(versionsAfterRestore.map((v) => v.id));
    });

    it("a timeline file that references an asset ID renders that asset after import", async () => {
      const { project, folder } = await projectWithFolder(USER, "Film");
      // A red still, saved as a file in the project folder.
      const red = await sharp({
        create: { width: 64, height: 36, channels: 3, background: "#ff0000" }
      })
        .png()
        .toBuffer();
      const asset = await saveProjectAsset({
        projectId: project.id,
        userId: USER,
        name: "red",
        contentType: "image/png",
        bytes: new Uint8Array(red)
      });
      const document = documentWith("backdrop");
      document.clips.push({
        id: "still",
        trackId: "v1",
        name: "Red still",
        startMs: 0,
        durationMs: 1000,
        mediaType: "image",
        currentAssetId: asset.id
      });
      // The still is on a track above the blue backdrop.
      document.tracks.unshift({ ...TRACK, id: "v0", name: "Stills" });
      document.tracks[1] = { ...TRACK, index: 1 };
      document.clips[1]!["trackId"] = "v0";
      await folderOf(folder).write(
        "Timelines/Poster.timeline.json",
        JSON.stringify({
          format: "nodetool.timeline",
          version: 1,
          width: 640,
          height: 360,
          document
        })
      );

      reconcileProjectOnOpen(project.id, USER);
      await flushProjectReconciles();

      const [poster] = await TimelineSequence.listByProject(project.id, USER);
      expect(poster).toMatchObject({ name: "Poster", width: 640, height: 360 });
      // The stored clip names the asset by its ID.
      expect(poster!.toDocument().clips[1]).toMatchObject({
        currentAssetId: asset.id
      });
      const frames = createLocalWorkspace(path.join(tmpDir, "frames"));
      const context = new ProcessingContext({
        jobId: "timeline-file-render",
        userId: USER,
        projectId: project.id,
        assetStorage: mocks.adapter,
        storage: new InMemoryStorageAdapter(),
        workspace: frames
      });
      const preview = (await createCapabilityRun({ context, gate: UNGATED }).invoke(
        "preview_timeline_frame",
        { timeline_id: poster!.id, times_ms: [500], width: 160 }
      )) as {
        error?: string;
        complete: boolean;
        frames: Array<{
          layers: Array<{ clip_id: string; skipped?: string }>;
          image: { path: string };
        }>;
      };

      expect(preview.error).toBeUndefined();
      expect(preview.complete).toBe(true);
      const [frame] = preview.frames;
      expect(
        frame!.layers.map((layer) => [layer.clip_id, layer.skipped])
      ).toEqual([
        ["still", undefined],
        ["c1", undefined]
      ]);
      // The frame shows the asset's pixels over the blue backdrop.
      const png = await frames.read(frame!.image.path);
      const { data } = await sharp(Buffer.from(png!))
        .raw()
        .toBuffer({ resolveWithObject: true });
      const middle = (45 * 160 + 80) * (data.length / (160 * 90));
      expect([data[middle], data[middle + 1], data[middle + 2]]).toEqual([255, 0, 0]);
    });

    it("moves the file with a timeline that is moved to another project", async () => {
      const a = await projectWithFolder(USER, "Film A");
      const b = await projectWithFolder(USER, "Film B");
      const caller = createCaller(makeCtx());
      const fox = await createFox(caller, a.project.id, "first");
      const before = await reload(fox.id);

      await caller.projects.assignDocument({
        type: "timeline",
        ref: fox.id,
        projectId: b.project.id
      });

      expect(await timelineFiles(a.folder)).toEqual([]);
      expect(await timelineFiles(b.folder)).toEqual([PATH]);
      expect((await fileOf(b.folder, PATH)).id).toBe(fox.id);
      const moved = await reload(fox.id);
      expect(moved.project_id).toBe(b.project.id);
      expect(moved.revision).toBe(before.revision);
      // Neither folder takes the move for a new or a missing document.
      expect(
        await reconcileDocumentFiles([timelineFileAdapter], a.project.id, USER)
      ).toMatchObject({ files: 0, missing: [], created: [] });
      expect(
        await reconcileDocumentFiles([timelineFileAdapter], b.project.id, USER)
      ).toMatchObject({ unchanged: 1, created: [], reassigned: [] });
    });

    it("keeps an unseen file edit as a version when the timeline is moved", async () => {
      const a = await projectWithFolder(USER, "Film A");
      const b = await projectWithFolder(USER, "Film B");
      const caller = createCaller(makeCtx());
      const fox = await createFox(caller, a.project.id, "first");
      // Edited outside NodeTool, and nothing reconciles it before the move.
      await editOnDisk(a.folder, "first", "edited before the move");

      await caller.projects.assignDocument({
        type: "timeline",
        ref: fox.id,
        projectId: b.project.id
      });

      expect(await timelineFiles(a.folder)).toEqual([]);
      expect(await timelineFiles(b.folder)).toEqual([PATH]);
      expect(await clipNameInFile(b.folder, PATH)).toBe("first");
      expect(clipName(await reload(fox.id))).toBe("first");
      const [kept] = await TimelineSequenceVersion.listForTimeline(fox.id, {
        saveType: "manual"
      });
      expect(kept?.name).toBe("File edit replaced by a save");
      expect(
        (JSON.parse(kept?.document ?? "{}") as TimelineFileJson["document"]).clips[0]
          ?.name
      ).toBe("edited before the move");
    });

    it("refuses to move a timeline whose file holds an edit that is not valid", async () => {
      const a = await projectWithFolder(USER, "Film A");
      const b = await projectWithFolder(USER, "Film B");
      const caller = createCaller(makeCtx());
      const fox = await createFox(caller, a.project.id, "first");
      const before = await reload(fox.id);
      await folderOf(a.folder).write(PATH, "{ half an edit");

      await expect(
        caller.projects.assignDocument({
          type: "timeline",
          ref: fox.id,
          projectId: b.project.id
        })
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: expect.stringContaining(
          `Cannot move timeline "Fox" to another project: its file ${PATH} was edited and is not valid. The file is not valid JSON`
        )
      });

      // The timeline and the user's file are where they were.
      expect(await folderOf(a.folder).readText(PATH)).toBe("{ half an edit");
      expect(await timelineFiles(b.folder)).toEqual([]);
      const stored = await reload(fox.id);
      expect(stored).toMatchObject({
        project_id: a.project.id,
        file_path: PATH,
        revision: before.revision,
        updated_at: before.updated_at
      });
      expect(stored.file_error).toMatch(/^The file is not valid JSON/);
    });

    it("writes the file of a timeline copied into another project", async () => {
      const a = await projectWithFolder(USER, "Film A");
      const b = await projectWithFolder(USER, "Film B");
      const caller = createCaller(makeCtx());
      const fox = await createFox(caller, a.project.id, "first");

      const copy = await copyProjectDocument({
        userId: USER,
        type: "timeline",
        id: fox.id,
        destinationProjectId: b.project.id,
        storage: mocks.adapter!
      });

      expect(copy.id).not.toBe(fox.id);
      expect(await timelineFiles(b.folder)).toEqual([PATH]);
      expect(await fileOf(b.folder, PATH)).toMatchObject({ id: copy.id });
      expect(await clipNameInFile(b.folder, PATH)).toBe("first");
      const stored = await reload(copy.id);
      expect(stored.file_hash).toBe(
        sha256((await folderOf(b.folder).readText(PATH)) ?? "")
      );
      // The copy is no outside edit, and the original keeps its own file.
      expect(
        await reconcileDocumentFiles([timelineFileAdapter], b.project.id, USER)
      ).toMatchObject({ unchanged: 1, created: [], reassigned: [], written: [] });
      expect((await fileOf(a.folder, PATH)).id).toBe(fox.id);
    });
  }
);
