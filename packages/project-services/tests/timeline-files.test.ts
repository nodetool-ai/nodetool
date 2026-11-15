/**
 * Timelines as files in the project folder (PRD T5, D8, US8):
 * `Timelines/<name>.timeline.json`.
 *
 * Saving in NodeTool writes the file. Editing the file updates the timeline
 * and raises its `revision`. The cases cover the write paths of the model,
 * one test per row of the reconcile table, the validation
 * `set_timeline_document` runs, version restore, the agent's file tools, and
 * the migration of timelines from before project folders.
 *
 * Every case runs against a local directory and against a storage-backed
 * folder (a key prefix in an object store), through the same `Workspace`
 * interface.
 */
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UNGATED, createCapabilityRun } from "@nodetool-ai/agents";
import {
  Asset,
  DocumentFileMoveError,
  ModelChangeEvent,
  ModelObserver,
  TimelineSequence,
  TimelineSequenceVersion,
  initTestDb,
  moveDocumentToProject,
  setTimelineFileSync
} from "@nodetool-ai/models";
import {
  createLocalWorkspace,
  createWorkspace,
  setProjectFolderResolver,
  type ProcessingContext,
  type ProjectFolderResolution,
  type Workspace
} from "@nodetool-ai/runtime";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";
import {
  DOCUMENT_FILE_MISSING,
  documentFileSync,
  reconcileDocumentFiles,
  type DocumentFilesReport
} from "../src/document-file-sync.js";
import {
  COPY_GRACE_MS,
  cancelProjectReconciles,
  flushProjectReconciles,
  scheduleProjectReconcile
} from "../src/project-index.js";
import {
  TIMELINE_FILE_EDIT_VERSION_NAME,
  TIMELINE_FILE_REPLACED_VERSION_NAME,
  migrateTimelineFiles,
  timelineFileAdapter
} from "../src/timeline-file.js";

const USER = "owner";
const PROJECT = "project-a";
const OTHER_PROJECT = "project-b";

interface TestTrack {
  id: string;
  name: string;
  type: string;
  index: number;
  visible: boolean;
  locked: boolean;
}

interface TestClip {
  id: string;
  trackId: string;
  name: string;
  startMs: number;
  durationMs: number;
  mediaType: string;
  shapeStyle?: Record<string, unknown>;
  currentAssetId?: string;
  sourceType: string;
  status: string;
  locked: boolean;
  versions: unknown[];
}

interface TestDocument {
  tracks: TestTrack[];
  clips: TestClip[];
  markers: unknown[];
}

const TRACK: TestTrack = {
  id: "v1",
  name: "Video",
  type: "video",
  index: 0,
  visible: true,
  locked: false
};

/** A shape clip in the stored shape, one second long unless told otherwise. */
function clip(id: string, name: string, startMs = 0, durationMs = 1000): TestClip {
  return {
    id,
    trackId: "v1",
    name,
    startMs,
    durationMs,
    mediaType: "shape",
    shapeStyle: { kind: "rect", fill: "#ff0000", x: 0, y: 0, width: 1, height: 1 },
    sourceType: "imported",
    status: "generated",
    locked: false,
    versions: []
  };
}

/** A still that names its media by asset ID. */
function still(id: string, assetId: string, startMs = 0): TestClip {
  const { shapeStyle: _shapeStyle, ...rest } = clip(id, "Still", startMs);
  return { ...rest, mediaType: "image", currentAssetId: assetId };
}

function documentOf(...clips: TestClip[]): TestDocument {
  return { tracks: [TRACK], clips, markers: [] };
}

let root: string;
let rawStore: InMemoryStorageAdapter;
let workspaces: Map<string, Workspace>;
let unreachable: boolean;

const kinds = {
  /** A real directory on this host. */
  local: (projectId: string): Workspace =>
    createLocalWorkspace(join(root, "projects", projectId)),
  /** A key prefix in an object store. */
  storage: (projectId: string): Workspace =>
    createWorkspace(rawStore, { prefix: `workspaces/${USER}/${projectId}` })
} as const;

type Kind = keyof typeof kinds;

/** The project's folder. Writes through it stand for another app's. */
function folder(kind: Kind, projectId = PROJECT): Workspace {
  let workspace = workspaces.get(projectId);
  if (!workspace) {
    workspace = kinds[kind](projectId);
    workspaces.set(projectId, workspace);
  }
  return workspace;
}

