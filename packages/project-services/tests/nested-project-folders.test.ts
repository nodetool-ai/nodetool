/**
 * A project folder inside another project folder.
 *
 * Personal's managed folder holds `projects/<segment>`, the folder of every
 * cloud project, of every imported project and of every native game. Those
 * folders belong to their own project. The reconcile of the outer folder, its
 * watcher, the hash job, the asset manifest and the document file sync never
 * enter one, and no asset or document of the outer project reads, writes or
 * deletes a file in one.
 *
 * Every case runs against a local directory and against a storage-backed
 * folder (a key prefix in an object store), through the same `Workspace`
 * interface.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Asset,
  DOCUMENT_FILE_MISSING,
  ModelObserver,
  TimelineSequence,
  Workflow,
  initTestDb,
  setTimelineFileSync,
  setWorkflowFileSync
} from "@nodetool-ai/models";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import {
  createLocalWorkspace,
  createWorkspace,
  setProjectFolderResolver,
  type ProjectFolderResolution,
  type Workspace
} from "@nodetool-ai/runtime";
import {
  FileStorageAdapter,
  InMemoryStorageAdapter,
  type StorageAdapter
} from "@nodetool-ai/storage";
import { lookupExternalAssetPath } from "@nodetool-ai/asset-services/external-asset-lookup";
import {
  listProjectDirectories,
  loadProjectDirectoryIndex
} from "@nodetool-ai/asset-services/project-asset-directories";
import {
  ProjectAssetPlacementError,
  ProjectAssetRelinkError,
  deleteProjectAssetFile,
  relinkProjectAsset,
  renameProjectAssetFile,
  saveProjectAsset
} from "@nodetool-ai/asset-services/project-asset";
import {
  isProjectAssetOffline,
  partialContentHash
} from "@nodetool-ai/asset-services/project-asset-file";
import { ProjectAssetStorageAdapter } from "@nodetool-ai/asset-services/project-asset-storage";
import { getAssetAdapter } from "@nodetool-ai/asset-services/storage";
import {
  documentFileSync,
  reconcileDocumentFiles
} from "../src/document-file-sync.js";
import { scanFolder } from "../src/project-folder-scan.js";
import { ProjectHashJob } from "../src/project-hash-job.js";
import {
  cancelProjectReconciles,
  ensureAssetForPath,
  flushProjectReconciles,
  reconcileInBackground,
  reconcileProjectIndex
} from "../src/project-index.js";
import {
  ASSET_MANIFEST_FILE,
  writeProjectAssetManifest,
  type AssetManifest
} from "../src/project-manifest.js";
import {
  ProjectFolderWatchers,
  WATCH_DEBOUNCE_MS,
  type FolderWatchFactory
} from "../src/project-watch.js";
import { timelineFileAdapter } from "../src/timeline-file.js";
import {
  setWorkflowFileNodeRegistry,
  workflowFileAdapter
} from "../src/workflow-file.js";

vi.mock("@nodetool-ai/asset-services/storage", () => ({
  getAssetAdapter: vi.fn()
}));

const USER = "owner";
/** The outer project: Personal, whose folder is the user's managed folder. */
const OUTER = "outer-project";
/** A project whose folder lies inside the outer project's folder. */
const INNER = "inner-project";
/** Where the inner project's folder is, relative to the outer folder. */
const INNER_DIR = `projects/${"a".repeat(64)}`;
/** A game workspace inside the outer folder. It has no `.nodetool/`. */
const GAME_DIR = `projects/${"b".repeat(64)}`;
const KNOWN_NODE = "nodetool.constant.String";
/** A 1x1 PNG. */
const PNG = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64"
  )
);
const text = (value: string): Uint8Array => new TextEncoder().encode(value);

/** A registry that has one node type. */
const registry = {
  availability: (type: string) =>
    type === KNOWN_NODE ? "executable" : "unknown",
  has: (type: string) => type === KNOWN_NODE,
  getMetadata: () => undefined,
  validateNode: () => []
} as unknown as NodeRegistry;

const GRAPH = {
  nodes: [
    {
      id: "a",
      type: KNOWN_NODE,
      data: { value: "hello" },
      ui_properties: { position: { x: 40, y: 80 } }
    }
  ],
  edges: []
};

