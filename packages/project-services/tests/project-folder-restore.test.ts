/**
 * Restoring a project folder that another install wrote (PRD T1, T3, US12):
 * asset rows from `.nodetool/assets.json`, workflows and timelines from their
 * files, an asset whose file is absent, an ID that is taken on this install,
 * and a folder that is a copy of a project on this install.
 *
 * "Another install" is a second, empty database over the same folder. Every
 * case that reads or writes project files runs against a local directory and
 * against a storage-backed folder, through the same `Workspace` interface.
 * The manifest is read as untrusted input, and its cases say what a manifest
 * can and cannot make this install do.
 */
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Asset,
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
  loadSharpOrThrow,
  setProjectFolderResolver,
  type ProjectFolderResolution,
  type Workspace
} from "@nodetool-ai/runtime";
import {
  FileStorageAdapter,
  InMemoryStorageAdapter,
  type StorageAdapter
} from "@nodetool-ai/storage";
import { retrieveAssetBytes } from "@nodetool-ai/asset-services/asset-paths";
import { lookupExternalAssetPath } from "@nodetool-ai/asset-services/external-asset-lookup";
import { saveProjectAsset } from "@nodetool-ai/asset-services/project-asset";
import {
  isProjectAssetOffline,
  partialContentHash
} from "@nodetool-ai/asset-services/project-asset-file";
import { ProjectAssetStorageAdapter } from "@nodetool-ai/asset-services/project-asset-storage";
import { getAssetAdapter } from "@nodetool-ai/asset-services/storage";
import { documentFileSync } from "../src/document-file-sync.js";
import {
  RESTORE_IDS_FILE,
  discardRestoredAssets,
  finishProjectFolderRestore,
  restoreProjectFolder,
  type ProjectFolderRestoreReport
} from "../src/project-folder-restore.js";
import {
  cancelProjectReconciles,
  flushProjectReconciles,
  onProjectFileChanged,
  scanFolder
} from "../src/project-index.js";
import {
  ASSET_MANIFEST_FILE,
  writeProjectAssetManifest,
  type AssetManifest
} from "../src/project-manifest.js";
import { timelineFileAdapter } from "../src/timeline-file.js";
import {
  setWorkflowFileNodeRegistry,
  workflowFileAdapter
} from "../src/workflow-file.js";

vi.mock("@nodetool-ai/asset-services/storage", () => ({
  getAssetAdapter: vi.fn()
}));

const USER = "owner";
const OTHER_USER = "someone-else";
const PROJECT = "11111111111111111111111111111111";
const COPY = "22222222222222222222222222222222";
const WORKFLOW_PATH = "Workflows/Stills.workflow.json";
const TIMELINE_PATH = "Timelines/Teaser.timeline.json";
const KNOWN_NODE = "nodetool.constant.String";
const FULL_ID = /^[0-9a-f]{32}$/;

/** A registry that has one node type. */
const registry = {
  availability: (type: string) =>
    type === KNOWN_NODE ? "executable" : "unknown",
  has: (type: string) => type === KNOWN_NODE,
  getMetadata: () => undefined,
  validateNode: () => []
} as unknown as NodeRegistry;

interface TestNode {
  id: string;
  type: string;
  data: { value: string };
  ui_properties: { position: { x: number; y: number } };
}

function node(id: string, value: string): TestNode {
  return {
    id,
    type: KNOWN_NODE,
    data: { value },
    ui_properties: { position: { x: 40, y: 80 } }
  };
}

const TRACK = {
  id: "v1",
  name: "Video",
  type: "video",
  index: 0,
  visible: true,
  locked: false
};

/** A still that names its media by asset ID. */
function still(id: string, assetId: string, startMs: number): Record<string, unknown> {
  return {
    id,
    trackId: "v1",
    name: "Still",
    startMs,
    durationMs: 1000,
    mediaType: "image",
    currentAssetId: assetId,
    sourceType: "imported",
    status: "generated",
    locked: false,
    versions: []
  };
}

let root: string;
let rawStore: InMemoryStorageAdapter;
let assetStore: StorageAdapter;
let workspaces: Map<string, Workspace>;
let nodetoolDirs: Map<string, Workspace>;
let red: Uint8Array;
let blue: Uint8Array;

const kinds = {
  /** A real directory on this host. */
  local: {
    folder: (projectId: string): Workspace =>
      createLocalWorkspace(join(root, "projects", projectId)),
    nodetoolDir: (projectId: string): Workspace =>
      createLocalWorkspace(join(root, "projects", projectId, ".nodetool"))
  },
  /** A key prefix in the object store the assets live in. */
  storage: {
    folder: (projectId: string): Workspace =>
      createWorkspace(rawStore, { prefix: `workspaces/${USER}/${projectId}` }),
    nodetoolDir: (projectId: string): Workspace =>
      createWorkspace(rawStore, {
        prefix: `workspaces/${USER}/${projectId}/.nodetool`
      })
  }
} as const;
type Kind = keyof typeof kinds;