function useFolders(kind: Kind): void {
  setProjectFolderResolver(
    async (projectId): Promise<ProjectFolderResolution> => {
      const id = projectId ?? "personal";
      if (unreachable) {
        return { ok: false, projectId: id, reason: `Project folder not found: ${id}` };
      }
      return { ok: true, projectId: id, workspace: folder(kind, id) };
    }
  );
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function pathOf(name: string): string {
  return `Timelines/${name}.timeline.json`;
}

function makeTimeline(
  name: string,
  fields: Record<string, unknown> = {}
): Promise<TimelineSequence> {
  return TimelineSequence.create<TimelineSequence>({
    user_id: USER,
    project_id: PROJECT,
    name,
    duration_ms: 1000,
    document: JSON.stringify(documentOf(clip("c1", "hello"))),
    ...fields
  });
}

async function reload(id: string): Promise<TimelineSequence> {
  const found = await TimelineSequence.findById(id);
  if (!found || found.id !== id) throw new Error(`timeline ${id} is gone`);
  return found;
}

function documentIn(row: TimelineSequence): TestDocument {
  return JSON.parse(row.document) as TestDocument;
}

async function rows(projectId = PROJECT): Promise<TimelineSequence[]> {
  return TimelineSequence.listForProjects(USER, [projectId]);
}

async function versionsOf(id: string): Promise<TimelineSequenceVersion[]> {
  return TimelineSequenceVersion.listForTimeline(id);
}

async function fileNames(kind: Kind, projectId = PROJECT): Promise<string[]> {
  const entries = await folder(kind, projectId)
    .list("Timelines")
    .catch(() => []);
  return entries.map((entry) => entry.name).sort();
}

async function textOf(kind: Kind, path: string): Promise<string> {
  const text = await folder(kind).readText(path);
  if (text === null) throw new Error(`no file at ${path}`);
  return text;
}

interface TimelineFileJson {
  format: string;
  version: number;
  id?: string;
  fps: number;
  width: number;
  height: number;
  duration_ms: number;
  document: TestDocument;
}

async function jsonOf(kind: Kind, path: string): Promise<TimelineFileJson> {
  return JSON.parse(await textOf(kind, path)) as TimelineFileJson;
}

/** Change the file at `path` as a text editor would. */
async function editFile(
  kind: Kind,
  path: string,
  change: (file: TimelineFileJson) => void
): Promise<string> {
  const file = await jsonOf(kind, path);
  change(file);
  const text = `${JSON.stringify(file, null, 2)}\n`;
  await folder(kind).write(path, text);
  return text;
}

function reconcile(projectId = PROJECT): Promise<DocumentFilesReport> {
  return reconcileDocumentFiles([timelineFileAdapter], projectId, USER);
}

/** A run of the agent tools for `USER`, in the project's folder. */
function agentRun(kind: Kind): ReturnType<typeof createCapabilityRun> {
  const variables = new Map<string, unknown>();
  const context = {
    userId: USER,
    workspace: folder(kind),
    threadId: "thread-timeline-files",
    workflowId: null,
    get: (key: string) => variables.get(key),
    set: (key: string, value: unknown) => void variables.set(key, value),
    postMessage: () => undefined
  } as unknown as ProcessingContext;
  return createCapabilityRun({ context, gate: UNGATED });
}

/** The versions of a timeline, newest first, as name and first clip name. */
async function versionNames(id: string): Promise<Array<[string | null, unknown]>> {
  return (await versionsOf(id)).map((version) => [
    version.name,
    (JSON.parse(version.document) as TestDocument).clips[0]?.name
  ]);
}

/**
 * `inner` as a folder that ignores case, as macOS and Windows folders do: a
 * file answers to its path in any case, and a listing shows the name the
 * file has.
 */
function ignoringCase(inner: Workspace): Workspace {
  const actual = async (path: string): Promise<string> => {
    const key = inner.key(path);
    const slash = key.lastIndexOf("/");
    const entries = await inner
      .list(slash < 0 ? "" : key.slice(0, slash))
      .catch(() => []);
    const match = entries.find(
      (entry) => entry.path.toLowerCase() === key.toLowerCase()
    );
    return match?.path ?? key;
  };
  const folded: Partial<Workspace> = {
    read: async (path) => inner.read(await actual(path)),
    readText: async (path) => inner.readText(await actual(path)),
    stat: async (path) => inner.stat(await actual(path)),
    exists: async (path) => inner.exists(await actual(path)),
    write: async (path, data, type) => inner.write(await actual(path), data, type),
    writeNew: async (path, data, type) =>
      inner.writeNew(await actual(path), data, type),
    delete: async (path) => inner.delete(await actual(path)),
    materialize: async (path) => inner.materialize(await actual(path))
  };
  return new Proxy(inner, {
    get(target, property, receiver): unknown {
      const override = folded[property as keyof Workspace];
      if (override) return override;
      const value: unknown = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
}

/** Let the time a copy waits to be told apart from a move pass. */
function passCopyGrace(): void {
  const now = Date.now();
  vi.spyOn(Date, "now").mockReturnValue(now + COPY_GRACE_MS + 1);
}

beforeEach(async () => {
  initTestDb();
  root = await mkdtemp(join(tmpdir(), "nodetool-timeline-files-"));
  rawStore = new InMemoryStorageAdapter();
  workspaces = new Map();
  unreachable = false;
  setTimelineFileSync(documentFileSync(timelineFileAdapter));
});

afterEach(async () => {
  cancelProjectReconciles();
  ModelObserver.clear();
  setProjectFolderResolver(null);
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});

describe.each(["local", "storage"] as const)("timeline files (%s folder)", (kind) => {
  beforeEach(() => useFolders(kind));

  describe("saving in NodeTool", () => {
    it("writes Timelines/<name>.timeline.json in the fixed format", async () => {
      const assetId = "0123456789abcdef0123456789abcdef";
      const document = documentOf(clip("c1", "hello"), still("c2", assetId, 1000));
      const timeline = await makeTimeline("Fox in snow", {
        fps: 24,
        width: 1280,
        height: 720,
        duration_ms: 2000,
        document: JSON.stringify(document)
      });

      const text = await textOf(kind, pathOf("Fox in snow"));
      expect(text).toBe(
        `${JSON.stringify(
          {
            format: "nodetool.timeline",
            version: 1,
            id: timeline.id,
            fps: 24,
            width: 1280,
            height: 720,
            duration_ms: 2000,
            document
          },
          null,
          2
        )}\n`
      );
      // The file name is the name. The file holds no name field, and nothing
      // the database alone keeps.
      expect(Object.keys(JSON.parse(text) as object)).toEqual([
        "format",
        "version",
        "id",
        "fps",
        "width",
        "height",
        "duration_ms",
        "document"
      ]);
      // A clip names its media by asset ID, in the file as in the row.
      expect((await jsonOf(kind, pathOf("Fox in snow"))).document.clips[1]).toMatchObject({
        currentAssetId: assetId
      });
      const stored = await reload(timeline.id);
      expect(stored.file_path).toBe(pathOf("Fox in snow"));
      expect(stored.file_hash).toBe(sha256(text));
      expect(stored.file_error).toBeNull();
      // The caller's instance carries the same state as the row.
      expect(timeline.file_path).toBe(stored.file_path);
      expect(timeline.file_hash).toBe(stored.file_hash);
    });

    it("leaves the file byte-identical when saved again without changes", async () => {
      const timeline = await makeTimeline("Fox");
      const path = pathOf("Fox");
      const before = await folder(kind).read(path);
      const stat = await folder(kind).stat(path);
      const write = vi.spyOn(folder(kind), "write");

      await timeline.save();
      const saved = await TimelineSequence.updateFieldsIfUnchanged(
        timeline.id,
        timeline.updated_at,
        { document: JSON.stringify(documentOf(clip("c1", "hello"))) }
      );

      expect(saved).not.toBeNull();
      expect(await folder(kind).read(path)).toEqual(before);
      expect(write).not.toHaveBeenCalled();
      expect((await folder(kind).stat(path))?.modifiedAt).toBe(stat?.modifiedAt);
      expect((await reload(timeline.id)).file_hash).toBe(timeline.file_hash);
    });

    it("writes the file on every write path of the model", async () => {
      const nameInFile = async (): Promise<string | undefined> =>
        (await jsonOf(kind, pathOf("Fox"))).document.clips[0]?.name;
      const named = (name: string): string =>
        JSON.stringify(documentOf(clip("c1", name)));

      // TimelineSequence.create: tRPC create, create_timeline, the CLI.
      const timeline = await makeTimeline("Fox");
      expect(await nameInFile()).toBe("hello");

      // Instance save: every caller that loads, changes and saves the row.
      timeline.document = named("saved");
      await timeline.save();
      expect(await nameInFile()).toBe("saved");

      // Instance update, which is a save.
      await timeline.update({ fps: 25 });
      expect((await jsonOf(kind, pathOf("Fox"))).fps).toBe(25);

      // The static update: the REST routes and the asset and script tools.
      await TimelineSequence.update(timeline.id, { document: named("static") });
      expect(await nameInFile()).toBe("static");

      // Conditional update of fields: the editor's save, set_timeline_document,
      // version restore.
      const current = await reload(timeline.id);
      const updated = await TimelineSequence.updateFieldsIfUnchanged(
        timeline.id,
        current.updated_at,
        { document: named("conditional") }
      );
      expect(await nameInFile()).toBe("conditional");
      expect(updated?.file_hash).toBe(sha256(await textOf(kind, pathOf("Fox"))));

      // Conditional update of the document, and the mutation built on it:
      // edit_timeline and every tool that changes clips.
      const replaced = await TimelineSequence.updateDocumentIfUnchanged(
        timeline.id,
        updated?.updated_at ?? "",
        documentOf(clip("c1", "replaced")) as never
      );
      expect(await nameInFile()).toBe("replaced");
      expect(replaced?.file_hash).toBe(sha256(await textOf(kind, pathOf("Fox"))));
      const mutated = await TimelineSequence.mutateDocument(timeline.id, (doc) => {
        doc.clips[0]!.name = "mutated";
      });
      expect(await nameInFile()).toBe("mutated");
      expect((await reload(timeline.id)).file_hash).toBe(mutated?.sequence.file_hash);
      expect(mutated?.sequence.file_hash).toBe(
        sha256(await textOf(kind, pathOf("Fox")))
      );
      // None of these saves reads as an outside edit.
      expect(await reconcile()).toMatchObject({ unchanged: 1, imported: [] });
    });

    it("does not change updated_at or revision when it records the file", async () => {
      const timeline = await makeTimeline("Fox");
      const stored = await reload(timeline.id);

      expect(stored.updated_at).toBe(timeline.updated_at);
      expect(stored.revision).toBe(timeline.revision);
      // The row an editor read is still the row a conditional save expects.
      const saved = await TimelineSequence.updateFieldsIfUnchanged(
        timeline.id,
        timeline.updated_at,
        { fps: 25 }
      );
      expect(saved?.revision).toBe(timeline.revision + 1);
    });

    it("renames the file when the timeline is renamed", async () => {
      const timeline = await makeTimeline("Fox");

      const renamed = await TimelineSequence.updateFieldsIfUnchanged(
        timeline.id,
        timeline.updated_at,
        { name: "Arctic fox" }
      );

      expect(await fileNames(kind)).toEqual(["Arctic fox.timeline.json"]);
      expect(renamed?.file_path).toBe(pathOf("Arctic fox"));
      expect((await jsonOf(kind, pathOf("Arctic fox"))).id).toBe(timeline.id);
      // The rename is not an outside edit.
      expect(await reconcile()).toMatchObject({ unchanged: 1, renamed: [], created: [] });
      expect(await rows()).toHaveLength(1);
    });

    it("deletes the file when the timeline is deleted", async () => {
      const first = await makeTimeline("Fox");
      const second = await makeTimeline("Owl");

      await first.delete();
      expect(await fileNames(kind)).toEqual(["Owl.timeline.json"]);

      expect(await TimelineSequence.deleteOwned(USER, second.id)).toBe(true);
      expect(await fileNames(kind)).toEqual([]);
      expect(await reconcile()).toMatchObject({ files: 0, created: [] });
      expect(await rows()).toHaveLength(0);
    });

    it("gives a name another file has a numeric suffix", async () => {
      const first = await makeTimeline("Fox");
      const second = await makeTimeline("Fox");
      // Names compare without case, as macOS and Windows folders do.
      const third = await makeTimeline("fox");

      expect(await fileNames(kind)).toEqual([
        "Fox-2.timeline.json",
        "Fox.timeline.json",
        "fox-3.timeline.json"
      ]);
      expect(first.file_path).toBe(pathOf("Fox"));
      expect(second.file_path).toBe(pathOf("Fox-2"));
      expect(third.file_path).toBe(pathOf("fox-3"));
      expect((await jsonOf(kind, pathOf("Fox"))).id).toBe(first.id);
      expect((await jsonOf(kind, pathOf("Fox-2"))).id).toBe(second.id);

      // A later save keeps each file where it is, and the names stay.
      second.fps = 25;
      await second.save();
      expect(second.file_path).toBe(pathOf("Fox-2"));
      expect(await reconcile()).toMatchObject({ unchanged: 3, renamed: [] });
      expect((await reload(second.id)).name).toBe("Fox");

      // A renamed timeline whose new name is taken gets a suffix too.
      const owl = await makeTimeline("Owl");
      const renamed = await TimelineSequence.updateFieldsIfUnchanged(
        owl.id,
        owl.updated_at,
        { name: "Fox" }
      );
      expect(renamed?.file_path).toBe(pathOf("Fox-4"));
    });

    it("takes the file along when the timeline changes project", async () => {
      const timeline = await makeTimeline("Fox");

      // The project router's move of one document.
      expect(
        await moveDocumentToProject(USER, "timeline", timeline.id, OTHER_PROJECT)
      ).toBe(true);

      expect(await fileNames(kind, PROJECT)).toEqual([]);
      expect(await fileNames(kind, OTHER_PROJECT)).toEqual(["Fox.timeline.json"]);
      expect((await reload(timeline.id)).file_path).toBe(pathOf("Fox"));
      // Neither folder takes the move for a new or a missing document.
      expect(await reconcile(PROJECT)).toMatchObject({ files: 0, missing: [] });
      expect(await reconcile(OTHER_PROJECT)).toMatchObject({
        unchanged: 1,
        created: []
      });

      // The same through a loaded instance.
      const loaded = await reload(timeline.id);
      loaded.project_id = PROJECT;
      await loaded.save();
      expect(await fileNames(kind, OTHER_PROJECT)).toEqual([]);
      expect(await fileNames(kind, PROJECT)).toEqual(["Fox.timeline.json"]);
    });

    it("keeps a file edit NodeTool has not seen when the timeline changes project", async () => {
      const timeline = await makeTimeline("Fox");
      // The file is edited, and nothing reconciles it before the move.
      await editFile(kind, pathOf("Fox"), (file) => {
        file.document.clips[0]!.name = "edited before the move";
        file.fps = 24;
      });

      expect(
        await moveDocumentToProject(USER, "timeline", timeline.id, OTHER_PROJECT)
      ).toBe(true);

      // The timeline moved, and its file in the new folder is the row's.
      expect(await fileNames(kind, PROJECT)).toEqual([]);
      expect(await fileNames(kind, OTHER_PROJECT)).toEqual(["Fox.timeline.json"]);
      const moved = await reload(timeline.id);
      expect(moved.project_id).toBe(OTHER_PROJECT);
      expect(documentIn(moved).clips[0]?.name).toBe("hello");
      expect(moved.file_error).toBeNull();
      // The edit that went with the old file is a version, settings included.
      expect(await versionNames(timeline.id)).toEqual([
        [TIMELINE_FILE_REPLACED_VERSION_NAME, "edited before the move"]
      ]);
      expect((await versionsOf(timeline.id))[0]).toMatchObject({ fps: 24 });
      expect(await reconcile(PROJECT)).toMatchObject({ files: 0, missing: [] });
      expect(await reconcile(OTHER_PROJECT)).toMatchObject({
        unchanged: 1,
        imported: [],
        created: []
      });

      // The same through a loaded instance whose save changes content too.
      const there = folder(kind, OTHER_PROJECT);
      const text = (await there.readText(pathOf("Fox"))) ?? "";
      await there.write(pathOf("Fox"), text.replace('"hello"', '"edited again"'));
      const loaded = await reload(timeline.id);
      loaded.project_id = PROJECT;
      loaded.fps = 25;
      await loaded.save();

      expect(await fileNames(kind, OTHER_PROJECT)).toEqual([]);
      const file = await jsonOf(kind, pathOf("Fox"));
      expect(file.fps).toBe(25);
      expect(file.document.clips[0]?.name).toBe("hello");
      expect(await versionNames(timeline.id)).toEqual([
        [TIMELINE_FILE_REPLACED_VERSION_NAME, "edited again"],
        [TIMELINE_FILE_REPLACED_VERSION_NAME, "edited before the move"]
      ]);
    });

    it("keeps no version when a moved timeline's file holds the row's content", async () => {
      const timeline = await makeTimeline("Fox");
      // The same content in another layout is no edit.
      await folder(kind).write(
        pathOf("Fox"),
        JSON.stringify(await jsonOf(kind, pathOf("Fox")))
      );

      await moveDocumentToProject(USER, "timeline", timeline.id, OTHER_PROJECT);

      expect(await fileNames(kind, PROJECT)).toEqual([]);
      expect(await fileNames(kind, OTHER_PROJECT)).toEqual(["Fox.timeline.json"]);
      expect(await versionsOf(timeline.id)).toHaveLength(0);

      // Nor does an untouched file, when the save that moves the timeline
      // changes its content as well.
      const loaded = await reload(timeline.id);
      loaded.project_id = PROJECT;
      loaded.document = JSON.stringify(documentOf(clip("c1", "changed with the move")));
      await loaded.save();
      expect(await fileNames(kind, OTHER_PROJECT)).toEqual([]);
      expect((await jsonOf(kind, pathOf("Fox"))).document.clips[0]?.name).toBe(
        "changed with the move"
      );
      expect(await versionsOf(timeline.id)).toHaveLength(0);
    });

    it("refuses to move a timeline whose file holds an edit that is not valid", async () => {
      const timeline = await makeTimeline("Fox");
      await folder(kind).write(pathOf("Fox"), "{ half an edit");
      const move = (): Promise<boolean> =>
        moveDocumentToProject(USER, "timeline", timeline.id, OTHER_PROJECT);

      await expect(move()).rejects.toThrow(DocumentFileMoveError);
      await expect(move()).rejects.toThrow(
        `Cannot move timeline "Fox" to another project: its file ${pathOf("Fox")} was edited and is not valid. The file is not valid JSON`
      );

      // Nothing moved. The file is the user's, in place and untouched, and
      // the row says what is wrong with it.
      expect(await textOf(kind, pathOf("Fox"))).toBe("{ half an edit");
      expect(await fileNames(kind, OTHER_PROJECT)).toEqual([]);
      const stored = await reload(timeline.id);
      expect(stored).toMatchObject({
        project_id: PROJECT,
        file_path: pathOf("Fox"),
        file_hash: timeline.file_hash,
        revision: timeline.revision,
        updated_at: timeline.updated_at
      });
      expect(stored.file_error).toMatch(/^The file is not valid JSON/);
      expect(await versionsOf(timeline.id)).toHaveLength(0);

      // A document the validation refuses is no different, and a save of a
      // loaded instance that moves the timeline stores nothing.
      const file = { format: "nodetool.timeline", version: 1, id: timeline.id };
      await folder(kind).write(
        pathOf("Fox"),
        JSON.stringify({
          ...file,
          document: documentOf({ ...clip("c1", "draft"), mediaType: "hologram" })
        })
      );
      const loaded = await reload(timeline.id);
      loaded.project_id = OTHER_PROJECT;
      loaded.fps = 12;
      await expect(loaded.save()).rejects.toThrow(
        /was edited and is not valid\. The document has 1 error\n/
      );
      expect(await reload(timeline.id)).toMatchObject({
        project_id: PROJECT,
        fps: 30,
        revision: timeline.revision
      });
      expect(await fileNames(kind)).toEqual(["Fox.timeline.json"]);

      // Once the file is valid the move goes through, and the edit is kept.
      await folder(kind).write(
        pathOf("Fox"),
        JSON.stringify({ ...file, document: documentOf(clip("c1", "fixed")) })
      );
      expect(await move()).toBe(true);
      expect(await fileNames(kind, PROJECT)).toEqual([]);
      expect(await fileNames(kind, OTHER_PROJECT)).toEqual(["Fox.timeline.json"]);
      expect(await versionNames(timeline.id)).toEqual([
        [TIMELINE_FILE_REPLACED_VERSION_NAME, "fixed"]
      ]);
      expect(await reload(timeline.id)).toMatchObject({
        project_id: OTHER_PROJECT,
        file_error: null
      });
    });

    it("writes no file for a timeline outside every folder", async () => {
      // A loose timeline of a user with no Personal project has no folder.
      const loose = await makeTimeline("Loose", { project_id: "default" });

      expect(loose.file_path).toBeNull();
      expect(await fileNames(kind)).toEqual([]);
      expect(await fileNames(kind, "personal")).toEqual([]);
    });

    it("saves the row when the folder is away and writes the file later", async () => {
      const timeline = await makeTimeline("Fox");
      unreachable = true;

      const saved = await TimelineSequence.updateFieldsIfUnchanged(
        timeline.id,
        timeline.updated_at,
        { document: JSON.stringify(documentOf(clip("c1", "offline edit"))) }
      );

      // The row is saved. Its hash still names the file as last written.
      expect(saved && documentIn(saved).clips[0]?.name).toBe("offline edit");
      expect((await reload(timeline.id)).file_hash).toBe(timeline.file_hash);
      expect((await jsonOf(kind, pathOf("Fox"))).document.clips[0]?.name).toBe("hello");

      unreachable = false;
      const report = await reconcile();

      // The row wins: nothing is imported and no version is made.
      expect(report).toMatchObject({ written: [timeline.id], imported: [] });
      expect((await jsonOf(kind, pathOf("Fox"))).document.clips[0]?.name).toBe(
        "offline edit"
      );
      expect(await versionsOf(timeline.id)).toHaveLength(0);
      const stored = await reload(timeline.id);
      expect(stored.file_hash).toBe(sha256(await textOf(kind, pathOf("Fox"))));
      expect(stored.revision).toBe(saved?.revision);
    });

    it("writes the file of a row that a host without the sync saved", async () => {
      const timeline = await makeTimeline("Fox");
      setTimelineFileSync(null);

      const saved = await TimelineSequence.updateFieldsIfUnchanged(
        timeline.id,
        timeline.updated_at,
        { document: JSON.stringify(documentOf(clip("c1", "from the cli"))) }
      );
      expect(saved?.file_hash).toBe(timeline.file_hash);
      const loaded = await reload(timeline.id);
      loaded.fps = 25;
      await loaded.save();
      expect((await reload(timeline.id)).file_hash).toBe(timeline.file_hash);

      setTimelineFileSync(documentFileSync(timelineFileAdapter));
      expect(await reconcile()).toMatchObject({ written: [timeline.id], imported: [] });
      const file = await jsonOf(kind, pathOf("Fox"));
      expect(file.document.clips[0]?.name).toBe("from the cli");
      expect(file.fps).toBe(25);
    });
  });

  describe("the reconcile table", () => {
    it("hash equals file_hash: changes nothing", async () => {
      const timeline = await makeTimeline("Fox");
      const before = await reload(timeline.id);
      const events: ModelChangeEvent[] = [];
      ModelObserver.subscribe(
        (_instance, event) => events.push(event),
        "TimelineSequence"
      );

      const report = await reconcile();

      expect(report).toMatchObject({
        files: 1,
        unchanged: 1,
        imported: [],
        invalid: [],
        missing: [],
        renamed: [],
        created: [],
        reassigned: [],
        written: []
      });
      expect(events).toEqual([]);
      expect((await reload(timeline.id)).toRow()).toEqual(before.toRow());
      expect(await versionsOf(timeline.id)).toHaveLength(0);
    });

    it("hash differs and the file validates: snapshots the row, imports the file, raises revision", async () => {
      const timeline = await makeTimeline("Fox");
      const before = await reload(timeline.id);
      const announced: unknown[] = [];
      ModelObserver.subscribe((instance, event) => {
        if (event === ModelChangeEvent.UPDATED) announced.push(instance.id);
      }, "TimelineSequence");

      const text = await editFile(kind, pathOf("Fox"), (file) => {
        file.document.clips[0]!.name = "edited on disk";
        file.document.clips.push(clip("c2", "added on disk", 1000, 2000));
        file.fps = 24;
        file.width = 1280;
        file.height = 720;
      });
      const report = await reconcile();

      expect(report).toMatchObject({ imported: [timeline.id], invalid: [] });
      const stored = await reload(timeline.id);
      expect(documentIn(stored)).toEqual(
        documentOf(clip("c1", "edited on disk"), clip("c2", "added on disk", 1000, 2000))
      );
      expect(stored).toMatchObject({ fps: 24, width: 1280, height: 720, name: "Fox" });
      // The duration is the end of the last clip, as set_timeline_document
      // computes it. The file still says 1000.
      expect(stored.duration_ms).toBe(3000);
      // The file is left as it was written, and its hash is the row's.
      expect(await textOf(kind, pathOf("Fox"))).toBe(text);
      expect(stored.file_hash).toBe(sha256(text));
      // The previous document exists as a version, with its settings.
      const versions = await versionsOf(timeline.id);
      expect(versions).toHaveLength(1);
      expect(versions[0]).toMatchObject({
        name: TIMELINE_FILE_EDIT_VERSION_NAME,
        save_type: "manual",
        fps: 30,
        width: 1920,
        height: 1080,
        duration_ms: 1000
      });
      expect(JSON.parse(versions[0]!.document)).toEqual(documentOf(clip("c1", "hello")));
      // Open editors reload through the revision check, and are told once.
      expect(stored.revision).toBe(before.revision + 1);
      expect(stored.updated_at > before.updated_at).toBe(true);
      expect(announced).toEqual([timeline.id]);
      // A save that still names the row as it was before the edit is refused.
      expect(
        await TimelineSequence.updateFieldsIfUnchanged(timeline.id, before.updated_at, {
          fps: 60
        })
      ).toBeNull();
      expect(await reconcile()).toMatchObject({ unchanged: 1, imported: [] });
      expect((await reload(timeline.id)).revision).toBe(stored.revision);
    });

    it("hash differs and the file fails validation: keeps the row and records the error", async () => {
      const timeline = await makeTimeline("Fox");
      const before = await reload(timeline.id);

      await folder(kind).write(pathOf("Fox"), "{ not json");
      const report = await reconcile();

      expect(report).toMatchObject({ invalid: [timeline.id], imported: [] });
      const stored = await reload(timeline.id);
      expect(stored.file_error).toMatch(/^The file is not valid JSON/);
      expect(stored.document).toBe(before.document);
      expect(stored.updated_at).toBe(before.updated_at);
      expect(stored.revision).toBe(before.revision);
      expect(stored.file_hash).toBe(before.file_hash);
      expect(await versionsOf(timeline.id)).toHaveLength(0);
      // The file is not overwritten: the edit is the user's to fix.
      expect(await textOf(kind, pathOf("Fox"))).toBe("{ not json");

      // A document of the wrong type is refused the same way.
      const file = { format: "nodetool.timeline", version: 1, id: timeline.id };
      await folder(kind).write(
        pathOf("Fox"),
        JSON.stringify({ ...file, document: "not an object" })
      );
      await reconcile();
      expect((await reload(timeline.id)).file_error).toBe(
        '"document" must be an object'
      );
      // So is a setting that is no positive number.
      await folder(kind).write(
        pathOf("Fox"),
        JSON.stringify({ ...file, fps: -1, document: documentOf(clip("c1", "x")) })
      );
      await reconcile();
      expect((await reload(timeline.id)).file_error).toBe(
        "fps must be a positive number."
      );
      // So is a document the validation of set_timeline_document refuses.
      await folder(kind).write(
        pathOf("Fox"),
        JSON.stringify({
          ...file,
          document: documentOf({ ...clip("c1", "x"), mediaType: "hologram" })
        })
      );
      await reconcile();
      expect((await reload(timeline.id)).file_error).toMatch(
        /^The document has 1 error\nclips\.0\.mediaType: /
      );
      expect((await reload(timeline.id)).revision).toBe(before.revision);
      expect((await reload(timeline.id)).document).toBe(before.document);

      // Fixing the file clears the error and imports it.
      await folder(kind).write(
        pathOf("Fox"),
        JSON.stringify({ ...file, document: documentOf(clip("c1", "fixed")) })
      );
      expect(await reconcile()).toMatchObject({ imported: [timeline.id] });
      const fixed = await reload(timeline.id);
      expect(fixed.file_error).toBeNull();
      expect(documentIn(fixed).clips[0]?.name).toBe("fixed");
      // A file that names no settings keeps the ones the timeline has.
      expect(fixed).toMatchObject({ fps: 30, width: 1920, height: 1080 });
    });

    it("file absent: records that the file is missing and keeps the row", async () => {
      const timeline = await makeTimeline("Fox");
      const before = await reload(timeline.id);

      await folder(kind).delete(pathOf("Fox"));
      const report = await reconcile();

      expect(report).toMatchObject({ missing: [timeline.id], written: [] });
      const stored = await reload(timeline.id);
      expect(stored.file_error).toBe(DOCUMENT_FILE_MISSING);
      expect(stored.document).toBe(before.document);
      expect(stored.revision).toBe(before.revision);
      expect(stored.file_path).toBe(pathOf("Fox"));
      // Nothing is restored behind the user's back.
      expect(await fileNames(kind)).toEqual([]);

      // Saving the timeline in NodeTool writes the file again.
      const saved = await TimelineSequence.updateFieldsIfUnchanged(
        timeline.id,
        stored.updated_at,
        { fps: 25 }
      );
      expect(saved?.file_error).toBeNull();
      expect(await fileNames(kind)).toEqual(["Fox.timeline.json"]);
      expect((await reload(timeline.id)).file_error).toBeNull();
    });

    it("file renamed, same ID: renames the timeline", async () => {
      const timeline = await makeTimeline("Fox");

      await folder(kind).move(pathOf("Fox"), pathOf("Arctic fox"));
      const report = await reconcile();

      expect(report).toMatchObject({
        renamed: [timeline.id],
        created: [],
        reassigned: [],
        missing: []
      });
      const stored = await reload(timeline.id);
      expect(stored.name).toBe("Arctic fox");
      expect(stored.file_path).toBe(pathOf("Arctic fox"));
      expect(stored.file_error).toBeNull();
      expect(await rows()).toHaveLength(1);
      // The rename alone is no change of content.
      expect(await versionsOf(timeline.id)).toHaveLength(0);

      // A file moved to another directory keeps its timeline and its name.
      await folder(kind).move(pathOf("Arctic fox"), "Archive/Arctic fox.timeline.json");
      expect(await reconcile()).toMatchObject({ renamed: [timeline.id] });
      const moved = await reload(timeline.id);
      expect(moved.file_path).toBe("Archive/Arctic fox.timeline.json");
      expect(moved.name).toBe("Arctic fox");
      // A later save writes where the file is.
      await TimelineSequence.updateFieldsIfUnchanged(timeline.id, moved.updated_at, {
        fps: 25
      });
      expect((await jsonOf(kind, "Archive/Arctic fox.timeline.json")).fps).toBe(25);
      expect(await fileNames(kind)).toEqual([]);
    });

    it("new file with an unknown ID: creates the timeline in this project", async () => {
      const id = "0123456789abcdef0123456789abcdef";
      const document = documentOf(clip("c1", "from a file", 0, 4000));
      const text = `${JSON.stringify(
        {
          format: "nodetool.timeline",
          version: 1,
          id,
          fps: 25,
          width: 1080,
          height: 1920,
          duration_ms: 4000,
          document
        },
        null,
        2
      )}\n`;
      await folder(kind).write(pathOf("From git"), text);

      const report = await reconcile();

      expect(report.created).toEqual([id]);
      const created = await reload(id);
      expect(created).toMatchObject({
        user_id: USER,
        project_id: PROJECT,
        name: "From git",
        fps: 25,
        width: 1080,
        height: 1920,
        duration_ms: 4000,
        file_path: pathOf("From git"),
        file_hash: sha256(text),
        file_error: null
      });
      expect(documentIn(created)).toEqual(document);
      // The file keeps its ID and its bytes.
      expect(await textOf(kind, pathOf("From git"))).toBe(text);
      expect(await reconcile()).toMatchObject({ unchanged: 1, created: [] });
      expect(await rows()).toHaveLength(1);

      // A new file that fails validation becomes no timeline.
      await folder(kind).write(
        pathOf("Broken"),
        JSON.stringify({
          format: "nodetool.timeline",
          version: 1,
          document: { tracks: [], clips: [{ id: "c1", mediaType: "bogus" }] }
        })
      );
      expect(await reconcile()).toMatchObject({
        rejected: [pathOf("Broken")],
        created: [],
        reassigned: []
      });
      expect(await rows()).toHaveLength(1);
    });

    it("new file whose ID belongs to another file: assigns a new ID and rewrites the file", async () => {
      const timeline = await makeTimeline("Fox");
      // A copy that was edited afterwards: it cannot be the other half of a move.
      const file = await jsonOf(kind, pathOf("Fox"));
      file.document.clips[0]!.name = "the copy";
      await folder(kind).write(pathOf("Fox copy"), JSON.stringify(file));

      const report = await reconcile();

      expect(report).toMatchObject({ unchanged: 1, created: [], renamed: [] });
      expect(report.reassigned).toHaveLength(1);
      const [copyId] = report.reassigned;
      expect(copyId).not.toBe(timeline.id);
      const copy = await reload(copyId!);
      expect(copy).toMatchObject({ name: "Fox copy", project_id: PROJECT });
      expect(documentIn(copy).clips[0]?.name).toBe("the copy");
      // The file now carries the new ID, in the canonical format.
      const rewritten = await textOf(kind, pathOf("Fox copy"));
      expect((JSON.parse(rewritten) as TimelineFileJson).id).toBe(copyId);
      expect(copy.file_hash).toBe(sha256(rewritten));
      // The original is untouched.
      const original = await reload(timeline.id);
      expect(documentIn(original).clips[0]?.name).toBe("hello");
      expect(original.revision).toBe(timeline.revision);
      expect((await jsonOf(kind, pathOf("Fox"))).id).toBe(timeline.id);
      expect(await reconcile()).toMatchObject({ unchanged: 2, reassigned: [] });
    });

    it("assigns a new ID to a file whose ID belongs to a timeline of another project", async () => {
      const elsewhere = await makeTimeline("Fox", { project_id: OTHER_PROJECT });
      const text = await folder(kind, OTHER_PROJECT).readText(pathOf("Fox"));
      await folder(kind).write(pathOf("Fox"), text ?? "");

      const report = await reconcile();

      expect(report.reassigned).toHaveLength(1);
      expect(report.reassigned[0]).not.toBe(elsewhere.id);
      expect((await reload(elsewhere.id)).project_id).toBe(OTHER_PROJECT);
      expect((await jsonOf(kind, pathOf("Fox"))).id).toBe(report.reassigned[0]);
    });
  });

  describe("editing a timeline file", () => {
    it("collapses the edits made between two reconciles into one version", async () => {
      const timeline = await makeTimeline("Fox");

      for (const name of ["first", "second", "third"]) {
        await editFile(kind, pathOf("Fox"), (file) => {
          file.document.clips[0]!.name = name;
        });
      }
      await reconcile();

      const stored = await reload(timeline.id);
      expect(documentIn(stored).clips[0]?.name).toBe("third");
      expect(stored.revision).toBe(timeline.revision + 1);
      const versions = await versionsOf(timeline.id);
      expect(versions).toHaveLength(1);
      expect(JSON.parse(versions[0]!.document)).toEqual(documentOf(clip("c1", "hello")));
    });

    it("makes no version and raises no revision for an edit that changes no content", async () => {
      const timeline = await makeTimeline("Fox");
      const before = await reload(timeline.id);
      const compact = JSON.stringify(await jsonOf(kind, pathOf("Fox")));

      await folder(kind).write(pathOf("Fox"), compact);
      const report = await reconcile();

      expect(report).toMatchObject({ imported: [], invalid: [] });
      const stored = await reload(timeline.id);
      expect(stored.updated_at).toBe(before.updated_at);
      expect(stored.revision).toBe(before.revision);
      expect(stored.file_hash).toBe(sha256(compact));
      expect(await versionsOf(timeline.id)).toHaveLength(0);
      expect(await reconcile()).toMatchObject({ unchanged: 1 });
    });

    it("stores the document set_timeline_document stores for the same input", async () => {
      const byFile = await makeTimeline("By file");
      const byTool = await makeTimeline("By tool");
      // Written the way a person authors a cut: no bookkeeping fields, an
      // undeclared track, and settings inside the document.
      const authored = {
        fps: 25,
        clips: [
          {
            id: "title",
            trackId: "titles",
            name: "Title",
            startMs: 500,
            durationMs: 1500,
            mediaType: "shape",
            shapeStyle: { kind: "rect", fill: "#00ff00" }
          }
        ]
      };

      const written = (await agentRun(kind).invoke("set_timeline_document", {
        timeline_id: byTool.id,
        document: authored
      })) as Record<string, unknown>;
      expect(written).toMatchObject({ ok: true, written: true });
      await editFile(kind, pathOf("By file"), (file) => {
        // The file states no fps of its own, so the document's applies.
        delete (file as Partial<TimelineFileJson>).fps;
        file.document = authored as unknown as TestDocument;
      });
      expect(await reconcile()).toMatchObject({ imported: [byFile.id], invalid: [] });

      const [file, tool] = [await reload(byFile.id), await reload(byTool.id)];
      expect(documentIn(file)).toEqual(documentIn(tool));
      expect(documentIn(file).tracks).toEqual([
        expect.objectContaining({ id: "titles", index: 0, visible: true, locked: false })
      ]);
      expect(file).toMatchObject({
        fps: tool.fps,
        width: tool.width,
        height: tool.height,
        duration_ms: tool.duration_ms
      });
      expect(file.duration_ms).toBe(2000);
      // A setting beside the document wins over one inside it, as the tool's
      // own parameter does.
      await editFile(kind, pathOf("By file"), (edited) => {
        edited.fps = 60;
        edited.document = authored as unknown as TestDocument;
      });
      await reconcile();
      expect((await reload(byFile.id)).fps).toBe(60);
    });

    it("rejects a document with the errors set_timeline_document gives, and keeps the document", async () => {
      const timeline = await makeTimeline("Fox");
      const before = await reload(timeline.id);
      const broken = documentOf({
        ...clip("c1", "hello"),
        mediaType: "hologram"
      });
      const refused = (await agentRun(kind).invoke("set_timeline_document", {
        timeline_id: timeline.id,
        document: broken
      })) as {
        error: string;
        written: boolean;
        validation: { errors: Array<{ message: string }> };
      };
      expect(refused.written).toBe(false);
      expect(refused.validation.errors.length).toBeGreaterThan(0);
      expect(refused.error).toMatch(/^The document has 1 error and was not written/);

      await editFile(kind, pathOf("Fox"), (file) => {
        file.document = broken;
      });
      const report = await reconcile();

      expect(report).toMatchObject({ invalid: [timeline.id], imported: [] });
      const stored = await reload(timeline.id);
      expect(stored.file_error).toBe(
        [
          "The document has 1 error",
          ...refused.validation.errors.map((issue) => issue.message)
        ].join("\n")
      );
      // The previous document is still the one a render reads.
      expect(stored.document).toBe(before.document);
      expect(stored.updated_at).toBe(before.updated_at);
      expect(stored.revision).toBe(before.revision);
      // Neither the tool nor the file left a version behind.
      expect(await versionsOf(timeline.id)).toHaveLength(0);
    });

    it("keeps an asset reference as the asset's ID", async () => {
      const asset = await Asset.create<Asset>({
        user_id: USER,
        project_id: PROJECT,
        name: "poster.png",
        content_type: "image/png"
      });
      const timeline = await makeTimeline("Fox");

      // A full ID is stored as written.
      await editFile(kind, pathOf("Fox"), (file) => {
        file.document.clips.push(still("c2", asset.id, 1000));
      });
      await reconcile();
      expect(documentIn(await reload(timeline.id)).clips[1]).toMatchObject({
        currentAssetId: asset.id
      });

      // The form the asset tools print becomes the full ID, as it does in
      // set_timeline_document.
      await editFile(kind, pathOf("Fox"), (file) => {
        file.document.clips[1]!.currentAssetId = `asset://${asset.id.slice(0, 12)}.png`;
        file.document.clips[1]!.name = "By short id";
      });
      await reconcile();
      expect(documentIn(await reload(timeline.id)).clips[1]).toMatchObject({
        name: "By short id",
        currentAssetId: asset.id
      });
    });

    it("restores a changed id in a known file", async () => {
      const timeline = await makeTimeline("Fox");

      await editFile(kind, pathOf("Fox"), (file) => {
        file.id = "ffffffffffffffffffffffffffffffff";
        file.document.clips[0]!.name = "edited with a new id";
      });
      const report = await reconcile();

      expect(report).toMatchObject({ imported: [timeline.id], created: [], reassigned: [] });
      expect(await rows()).toHaveLength(1);
      const stored = await reload(timeline.id);
      expect(documentIn(stored).clips[0]?.name).toBe("edited with a new id");
      const rewritten = await textOf(kind, pathOf("Fox"));
      expect((JSON.parse(rewritten) as TimelineFileJson).id).toBe(timeline.id);
      expect(stored.file_hash).toBe(sha256(rewritten));
      expect(await reconcile()).toMatchObject({ unchanged: 1, imported: [] });
    });

    it("gives the same result when an agent edits the file with its file tools", async () => {
      const byHand = await makeTimeline("By hand");
      const byAgent = await makeTimeline("By agent");
      const run = agentRun(kind);

      await editFile(kind, pathOf("By hand"), (file) => {
        file.document.clips[0]!.name = "edited";
      });
      const edited = (await run.invoke("edit_file", {
        path: pathOf("By agent"),
        old_string: '"name": "hello"',
        new_string: '"name": "edited"'
      })) as Record<string, unknown>;
      expect(edited["error"]).toBeUndefined();
      const report = await reconcile();

      expect(report.imported.sort()).toEqual([byHand.id, byAgent.id].sort());
      const [hand, agent] = [await reload(byHand.id), await reload(byAgent.id)];
      expect(agent.document).toBe(hand.document);
      expect(documentIn(agent).clips[0]?.name).toBe("edited");
      expect(agent.revision).toBe(hand.revision);
      expect((await versionsOf(byAgent.id)).map((v) => v.document)).toEqual(
        (await versionsOf(byHand.id)).map((v) => v.document)
      );

      // A file the agent writes from scratch becomes a timeline.
      const written = (await run.invoke("write_file", {
        file_path: pathOf("Agent made"),
        content: JSON.stringify({
          format: "nodetool.timeline",
          version: 1,
          document: documentOf(clip("c1", "made by an agent"))
        })
      })) as Record<string, unknown>;
      expect(written["error"]).toBeUndefined();
      const second = await reconcile();
      expect(second.reassigned).toHaveLength(1);
      const made = await reload(second.reassigned[0]!);
      expect(made).toMatchObject({
        name: "Agent made",
        project_id: PROJECT,
        fps: 30,
        width: 1920,
        height: 1080,
        duration_ms: 1000
      });
      expect((await jsonOf(kind, pathOf("Agent made"))).id).toBe(made.id);

      // A document the tool would refuse is refused for the agent's file too.
      await run.invoke("edit_file", {
        path: pathOf("By agent"),
        old_string: '"mediaType": "shape"',
        new_string: '"mediaType": "hologram"'
      });
      expect(await reconcile()).toMatchObject({ invalid: [byAgent.id] });
      expect((await reload(byAgent.id)).document).toBe(agent.document);
    });
  });

  describe("a file edit NodeTool has not seen", () => {
    const named = (name: string): string =>
      JSON.stringify(documentOf(clip("c1", name)));

    it("keeps the edit as a version when a save replaces the file", async () => {
      // The file changes while no client has the project open, as after a
      // `git pull`, and nothing reconciles it before the next save.
      const timeline = await makeTimeline("Fox");
      await editFile(kind, pathOf("Fox"), (file) => {
        file.document.clips[0]!.name = "pulled from git";
        file.fps = 24;
      });

      const written = (await agentRun(kind).invoke("set_timeline_document", {
        timeline_id: timeline.id,
        document: documentOf(clip("c1", "saved in NodeTool"))
      })) as Record<string, unknown>;
      expect(written).toMatchObject({ ok: true, written: true });

      // The save is stored and written, and the edit it replaced is a version
      // beside the one the tool keeps of the row.
      const stored = await reload(timeline.id);
      expect(documentIn(stored).clips[0]?.name).toBe("saved in NodeTool");
      expect((await jsonOf(kind, pathOf("Fox"))).document.clips[0]?.name).toBe(
        "saved in NodeTool"
      );
      expect(stored.file_hash).toBe(sha256(await textOf(kind, pathOf("Fox"))));
      expect(await versionNames(timeline.id)).toEqual([
        [TIMELINE_FILE_REPLACED_VERSION_NAME, "pulled from git"],
        ["Before set_timeline_document", "hello"]
      ]);
      // The version holds the edit as the file had it, settings included.
      expect((await versionsOf(timeline.id))[0]).toMatchObject({
        fps: 24,
        duration_ms: 1000,
        save_type: "manual"
      });
      expect(await reconcile()).toMatchObject({ unchanged: 1, imported: [] });
    });

    it("keeps the edit when the timeline is renamed or a field outside the file is saved", async () => {
      const renamed = await makeTimeline("Fox");
      const linked = await makeTimeline("Owl");
      await editFile(kind, pathOf("Fox"), (file) => {
        file.document.clips[0]!.name = "fox edit";
      });
      await editFile(kind, pathOf("Owl"), (file) => {
        file.document.clips[0]!.name = "owl edit";
      });

      // A rename writes the new file and deletes the old one.
      await TimelineSequence.updateFieldsIfUnchanged(renamed.id, renamed.updated_at, {
        name: "Arctic fox"
      });
      // The linked workflow is not in the file at all.
      await TimelineSequence.updateFieldsIfUnchanged(linked.id, linked.updated_at, {
        workflow_id: "workflow-1"
      });

      expect(await fileNames(kind)).toEqual([
        "Arctic fox.timeline.json",
        "Owl.timeline.json"
      ]);
      expect(await versionNames(renamed.id)).toEqual([
        [TIMELINE_FILE_REPLACED_VERSION_NAME, "fox edit"]
      ]);
      expect(await versionNames(linked.id)).toEqual([
        [TIMELINE_FILE_REPLACED_VERSION_NAME, "owl edit"]
      ]);
    });

    it("keeps no version when the file holds the row's content in another layout", async () => {
      const timeline = await makeTimeline("Fox");
      const compact = JSON.stringify(await jsonOf(kind, pathOf("Fox")));
      await folder(kind).write(pathOf("Fox"), compact);

      await TimelineSequence.updateFieldsIfUnchanged(timeline.id, timeline.updated_at, {
        workflow_id: "workflow-1"
      });

      expect(await versionNames(timeline.id)).toEqual([]);
      expect((await reload(timeline.id)).file_hash).toBe(
        sha256(await textOf(kind, pathOf("Fox")))
      );
    });

    it("leaves a file that failed validation alone when the timeline is saved", async () => {
      const timeline = await makeTimeline("Fox");
      // The user's edit in progress: a clip of a media type that does not exist.
      const inProgress = await editFile(kind, pathOf("Fox"), (file) => {
        file.document.clips.push({
          ...clip("c2", "draft", 1000),
          mediaType: "hologram"
        });
      });
      expect(await reconcile()).toMatchObject({ invalid: [timeline.id] });
      const refused = await reload(timeline.id);

      const saved = await TimelineSequence.updateFieldsIfUnchanged(
        timeline.id,
        refused.updated_at,
        { document: named("saved in NodeTool") }
      );
      const renamed = await TimelineSequence.updateFieldsIfUnchanged(
        timeline.id,
        saved?.updated_at ?? "",
        { name: "Arctic fox" }
      );

      // The row is saved. The file is the user's, untouched and not renamed.
      expect(renamed).toMatchObject({ name: "Arctic fox", file_path: pathOf("Fox") });
      expect(renamed && documentIn(renamed).clips[0]?.name).toBe("saved in NodeTool");
      expect(await fileNames(kind)).toEqual(["Fox.timeline.json"]);
      expect(await textOf(kind, pathOf("Fox"))).toBe(inProgress);
      const stored = await reload(timeline.id);
      expect(stored.file_error).toBe(refused.file_error);
      expect(stored.file_hash).toBe(timeline.file_hash);
      // The reconcile leaves it alone as well.
      expect(await reconcile()).toMatchObject({ invalid: [timeline.id], written: [] });
      expect(await textOf(kind, pathOf("Fox"))).toBe(inProgress);

      // Once the file is valid it is imported, and the saves made meanwhile
      // are the version.
      await editFile(kind, pathOf("Fox"), (file) => {
        file.document.clips[1]!.mediaType = "shape";
      });
      expect(await reconcile()).toMatchObject({ imported: [timeline.id] });
      const imported = await reload(timeline.id);
      expect(documentIn(imported).clips.map((c) => c.name)).toEqual(["hello", "draft"]);
      expect(imported.file_error).toBeNull();
      expect(await versionNames(timeline.id)).toEqual([
        [TIMELINE_FILE_EDIT_VERSION_NAME, "saved in NodeTool"]
      ]);
    });

    it("records the error of an invalid file that a save finds first", async () => {
      const timeline = await makeTimeline("Fox");
      await folder(kind).write(pathOf("Fox"), "{ half an edit");

      const saved = await TimelineSequence.updateFieldsIfUnchanged(
        timeline.id,
        timeline.updated_at,
        { fps: 25 }
      );

      expect(saved?.file_error).toMatch(/^The file is not valid JSON/);
      expect(await textOf(kind, pathOf("Fox"))).toBe("{ half an edit");
      expect(await reload(timeline.id)).toMatchObject({
        fps: 25,
        file_hash: timeline.file_hash
      });
    });

    it("imports the edit when a host without the sync saved the row as well", async () => {
      const timeline = await makeTimeline("Fox");
      setTimelineFileSync(null);
      await TimelineSequence.updateFieldsIfUnchanged(timeline.id, timeline.updated_at, {
        document: named("from the cli")
      });
      setTimelineFileSync(documentFileSync(timelineFileAdapter));
      const edited = await editFile(kind, pathOf("Fox"), (file) => {
        file.document.clips[0]!.name = "edited on disk";
      });

      const report = await reconcile();

      // The file is not written from the row: it is imported, and what the
      // other host saved is the version.
      expect(report).toMatchObject({ imported: [timeline.id], written: [] });
      expect(await textOf(kind, pathOf("Fox"))).toBe(edited);
      expect(documentIn(await reload(timeline.id)).clips[0]?.name).toBe(
        "edited on disk"
      );
      expect(await versionNames(timeline.id)).toEqual([
        [TIMELINE_FILE_EDIT_VERSION_NAME, "from the cli"]
      ]);
    });

    it("keeps an invalid edit when a host without the sync saved the row as well", async () => {
      const timeline = await makeTimeline("Fox");
      setTimelineFileSync(null);
      await TimelineSequence.updateFieldsIfUnchanged(timeline.id, timeline.updated_at, {
        document: named("from the cli")
      });
      setTimelineFileSync(documentFileSync(timelineFileAdapter));
      await folder(kind).write(pathOf("Fox"), "{ half an edit");

      expect(await reconcile()).toMatchObject({ invalid: [timeline.id], written: [] });

      expect(await textOf(kind, pathOf("Fox"))).toBe("{ half an edit");
      expect(documentIn(await reload(timeline.id)).clips[0]?.name).toBe("from the cli");
    });

    it("renames the file of a timeline that was renamed while the folder was away", async () => {
      const timeline = await makeTimeline("Fox");
      unreachable = true;
      await TimelineSequence.updateFieldsIfUnchanged(timeline.id, timeline.updated_at, {
        name: "Arctic fox"
      });
      unreachable = false;

      expect(await reconcile()).toMatchObject({ written: [timeline.id], renamed: [] });

      expect(await fileNames(kind)).toEqual(["Arctic fox.timeline.json"]);
      expect(await reload(timeline.id)).toMatchObject({
        name: "Arctic fox",
        file_path: pathOf("Arctic fox")
      });
      expect(await reconcile()).toMatchObject({ unchanged: 1, written: [], created: [] });
    });
  });

  describe("duplicating and moving a file", () => {
    it("makes a second timeline with a new ID from a duplicated file", async () => {
      const timeline = await makeTimeline("Fox");
      await folder(kind).copy(pathOf("Fox"), pathOf("Fox copy"));

      // An exact copy first waits to be told apart from a move.
      const first = await reconcile();
      expect(first).toMatchObject({ deferred: [pathOf("Fox copy")], reassigned: [] });
      expect(await rows()).toHaveLength(1);

      passCopyGrace();
      const report = await reconcile();

      expect(report.reassigned).toHaveLength(1);
      const copy = await reload(report.reassigned[0]!);
      expect(copy.id).not.toBe(timeline.id);
      expect(copy).toMatchObject({ name: "Fox copy", project_id: PROJECT });
      expect(copy.document).toBe((await reload(timeline.id)).document);
      expect((await jsonOf(kind, pathOf("Fox copy"))).id).toBe(copy.id);
      expect((await jsonOf(kind, pathOf("Fox"))).id).toBe(timeline.id);
      expect(await rows()).toHaveLength(2);
      expect(await reconcile()).toMatchObject({ unchanged: 2, reassigned: [], deferred: [] });
    });

    it("follows a move seen half done: a copy, then the delete", async () => {
      const timeline = await makeTimeline("Fox");
      await folder(kind).copy(pathOf("Fox"), pathOf("Arctic fox"));

      expect(await reconcile()).toMatchObject({
        deferred: [pathOf("Arctic fox")],
        reassigned: []
      });
      await folder(kind).delete(pathOf("Fox"));
      const report = await reconcile();

      expect(report).toMatchObject({ renamed: [timeline.id], reassigned: [], missing: [] });
      expect(await rows()).toHaveLength(1);
      expect(await reload(timeline.id)).toMatchObject({
        name: "Arctic fox",
        file_path: pathOf("Arctic fox"),
        file_error: null
      });
    });
  });

  describe("version restore", () => {
    it("writes the row and the file and raises revision, so the next reconcile changes nothing", async () => {
      const timeline = await makeTimeline("Fox");
      const run = agentRun(kind);
      await run.invoke("create_timeline_version", {
        timeline_id: timeline.id,
        name: "v1"
      });
      // The second draft is saved through a loaded instance, so the restore
      // is the only write here that takes the conditional update.
      const changed = await reload(timeline.id);
      changed.document = JSON.stringify(
        documentOf(clip("c1", "second draft", 0, 5000))
      );
      changed.duration_ms = 5000;
      changed.fps = 24;
      await changed.save();
      expect(await jsonOf(kind, pathOf("Fox"))).toMatchObject({
        fps: 24,
        duration_ms: 5000
      });

      const restored = (await run.invoke("restore_timeline_version", {
        timeline_id: timeline.id,
        version: 1
      })) as Record<string, unknown>;
      expect(restored).toMatchObject({ ok: true, restored_version: 1 });
      const after = await reload(timeline.id);
      const versions = await versionsOf(timeline.id);

      // The file holds the restored document and the row records its hash.
      const file = await jsonOf(kind, pathOf("Fox"));
      expect(file.document).toEqual(documentOf(clip("c1", "hello")));
      expect(file).toMatchObject({ fps: 30, duration_ms: 1000 });
      expect(after.file_hash).toBe(sha256(await textOf(kind, pathOf("Fox"))));
      // The restore is a write, so open editors reload.
      expect(after.revision).toBe(changed.revision + 1);

      const report = await reconcile();

      expect(report).toMatchObject({ unchanged: 1, imported: [], written: [] });
      const stored = await reload(timeline.id);
      expect(documentIn(stored)).toEqual(documentOf(clip("c1", "hello")));
      expect(stored.fps).toBe(30);
      expect(stored.updated_at).toBe(after.updated_at);
      expect(stored.revision).toBe(after.revision);
      expect((await versionsOf(timeline.id)).map((v) => v.id)).toEqual(
        versions.map((v) => v.id)
      );
    });
  });

  describe("triggers", () => {
    it("imports an edited file on the reconcile the asset triggers schedule", async () => {
      const timeline = await makeTimeline("Fox");
      await editFile(kind, pathOf("Fox"), (file) => {
        file.document.clips[0]!.name = "seen by the trigger";
      });

      scheduleProjectReconcile(PROJECT, USER);
      await flushProjectReconciles();

      const stored = await reload(timeline.id);
      expect(documentIn(stored).clips[0]?.name).toBe("seen by the trigger");
      expect(stored.revision).toBe(timeline.revision + 1);
    });

    it("looks only at the changed paths it is given", async () => {
      const fox = await makeTimeline("Fox");
      const owl = await makeTimeline("Owl");
      await editFile(kind, pathOf("Fox"), (file) => {
        file.document.clips[0]!.name = "fox edit";
      });
      await editFile(kind, pathOf("Owl"), (file) => {
        file.document.clips[0]!.name = "owl edit";
      });
      const list = vi.spyOn(folder(kind), "list");

      const report = await reconcileDocumentFiles(
        [timelineFileAdapter],
        PROJECT,
        USER,
        { paths: [pathOf("Fox")] }
      );

      expect(report).toMatchObject({ files: 1, imported: [fox.id], missing: [] });
      expect(list).not.toHaveBeenCalled();
      expect(documentIn(await reload(owl.id)).clips[0]?.name).toBe("hello");

      // A changed path with nothing at it marks its row missing, and no other.
      await folder(kind).delete(pathOf("Owl"));
      const gone = await reconcileDocumentFiles([timelineFileAdapter], PROJECT, USER, {
        paths: [pathOf("Owl")]
      });
      expect(gone).toMatchObject({ files: 0, missing: [owl.id] });
      expect((await reload(fox.id)).file_error).toBeNull();
    });
  });

  describe("a row whose file is missing", () => {
    it("gets its file back from a changed path alone, and makes no second timeline", async () => {
      const timeline = await makeTimeline("Fox");
      const text = await textOf(kind, pathOf("Fox"));
      await folder(kind).delete(pathOf("Fox"));
      expect(await reconcile()).toMatchObject({ missing: [timeline.id] });

      // The file comes back under another name, and the watcher names only
      // the path that appeared.
      await folder(kind).write(pathOf("Arctic fox"), text);
      const report = await reconcileDocumentFiles(
        [timelineFileAdapter],
        PROJECT,
        USER,
        { paths: [pathOf("Arctic fox")] }
      );

      expect(report).toMatchObject({ renamed: [timeline.id], reassigned: [], created: [] });
      expect(await rows()).toHaveLength(1);
      expect(await reload(timeline.id)).toMatchObject({
        name: "Arctic fox",
        file_path: pathOf("Arctic fox"),
        file_error: null
      });
    });
  });

  describe("migration", () => {
    /** Timelines as a database from before project folders holds them. */
    async function legacyTimelines(names: string[]): Promise<TimelineSequence[]> {
      setTimelineFileSync(null);
      const made: TimelineSequence[] = [];
      for (const name of names) made.push(await makeTimeline(name));
      setTimelineFileSync(documentFileSync(timelineFileAdapter));
      return made;
    }

    it("writes one file per project timeline, and a second run writes nothing", async () => {
      const made = await legacyTimelines(["Fox", "Owl", "Fox"]);
      const elsewhere = await makeTimeline("Elsewhere", { project_id: OTHER_PROJECT });
      expect(await fileNames(kind)).toEqual([]);

      expect(await migrateTimelineFiles()).toBe(3);

      expect(await fileNames(kind)).toEqual([
        "Fox-2.timeline.json",
        "Fox.timeline.json",
        "Owl.timeline.json"
      ]);
      for (const timeline of made) {
        const stored = await reload(timeline.id);
        expect(stored.file_path).not.toBeNull();
        const text = await textOf(kind, stored.file_path ?? "");
        expect((JSON.parse(text) as TimelineFileJson).id).toBe(timeline.id);
        expect(stored.file_hash).toBe(sha256(text));
        // Writing the file is not an edit of the timeline.
        expect(stored.updated_at).toBe(timeline.updated_at);
        expect(stored.revision).toBe(timeline.revision);
      }
      expect(await fileNames(kind, OTHER_PROJECT)).toEqual([
        "Elsewhere.timeline.json"
      ]);
      expect((await reload(elsewhere.id)).file_hash).toBe(elsewhere.file_hash);

      const write = vi.spyOn(folder(kind), "write");
      const writeNew = vi.spyOn(folder(kind), "writeNew");
      expect(await migrateTimelineFiles()).toBe(0);
      expect(write).not.toHaveBeenCalled();
      expect(writeNew).not.toHaveBeenCalled();
      expect(await reconcile()).toMatchObject({ unchanged: 3, written: [], created: [] });
    });

    it("skips a project whose folder is away and writes its files on the next run", async () => {
      await legacyTimelines(["Fox"]);
      unreachable = true;

      expect(await migrateTimelineFiles()).toBe(0);

      unreachable = false;
      expect(await migrateTimelineFiles()).toBe(1);
      expect(await fileNames(kind)).toEqual(["Fox.timeline.json"]);
    });

    it("writes the files of legacy timelines when the project is reconciled", async () => {
      const [fox] = await legacyTimelines(["Fox"]);

      const report = await reconcile();

      expect(report.written).toEqual([fox?.id]);
      expect(await fileNames(kind)).toEqual(["Fox.timeline.json"]);
      expect(await reconcile()).toMatchObject({ unchanged: 1, written: [] });
    });
  });
});

/**
 * File names that differ in case only. The folder is the object store, whose
 * keys keep case apart on every host, so the cases do not depend on the file
 * system the tests run on. `ignoringCase` makes it answer as a macOS or
 * Windows folder does.
 */
describe("timeline file names that differ in case only", () => {
  const kind = "storage";
  beforeEach(() => useFolders(kind));

  describe("a folder that ignores case", () => {
    beforeEach(() => {
      workspaces.set(PROJECT, ignoringCase(kinds[kind](PROJECT)));
    });

    /** Rename the file in case only, as Finder or Explorer does. */
    async function renameInCase(from: string, to: string): Promise<void> {
      const inner = kinds[kind](PROJECT);
      await inner.move(from, to);
    }

    it("follows a rename in case only and makes no second timeline", async () => {
      const timeline = await makeTimeline("Foo");
      await renameInCase(pathOf("Foo"), pathOf("foo"));
      // The old path still reads, which is what made the file look like a copy.
      expect(await folder(kind).exists(pathOf("Foo"))).toBe(true);
      expect(await fileNames(kind)).toEqual(["foo.timeline.json"]);

      const report = await reconcile();

      expect(report).toMatchObject({
        renamed: [timeline.id],
        deferred: [],
        reassigned: [],
        created: []
      });
      expect(await reload(timeline.id)).toMatchObject({
        name: "foo",
        file_path: pathOf("foo"),
        file_error: null
      });

      passCopyGrace();
      expect(await reconcile()).toMatchObject({
        unchanged: 1,
        renamed: [],
        reassigned: [],
        created: []
      });
      expect(await rows()).toHaveLength(1);
      expect((await jsonOf(kind, pathOf("foo"))).id).toBe(timeline.id);
      expect(await versionsOf(timeline.id)).toHaveLength(0);
    });

    it("follows it when the watcher names both paths", async () => {
      const timeline = await makeTimeline("Foo");
      await renameInCase(pathOf("Foo"), pathOf("foo"));

      const report = await reconcileDocumentFiles(
        [timelineFileAdapter],
        PROJECT,
        USER,
        { paths: [pathOf("Foo"), pathOf("foo")] }
      );

      expect(report).toMatchObject({ renamed: [timeline.id], deferred: [], reassigned: [] });
      passCopyGrace();
      expect(
        await reconcileDocumentFiles([timelineFileAdapter], PROJECT, USER, {
          paths: [pathOf("Foo"), pathOf("foo")]
        })
      ).toMatchObject({ unchanged: 1, reassigned: [], created: [] });
      expect(await rows()).toHaveLength(1);
      expect(await reload(timeline.id)).toMatchObject({
        name: "foo",
        file_path: pathOf("foo")
      });
    });

    it("imports an edit made with the rename", async () => {
      const timeline = await makeTimeline("Foo");
      await renameInCase(pathOf("Foo"), pathOf("foo"));
      await editFile(kind, pathOf("foo"), (file) => {
        file.document.clips[0]!.name = "edited too";
      });

      expect(await reconcile()).toMatchObject({
        renamed: [timeline.id],
        imported: [timeline.id],
        reassigned: []
      });
      const stored = await reload(timeline.id);
      expect(documentIn(stored).clips[0]?.name).toBe("edited too");
      expect(stored.revision).toBe(timeline.revision + 1);
      expect(await rows()).toHaveLength(1);
    });
  });

  it("keeps two files that differ in case apart on a folder that does not ignore it", async () => {
    const upper = await makeTimeline("Foo");
    await folder(kind).copy(pathOf("Foo"), pathOf("foo"));

    // Both files are listed, so the second is a copy and waits.
    expect(await reconcile()).toMatchObject({
      unchanged: 1,
      renamed: [],
      deferred: [pathOf("foo")]
    });
    passCopyGrace();
    const report = await reconcile();
    expect(report.reassigned).toHaveLength(1);
    expect(await reload(upper.id)).toMatchObject({ name: "Foo", file_path: pathOf("Foo") });
    expect(await rows()).toHaveLength(2);
  });
});
