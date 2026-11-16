/**
 * Acceptance clauses of the project folders PRD that no other test checks
 * (issue #7625): US2 listing half, US6 documents of a moved asset, US8 last
 * valid workflow, US11 Locate restores asset bytes, US12 what does not travel.
 *
 * Folders are real directories made by this server's own write paths. The
 * reconcile is called directly so no test waits for a watcher.
 */
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Asset,
  JsScript,
  ModelObserver,
  Thread,
  Workflow,
  initTestDb
} from "@nodetool-ai/models";
import { BaseNode, NodeRegistry } from "@nodetool-ai/node-sdk";
import { FileStorageAdapter, InMemoryStorageAdapter, type StorageAdapter } from "@nodetool-ai/storage";
import { ProcessingContext, createLocalWorkspace } from "@nodetool-ai/runtime";
import { UNGATED, createCapabilityRun } from "@nodetool-ai/agents";
import { emptyJsScriptDocument } from "@nodetool-ai/protocol/api-schemas/js-scripts.js";

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
  flushProjectReconciles,
  reconcileProjectIndex
} from "@nodetool-ai/project-services/project-index";
import { writeProjectAssetManifest } from "@nodetool-ai/project-services/project-manifest";
import { reconcileDocumentFiles } from "@nodetool-ai/project-services/document-file-sync";
import {
  setWorkflowFileNodeRegistry,
  workflowFileAdapter
} from "@nodetool-ai/project-services/workflow-file";
import { startHeadlessJob } from "../src/headless-job-runner.js";
import { lookupExternalAssetPath } from "../src/lib/external-asset-lookup.js";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

const createCaller = createCallerFactory(appRouter);
const USER = "1";

function makeCtx(): Context {
  return {
    userId: USER,
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false
  } as Context;
}

const caller = (): ReturnType<typeof createCaller> => createCaller(makeCtx());

/** Writes a file into the run's folder, so a run that started shows. */
class WriteMarker extends BaseNode {
  static readonly nodeType = "test.acceptance.WriteMarker";
  static readonly title = "Write marker";
  static readonly description = "Writes marker.txt into the run's folder";
  static readonly metadataOutputTypes = { output: "str" };

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    if (!context?.workspace) throw new Error("The run has no folder");
    await context.workspace.write("marker.txt", "ran");
    return { output: "ok" };
  }
}

const registry = new NodeRegistry();
registry.register(WriteMarker);

async function solidPng(color: string): Promise<Uint8Array> {
  return new Uint8Array(
    await sharp({
      create: { width: 64, height: 36, channels: 3, background: color }
    })
      .png()
      .toBuffer()
  );
}

let tmpDir: string;
let stores = 0;