function folder(kind: Kind, projectId = PROJECT): Workspace {
  let workspace = workspaces.get(projectId);
  if (!workspace) {
    workspace = kinds[kind].folder(projectId);
    workspaces.set(projectId, workspace);
  }
  return workspace;
}

function nodetoolDir(kind: Kind, projectId = PROJECT): Workspace {
  let workspace = nodetoolDirs.get(projectId);
  if (!workspace) {
    workspace = kinds[kind].nodetoolDir(projectId);
    nodetoolDirs.set(projectId, workspace);
  }
  return workspace;
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
      const id = projectId ?? "personal";
      return {
        ok: true,
        projectId: id,
        workspace: folder(kind, id),
        nodetoolDir: nodetoolDir(kind, id)
      };
    }
  );
}

async function solidPng(r: number, g: number, b: number): Promise<Uint8Array> {
  const sharp = await loadSharpOrThrow();
  const png = await sharp({
    create: { width: 16, height: 16, channels: 3, background: { r, g, b } }
  })
    .png()
    .toBuffer();
  return new Uint8Array(png);
}

/** What the first install made in the folder. */
interface Produced {
  fox: Asset;
  snow: Asset;
  workflow: Workflow;
  timeline: TimelineSequence;
}

/**
 * Make a project folder the way an install does: two images in `Generated/`,
 * a workflow and a timeline that use them, and the asset manifest. The
 * workflow names one image by ID and the other by `asset://` locator.
 */
async function produceFolder(projectId = PROJECT): Promise<Produced> {
  const save = (name: string, bytes: Uint8Array): Promise<Asset> =>
    saveProjectAsset({ projectId, userId: USER, name, contentType: "image/png", bytes });
  const fox = await save("fox", red);
  const snow = await save("snow", blue);
  const workflow = await Workflow.create<Workflow>({
    user_id: USER,
    project_id: projectId,
    name: "Stills",
    graph: {
      nodes: [node("a", fox.id), node("b", `asset://${snow.id}.png`)],
      edges: []
    }
  });
  const timeline = await TimelineSequence.create<TimelineSequence>({
    user_id: USER,
    project_id: projectId,
    name: "Teaser",
    duration_ms: 2000,
    document: JSON.stringify({
      tracks: [TRACK],
      clips: [still("c1", fox.id, 0), still("c2", snow.id, 1000)],
      markers: []
    })
  });
  await flushProjectReconciles();
  await writeProjectAssetManifest(projectId, USER);
  return { fox, snow, workflow, timeline };
}

/** A second install: an empty database. The folders stay as they are. */
function emptyDatabase(): void {
  cancelProjectReconciles();
  initTestDb();
}

/** Restore the folder of `projectId` as opening it does, and finish. */
async function restore(
  kind: Kind,
  projectId = PROJECT,
  copyOf: string | null = null
): Promise<ProjectFolderRestoreReport> {
  const report = await restoreProjectFolder({
    userId: USER,
    projectId,
    workspace: folder(kind, projectId),
    nodetoolDir: nodetoolDir(kind, projectId),
    copyOf
  });
  await finishProjectFolderRestore(projectId, USER);
  return report;
}

/** Copy every file of one folder into another, as Finder or `cp -r` does. */
async function copyFolder(kind: Kind, from: string, to: string): Promise<void> {
  for (const path of (await scanFolder(folder(kind, from))).keys()) {
    const bytes = await folder(kind, from).read(path);
    if (bytes) await folder(kind, to).write(path, bytes);
  }
  const manifest = await nodetoolDir(kind, from).readText(ASSET_MANIFEST_FILE);
  if (manifest !== null) {
    await nodetoolDir(kind, to).write(ASSET_MANIFEST_FILE, manifest);
  }
}

/**
 * Every file of the folder with its content. `.nodetool/` is not among them:
 * the indexer rewrites the manifest whenever the index changes.
 */
async function contentsOf(kind: Kind, projectId = PROJECT): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const path of (await scanFolder(folder(kind, projectId))).keys()) {
    const bytes = await folder(kind, projectId).read(path);
    out[path] = Buffer.from(bytes ?? []).toString("latin1");
  }
  return out;
}

async function manifestOf(kind: Kind, projectId = PROJECT): Promise<AssetManifest> {
  const text = await nodetoolDir(kind, projectId).readText(ASSET_MANIFEST_FILE);
  return JSON.parse(text ?? "{}") as AssetManifest;
}

/** Replace the folder's manifest with `assets`, as another machine could. */
async function writeManifest(
  kind: Kind,
  assets: unknown,
  projectId = PROJECT
): Promise<void> {
  await nodetoolDir(kind, projectId).write(
    ASSET_MANIFEST_FILE,
    JSON.stringify({ format: "nodetool.assets", version: 1, assets })
  );
}