const TIMELINE_DOCUMENT = JSON.stringify({
  tracks: [
    { id: "v1", name: "Video", type: "video", index: 0, visible: true, locked: false }
  ],
  clips: [
    {
      id: "c1",
      trackId: "v1",
      name: "hello",
      startMs: 0,
      durationMs: 1000,
      mediaType: "shape",
      shapeStyle: { kind: "rect", fill: "#ff0000", x: 0, y: 0, width: 1, height: 1 },
      sourceType: "imported",
      status: "generated",
      locked: false,
      versions: []
    }
  ],
  markers: []
});

let root: string;
let rawStore: InMemoryStorageAdapter;
let assetStore: StorageAdapter;

type Kind = "local" | "storage";

/** The directory or key prefix of a project's folder. */
function locationOf(kind: Kind, projectId: string): string {
  const outer = kind === "local" ? join(root, "outer") : `workspaces/${USER}`;
  if (projectId === OUTER) return outer;
  return kind === "local" ? join(outer, ...INNER_DIR.split("/")) : `${outer}/${INNER_DIR}`;
}

/**
 * The project's folder, built the way the host builds it: the outer folder
 * is told which of its directories the database records as other folders.
 */
function folder(kind: Kind, projectId: string): Workspace {
  const nestedFolders = (): string[] => (projectId === OUTER ? [GAME_DIR] : []);
  const location = locationOf(kind, projectId);
  return kind === "local"
    ? createLocalWorkspace(location, { nestedFolders })
    : createWorkspace(rawStore, { prefix: location, nestedFolders });
}

/** The folder's reserved directory, where NodeTool keeps its own files. */
function nodetoolDir(kind: Kind, projectId: string): Workspace {
  const location = locationOf(kind, projectId);
  return kind === "local"
    ? createLocalWorkspace(join(location, ".nodetool"))
    : createWorkspace(rawStore, { prefix: `${location}/.nodetool` });
}

function useFolders(kind: Kind): void {
  assetStore =
    kind === "local"
      ? new FileStorageAdapter(join(root, "assets"), {
          externalPathLookup: lookupExternalAssetPath
        })
      : new ProjectAssetStorageAdapter(rawStore);
  vi.mocked(getAssetAdapter).mockReturnValue(assetStore);
  setProjectFolderResolver(
    async (projectId): Promise<ProjectFolderResolution> => {
      const id = projectId ?? OUTER;
      return {
        ok: true,
        projectId: id,
        workspace: folder(kind, id),
        nodetoolDir: nodetoolDir(kind, id)
      };
    }
  );
}

/** The inner project's files, by their path in the outer folder. */
interface InnerProject {
  image: Asset;
  workflow: Workflow;
  timeline: TimelineSequence;
  /** Path in the outer folder, to the file's bytes. */
  files: Map<string, Uint8Array>;
}

/** Every file below `directory` of the outer folder, read past every rule. */
async function bytesBelow(
  kind: Kind,
  directory: string
): Promise<Map<string, Uint8Array>> {
  const location = locationOf(kind, OUTER);
  const raw: StorageAdapter =
    kind === "local" ? new FileStorageAdapter(location) : rawStore;
  const prefix = kind === "local" ? directory : `${location}/${directory}`;
  const listing = await raw.list(`${prefix}/`);
  const files = new Map<string, Uint8Array>();
  for (const entry of listing.entries) {
    const bytes = await raw.retrieve(entry.uri);
    if (!bytes) throw new Error(`no bytes at ${entry.key}`);
    const path = kind === "local" ? entry.key : entry.key.slice(location.length + 1);
    files.set(path, new Uint8Array(bytes));
  }
  return files;
}

/**
 * Give the inner project a media file, a workflow file, a timeline file and
 * its `.nodetool/` directory, all written through its own folder.
 */
async function makeInnerProject(kind: Kind): Promise<InnerProject> {
  await nodetoolDir(kind, INNER).write(
    "project.json",
    `${JSON.stringify({ format: "nodetool.project", version: 1, id: INNER, name: "Inner" })}\n`
  );
  const image = await saveProjectAsset({
    projectId: INNER,
    userId: USER,
    name: "fox",
    contentType: "image/png",
    bytes: PNG
  });
  const workflow = await Workflow.create<Workflow>({
    user_id: USER,
    project_id: INNER,
    name: "Fox",
    graph: GRAPH
  });
  const timeline = await TimelineSequence.create<TimelineSequence>({
    user_id: USER,
    project_id: INNER,
    name: "Cut",
    duration_ms: 1000,
    document: TIMELINE_DOCUMENT
  });
  const files = await bytesBelow(kind, INNER_DIR);
  expect([...files.keys()].sort()).toEqual([
    `${INNER_DIR}/.nodetool/project.json`,
    `${INNER_DIR}/Generated/fox.png`,
    `${INNER_DIR}/Timelines/Cut.timeline.json`,
    `${INNER_DIR}/Workflows/Fox.workflow.json`
  ]);
  return { image, workflow, timeline, files };
}