function newAssetStore(): void {
  stores++;
  mocks.adapter = new FileStorageAdapter(path.join(tmpDir, `storage-${stores}`), {
    externalPathLookup: lookupExternalAssetPath
  });
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

async function saveStill(projectId: string, name: string, color: string): Promise<Asset> {
  return saveProjectAsset({
    projectId,
    userId: USER,
    name,
    contentType: "image/png",
    bytes: await solidPng(color)
  });
}

beforeEach(async () => {
  initTestDb();
  tmpDir = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "nodetool-pf-acceptance-"))
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

describe("US2: a non-media file of an opened folder", () => {
  it("is listed in Files and is not an asset of the asset browser", async () => {
    const folder = path.join(tmpDir, "Footage Film");
    await fs.mkdir(path.join(folder, "notes"), { recursive: true });
    await fs.writeFile(path.join(folder, "still.png"), await solidPng("#ff0000"));
    await fs.writeFile(path.join(folder, "script.md"), "# Script");
    await fs.writeFile(path.join(folder, "notes", "ideas.txt"), "ideas");

    const project = await caller().projects.openFolder({ path: folder });
    await reconcileProjectIndex(project.id, USER);

    const workspaceId = project.folder?.workspace_id ?? "";
    const files = await caller().workspace.listFiles({ id: workspaceId, path: "." });
    expect(files.map((entry) => entry.name)).toEqual(
      expect.arrayContaining(["still.png", "script.md", "notes"])
    );
    const nested = await caller().workspace.listFiles({ id: workspaceId, path: "notes" });
    expect(nested.map((entry) => entry.name)).toEqual(["ideas.txt"]);

    const listed = await caller().assets.list({ project_id: project.id });
    const names = listed.assets.map((asset) => asset.name);
    expect(names).toContain("still.png");
    expect(names).not.toContain("script.md");
    expect(names).not.toContain("ideas.txt");
    const rows = await Asset.listProjectFiles(USER, project.id);
    expect(rows.map((row) => row.workspace_path)).toEqual(["still.png"]);
  });
});

describe("US6: a document that uses an asset whose file moved", () => {
  it("still renders the asset after the file is moved and renamed outside NodeTool", async () => {
    const project = await caller().projects.create({ name: "Moving Film" });
    const folder = project.folder?.path ?? "";
    const red = await saveStill(project.id, "red", "#ff0000");
    const timeline = await caller().timeline.create({ projectId: project.id, name: "Teaser" });
    await caller().timeline.update({
      id: timeline.id,
      baseUpdatedAt: timeline.updatedAt,
      document: {
        tracks: [
          { id: "v0", name: "Stills", type: "video", index: 0, visible: true, locked: false }
        ],
        clips: [
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
    const before = await Asset.find(USER, red.id);
    expect(before?.workspace_path).toBeTruthy();

    await fs.mkdir(path.join(folder, "Reviewed"), { recursive: true });
    await fs.rename(
      path.join(folder, before?.workspace_path ?? ""),
      path.join(folder, "Reviewed", "red-final.png")
    );
    const report = await reconcileProjectIndex(project.id, USER);

    expect(report.moved).toEqual([red.id]);
    const after = await Asset.find(USER, red.id);
    expect(after?.workspace_path).toBe("Reviewed/red-final.png");
    expect(await bytesOf(after as Asset)).toEqual(await solidPng("#ff0000"));
    const frames = createLocalWorkspace(path.join(tmpDir, "frames"));
    const context = new ProcessingContext({
      jobId: "acceptance-render",
      userId: USER,
      projectId: project.id,
      assetStorage: mocks.adapter,
      storage: new InMemoryStorageAdapter(),
      workspace: frames
    });
    const preview = (await createCapabilityRun({ context, gate: UNGATED }).invoke(
      "preview_timeline_frame",
      { timeline_id: timeline.id, times_ms: [500], width: 160 }
    )) as {
      error?: string;
      frames: Array<{
        layers: Array<{ clip_id: string; skipped?: string }>;
        image: { path: string };
      }>;
    };
    expect(preview.error).toBeUndefined();
    const [frame] = preview.frames;
    expect(frame?.layers.map((layer) => [layer.clip_id, layer.skipped])).toEqual([
      ["still", undefined]
    ]);
    const { data } = await sharp(Buffer.from((await frames.read(frame!.image.path))!))
      .raw()
      .toBuffer({ resolveWithObject: true });
    const middle = (45 * 160 + 80) * (data.length / (160 * 90));
    expect([data[middle], data[middle + 1], data[middle + 2]]).toEqual([255, 0, 0]);
  });
});

describe("US8: a workflow whose file is invalid", () => {
  it("keeps the last valid graph runnable and shows the error on the document", async () => {
    const project = await caller().projects.create({ name: "Hand edited" });
    const folder = project.folder?.path ?? "";
    const workflow = await Workflow.create<Workflow>({
      user_id: USER,
      project_id: project.id,
      name: "Marker",
      graph: { nodes: [{ id: "m", type: WriteMarker.nodeType, data: {} }], edges: [] }
    });
    const file = path.join(folder, "Workflows", "Marker.workflow.json");
    expect((await fs.readFile(file, "utf8")).length).toBeGreaterThan(0);

    await fs.writeFile(file, "{ not json");
    const report = await reconcileDocumentFiles([workflowFileAdapter], project.id, USER);

    expect(report).toMatchObject({ invalid: [workflow.id] });
    const stored = await Workflow.find(USER, workflow.id);
    expect(stored?.file_error).toMatch(/^The file is not valid JSON/);
    expect(stored?.graph.nodes.map((node) => node.type)).toEqual([WriteMarker.nodeType]);

    const result = await startHeadlessJob({ workflowId: workflow.id, userId: USER, registry });

    expect(result).toMatchObject({ status: "completed" });
    expect(await fs.readFile(path.join(folder, "marker.txt"), "utf8")).toBe("ran");
    // The invalid file is the user's to fix, so the run does not overwrite it.
    expect(await fs.readFile(file, "utf8")).toBe("{ not json");
  });
});

describe("US11: Locate after the folder moved", () => {
  it("resolves the bytes of every asset again without a re-import", async () => {
    const project = await caller().projects.create({ name: "Aurora" });
    const oldPath = project.folder?.path ?? "";
    const red = await saveStill(project.id, "red", "#ff0000");
    const green = await saveStill(project.id, "green", "#00ff00");
    await flushProjectReconciles();
    const moved = path.join(tmpDir, "Aurora on another drive");
    await fs.rename(oldPath, moved);

    expect((await caller().projects.get({ id: project.id })).project.folder?.is_accessible).toBe(
      false
    );
    expect(await bytesOf((await Asset.find(USER, red.id)) as Asset)).toBeNull();

    await caller().projects.relocate({ project_id: project.id, path: moved });

    expect(await bytesOf((await Asset.find(USER, red.id)) as Asset)).toEqual(
      await solidPng("#ff0000")
    );
    expect(await bytesOf((await Asset.find(USER, green.id)) as Asset)).toEqual(
      await solidPng("#00ff00")
    );
    const rows = await Asset.listProjectFiles(USER, project.id);
    expect(rows.map((row) => row.id).sort()).toEqual([red.id, green.id].sort());
    expect(rows.every((row) => !row.file_error)).toBe(true);
  });
});

describe("US12: opening a copied folder", () => {
  it("restores the files and leaves chats and database documents behind", async () => {
    const project = await caller().projects.create({ name: "Travelling" });
    const original = project.folder?.path ?? "";
    const still = await saveStill(project.id, "still", "#ff0000");
    await Workflow.create<Workflow>({
      user_id: USER,
      project_id: project.id,
      name: "Travels",
      graph: { nodes: [{ id: "m", type: WriteMarker.nodeType, data: {} }], edges: [] }
    });
    const thread = await Thread.create({ user_id: USER, project_id: project.id, title: "Chat" });
    const script = new JsScript({
      user_id: USER,
      project_id: project.id,
      name: "A script",
      document: JSON.stringify(emptyJsScriptDocument())
    });
    await script.save();
    await flushProjectReconciles();
    await writeProjectAssetManifest(project.id, USER);
    const copy = path.join(tmpDir, "elsewhere", "Travelling");
    await fs.cp(original, copy, { recursive: true });

    // Another machine: an empty database and its own asset store.
    await flushProjectReconciles();
    cancelProjectReconciles();
    initTestDb();
    newAssetStore();
    const opened = await caller().projects.openFolder({ path: copy });
    await reconcileProjectIndex(opened.id, USER);

    expect(opened.id).toBe(project.id);
    expect(await Thread.find(USER, thread.id)).toBeNull();
    expect(await JsScript.findById(script.id)).toBeNull();
    const restored = await Asset.find(USER, still.id);
    expect(restored?.workspace_path).toBeTruthy();
    expect(await bytesOf(restored as Asset)).toEqual(await solidPng("#ff0000"));
    const workflows = await Workflow.paginate(USER, { projectId: project.id, limit: 10 });
    expect(workflows[0].map((row) => row.name)).toEqual(["Travels"]);
  });
});