async function assetRows(projectId = PROJECT): Promise<Asset[]> {
  const rows = await Asset.listProjectFiles(USER, projectId);
  return rows.sort((a, b) => (a.workspace_path ?? "").localeCompare(b.workspace_path ?? ""));
}

async function bytesOf(asset: Asset): Promise<Uint8Array | null> {
  const bytes = await retrieveAssetBytes(
    assetStore,
    USER,
    asset.id,
    asset.content_type
  );
  return bytes ? new Uint8Array(bytes) : null;
}

async function workflowsOf(projectId = PROJECT): Promise<Workflow[]> {
  return Workflow.listForProjects(USER, [projectId]);
}

async function timelinesOf(projectId = PROJECT): Promise<TimelineSequence[]> {
  return TimelineSequence.listForProjects(USER, [projectId]);
}

/** The values of the workflow's two nodes: the asset references. */
function references(workflow: Workflow): string[] {
  const nodes = workflow.graph.nodes as unknown as TestNode[];
  return nodes.map((item) => item.data.value);
}

/** The asset ID each clip of the timeline names. */
function clipAssets(timeline: TimelineSequence): unknown[] {
  return timeline.toDocument().clips.map((item) => item.currentAssetId);
}

beforeEach(async () => {
  initTestDb();
  root = await mkdtemp(join(tmpdir(), "nodetool-folder-restore-"));
  rawStore = new InMemoryStorageAdapter();
  workspaces = new Map();
  nodetoolDirs = new Map();
  red ??= await solidPng(255, 0, 0);
  blue ??= await solidPng(0, 0, 255);
  setWorkflowFileSync(documentFileSync(workflowFileAdapter));
  setTimelineFileSync(documentFileSync(timelineFileAdapter));
  setWorkflowFileNodeRegistry(() => registry);
});

afterEach(async () => {
  await flushProjectReconciles();
  cancelProjectReconciles();
  ModelObserver.clear();
  setProjectFolderResolver(null);
  setWorkflowFileNodeRegistry(null);
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});