/** The inner project's files and rows are exactly what they were. */
async function expectInnerUntouched(kind: Kind, inner: InnerProject): Promise<void> {
  expect(await bytesBelow(kind, INNER_DIR)).toEqual(inner.files);
  const rows = await Asset.listProjectFiles(USER, INNER);
  expect(rows.map((row) => row.id)).toEqual([inner.image.id]);
  expect(rows[0]).toMatchObject({ workspace_path: "Generated/fox.png" });
  expect(isProjectAssetOffline(rows[0])).toBe(false);
  const workflows = await Workflow.listForProjects(USER, [INNER]);
  expect(workflows.map((row) => row.id)).toEqual([inner.workflow.id]);
  expect(workflows[0]).toMatchObject({
    file_path: "Workflows/Fox.workflow.json",
    file_error: null
  });
  const timelines = await TimelineSequence.listForProjects(USER, [INNER]);
  expect(timelines.map((row) => row.id)).toEqual([inner.timeline.id]);
  expect(timelines[0]).toMatchObject({
    file_path: "Timelines/Cut.timeline.json",
    file_error: null
  });
}

function reconcileDocuments(
  projectId: string,
  paths?: string[]
): ReturnType<typeof reconcileDocumentFiles> {
  return reconcileDocumentFiles(
    [workflowFileAdapter, timelineFileAdapter],
    projectId,
    USER,
    paths ? { paths } : {}
  );
}

/**
 * The rows the outer project got from the inner folder before the scan left
 * it out: one asset per media file and one document per document file, each
 * pointing at the inner project's file.
 */
async function makeRowsOfTheDefect(): Promise<{
  asset: Asset;
  workflow: Workflow;
}> {
  const asset = await Asset.create<Asset>({
    user_id: USER,
    project_id: OUTER,
    name: "fox",
    content_type: "image/png",
    size: PNG.byteLength,
    workspace_path: `${INNER_DIR}/Generated/fox.png`,
    metadata: {
      workspace_size: PNG.byteLength,
      workspace_mtime: 1,
      workspace_hash: partialContentHash(PNG)
    }
  });
  // The model's save hook is off while the row is made, as it writes a file.
  setWorkflowFileSync(null);
  const workflow = await Workflow.create<Workflow>({
    user_id: USER,
    project_id: OUTER,
    name: "Fox",
    graph: GRAPH,
    file_path: `${INNER_DIR}/Workflows/Fox.workflow.json`,
    file_hash: "0".repeat(64)
  });
  setWorkflowFileSync(documentFileSync(workflowFileAdapter));
  return { asset, workflow };
}

beforeEach(async () => {
  initTestDb();
  root = await mkdtemp(join(tmpdir(), "nodetool-nested-folders-"));
  rawStore = new InMemoryStorageAdapter();
  setWorkflowFileSync(documentFileSync(workflowFileAdapter));
  setTimelineFileSync(documentFileSync(timelineFileAdapter));
  setWorkflowFileNodeRegistry(() => registry);
});

afterEach(async () => {
  await flushProjectReconciles();
  cancelProjectReconciles();
  vi.useRealTimers();
  ModelObserver.clear();
  setProjectFolderResolver(null);
  setWorkflowFileSync(null);
  setTimelineFileSync(null);
  setWorkflowFileNodeRegistry(null);
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});

