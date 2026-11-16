/**
 * projects.openFolder on a folder that was a project before (PRD T1, US12):
 * a folder copied to another machine, a folder whose project lost its folder,
 * a duplicate of a project that is still here, a media file that did not
 * travel, and an asset ID that is taken on this install.
 *
 * The folders are real directories made by this server's own write paths:
 * `projects.create`, `saveProjectAsset`, the `Workflow` model and the
 * timeline router. "Another machine" is a copy of the directory opened on an
 * empty database with its own asset store. Opening a folder is local-only,
 * so there is no storage-backed case here. The restore itself runs against
 * both folder kinds in `packages/project-services/tests/project-folder-restore.test.ts`.
 */
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Asset,
  ModelObserver,
  Project,
  TimelineSequence,
  Workflow,
  initTestDb
} from "@nodetool-ai/models";
import { BaseNode, NodeRegistry } from "@nodetool-ai/node-sdk";
import { FileStorageAdapter, InMemoryStorageAdapter, type StorageAdapter } from "@nodetool-ai/storage";
import { ProcessingContext, createLocalWorkspace } from "@nodetool-ai/runtime";
import { UNGATED, createCapabilityRun } from "@nodetool-ai/agents";

const mocks = vi.hoisted(() => ({ adapter: null as StorageAdapter | null }));

vi.mock("@nodetool-ai/asset-services/storage", async (orig) => {
  const actual =
    await orig<typeof import("@nodetool-ai/asset-services/storage")>();
  return { ...actual, getAssetAdapter: () => mocks.adapter };
});

import { retrieveAssetBytes } from "@nodetool-ai/asset-services/asset-paths";
import { saveProjectAsset } from "@nodetool-ai/asset-services/project-asset";
import {
  cancelProjectReconciles,
  flushProjectReconciles
} from "@nodetool-ai/project-services/project-index";
import { writeProjectAssetManifest } from "@nodetool-ai/project-services/project-manifest";
import { setWorkflowFileNodeRegistry } from "@nodetool-ai/project-services/workflow-file";
import { startHeadlessJob } from "../src/headless-job-runner.js";
import { lookupExternalAssetPath } from "../src/lib/external-asset-lookup.js";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

const createCaller = createCallerFactory(appRouter);
const USER = "1";
const OTHER_USER = "2";
const FULL_ID = /^[0-9a-f]{32}$/;
const WORKFLOW_FILE = path.join("Workflows", "Reads a still.workflow.json");
const TIMELINE_FILE = path.join("Timelines", "Teaser.timeline.json");

function makeCtx(userId = USER): Context {
  return {
    userId,
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false
  } as Context;
}

const caller = (userId = USER): ReturnType<typeof createCaller> =>
  createCaller(makeCtx(userId));

/**
 * Reads the asset its own node in the stored workflow names and writes the
 * bytes into the run's folder. It works only when the workflow was restored
 * under its ID with a reference that resolves to a file.
 */
class ReadStill extends BaseNode {
  static readonly nodeType = "test.copied.ReadStill";
  static readonly title = "Read still";
  static readonly description = "Copies the asset the node names into the run folder";
  static readonly metadataOutputTypes = { output: "str" };

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    if (!context?.workspace || !context.workflowId || !mocks.adapter) {
      throw new Error("The run has no folder, workflow or asset store");
    }
    const workflow = await Workflow.find(context.userId, context.workflowId);
    const node = workflow?.graph.nodes.find((item) => item.type === ReadStill.nodeType);
    const assetId = String((node?.data as { asset_id?: string })?.asset_id ?? "");
    const bytes = await retrieveAssetBytes(
      mocks.adapter,
      context.userId,
      assetId,
      "image/png"
    );
    if (!bytes) throw new Error(`Asset ${assetId} has no bytes`);
    await context.workspace.write("read-still.png", new Uint8Array(bytes));
    return { output: assetId };
  }
}

const registry = new NodeRegistry();
registry.register(ReadStill);

const TRACK = {
  id: "v1",
  name: "Video",
  type: "video" as const,
  index: 0,
  visible: true,
  locked: false
};

async function solidPng(color: string): Promise<Uint8Array> {
  return new Uint8Array(
    await sharp({
      create: { width: 64, height: 36, channels: 3, background: color }
    })
      .png()
      .toBuffer()
  );
}