describe.each(["local", "storage"] as const)(
  "restoring a project folder (%s folder)",
  (kind) => {
    beforeEach(() => useFolders(kind));

    describe("a folder whose project is unknown on this install", () => {
      it("creates the asset rows under the IDs and paths the manifest records", async () => {
        const made = await produceFolder();
        emptyDatabase();

        const report = await restore(kind);

        expect([...report.assets].sort()).toEqual([made.fox.id, made.snow.id].sort());
        expect(report.replaced.size).toBe(0);
        expect(report.rewritten).toEqual([]);
        const [fox, snow] = await assetRows();
        expect(fox).toMatchObject({
          id: made.fox.id,
          user_id: USER,
          project_id: PROJECT,
          workspace_path: "Generated/fox.png",
          content_type: "image/png",
          name: "fox.png"
        });
        expect(snow).toMatchObject({
          id: made.snow.id,
          workspace_path: "Generated/snow.png"
        });
        // Each row records the fingerprint of the file as it is here.
        expect(fox!.size).toBe(red.byteLength);
        expect(fox!.metadata).toMatchObject({
          workspace_size: red.byteLength,
          workspace_hash: partialContentHash(red)
        });
        // The IDs resolve to the bytes in the folder.
        expect(isProjectAssetOffline(fox!)).toBe(false);
        expect(await bytesOf(fox!)).toEqual(red);
        expect(await bytesOf(snow!)).toEqual(blue);
        expect(await assetRows()).toHaveLength(2);
      });

      it("creates the workflow and the timeline from their files under their IDs, with references that resolve", async () => {
        const made = await produceFolder();
        const before = await contentsOf(kind);
        emptyDatabase();

        await restore(kind);

        const [workflow] = await workflowsOf();
        expect(workflow).toMatchObject({
          id: made.workflow.id,
          name: "Stills",
          file_path: WORKFLOW_PATH,
          file_error: null
        });
        expect(references(workflow!)).toEqual([
          made.fox.id,
          `asset://${made.snow.id}.png`
        ]);
        const [timeline] = await timelinesOf();
        expect(timeline).toMatchObject({
          id: made.timeline.id,
          name: "Teaser",
          file_path: TIMELINE_PATH,
          file_error: null
        });
        expect(clipAssets(timeline!)).toEqual([made.fox.id, made.snow.id]);
        // Every reference names an asset row of this install.
        for (const id of [made.fox.id, made.snow.id]) {
          expect(await Asset.find(USER, id)).not.toBeNull();
        }
        // No file in the folder was changed to get there.
        expect(await contentsOf(kind)).toEqual(before);
      });

      it("shows an asset whose file is absent as missing and restores the rest", async () => {
        const made = await produceFolder();
        await folder(kind).delete("Generated/snow.png");
        emptyDatabase();

        const report = await restore(kind);

        expect([...report.assets].sort()).toEqual([made.fox.id, made.snow.id].sort());
        const snow = await Asset.find(USER, made.snow.id);
        expect(snow).toMatchObject({ workspace_path: "Generated/snow.png" });
        expect(isProjectAssetOffline(snow!)).toBe(true);
        expect(await bytesOf(snow!)).toBeNull();
        const fox = await Asset.find(USER, made.fox.id);
        expect(isProjectAssetOffline(fox!)).toBe(false);
        expect(await bytesOf(fox!)).toEqual(red);
        expect((await workflowsOf()).map((row) => row.id)).toEqual([made.workflow.id]);
        expect((await timelinesOf()).map((row) => row.id)).toEqual([made.timeline.id]);
        // The file's absence deleted nothing and created nothing in the folder.
        expect(await folder(kind).exists("Generated/snow.png")).toBe(false);
      });

      it("gives a media file the manifest does not list a row of its own", async () => {
        const made = await produceFolder();
        await folder(kind).write("footage/extra.png", await solidPng(0, 255, 0));
        emptyDatabase();

        await restore(kind);

        const rows = await assetRows();
        expect(rows.map((row) => row.workspace_path)).toEqual([
          "footage/extra.png",
          "Generated/fox.png",
          "Generated/snow.png"
        ]);
        expect(rows[0]!.id).toMatch(FULL_ID);
        expect([made.fox.id, made.snow.id]).not.toContain(rows[0]!.id);
        // The manifest is written again and lists the new row too.
        expect((await manifestOf(kind)).assets.map((entry) => entry.id).sort()).toEqual(
          rows.map((row) => row.id).sort()
        );
      });
    });

    describe("an ID that is taken on this install", () => {
      it.each([
        ["another user", OTHER_USER, "their-project"],
        ["another project of the same user", USER, "other-project"]
      ])(
        "gives an asset whose ID belongs to %s a new ID and rewrites the references",
        async (_owner, owner, ownerProject) => {
          const made = await produceFolder();
          const workflowBefore = await folder(kind).readText(WORKFLOW_PATH);
          const timelineBefore = await folder(kind).readText(TIMELINE_PATH);
          emptyDatabase();
          const taken = await Asset.create<Asset>({
            id: made.fox.id,
            user_id: owner,
            project_id: ownerProject,
            name: "Theirs",
            content_type: "image/jpeg",
            metadata: { note: "untouched" }
          });
          const takenRow = { ...taken.toRow() };

          const report = await restore(kind);

          const newId = report.replaced.get(made.fox.id);
          expect(newId).toMatch(FULL_ID);
          expect(newId).not.toBe(made.fox.id);
          expect([...report.replaced.keys()]).toEqual([made.fox.id]);
          // The row that had the ID is exactly as it was.
          const [still] = await Asset.findMany(owner, [made.fox.id]);
          expect(still!.toRow()).toEqual(takenRow);
          // The restored asset has the new ID and the file.
          const fox = await Asset.find(USER, newId!);
          expect(fox).toMatchObject({
            project_id: PROJECT,
            workspace_path: "Generated/fox.png"
          });
          expect(await bytesOf(fox!)).toEqual(red);
          // The asset whose ID was free keeps it.
          expect(await Asset.find(USER, made.snow.id)).toMatchObject({
            workspace_path: "Generated/snow.png"
          });
          // The files and the rows made from them name the new ID.
          expect([...report.rewritten].sort()).toEqual([TIMELINE_PATH, WORKFLOW_PATH]);
          // Nothing else in them changed: same keys, same order, same layout.
          expect(workflowBefore).toContain(made.fox.id);
          expect(await folder(kind).readText(WORKFLOW_PATH)).toBe(
            workflowBefore!.replaceAll(made.fox.id, newId!)
          );
          expect(timelineBefore).toContain(made.fox.id);
          expect(await folder(kind).readText(TIMELINE_PATH)).toBe(
            timelineBefore!.replaceAll(made.fox.id, newId!)
          );
          const [workflow] = await workflowsOf();
          expect(workflow!.id).toBe(made.workflow.id);
          expect(references(workflow!)).toEqual([newId, `asset://${made.snow.id}.png`]);
          const [timeline] = await timelinesOf();
          expect(timeline!.id).toBe(made.timeline.id);
          expect(clipAssets(timeline!)).toEqual([newId, made.snow.id]);
          // The manifest names the IDs this install uses.
          expect((await manifestOf(kind)).assets.map((entry) => entry.id).sort()).toEqual(
            [newId!, made.snow.id].sort()
          );
        }
      );

      it("gives a workflow and a timeline whose IDs another user has new IDs, and leaves that user's rows alone", async () => {
        const made = await produceFolder();
        emptyDatabase();
        const theirWorkflow = await Workflow.create<Workflow>({
          id: made.workflow.id,
          user_id: OTHER_USER,
          project_id: "their-project",
          name: "Theirs",
          graph: { nodes: [node("x", "theirs")], edges: [] }
        });
        const theirTimeline = await TimelineSequence.create<TimelineSequence>({
          id: made.timeline.id,
          user_id: OTHER_USER,
          project_id: "their-project",
          name: "Theirs",
          duration_ms: 0,
          document: JSON.stringify({ tracks: [], clips: [], markers: [] })
        });

        const report = await restore(kind);

        const [workflow] = await workflowsOf();
        expect(workflow!.id).toBe(report.replaced.get(made.workflow.id));
        expect(workflow!.id).not.toBe(made.workflow.id);
        expect(workflow).toMatchObject({ name: "Stills", user_id: USER });
        expect(references(workflow!)).toEqual([
          made.fox.id,
          `asset://${made.snow.id}.png`
        ]);
        const [timeline] = await timelinesOf();
        expect(timeline!.id).toBe(report.replaced.get(made.timeline.id));
        expect(timeline!.id).not.toBe(made.timeline.id);
        expect(clipAssets(timeline!)).toEqual([made.fox.id, made.snow.id]);
        // The other user's documents kept their owner, name and content.
        const [theirs] = [...(await Workflow.getManyByIds([made.workflow.id])).values()];
        expect(theirs).toMatchObject({ user_id: OTHER_USER, name: "Theirs" });
        expect(theirs!.graph).toEqual(theirWorkflow.graph);
        const theirSequence = await TimelineSequence.findById(made.timeline.id);
        expect(theirSequence).toMatchObject({
          user_id: OTHER_USER,
          name: "Theirs",
          document: theirTimeline.document
        });
      });

      it("gives a workflow whose ID is taken while the folder is restored a fresh ID, rewrites its file, and leaves the row that took the ID alone", async () => {
        const made = await produceFolder();
        emptyDatabase();
        await restoreProjectFolder({
          userId: USER,
          projectId: PROJECT,
          workspace: folder(kind),
          nodetoolDir: nodetoolDir(kind),
          copyOf: null
        });
        // The ID was free when the files were read. Another user takes it
        // before the workflow is created, and the lookup that precedes the
        // create does not see it yet.
        const theirs = await Workflow.create<Workflow>({
          id: made.workflow.id,
          user_id: OTHER_USER,
          project_id: "their-project",
          name: "Theirs",
          graph: { nodes: [node("x", "theirs")], edges: [] }
        });
        vi.spyOn(workflowFileAdapter, "exists").mockResolvedValue(false);

        await finishProjectFolderRestore(PROJECT, USER);

        const [workflow] = await workflowsOf();
        expect(workflow!.id).toMatch(FULL_ID);
        expect(workflow!.id).not.toBe(made.workflow.id);
        expect(workflow).toMatchObject({ name: "Stills", user_id: USER, file_error: null });
        expect(references(workflow!)).toEqual([
          made.fox.id,
          `asset://${made.snow.id}.png`
        ]);
        // The file carries the ID the row has.
        const file = JSON.parse((await folder(kind).readText(WORKFLOW_PATH)) ?? "{}") as {
          id: string;
        };
        expect(file.id).toBe(workflow!.id);
        // The row that took the ID is as it was.
        const [kept] = [...(await Workflow.getManyByIds([made.workflow.id])).values()];
        expect(kept).toMatchObject({ user_id: OTHER_USER, name: "Theirs" });
        expect(kept!.graph).toEqual(theirs.graph);
        expect(kept!.updated_at).toBe(theirs.updated_at);
      });
    });

    describe("a folder that is a copy of a project on this install", () => {
      it("becomes a second project that shares no ID with the original, with references inside its own folder", async () => {
        const made = await produceFolder();
        await copyFolder(kind, PROJECT, COPY);
        const original = await contentsOf(kind);

        const report = await restore(kind, COPY, PROJECT);

        // Every asset, the workflow, the timeline and the project ID are new.
        expect(report.replaced.get(PROJECT)).toBe(COPY);
        const copies = await assetRows(COPY);
        expect(copies.map((row) => row.workspace_path)).toEqual([
          "Generated/fox.png",
          "Generated/snow.png"
        ]);
        const [fox, snow] = copies;
        expect(fox!.id).toBe(report.replaced.get(made.fox.id));
        expect(snow!.id).toBe(report.replaced.get(made.snow.id));
        const [workflow] = await workflowsOf(COPY);
        const [timeline] = await timelinesOf(COPY);
        expect(workflow!.id).toBe(report.replaced.get(made.workflow.id));
        expect(timeline!.id).toBe(report.replaced.get(made.timeline.id));
        const originalIds = [
          PROJECT,
          made.fox.id,
          made.snow.id,
          made.workflow.id,
          made.timeline.id
        ];
        const copyIds = [COPY, fox!.id, snow!.id, workflow!.id, timeline!.id];
        for (const id of copyIds) {
          expect(id).toMatch(FULL_ID);
          expect(originalIds).not.toContain(id);
        }
        expect(new Set(copyIds).size).toBe(copyIds.length);

        // The copy's references name the copy's assets, whose files are in
        // the copy's folder.
        expect(references(workflow!)).toEqual([fox!.id, `asset://${snow!.id}.png`]);
        expect(clipAssets(timeline!)).toEqual([fox!.id, snow!.id]);
        expect(await bytesOf(fox!)).toEqual(red);
        expect(await bytesOf(snow!)).toEqual(blue);
        expect(fox!.project_id).toBe(COPY);
        // No file of the copy names an ID of the original.
        const copied = await contentsOf(kind, COPY);
        expect(Object.keys(copied).sort()).toEqual(Object.keys(original).sort());
        const manifestText = await nodetoolDir(kind, COPY).readText(ASSET_MANIFEST_FILE);
        for (const text of [...Object.values(copied), manifestText ?? ""]) {
          for (const id of originalIds) expect(text).not.toContain(id);
        }
        expect((await manifestOf(kind, COPY)).assets.map((entry) => entry.id).sort()).toEqual(
          [fox!.id, snow!.id].sort()
        );

        // The original: rows, references and every file as they were.
        expect(await contentsOf(kind)).toEqual(original);
        expect(
          (await manifestOf(kind)).assets.map((entry) => [entry.id, entry.path])
        ).toEqual([
          [made.fox.id, "Generated/fox.png"],
          [made.snow.id, "Generated/snow.png"]
        ]);
        expect((await assetRows()).map((row) => row.id).sort()).toEqual(
          [made.fox.id, made.snow.id].sort()
        );
        const [originalWorkflow] = await workflowsOf();
        expect(originalWorkflow!.id).toBe(made.workflow.id);
        expect(references(originalWorkflow!)).toEqual([
          made.fox.id,
          `asset://${made.snow.id}.png`
        ]);
        const [originalTimeline] = await timelinesOf();
        expect(clipAssets(originalTimeline!)).toEqual([made.fox.id, made.snow.id]);
      });

      it("a second open after a failed one resolves the references the failed one wrote", async () => {
        await produceFolder();
        await copyFolder(kind, PROJECT, COPY);
        // The first open rewrites the files, then fails later and removes
        // the rows it made, as `adopt` does.
        const failed = await restoreProjectFolder({
          userId: USER,
          projectId: COPY,
          workspace: folder(kind, COPY),
          nodetoolDir: nodetoolDir(kind, COPY),
          copyOf: PROJECT
        });
        expect(failed.rewritten.length).toBeGreaterThan(0);
        await discardRestoredAssets(USER, failed.assets);

        await restore(kind, COPY, PROJECT);

        const copies = await assetRows(COPY);
        const [fox, snow] = copies;
        const [workflow] = await workflowsOf(COPY);
        const [timeline] = await timelinesOf(COPY);
        expect(references(workflow!)).toEqual([fox!.id, `asset://${snow!.id}.png`]);
        expect(clipAssets(timeline!)).toEqual([fox!.id, snow!.id]);
        expect(await bytesOf(fox!)).toEqual(red);
        // The record of written IDs is gone once the open finished.
        expect(await nodetoolDir(kind, COPY).readText(RESTORE_IDS_FILE)).toBeNull();
      });

      it("gives the copy its own asset for a file of the original that the copied manifest leaves out", async () => {
        const made = await produceFolder();
        await copyFolder(kind, PROJECT, COPY);
        const listed = (await manifestOf(kind, COPY)).assets.filter(
          (entry) => entry.id === made.fox.id
        );
        await writeManifest(kind, listed, COPY);

        await restore(kind, COPY, PROJECT);

        const [fox, snow] = await assetRows(COPY);
        expect(snow!.workspace_path).toBe("Generated/snow.png");
        expect(snow!.id).not.toBe(made.snow.id);
        const [workflow] = await workflowsOf(COPY);
        expect(references(workflow!)).toEqual([fox!.id, `asset://${snow!.id}.png`]);
        // The original's asset keeps its row and project.
        expect((await Asset.find(USER, made.snow.id))!.project_id).toBe(PROJECT);
      });

      it("editing a workflow in the copy changes neither the original's file nor its row", async () => {
        const made = await produceFolder();
        await copyFolder(kind, PROJECT, COPY);
        await restore(kind, COPY, PROJECT);
        const originalFile = await folder(kind).readText(WORKFLOW_PATH);
        const [originalBefore] = await workflowsOf();
        const [copy] = await workflowsOf(COPY);

        copy!.graph = { nodes: [node("a", "edited in the copy")], edges: [] } as never;
        await copy!.save();

        // The edit reached the copy's file.
        expect(await folder(kind, COPY).readText(WORKFLOW_PATH)).toContain(
          "edited in the copy"
        );
        // The original's file and row did not change.
        expect(await folder(kind).readText(WORKFLOW_PATH)).toBe(originalFile);
        const [originalAfter] = await workflowsOf();
        expect(originalAfter!.id).toBe(made.workflow.id);
        expect(originalAfter!.graph).toEqual(originalBefore!.graph);
        expect(originalAfter!.updated_at).toBe(originalBefore!.updated_at);
        expect(originalAfter!.file_hash).toBe(originalBefore!.file_hash);
      });
    });

    describe("a manifest is untrusted input", () => {
      it("leaves out entries with a path outside the folder, in .nodetool/, or a directory, and with an ID NodeTool does not generate", async () => {
        await produceFolder();
        emptyDatabase();
        await folder(kind).write("Generated/sub/inner.png", red);
        const id = (n: number): string => String(n).repeat(32);
        await writeManifest(kind, [
          { id: id(1), path: "../outside.png", size: 1, mtime: 1, partial_hash: null },
          { id: id(2), path: "/etc/hostname", size: 1, mtime: 1, partial_hash: null },
          { id: id(3), path: ".nodetool/project.json", size: 1, mtime: 1, partial_hash: null },
          { id: id(4), path: "Generated/../../outside.png", size: 1, mtime: 1, partial_hash: null },
          { id: id(5), path: "Generated/sub", size: 1, mtime: 1, partial_hash: null },
          { id: "image", path: "Generated/fox.png", size: 1, mtime: 1, partial_hash: null },
          { id: `${id(6).slice(0, 31)}Z`, path: "Generated/fox.png", size: 1, mtime: 1, partial_hash: null },
          { id: 7, path: "Generated/fox.png" },
          { id: id(8) },
          "not an entry",
          null,
          // The one entry that is used. Its fingerprint parts are not of
          // their types and read as not recorded.
          { id: id(9), path: "Generated/snow.png", size: "big", mtime: -5, partial_hash: "abc", content_hash: 12 },
          // A second entry for the same ID, and one for the same path.
          { id: id(9), path: "Generated/fox.png", size: 1, mtime: 1, partial_hash: null },
          { id: id(0), path: "Generated/snow.png", size: 1, mtime: 1, partial_hash: null }
        ]);

        const report = await restoreProjectFolder({
          userId: USER,
          projectId: PROJECT,
          workspace: folder(kind),
          nodetoolDir: nodetoolDir(kind),
          copyOf: null
        });

        expect(report.assets).toEqual([id(9)]);
        const rows = await Asset.listProjectFiles(USER, PROJECT);
        expect(rows.map((row) => [row.id, row.workspace_path])).toEqual([
          [id(9), "Generated/snow.png"]
        ]);
        // Not one row of any user names a path outside the folder.
        const all = await Asset.allForMigration();
        expect(all.map((row) => row.workspace_path)).toEqual(["Generated/snow.png"]);
        expect(all[0]!.content_hash).toBeNull();
        expect(all[0]!.metadata).toBeNull();

        // The reconcile then reads the file and records what it finds.
        await finishProjectFolderRestore(PROJECT, USER);
        const snow = await Asset.find(USER, id(9));
        expect(snow!.size).toBe(blue.byteLength);
        expect(await bytesOf(snow!)).toEqual(blue);
      });

      it("never stores a full hash or a fingerprint it did not measure", async () => {
        const made = await produceFolder();
        emptyDatabase();
        const recorded = (await manifestOf(kind)).assets;
        const entryOf = (path: string): AssetManifest["assets"][number] => {
          const entry = recorded.find((item) => item.path === path);
          if (!entry) throw new Error(`no manifest entry for ${path}`);
          return entry;
        };
        const fullHash = (fill: string): string => fill.repeat(64);
        // The fox is as the manifest says. The snow file is not: the manifest
        // names the fox's partial hash for it, and a modification time that
        // would make a file with that fingerprint read as unchanged.
        const snowInfo = await folder(kind).stat("Generated/snow.png");
        await writeManifest(kind, [
          { ...entryOf("Generated/fox.png"), mtime: 5, content_hash: fullHash("a") },
          {
            ...entryOf("Generated/snow.png"),
            mtime: snowInfo!.modifiedAt,
            partial_hash: partialContentHash(red),
            content_hash: fullHash("b")
          }
        ]);
        const refreshed: string[] = [];
        const stop = onProjectFileChanged((asset) => void refreshed.push(asset.id));

        try {
          await restoreProjectFolder({
            userId: USER,
            projectId: PROJECT,
            workspace: folder(kind),
            nodetoolDir: nodetoolDir(kind),
            copyOf: null
          });

          // Before any reconcile: the fox carries what was measured here,
          // with the file's own modification time. A partial hash does not
          // read the middle of a file, so the recorded full hash is not
          // taken: the hash job computes it. The snow file carries nothing
          // from the manifest.
          const foxInfo = await folder(kind).stat("Generated/fox.png");
          const fox = await Asset.find(USER, made.fox.id);
          expect(fox!.metadata).toEqual({
            workspace_size: red.byteLength,
            workspace_mtime: foxInfo!.modifiedAt,
            workspace_hash: partialContentHash(red)
          });
          expect(fox!.content_hash).toBeNull();
          const snow = await Asset.find(USER, made.snow.id);
          expect(snow!.metadata).toBeNull();
          expect(snow!.content_hash).toBeNull();
          expect(snow!.size).toBe(blue.byteLength);

          // The reconcile reads the snow file as changed and leaves the fox.
          await finishProjectFolderRestore(PROJECT, USER);
          expect(refreshed).toEqual([made.snow.id]);
          const reconciled = await Asset.find(USER, made.snow.id);
          expect(reconciled!.metadata).toMatchObject({
            workspace_size: blue.byteLength,
            workspace_hash: partialContentHash(blue)
          });
        } finally {
          stop();
        }
      });

      it("stops, with no rows made, when the folder fails to answer for a manifest path", async () => {
        await produceFolder();
        emptyDatabase();
        const real = folder(kind);
        const stat = real.stat.bind(real);
        vi.spyOn(real, "stat").mockImplementation(async (path) => {
          if (path === "Generated/snow.png") throw new Error("EIO: i/o error");
          return stat(path);
        });

        await expect(
          restoreProjectFolder({
            userId: USER,
            projectId: PROJECT,
            workspace: real,
            nodetoolDir: nodetoolDir(kind),
            copyOf: null
          })
        ).rejects.toThrow(/EIO/);
        expect(await assetRows()).toEqual([]);
      });

      it("opens the folder without its asset IDs when the manifest is not a manifest", async () => {
        const made = await produceFolder();
        emptyDatabase();
        await nodetoolDir(kind).write(ASSET_MANIFEST_FILE, "{ not json");

        const report = await restore(kind);

        expect(report.assets).toEqual([]);
        // The media still gets rows, under new IDs, and the documents open.
        const rows = await assetRows();
        expect(rows.map((row) => row.workspace_path)).toEqual([
          "Generated/fox.png",
          "Generated/snow.png"
        ]);
        expect(rows.map((row) => row.id)).not.toContain(made.fox.id);
        expect((await workflowsOf()).map((row) => row.id)).toEqual([made.workflow.id]);
        expect((await timelinesOf()).map((row) => row.id)).toEqual([made.timeline.id]);
      });

      it("does not replace a string that only looks like a reference when the ID is not one NodeTool generates", async () => {
        await produceFolder();
        // A workflow file another machine wrote with the ID of a node type.
        const file = JSON.parse((await folder(kind).readText(WORKFLOW_PATH)) ?? "{}") as {
          id: string;
        };
        file.id = KNOWN_NODE;
        await folder(kind).write(WORKFLOW_PATH, JSON.stringify(file, null, 2));
        await copyFolder(kind, PROJECT, COPY);

        await restore(kind, COPY, PROJECT);

        // The copy's workflow has a new ID, and its nodes kept their type.
        const [workflow] = await workflowsOf(COPY);
        expect(workflow!.id).toMatch(FULL_ID);
        const types = (workflow!.graph.nodes as unknown as TestNode[]).map(
          (item) => item.type
        );
        expect(types).toEqual([KNOWN_NODE, KNOWN_NODE]);
      });
    });
  }
);