describe.each(["local", "storage"] as const)(
  "a project folder inside another project folder (%s folder)",
  (kind) => {
    beforeEach(() => useFolders(kind));

    describe("a reconcile of the outer folder", () => {
      it("indexes its own media and none of the inner project's", async () => {
        const inner = await makeInnerProject(kind);
        await folder(kind, OUTER).write("Imported/own.png", PNG);

        const report = await reconcileProjectIndex(OUTER, USER);

        expect(report.files).toBe(1);
        const rows = await Asset.listProjectFiles(USER, OUTER);
        expect(rows.map((row) => row.workspace_path)).toEqual(["Imported/own.png"]);
        await expectInnerUntouched(kind, inner);
      });

      it("creates no document from the inner project's workflow and timeline files, and rewrites neither", async () => {
        const inner = await makeInnerProject(kind);

        const report = await reconcileDocuments(OUTER);

        expect(report).toMatchObject({ files: 0, created: [], reassigned: [] });
        expect(await Workflow.listForProjects(USER, [OUTER])).toEqual([]);
        expect(await TimelineSequence.listForProjects(USER, [OUTER])).toEqual([]);
        await expectInnerUntouched(kind, inner);
        // The inner project's own reconcile still finds every file as it left it.
        expect(await reconcileDocuments(INNER)).toMatchObject({
          files: 2,
          unchanged: 2
        });
      });

      it("leaves the inner folder alone on the triggers that run in the background", async () => {
        const inner = await makeInnerProject(kind);

        await reconcileInBackground(OUTER, USER);
        await flushProjectReconciles();

        expect(await Asset.listProjectFiles(USER, OUTER)).toEqual([]);
        expect(await Workflow.listForProjects(USER, [OUTER])).toEqual([]);
        expect(await TimelineSequence.listForProjects(USER, [OUTER])).toEqual([]);
        await expectInnerUntouched(kind, inner);
      });

      it("looks at no changed path that is the inner folder, lies in it, or holds it", async () => {
        const inner = await makeInnerProject(kind);
        const paths = [
          "projects",
          INNER_DIR,
          `${INNER_DIR}/Generated`,
          `${INNER_DIR}/Generated/fox.png`,
          `${INNER_DIR}/Workflows/Fox.workflow.json`,
          `${INNER_DIR}/Timelines/Cut.timeline.json`
        ];

        const report = await reconcileProjectIndex(OUTER, USER, { paths });
        const documents = await reconcileDocuments(OUTER, paths);

        expect(report).toMatchObject({ files: 0, created: [] });
        expect(documents).toMatchObject({ files: 0, created: [], reassigned: [] });
        expect(await Asset.listProjectFiles(USER, OUTER)).toEqual([]);
        expect(await Workflow.listForProjects(USER, [OUTER])).toEqual([]);
        await expectInnerUntouched(kind, inner);
      });

      it("enters no directory the host names as another folder, though it has no .nodetool/", async () => {
        await folder(kind, OUTER).write(`${GAME_DIR}/sprites/hero.png`, PNG);
        await folder(kind, OUTER).write("projects/notes/cover.png", PNG);

        const report = await reconcileProjectIndex(OUTER, USER);

        // A directory that is nobody's folder is still the outer project's.
        expect(report.files).toBe(1);
        const rows = await Asset.listProjectFiles(USER, OUTER);
        expect(rows.map((row) => row.workspace_path)).toEqual([
          "projects/notes/cover.png"
        ]);
      });

      it("scans a directory that only has a file named like the reserved directory", async () => {
        const outer = folder(kind, OUTER);
        await outer.write("Notes/.nodetool.md", "not reserved");
        await outer.write("Notes/my.nodetool", "not reserved");
        await outer.write("Notes/cover.png", PNG);

        expect([...(await scanFolder(outer)).keys()].sort()).toEqual([
          "Notes/.nodetool.md",
          "Notes/cover.png",
          "Notes/my.nodetool"
        ]);
      });
    });

    describe("the directories of the outer project", () => {
      it("list its own and none of the inner project's or the game's", async () => {
        await makeInnerProject(kind);
        const outer = folder(kind, OUTER);
        await outer.write(`${GAME_DIR}/sprites/hero.png`, PNG);
        await outer.write("Imported/Day 1/own.png", PNG);

        const index = await loadProjectDirectoryIndex(USER, OUTER);
        const directories = await listProjectDirectories(index);

        expect(directories.map((directory) => directory.path)).toEqual([
          "Imported",
          "Imported/Day 1",
          "projects"
        ]);
      });
    });

    describe("a file of the inner project", () => {
      it("gets no asset row in the outer project on first use", async () => {
        const inner = await makeInnerProject(kind);

        await expect(
          ensureAssetForPath(OUTER, USER, `${INNER_DIR}/Generated/fox.png`)
        ).rejects.toThrow(/another project/);

        expect(await Asset.listProjectFiles(USER, OUTER)).toEqual([]);
        await expectInnerUntouched(kind, inner);
      });
    });

    describe("a new asset of the outer project", () => {
      it.each([INNER_DIR, `${INNER_DIR}/Generated`, GAME_DIR])(
        "is refused in %s and writes no file there",
        async (directory) => {
          const inner = await makeInnerProject(kind);

          await expect(
            saveProjectAsset({
              projectId: OUTER,
              userId: USER,
              name: "wolf",
              contentType: "image/png",
              bytes: PNG,
              directory
            })
          ).rejects.toBeInstanceOf(ProjectAssetPlacementError);

          expect(await Asset.listProjectFiles(USER, OUTER)).toEqual([]);
          await expectInnerUntouched(kind, inner);
        }
      );

      it("is still saved in a directory that only leads to the inner folder", async () => {
        await makeInnerProject(kind);

        const asset = await saveProjectAsset({
          projectId: OUTER,
          userId: USER,
          name: "wolf",
          contentType: "image/png",
          bytes: PNG,
          directory: "projects"
        });

        expect(asset.workspace_path).toBe("projects/wolf.png");
      });
    });

    describe("rows the outer project already has for the inner project's files", () => {
      it("marks the asset offline and the document's file missing, and touches no byte", async () => {
        const inner = await makeInnerProject(kind);
        const { asset, workflow } = await makeRowsOfTheDefect();

        const report = await reconcileProjectIndex(OUTER, USER);
        const documents = await reconcileDocuments(OUTER);

        expect(report.offline).toEqual([asset.id]);
        const row = await Asset.find(USER, asset.id);
        expect(row && isProjectAssetOffline(row)).toBe(true);
        expect(documents.missing).toEqual([workflow.id]);
        const [document] = await Workflow.listForProjects(USER, [OUTER]);
        expect(document).toMatchObject({
          id: workflow.id,
          file_path: `${INNER_DIR}/Workflows/Fox.workflow.json`,
          file_error: DOCUMENT_FILE_MISSING
        });
        await expectInnerUntouched(kind, inner);
      });

      it("deleting or renaming the asset leaves the inner project's file where it is", async () => {
        const inner = await makeInnerProject(kind);
        const { asset } = await makeRowsOfTheDefect();

        expect(await renameProjectAssetFile(asset, "wolf")).toBeNull();
        expect(await deleteProjectAssetFile(asset)).toBe(false);
        await asset.delete();

        await expectInnerUntouched(kind, inner);
      });

      it("relinks the asset to a file of the outer project, and to none of the inner project's", async () => {
        const inner = await makeInnerProject(kind);
        const { asset } = await makeRowsOfTheDefect();
        await reconcileProjectIndex(OUTER, USER);
        const offline = await Asset.find(USER, asset.id);
        if (!offline) throw new Error("the asset is gone");
        await folder(kind, INNER).write("Generated/wolf.png", PNG);
        inner.files.set(`${INNER_DIR}/Generated/wolf.png`, PNG);
        await folder(kind, OUTER).write("Imported/own.png", PNG);

        await expect(
          relinkProjectAsset(offline, { path: `${INNER_DIR}/Generated/wolf.png` })
        ).rejects.toBeInstanceOf(ProjectAssetRelinkError);
        expect(await relinkProjectAsset(offline, { path: "Imported/own.png" })).toBe(
          true
        );

        const relinked = await Asset.find(USER, asset.id);
        expect(relinked?.workspace_path).toBe("Imported/own.png");
        expect(relinked && isProjectAssetOffline(relinked)).toBe(false);
        expect(await bytesBelow(kind, INNER_DIR)).toEqual(inner.files);
      });

      it("deleting the document leaves the inner project's file where it is", async () => {
        const inner = await makeInnerProject(kind);
        const { workflow } = await makeRowsOfTheDefect();
        // The file carries the ID of the outer project's row, as the defect left it.
        const path = `${INNER_DIR}/Workflows/Fox.workflow.json`;
        const stolen = new TextDecoder()
          .decode(inner.files.get(path))
          .replace(inner.workflow.id, workflow.id);
        await folder(kind, INNER).write("Workflows/Fox.workflow.json", stolen);
        inner.files.set(path, text(stolen));

        await workflow.delete();

        expect(await bytesBelow(kind, INNER_DIR)).toEqual(inner.files);
      });

      it("saving the document writes a file of its own in the outer folder", async () => {
        const inner = await makeInnerProject(kind);
        const { workflow } = await makeRowsOfTheDefect();
        const path = `${INNER_DIR}/Workflows/Fox.workflow.json`;
        const stolen = new TextDecoder()
          .decode(inner.files.get(path))
          .replace(inner.workflow.id, workflow.id);
        await folder(kind, INNER).write("Workflows/Fox.workflow.json", stolen);
        inner.files.set(path, text(stolen));

        workflow.description = "edited in the outer project";
        await workflow.save();

        expect(await bytesBelow(kind, INNER_DIR)).toEqual(inner.files);
        const [document] = await Workflow.listForProjects(USER, [OUTER]);
        expect(document).toMatchObject({
          id: workflow.id,
          file_path: "Workflows/Fox.workflow.json",
          file_error: null
        });
        expect(
          await folder(kind, OUTER).readText("Workflows/Fox.workflow.json")
        ).toContain("edited in the outer project");
      });

      it("the hash job reads no file of the inner project", async () => {
        const inner = await makeInnerProject(kind);
        const { asset } = await makeRowsOfTheDefect();
        // The row records the fingerprint the file has, so only the folder rule stops the job.
        const info = await folder(kind, OUTER).stat(`${INNER_DIR}/Generated/fox.png`);
        asset.metadata = { ...asset.metadata, workspace_mtime: info?.modifiedAt };
        await asset.save();
        const job = new ProjectHashJob();

        job.schedule(OUTER, USER);
        await job.idle();

        expect((await Asset.find(USER, asset.id))?.content_hash).toBeNull();
        await expectInnerUntouched(kind, inner);
      });

      it("the asset manifest of the outer folder lists no file of the inner project", async () => {
        await makeInnerProject(kind);
        await makeRowsOfTheDefect();
        await folder(kind, OUTER).write("Imported/own.png", PNG);
        await reconcileProjectIndex(OUTER, USER);

        await writeProjectAssetManifest(OUTER, USER);

        const manifest = JSON.parse(
          (await nodetoolDir(kind, OUTER).readText(ASSET_MANIFEST_FILE)) ?? "null"
        ) as AssetManifest;
        expect(manifest.assets.map((entry) => entry.path)).toEqual([
          "Imported/own.png"
        ]);
      });
    });
  }
);