/** What the first install made, and where. */
interface Produced {
  projectId: string;
  folder: string;
  red: Asset;
  green: Asset;
  workflowId: string;
  timelineId: string;
}

/**
 * Make a project the way a creator does: two stills in `Generated/`, a
 * workflow that reads the red one, and a timeline with the red still over a
 * blue backdrop. The asset manifest is written as the indexer writes it.
 */
async function produceProject(name = "My Film"): Promise<Produced> {
  const project = await caller().projects.create({ name });
  const folder = project.folder?.path ?? "";
  const save = (assetName: string, bytes: Uint8Array): Promise<Asset> =>
    saveProjectAsset({
      projectId: project.id,
      userId: USER,
      name: assetName,
      contentType: "image/png",
      bytes
    });
  const red = await save("red", await solidPng("#ff0000"));
  const green = await save("green", await solidPng("#00ff00"));
  const workflow = await Workflow.create<Workflow>({
    user_id: USER,
    project_id: project.id,
    name: "Reads a still",
    graph: {
      nodes: [{ id: "read", type: ReadStill.nodeType, data: { asset_id: red.id } }],
      edges: []
    }
  });
  const timeline = await caller().timeline.create({
    projectId: project.id,
    name: "Teaser"
  });
  await caller().timeline.update({
    id: timeline.id,
    baseUpdatedAt: timeline.updatedAt,
    document: {
      tracks: [
        { ...TRACK, id: "v0", name: "Stills" },
        { ...TRACK, index: 1 }
      ],
      clips: [
        {
          id: "backdrop",
          trackId: "v1",
          name: "Backdrop",
          startMs: 0,
          durationMs: 1000,
          mediaType: "shape",
          shapeStyle: { kind: "rect", fill: "#0000ff", x: 0, y: 0, width: 1, height: 1 },
          sourceType: "imported",
          status: "generated",
          locked: false,
          versions: []
        },
        {
          id: "still",
          trackId: "v0",
          name: "Red still",
          startMs: 0,
          durationMs: 1000,
          mediaType: "image",
          currentAssetId: red.id,
          sourceType: "imported",
          status: "generated",
          locked: false,
          versions: []
        }
      ],
      markers: []
    }
  });
  await flushProjectReconciles();
  await writeProjectAssetManifest(project.id, USER);
  return {
    projectId: project.id,
    folder,
    red,
    green,
    workflowId: workflow.id,
    timelineId: timeline.id
  };
}

let tmpDir: string;
let stores = 0;

/** A fresh asset store, as each install has its own. */
function newAssetStore(): void {
  stores++;
  mocks.adapter = new FileStorageAdapter(path.join(tmpDir, `storage-${stores}`), {
    externalPathLookup: lookupExternalAssetPath
  });
}

/** Another machine: an empty database and its own asset store. */
async function anotherMachine(): Promise<void> {
  await flushProjectReconciles();
  cancelProjectReconciles();
  initTestDb();
  newAssetStore();
}

/** Copy a project folder as Finder or `cp -r` does. */
async function copyFolder(from: string, name: string): Promise<string> {
  const to = path.join(tmpDir, "elsewhere", name);
  await fs.cp(from, to, { recursive: true });
  return to;
}