describe("restoring a local project folder", () => {
  beforeEach(() => useFolders("local"));

  it("leaves out a manifest entry whose path is a link that leaves the folder", async () => {
    await produceFolder();
    emptyDatabase();
    const outside = join(root, "outside");
    await mkdir(outside, { recursive: true });
    await writeFile(join(outside, "secret.png"), red);
    const directory = join(root, "projects", PROJECT);
    await symlink(join(outside, "secret.png"), join(directory, "Generated", "link.png"));
    await symlink(outside, join(directory, "linked"));
    await writeManifest("local", [
      { id: "a".repeat(32), path: "Generated/link.png", size: 1, mtime: 1, partial_hash: null },
      { id: "b".repeat(32), path: "linked/secret.png", size: 1, mtime: 1, partial_hash: null }
    ]);

    const report = await restore("local");

    expect(report.assets).toEqual([]);
    expect(report.skipped).toBe(2);
    expect(await Asset.find(USER, "a".repeat(32))).toBeNull();
    expect(await Asset.find(USER, "b".repeat(32))).toBeNull();
    // The linked file is as it was, and no row names it.
    expect(new Uint8Array(await readFile(join(outside, "secret.png")))).toEqual(red);
    const paths = (await Asset.allForMigration()).map((row) => row.workspace_path);
    expect(paths.sort()).toEqual(["Generated/fox.png", "Generated/snow.png"]);
  });
});