describe("the watcher of the outer folder", () => {
  beforeEach(() => {
    useFolders("local");
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  });

  it("starts no reconcile for a change in the inner project's folder", async () => {
    const inner = await makeInnerProject("local");
    let emit: (path: string | null) => void = () => {};
    const factory: FolderWatchFactory = (_directory, onChange) => {
      emit = onChange;
      return { close: () => {} };
    };
    const watchers = new ProjectFolderWatchers(factory);
    await watchers.setOpenProject(Symbol("client"), USER, OUTER);
    await flushProjectReconciles();
    const stat = vi.spyOn(Asset, "listProjectFiles");

    emit(`${INNER_DIR}/Generated/fox.png`);
    emit(`${INNER_DIR}/Workflows/Fox.workflow.json`);
    emit(INNER_DIR);
    await vi.advanceTimersByTimeAsync(WATCH_DEBOUNCE_MS);
    await watchers.flush();

    // A reconcile reads the project's rows. None ran.
    expect(stat).not.toHaveBeenCalled();
    await expectInnerUntouched("local", inner);
    watchers.closeAll();
  });

  it("still reconciles a change in the outer folder's own files", async () => {
    await makeInnerProject("local");
    let emit: (path: string | null) => void = () => {};
    const factory: FolderWatchFactory = (_directory, onChange) => {
      emit = onChange;
      return { close: () => {} };
    };
    const watchers = new ProjectFolderWatchers(factory);
    await watchers.setOpenProject(Symbol("client"), USER, OUTER);
    await flushProjectReconciles();
    await folder("local", OUTER).write("Imported/own.png", PNG);

    emit("Imported/own.png");
    emit(`${INNER_DIR}/Generated/fox.png`);
    await vi.advanceTimersByTimeAsync(WATCH_DEBOUNCE_MS);
    await watchers.flush();

    const rows = await Asset.listProjectFiles(USER, OUTER);
    expect(rows.map((row) => row.workspace_path)).toEqual(["Imported/own.png"]);
    watchers.closeAll();
  });
});