/** Every file under `dir` with its bytes, `.nodetool/assets.json` aside. */
async function filesOf(dir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const entries = await fs.readdir(dir, { recursive: true, withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const file = path.join(entry.parentPath, entry.name);
    const relative = path.relative(dir, file);
    // The indexer rewrites the asset manifest whenever the index changes.
    if (relative === path.join(".nodetool", "assets.json")) continue;
    out[relative] = (await fs.readFile(file)).toString("latin1");
  }
  return out;
}

async function jsonIn<T>(dir: string, file: string): Promise<T> {
  return JSON.parse(await fs.readFile(path.join(dir, file), "utf8")) as T;
}

async function bytesOf(asset: Asset): Promise<Uint8Array | null> {
  if (!mocks.adapter) throw new Error("no asset store");
  const bytes = await retrieveAssetBytes(
    mocks.adapter,
    asset.user_id,
    asset.id,
    asset.content_type
  );
  return bytes ? new Uint8Array(bytes) : null;
}

/** The asset the workflow's node names. */
async function workflowReference(workflowId: string): Promise<unknown> {
  const [workflow] = [...(await Workflow.getManyByIds([workflowId])).values()];
  return (workflow?.graph.nodes[0]?.data as { asset_id?: string })?.asset_id;
}

/** The asset the timeline's still names. */
async function timelineReference(timelineId: string): Promise<unknown> {
  const timeline = await TimelineSequence.findById(timelineId);
  return timeline
    ?.toDocument()
    .clips.find((clip) => clip.id === "still")?.currentAssetId;
}

/** The colour in the middle of the timeline's frame at 500 ms. */
async function renderedMiddle(
  projectId: string,
  timelineId: string
): Promise<{ skipped: unknown[]; rgb: number[] }> {
  const frames = createLocalWorkspace(path.join(tmpDir, `frames-${timelineId}`));
  const context = new ProcessingContext({
    jobId: "copied-folder-render",
    userId: USER,
    projectId,
    assetStorage: mocks.adapter,
    storage: new InMemoryStorageAdapter(),
    workspace: frames
  });
  const preview = (await createCapabilityRun({ context, gate: UNGATED }).invoke(
    "preview_timeline_frame",
    { timeline_id: timelineId, times_ms: [500], width: 160 }
  )) as {
    error?: string;
    complete: boolean;
    frames: Array<{
      layers: Array<{ clip_id: string; skipped?: string }>;
      image: { path: string };
    }>;
  };
  expect(preview.error).toBeUndefined();
  const [frame] = preview.frames;
  const png = await frames.read(frame!.image.path);
  const { data } = await sharp(Buffer.from(png!))
    .raw()
    .toBuffer({ resolveWithObject: true });
  const middle = (45 * 160 + 80) * (data.length / (160 * 90));
  return {
    skipped: frame!.layers.map((layer) => [layer.clip_id, layer.skipped]),
    rgb: [data[middle]!, data[middle + 1]!, data[middle + 2]!]
  };
}

beforeEach(async () => {
  initTestDb();
  tmpDir = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "nodetool-copied-folder-"))
  );
  vi.stubEnv("NODETOOL_ENV", "development");
  vi.stubEnv("NODETOOL_STORAGE_BACKEND", "file");
  vi.stubEnv("NODETOOL_WORKSPACE_STORAGE", "local");
  vi.stubEnv("NODETOOL_LOCAL_FILE_ROOTS", tmpDir);
  vi.stubEnv("PROJECTS_DIR", path.join(tmpDir, "NodeTool"));
  vi.stubEnv("NODETOOL_WORKSPACES_DIR", path.join(tmpDir, "workspaces"));
  stores = 0;
  newAssetStore();
  setWorkflowFileNodeRegistry(() => registry);
});

afterEach(async () => {
  await flushProjectReconciles();
  cancelProjectReconciles();
  setWorkflowFileNodeRegistry(null);
  vi.unstubAllEnvs();
  ModelObserver.clear();
  mocks.adapter = null;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("projects.openFolder on a folder that was a project before", () => {
  describe("the project is unknown on this install", () => {
    it("opens a folder produced on another database: the IDs are the originals, the workflow runs, and the timeline renders its clips", async () => {
      const made = await produceProject();
      const folder = await copyFolder(made.folder, "My Film");
      const before = await filesOf(folder);
      await anotherMachine();

      const project = await caller().projects.openFolder({ path: folder });

      // The folder was brought here by the user: deleting the project keeps
      // it, although it carries the record of the install that created it.
      expect(project).toMatchObject({
        id: made.projectId,
        name: "My Film",
        folder: {
          path: folder,
          origin: "adopted",
          is_accessible: true,
          on_delete: "keep"
        }
      });
      // Asset IDs equal the originals, and each resolves to its file.
      const assets = await Asset.listProjectFiles(USER, project.id);
      expect(assets.map((asset) => [asset.id, asset.workspace_path]).sort()).toEqual(
        [
          [made.red.id, "Generated/red.png"],
          [made.green.id, "Generated/green.png"]
        ].sort()
      );
      const red = await Asset.find(USER, made.red.id);
      expect(await bytesOf(red!)).toEqual(await solidPng("#ff0000"));
      expect((await caller().assets.get({ id: made.green.id })).offline).not.toBe(true);

      // The workflow is there under its ID and runs: its node reads the
      // asset the file names and writes it into the folder.
      const workflows = await Workflow.listForProjects(USER, [project.id]);
      expect(workflows.map((row) => [row.id, row.name, row.file_error])).toEqual([
        [made.workflowId, "Reads a still", null]
      ]);
      const run = await startHeadlessJob({
        workflowId: made.workflowId,
        userId: USER,
        registry
      });
      expect(run.status).toBe("completed");
      expect(
        new Uint8Array(await fs.readFile(path.join(folder, "read-still.png")))
      ).toEqual(await solidPng("#ff0000"));

      // The timeline is there under its ID and renders the still's pixels
      // over the backdrop.
      const timelines = await TimelineSequence.listByProject(project.id, USER);
      expect(timelines.map((row) => [row.id, row.name, row.file_error])).toEqual([
        [made.timelineId, "Teaser", null]
      ]);
      expect(await timelineReference(made.timelineId)).toBe(made.red.id);
      expect(await renderedMiddle(project.id, made.timelineId)).toEqual({
        skipped: [
          ["still", undefined],
          ["backdrop", undefined]
        ],
        rgb: [255, 0, 0]
      });

      // Opening changed no file of the folder. The run added its output.
      const after = await filesOf(folder);
      delete after["read-still.png"];
      expect(after).toEqual(before);
    });

    it("shows a media file that did not travel as missing and opens the rest", async () => {
      const made = await produceProject();
      const folder = await copyFolder(made.folder, "My Film");
      await fs.rm(path.join(folder, "Generated", "green.png"));
      await anotherMachine();

      const project = await caller().projects.openFolder({ path: folder });

      expect(project.id).toBe(made.projectId);
      // The asset is listed under its ID and reports as missing.
      const green = await caller().assets.get({ id: made.green.id });
      expect(green).toMatchObject({ id: made.green.id, offline: true });
      expect(await bytesOf((await Asset.find(USER, made.green.id))!)).toBeNull();
      // The rest of the project is there and works.
      const red = await caller().assets.get({ id: made.red.id });
      expect(red.offline).not.toBe(true);
      expect((await Workflow.listForProjects(USER, [project.id])).map((row) => row.id)).toEqual([
        made.workflowId
      ]);
      const run = await startHeadlessJob({
        workflowId: made.workflowId,
        userId: USER,
        registry
      });
      expect(run.status).toBe("completed");
      expect((await renderedMiddle(project.id, made.timelineId)).rgb).toEqual([255, 0, 0]);
      // Nothing took the missing file's place.
      await expect(fs.stat(path.join(folder, "Generated", "green.png"))).rejects.toThrow();
    });

    it("gives an asset whose ID another user has a new ID, rewrites the references, and leaves that user's asset alone", async () => {
      const made = await produceProject();
      const folder = await copyFolder(made.folder, "My Film");
      await anotherMachine();
      const theirProject = await caller(OTHER_USER).projects.create({ name: "Theirs" });
      const theirs = await Asset.create<Asset>({
        id: made.red.id,
        user_id: OTHER_USER,
        project_id: theirProject.id,
        name: "Their asset",
        content_type: "image/jpeg",
        metadata: { note: "untouched" }
      });
      const theirRow = { ...theirs.toRow() };

      const project = await caller().projects.openFolder({ path: folder });

      // The other user's row is exactly as it was.
      const [kept] = await Asset.findMany(OTHER_USER, [made.red.id]);
      expect(kept!.toRow()).toEqual(theirRow);
      expect(await Asset.find(USER, made.red.id)).toBeNull();
      // The red still has a new ID. The green one keeps its ID.
      const assets = await Asset.listProjectFiles(USER, project.id);
      const red = assets.find((asset) => asset.workspace_path === "Generated/red.png");
      expect(red!.id).toMatch(FULL_ID);
      expect(red!.id).not.toBe(made.red.id);
      expect(assets.map((asset) => asset.id).sort()).toEqual(
        [red!.id, made.green.id].sort()
      );
      // The workflow and the timeline name the new ID, in the file and the row.
      expect(await workflowReference(made.workflowId)).toBe(red!.id);
      expect(await timelineReference(made.timelineId)).toBe(red!.id);
      for (const file of [WORKFLOW_FILE, TIMELINE_FILE]) {
        const text = await fs.readFile(path.join(folder, file), "utf8");
        expect(text).toContain(red!.id);
        expect(text).not.toContain(made.red.id);
      }
      const run = await startHeadlessJob({
        workflowId: made.workflowId,
        userId: USER,
        registry
      });
      expect(run.status).toBe("completed");
      expect((await renderedMiddle(project.id, made.timelineId)).rgb).toEqual([255, 0, 0]);
    });
  });

  describe("the project is here and its recorded folder is gone", () => {
    it("relocates the project and keeps every row and ID", async () => {
      const made = await produceProject();
      const moved = path.join(tmpDir, "Moved Film");
      await fs.rename(made.folder, moved);

      const project = await caller().projects.openFolder({ path: moved });

      expect(project).toMatchObject({
        id: made.projectId,
        folder: { path: moved, origin: "created", is_accessible: true }
      });
      expect((await caller().projects.list({})).map((item) => item.name).sort()).toEqual([
        "My Film",
        "Personal"
      ]);
      await flushProjectReconciles();
      const assets = await Asset.listProjectFiles(USER, project.id);
      expect(assets.map((asset) => asset.id).sort()).toEqual(
        [made.red.id, made.green.id].sort()
      );
      expect((await Workflow.listForProjects(USER, [project.id])).map((row) => row.id)).toEqual([
        made.workflowId
      ]);
      expect(
        (await TimelineSequence.listByProject(project.id, USER)).map((row) => row.id)
      ).toEqual([made.timelineId]);
      expect(await bytesOf((await Asset.find(USER, made.red.id))!)).toEqual(
        await solidPng("#ff0000")
      );
    });
  });

  describe("the project is here and its recorded folder still exists", () => {
    it("opens a duplicate as a second project that shares no ID with the original, each with references inside its own folder", async () => {
      const made = await produceProject();
      const duplicate = await copyFolder(made.folder, "My Film copy");
      const originalFiles = await filesOf(made.folder);

      const project = await caller().projects.openFolder({ path: duplicate });

      // A second project, named after its folder.
      expect(project.id).toMatch(FULL_ID);
      expect(project.id).not.toBe(made.projectId);
      expect(project).toMatchObject({
        name: "My Film copy",
        folder: {
          path: duplicate,
          origin: "adopted",
          is_accessible: true,
          on_delete: "keep"
        }
      });
      expect((await caller().projects.list({})).map((item) => item.name).sort()).toEqual([
        "My Film",
        "My Film copy",
        "Personal"
      ]);
      expect(await jsonIn(duplicate, path.join(".nodetool", "project.json"))).toEqual({
        format: "nodetool.project",
        version: 1,
        id: project.id,
        name: "My Film copy"
      });

      // No ID is shared.
      const assets = await Asset.listProjectFiles(USER, project.id);
      const red = assets.find((asset) => asset.workspace_path === "Generated/red.png");
      const green = assets.find((asset) => asset.workspace_path === "Generated/green.png");
      const [workflow] = await Workflow.listForProjects(USER, [project.id]);
      const [timeline] = await TimelineSequence.listByProject(project.id, USER);
      const originalIds = [
        made.projectId,
        made.red.id,
        made.green.id,
        made.workflowId,
        made.timelineId
      ];
      const duplicateIds = [project.id, red!.id, green!.id, workflow!.id, timeline!.id];
      expect(assets).toHaveLength(2);
      expect(new Set([...originalIds, ...duplicateIds]).size).toBe(10);
      for (const id of duplicateIds) expect(id).toMatch(FULL_ID);
      // No file of the duplicate names an ID of the original, but for the
      // record that NodeTool created the original's folder. That record
      // names the original's project, so it does not apply to the duplicate.
      const duplicateFiles = await filesOf(duplicate);
      const createdRecord = path.join(".nodetool", "created.json");
      expect(JSON.parse(duplicateFiles[createdRecord] ?? "{}")).toMatchObject({
        project_id: made.projectId
      });
      delete duplicateFiles[createdRecord];
      const manifest = await fs.readFile(
        path.join(duplicate, ".nodetool", "assets.json"),
        "utf8"
      );
      for (const text of [...Object.values(duplicateFiles), manifest]) {
        for (const id of originalIds) expect(text).not.toContain(id);
      }
      expect(
        (await jsonIn<{ assets: Array<{ id: string }> }>(
          duplicate,
          path.join(".nodetool", "assets.json")
        )).assets.map((entry) => entry.id).sort()
      ).toEqual([red!.id, green!.id].sort());

      // The duplicate's references resolve inside the duplicate's folder.
      expect(await workflowReference(workflow!.id)).toBe(red!.id);
      expect(await timelineReference(timeline!.id)).toBe(red!.id);
      await fs.writeFile(
        path.join(duplicate, "Generated", "red.png"),
        await solidPng("#ffff00")
      );
      await fs.rm(path.join(duplicate, "read-still.png"), { force: true });
      const duplicateRun = await startHeadlessJob({
        workflowId: workflow!.id,
        userId: USER,
        registry
      });
      expect(duplicateRun.status).toBe("completed");
      expect(
        new Uint8Array(await fs.readFile(path.join(duplicate, "read-still.png")))
      ).toEqual(await solidPng("#ffff00"));

      // The original's references resolve inside the original's folder.
      expect(await workflowReference(made.workflowId)).toBe(made.red.id);
      expect(await timelineReference(made.timelineId)).toBe(made.red.id);
      const originalRun = await startHeadlessJob({
        workflowId: made.workflowId,
        userId: USER,
        registry
      });
      expect(originalRun.status).toBe("completed");
      expect(
        new Uint8Array(await fs.readFile(path.join(made.folder, "read-still.png")))
      ).toEqual(await solidPng("#ff0000"));
      expect((await renderedMiddle(made.projectId, made.timelineId)).rgb).toEqual([255, 0, 0]);

      // The original's rows and files are as they were.
      expect(
        (await Asset.listProjectFiles(USER, made.projectId)).map((asset) => asset.id).sort()
      ).toEqual([made.red.id, made.green.id].sort());
      const originalAfter = await filesOf(made.folder);
      delete originalAfter["read-still.png"];
      expect(originalAfter).toEqual(originalFiles);
      expect((await Project.findOwned(USER, made.projectId))?.name).toBe("My Film");
    });

    it("gives a duplicate's workflow a new ID even when the original no longer has that workflow", async () => {
      const made = await produceProject();
      const duplicate = await copyFolder(made.folder, "My Film copy");
      // The original deletes its workflow after the copy was made, so the
      // ID in the duplicate's file is free on this install.
      const [original] = [...(await Workflow.getManyByIds([made.workflowId])).values()];
      await original!.delete();
      expect((await Workflow.getManyByIds([made.workflowId])).size).toBe(0);

      const project = await caller().projects.openFolder({ path: duplicate });

      const [workflow] = await Workflow.listForProjects(USER, [project.id]);
      expect(workflow!.id).toMatch(FULL_ID);
      expect(workflow!.id).not.toBe(made.workflowId);
      const file = await jsonIn<{ id: string }>(duplicate, WORKFLOW_FILE);
      expect(file.id).toBe(workflow!.id);
    });

    it("editing a workflow in the duplicate changes neither the original's file nor its row", async () => {
      const made = await produceProject();
      const duplicate = await copyFolder(made.folder, "My Film copy");
      const project = await caller().projects.openFolder({ path: duplicate });
      const originalFile = await fs.readFile(path.join(made.folder, WORKFLOW_FILE), "utf8");
      const [originalBefore] = [
        ...(await Workflow.getManyByIds([made.workflowId])).values()
      ];
      const [copy] = await Workflow.listForProjects(USER, [project.id]);

      await caller().workflows.update({
        id: copy!.id,
        name: "Reads a still",
        access: "private",
        graph: {
          nodes: [
            {
              id: "read",
              type: ReadStill.nodeType,
              data: { asset_id: "edited-in-the-duplicate" }
            }
          ],
          edges: []
        }
      });

      // The edit reached the duplicate's file and row.
      expect(await fs.readFile(path.join(duplicate, WORKFLOW_FILE), "utf8")).toContain(
        "edited-in-the-duplicate"
      );
      expect(await workflowReference(copy!.id)).toBe("edited-in-the-duplicate");
      // The original's file and row did not change.
      expect(await fs.readFile(path.join(made.folder, WORKFLOW_FILE), "utf8")).toBe(
        originalFile
      );
      const [originalAfter] = [
        ...(await Workflow.getManyByIds([made.workflowId])).values()
      ];
      expect(originalAfter!.toRow()).toEqual(originalBefore!.toRow());
    });
  });
});
