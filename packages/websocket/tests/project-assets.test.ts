/**
 * Assets are files in the project folder (PRD D2, T3, US3).
 *
 * A workflow run's outputs and `context.createAsset` each leave one file in
 * `Generated/` of the run's project plus one row, the asset's id-based URL
 * serves that file, an asset from before still reads from its legacy key,
 * rename and delete change the file, and an asset id in the form the agent
 * `assets` capability returns resolves to the file's bytes.
 *
 * Every case runs with project folders as local directories and as key
 * prefixes in the object store the assets live in.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync } from "node:fs";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  Asset,
  ModelObserver,
  Workflow,
  initTestDb,
  type Workspace as WorkspaceRow
} from "@nodetool-ai/models";
import { BaseNode, NodeRegistry } from "@nodetool-ai/node-sdk";
import { ProcessingContext } from "@nodetool-ai/runtime";
import {
  FileStorageAdapter,
  InMemoryStorageAdapter,
  type StorageAdapter
} from "@nodetool-ai/storage";
import {
  UNGATED,
  compactResourceIds,
  createCapabilityRun
} from "@nodetool-ai/agents";

const mocks = vi.hoisted(() => ({ adapter: null as StorageAdapter | null }));

vi.mock("@nodetool-ai/asset-services/storage", async (orig) => {
  const actual =
    await orig<typeof import("@nodetool-ai/asset-services/storage")>();
  return { ...actual, getAssetAdapter: () => mocks.adapter };
});

import {
  resolveProjectWorkspace,
  runWorkflow,
  setWorkspaceCloudStorage,
  workspaceFromRow
} from "@nodetool-ai/execution/service";
import { createWorkflowRuntimeEnvironment } from "@nodetool-ai/project-services/workflow-runtime-environment";
import { ProjectAssetStorageAdapter } from "@nodetool-ai/asset-services/project-asset-storage";
import { partialContentHash } from "@nodetool-ai/asset-services/project-asset-file";
import { entityModelInterfaces } from "@nodetool-ai/document-services";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";
import { createStoredAsset } from "../src/lib/asset-model-interface.js";
import { lookupExternalAssetPath } from "../src/lib/external-asset-lookup.js";
import { getAssetStorageKey, retrieveAssetBytes } from "../src/lib/asset-paths.js";
import { toAssetResponse } from "../src/lib/asset-response.js";
import { createStorageHandler } from "../src/storage-api.js";
import {
  projectWithFolder,
  useProjectFolders,
  type ProjectFolderFixture
} from "./project-folder-fixture.js";

const createCaller = createCallerFactory(appRouter);
const USER = "1";

/** A 1x1 PNG, so the thumbnail generator has a real image. */
const PNG = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64"
  )
);
const OTHER = new Uint8Array([9, 8, 7, 6]);

function makeCtx(userId = USER): Context {
  return {
    userId,
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false
  } as Context;
}

/** An object store that signs download URLs, as S3 and Supabase do. */
class ObjectStore extends InMemoryStorageAdapter {
  async createDownloadUrl(uri: string): Promise<string | null> {
    return uri.startsWith("memory://")
      ? `https://bucket.example/${uri.slice("memory://".length)}?signed`
      : null;
  }
}

/** Emits one image, and is saved the way a generative node's output is. */
class FoxImage extends BaseNode {
  static readonly nodeType = "test.assets.FoxImage";
  static readonly title = "Fox image";
  static readonly description = "Outputs one image";
  static readonly metadataOutputTypes = { output: "image" };
  static readonly autoSaveAsset = true;

  async process(): Promise<Record<string, unknown>> {
    return { output: { type: "image", data: PNG, mime_type: "image/png" } };
  }
}

/** Saves an image through `context.createAsset`. */
class SaveFox extends BaseNode {
  static readonly nodeType = "test.assets.SaveFox";
  static readonly title = "Save fox";
  static readonly description = "Saves one image through the context";
  static readonly metadataOutputTypes = { output: "str" };

  async process(context: ProcessingContext): Promise<Record<string, unknown>> {
    const asset = (await context.createAsset({
      name: "fox in snow",
      contentType: "image/png",
      content: PNG
    })) as { id: string };
    return { output: asset.id };
  }
}

let folders: ProjectFolderFixture;
let tmpDir: string;
let storageRoot: string;
/** The store holding objects under raw keys, without the key-miss lookup. */
let rawExists: (key: string) => Promise<boolean>;
let rawKeys: () => Promise<string[]>;
/** Fetch a `get_url` the way a client does. */
let serve: (url: string) => Promise<Uint8Array | null>;

async function namesIn(row: WorkspaceRow): Promise<string[]> {
  const workspace = workspaceFromRow(row);
  if (!workspace) throw new Error("no workspace for row");
  return (await workspace.list("", { recursive: true }))
    .map((entry) => entry.path)
    .sort();
}

async function workflowIn(
  projectId: string,
  nodeType: string,
  title?: string
): Promise<Workflow> {
  return (await Workflow.create({
    user_id: USER,
    name: "Makes a fox",
    project_id: projectId,
    graph: {
      nodes: [
        {
          id: "fox",
          type: nodeType,
          data: {},
          ...(title && { ui_properties: { title } })
        }
      ],
      edges: []
    }
  })) as Workflow;
}

async function run(workflowId: string): Promise<Record<string, unknown>> {
  const registry = new NodeRegistry();
  registry.register(FoxImage);
  registry.register(SaveFox);
  const outcome = await runWorkflow({
    workflowId,
    userId: USER,
    environment: await createWorkflowRuntimeEnvironment(async () => registry),
    resolveWorkspace: resolveProjectWorkspace
  });
  if (outcome.kind !== "payload") {
    throw new Error(`run refused: ${outcome.detail}`);
  }
  return outcome.payload;
}

/** The bytes behind an asset's id key, as plain bytes on every backend. */
async function bytesOf(asset: Asset): Promise<Uint8Array | null> {
  const bytes = await retrieveAssetBytes(
    mocks.adapter!,
    USER,
    asset.id,
    asset.content_type
  );
  return bytes ? new Uint8Array(bytes) : null;
}

/**
 * Run a titled image node in a project and make its asset an entity, which is
 * what the web moves between projects.
 */
async function entityIn(projectId: string, title: string): Promise<Asset> {
  const before = new Set((await assetsOf(projectId)).map((row) => row.id));
  await run((await workflowIn(projectId, FoxImage.nodeType, title)).id);
  const asset = (await assetsOf(projectId)).find((row) => !before.has(row.id));
  if (!asset) throw new Error("the run saved no asset");
  asset.metadata = {
    ...asset.metadata,
    nodetool_entity: { kind: "character", name: title, descriptor: "a fox" }
  };
  await asset.save();
  return asset;
}

async function assetsOf(projectId: string): Promise<Asset[]> {
  return Asset.listByProject(USER, projectId);
}

beforeEach(async () => {
  initTestDb();
  folders = await useProjectFolders([USER]);
  tmpDir = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "project-assets-"))
  );
  storageRoot = path.join(tmpDir, "storage");
  vi.stubEnv("NODETOOL_ENV", "development");
  vi.stubEnv("NODETOOL_STORAGE_BACKEND", "file");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  ModelObserver.clear();
  setWorkspaceCloudStorage(null);
  mocks.adapter = null;
  await folders.cleanup();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe.each(["local", "cloud"] as const)(
  "assets as files in the project folder (%s)",
  (mode) => {
    beforeEach(async () => {
      vi.stubEnv("NODETOOL_WORKSPACE_STORAGE", mode);
      if (mode === "local") {
        const adapter = new FileStorageAdapter(storageRoot, {
          externalPathLookup: lookupExternalAssetPath
        });
        mocks.adapter = adapter;
        setWorkspaceCloudStorage(null);
        const handler = createStorageHandler({ storagePath: storageRoot });
        rawExists = async (key) => existsSync(path.join(storageRoot, key));
        rawKeys = async () =>
          (await adapter.list("")).entries.map((entry) => entry.key);
        serve = async (url) => {
          const response = await handler(
            new Request(`http://localhost${url}`, {
              headers: { "x-user-id": USER }
            })
          );
          return response.status === 200
            ? new Uint8Array(await response.arrayBuffer())
            : null;
        };
      } else {
        // The server hands project folders the asset store itself, so one
        // bucket holds both. `initWorkspaceStorage` does the same.
        const store = new ObjectStore();
        const adapter = new ProjectAssetStorageAdapter(store);
        mocks.adapter = adapter;
        setWorkspaceCloudStorage(adapter);
        rawExists = (key) => store.exists(store.uriForKey(key));
        rawKeys = async () =>
          (await store.list("")).entries.map((entry) => entry.key);
        // A signed URL names one object, and the bucket answers with it.
        serve = async (url) => {
          const key = decodeURIComponent(
            new URL(url, "http://localhost").pathname.replace(
              /^\/api\/storage\//,
              ""
            )
          );
          return store.retrieve(store.uriForKey(key));
        };
      }
    });

    it("a workflow run in project A leaves exactly one new file, Generated/fox-in-snow.png, and no object under the legacy key", async () => {
      const a = await projectWithFolder(USER, "Film A");
      const b = await projectWithFolder(USER, "Film B");
      const workflow = await workflowIn(a.project.id, FoxImage.nodeType, "fox in snow");
      const before = await namesIn(a.folder);

      const payload = await run(workflow.id);

      expect(payload["status"]).toBe("completed");
      expect(before).toEqual([]);
      expect(await namesIn(a.folder)).toEqual(["Generated/fox-in-snow.png"]);
      expect(await namesIn(b.folder)).toEqual([]);

      const [asset, ...rest] = await assetsOf(a.project.id);
      expect(rest).toEqual([]);
      expect(asset).toMatchObject({
        project_id: a.project.id,
        workspace_path: "Generated/fox-in-snow.png",
        name: "fox in snow",
        workflow_id: workflow.id,
        node_id: "fox",
        size: PNG.byteLength
      });
      expect(asset!.metadata).toMatchObject({
        workspace_size: PNG.byteLength,
        workspace_hash: partialContentHash(PNG)
      });
      expect(
        await rawExists(getAssetStorageKey(USER, asset!.id, asset!.content_type))
      ).toBe(false);
      // Only the thumbnail is in the asset store, beside the folder's file.
      expect(await rawExists(`${USER}/${asset!.id}_thumb.jpg`)).toBe(true);
      expect(
        (await rawKeys()).filter(
          (key) => key.startsWith(`${USER}/`) && !key.endsWith("_thumb.jpg")
        )
      ).toEqual([]);
    });

    it("the row's id-based URL serves the file's bytes", async () => {
      const a = await projectWithFolder(USER, "Film A");
      const workflow = await workflowIn(a.project.id, FoxImage.nodeType, "fox in snow");
      await run(workflow.id);
      const [asset] = await assetsOf(a.project.id);

      const response = await toAssetResponse(asset!);

      expect(response.get_url).toBeTruthy();
      expect(await serve(response.get_url!)).toEqual(PNG);
      expect(
        await bytesOf(asset!)
      ).toEqual(PNG);
      if (mode === "local") {
        // The URL carries the asset's id, never the file's path.
        expect(response.get_url).toBe(`/api/storage/${USER}/${asset!.id}.png`);
      } else {
        // An object store signs one object, so the URL names the file's own.
        expect(response.get_url).toContain("Generated/fox-in-snow.png");
      }
    });

    it("a second output with the same name gets a suffixed file and its own row", async () => {
      const a = await projectWithFolder(USER, "Film A");
      const workflow = await workflowIn(a.project.id, FoxImage.nodeType, "fox in snow");

      await run(workflow.id);
      await run(workflow.id);

      expect(await namesIn(a.folder)).toEqual([
        "Generated/fox-in-snow-2.png",
        "Generated/fox-in-snow.png"
      ]);
      const rows = await assetsOf(a.project.id);
      expect(rows.map((row) => row.workspace_path).sort()).toEqual([
        "Generated/fox-in-snow-2.png",
        "Generated/fox-in-snow.png"
      ]);
      expect(new Set(rows.map((row) => row.id)).size).toBe(2);
    });

    it("an output of a node with no title is named after its kind and node", async () => {
      const a = await projectWithFolder(USER, "Film A");
      const workflow = await workflowIn(a.project.id, FoxImage.nodeType);

      await run(workflow.id);

      expect(await namesIn(a.folder)).toEqual(["Generated/image_fox.png"]);
    });

    it("context.createAsset in a run saves into the run's project folder", async () => {
      const a = await projectWithFolder(USER, "Film A");
      const b = await projectWithFolder(USER, "Film B");
      const workflow = await workflowIn(a.project.id, SaveFox.nodeType);

      const payload = await run(workflow.id);

      expect(payload["status"]).toBe("completed");
      expect(await namesIn(a.folder)).toEqual(["Generated/fox-in-snow.png"]);
      expect(await namesIn(b.folder)).toEqual([]);
      const [asset, ...rest] = await assetsOf(a.project.id);
      expect(rest).toEqual([]);
      expect(asset).toMatchObject({
        project_id: a.project.id,
        workspace_path: "Generated/fox-in-snow.png",
        workflow_id: workflow.id
      });
      expect(
        await rawExists(getAssetStorageKey(USER, asset!.id, asset!.content_type))
      ).toBe(false);
      expect(await serve((await toAssetResponse(asset!)).get_url!)).toEqual(PNG);
    });

    it("an asset created before this change still serves its bytes from the legacy key", async () => {
      const a = await projectWithFolder(USER, "Film A");
      const legacy = await createStoredAsset({
        userId: USER,
        projectId: a.project.id,
        name: "old fox",
        contentType: "image/png",
        content: PNG
      });
      const key = getAssetStorageKey(USER, legacy.id, legacy.content_type);

      expect(legacy.workspace_path).toBeNull();
      expect(await rawExists(key)).toBe(true);
      const response = await toAssetResponse(legacy);
      expect(response.get_url).toBe(`/api/storage/${key}`);
      expect(await serve(response.get_url!)).toEqual(PNG);
      expect(
        await bytesOf(legacy)
      ).toEqual(PNG);
      expect(await namesIn(a.folder)).toEqual([]);

      // Renaming and deleting it touch no project folder.
      const caller = createCaller(makeCtx());
      await caller.assets.update({ id: legacy.id, name: "older fox" });
      expect(await serve(response.get_url!)).toEqual(PNG);
      await caller.assets.delete({ id: legacy.id });
      expect(await rawExists(key)).toBe(false);
      expect(await namesIn(a.folder)).toEqual([]);
    });

    it("renaming the asset renames its file, and the same id still serves it", async () => {
      const a = await projectWithFolder(USER, "Film A");
      await run((await workflowIn(a.project.id, FoxImage.nodeType, "fox in snow")).id);
      const [asset] = await assetsOf(a.project.id);

      const renamed = await createCaller(makeCtx()).assets.update({
        id: asset!.id,
        name: "red fox"
      });

      expect(renamed.name).toBe("red fox");
      expect(renamed.id).toBe(asset!.id);
      expect(await namesIn(a.folder)).toEqual(["Generated/red-fox.png"]);
      expect((await Asset.find(USER, asset!.id))?.workspace_path).toBe(
        "Generated/red-fox.png"
      );
      expect(await serve(renamed.get_url!)).toEqual(PNG);
      if (mode === "local") {
        const dir = path.join(a.folder.path, "Generated");
        expect(await fs.readdir(dir)).toEqual(["red-fox.png"]);
        expect(await fs.readFile(path.join(dir, "red-fox.png"))).toEqual(
          Buffer.from(PNG)
        );
      }
    });

    it("renaming onto a name another asset's file has keeps both files", async () => {
      const a = await projectWithFolder(USER, "Film A");
      await run((await workflowIn(a.project.id, FoxImage.nodeType, "fox in snow")).id);
      await run((await workflowIn(a.project.id, FoxImage.nodeType, "red fox")).id);
      const rows = await assetsOf(a.project.id);
      const snow = rows.find((row) => row.name === "fox in snow")!;
      const red = rows.find((row) => row.name === "red fox")!;

      await createCaller(makeCtx()).assets.update({ id: snow.id, name: "red fox" });

      expect(await namesIn(a.folder)).toEqual([
        "Generated/red-fox-2.png",
        "Generated/red-fox.png"
      ]);
      expect((await Asset.find(USER, red.id))?.workspace_path).toBe(
        "Generated/red-fox.png"
      );
      expect((await Asset.find(USER, snow.id))?.workspace_path).toBe(
        "Generated/red-fox-2.png"
      );
    });

    it("keeps the file where it was when a conditional rename loses", async () => {
      const a = await projectWithFolder(USER, "Film A");
      await run((await workflowIn(a.project.id, FoxImage.nodeType, "fox in snow")).id);
      const [asset] = await assetsOf(a.project.id);

      await expect(
        createCaller(makeCtx()).assets.update({
          id: asset!.id,
          name: "red fox",
          metadata: { note: "mine" },
          expected_metadata: { stale: true }
        })
      ).rejects.toThrow(/metadata changed/);

      expect(await namesIn(a.folder)).toEqual(["Generated/fox-in-snow.png"]);
      const row = await Asset.find(USER, asset!.id);
      expect(row?.workspace_path).toBe("Generated/fox-in-snow.png");
      expect(row?.name).toBe("fox in snow");
    });

    it("new data is written to the file, and a metadata update keeps the fingerprint", async () => {
      const a = await projectWithFolder(USER, "Film A");
      await run((await workflowIn(a.project.id, FoxImage.nodeType, "fox in snow")).id);
      const [asset] = await assetsOf(a.project.id);
      const caller = createCaller(makeCtx());

      const updated = await caller.assets.update({
        id: asset!.id,
        data: Buffer.from(OTHER).toString("base64"),
        data_encoding: "base64"
      });

      expect(await namesIn(a.folder)).toEqual(["Generated/fox-in-snow.png"]);
      expect(updated.size).toBe(OTHER.byteLength);
      expect(await serve(updated.get_url!)).toEqual(OTHER);
      expect(
        await rawExists(getAssetStorageKey(USER, asset!.id, asset!.content_type))
      ).toBe(false);

      const relabelled = await caller.assets.update({
        id: asset!.id,
        metadata: { note: "mine", workspace_hash: "forged", workspace_size: 1 }
      });
      expect(relabelled.metadata).toMatchObject({
        note: "mine",
        workspace_size: OTHER.byteLength,
        workspace_hash: partialContentHash(OTHER)
      });
    });

    it("deleting the asset deletes its file and leaves other files alone", async () => {
      const a = await projectWithFolder(USER, "Film A");
      await run((await workflowIn(a.project.id, FoxImage.nodeType, "fox in snow")).id);
      await run((await workflowIn(a.project.id, FoxImage.nodeType, "red fox")).id);
      const rows = await assetsOf(a.project.id);
      const snow = rows.find((row) => row.name === "fox in snow")!;
      const url = (await toAssetResponse(snow)).get_url!;

      const result = await createCaller(makeCtx()).assets.delete({ id: snow.id });

      expect(result.deleted_asset_ids).toEqual([snow.id]);
      expect(await Asset.find(USER, snow.id)).toBeNull();
      expect(await namesIn(a.folder)).toEqual(["Generated/red-fox.png"]);
      expect(await serve(url)).toBeNull();
      if (mode === "local") {
        expect(await fs.readdir(path.join(a.folder.path, "Generated"))).toEqual([
          "red-fox.png"
        ]);
      }
    });

    it("deleting an asset folder deletes the files of the assets in it", async () => {
      const a = await projectWithFolder(USER, "Film A");
      await run((await workflowIn(a.project.id, FoxImage.nodeType, "fox in snow")).id);
      const [asset] = await assetsOf(a.project.id);
      const shelf = await Asset.create<Asset>({
        user_id: USER,
        name: "Shelf",
        content_type: "folder",
        parent_id: USER,
        project_id: a.project.id
      });
      const caller = createCaller(makeCtx());
      await caller.assets.update({ id: asset!.id, parent_id: shelf.id });

      const result = await caller.assets.delete({ id: shelf.id });

      expect(result.deleted_asset_ids.sort()).toEqual([asset!.id, shelf.id].sort());
      expect(await namesIn(a.folder)).toEqual([]);
    });

    it("the resources router renames and deletes the file with the asset", async () => {
      const a = await projectWithFolder(USER, "Film A");
      await run((await workflowIn(a.project.id, FoxImage.nodeType, "fox in snow")).id);
      const [asset] = await assetsOf(a.project.id);
      const caller = createCaller(makeCtx());

      await caller.resources.update({
        ref: { kind: "asset", id: asset!.id },
        name: "red fox"
      });
      expect(await namesIn(a.folder)).toEqual(["Generated/red-fox.png"]);
      expect((await Asset.find(USER, asset!.id))?.workspace_path).toBe(
        "Generated/red-fox.png"
      );

      await caller.resources.delete({ ref: { kind: "asset", id: asset!.id } });
      expect(await namesIn(a.folder)).toEqual([]);
      expect(await Asset.find(USER, asset!.id)).toBeNull();
    });

    // ── Moving an asset to another project moves its file ──────────────────

    it("assigning an entity to another project moves its file there", async () => {
      const a = await projectWithFolder(USER, "Film A");
      const b = await projectWithFolder(USER, "Film B");
      const hero = await entityIn(a.project.id, "hero");

      await createCaller(makeCtx()).projects.assignDocument({
        projectId: b.project.id,
        type: "entity",
        ref: hero.id
      });

      const row = await Asset.find(USER, hero.id);
      expect(row?.project_id).toBe(b.project.id);
      expect(row?.workspace_path).toBe("Generated/hero.png");
      expect(await namesIn(b.folder)).toEqual(["Generated/hero.png"]);
      // The old folder keeps no file without a row.
      expect(await namesIn(a.folder)).toEqual([]);
      expect(await bytesOf(row!)).toEqual(PNG);
      expect(await serve((await toAssetResponse(row!)).get_url!)).toEqual(PNG);
    });

    it("a moved entity takes a free name beside a file of the same name and both keep their bytes", async () => {
      const a = await projectWithFolder(USER, "Film A");
      const b = await projectWithFolder(USER, "Film B");
      const theirs = await entityIn(b.project.id, "hero");
      await createCaller(makeCtx()).assets.update({
        id: theirs.id,
        data: Buffer.from(OTHER).toString("base64"),
        data_encoding: "base64"
      });
      const mine = await entityIn(a.project.id, "hero");

      await createCaller(makeCtx()).projects.assignDocument({
        projectId: b.project.id,
        type: "entity",
        ref: mine.id
      });

      const moved = (await Asset.find(USER, mine.id))!;
      const other = (await Asset.find(USER, theirs.id))!;
      expect(moved.project_id).toBe(b.project.id);
      expect(moved.workspace_path).toBe("Generated/hero-2.png");
      expect(other.workspace_path).toBe("Generated/hero.png");
      expect(await namesIn(b.folder)).toEqual([
        "Generated/hero-2.png",
        "Generated/hero.png"
      ]);
      expect(await namesIn(a.folder)).toEqual([]);
      // Two rows, two files, and each serves its own bytes.
      expect(await bytesOf(moved)).toEqual(PNG);
      expect(await bytesOf(other)).toEqual(OTHER);
    });

    it("deleting a moved entity deletes its own file and leaves the other asset's bytes", async () => {
      const a = await projectWithFolder(USER, "Film A");
      const b = await projectWithFolder(USER, "Film B");
      const theirs = await entityIn(b.project.id, "hero");
      const mine = await entityIn(a.project.id, "hero");
      const caller = createCaller(makeCtx());
      await caller.projects.assignDocument({
        projectId: b.project.id,
        type: "entity",
        ref: mine.id
      });

      await caller.assets.delete({ id: mine.id });

      expect(await Asset.find(USER, mine.id)).toBeNull();
      expect(await namesIn(b.folder)).toEqual(["Generated/hero.png"]);
      const other = (await Asset.find(USER, theirs.id))!;
      expect(other.workspace_path).toBe("Generated/hero.png");
      expect(await bytesOf(other)).toEqual(PNG);
    });

    it("the agent entity capability moves the file when it changes the project", async () => {
      const a = await projectWithFolder(USER, "Film A");
      const b = await projectWithFolder(USER, "Film B");
      const hero = await entityIn(a.project.id, "hero");
      const context = new ProcessingContext({
        jobId: "agent-job",
        userId: USER,
        projectId: a.project.id,
        assetStorage: mocks.adapter,
        storage: new InMemoryStorageAdapter()
      });

      const result = (await createCapabilityRun({
        context,
        gate: UNGATED
      }).invoke("update_entity", {
        entity_id: hero.id,
        project_id: b.project.id
      })) as { error?: string };

      expect(result.error).toBeUndefined();
      const row = (await Asset.find(USER, hero.id))!;
      expect(row.project_id).toBe(b.project.id);
      expect(await namesIn(b.folder)).toEqual(["Generated/hero.png"]);
      expect(await namesIn(a.folder)).toEqual([]);
      expect(await bytesOf(row)).toEqual(PNG);
    });

    it("an entity upsert that names another project moves the file", async () => {
      const a = await projectWithFolder(USER, "Film A");
      const b = await projectWithFolder(USER, "Film B");
      const hero = await entityIn(a.project.id, "hero");

      await entityModelInterfaces().upsertEntity?.({
        userId: USER,
        projectId: b.project.id,
        kind: "character",
        name: "hero",
        descriptor: "a fox",
        imageAssetId: hero.id
      });

      const row = (await Asset.find(USER, hero.id))!;
      expect(row.project_id).toBe(b.project.id);
      expect(await namesIn(b.folder)).toEqual(["Generated/hero.png"]);
      expect(await namesIn(a.folder)).toEqual([]);
      expect(await bytesOf(row)).toEqual(PNG);
    });

    it("an asset id in the form the agent assets capability returns resolves to the file's bytes", async () => {
      const a = await projectWithFolder(USER, "Film A");
      await run((await workflowIn(a.project.id, FoxImage.nodeType, "fox in snow")).id);
      const [asset] = await assetsOf(a.project.id);
      const context = new ProcessingContext({
        jobId: "agent-job",
        userId: USER,
        projectId: a.project.id,
        assetStorage: mocks.adapter,
        storage: new InMemoryStorageAdapter()
      });
      const capabilities = createCapabilityRun({ context, gate: UNGATED });

      // What the agent reads: the dispatcher shortens every id it hands over.
      const listed = compactResourceIds(
        await capabilities.invoke("list_assets", {})
      ) as { assets: Array<{ id: string; uri: string; name: string }> };
      const entry = listed.assets.find((item) => item.name === "fox in snow");

      expect(entry?.id).toBe(asset!.id.slice(0, 12));
      expect(entry?.uri.startsWith(`asset://${asset!.id.slice(0, 12)}`)).toBe(true);
      expect(entry?.uri).not.toContain(asset!.id);
      for (const name of [entry!.id, entry!.uri]) {
        const read = (await capabilities.invoke("read_asset", { name })) as {
          success: boolean;
          content_base64?: string;
          error?: string;
        };
        expect(read.error).toBeUndefined();
        expect(read.success).toBe(true);
        expect(Buffer.from(read.content_base64 ?? "", "base64")).toEqual(
          Buffer.from(PNG)
        );
      }
      // The same form reads through the context every media tool uses.
      const resolved = await context.resolveAssetBytes(entry!.uri);
      expect(resolved.bytes && new Uint8Array(resolved.bytes)).toEqual(PNG);
    });
  }
);

describe("project asset files on a local disk", () => {
  beforeEach(() => {
    vi.stubEnv("NODETOOL_WORKSPACE_STORAGE", "local");
    mocks.adapter = new FileStorageAdapter(storageRoot, {
      externalPathLookup: lookupExternalAssetPath
    });
  });

  async function generated(): Promise<{
    asset: Asset;
    folder: WorkspaceRow;
    file: string;
  }> {
    const a = await projectWithFolder(USER, "Film A");
    await run((await workflowIn(a.project.id, FoxImage.nodeType, "fox in snow")).id);
    const [asset] = await assetsOf(a.project.id);
    return {
      asset: asset!,
      folder: a.folder,
      file: path.join(a.folder.path, "Generated", "fox-in-snow.png")
    };
  }

  it("localPath returns the real file in the project folder", async () => {
    const { asset, file } = await generated();
    const adapter = mocks.adapter!;
    const key = getAssetStorageKey(USER, asset.id, asset.content_type);

    expect(await adapter.localPath(adapter.uriForKey(key))).toBe(file);
    expect(await fs.readFile(file)).toEqual(Buffer.from(PNG));
  });

  it("the storage route serves the file with its type and ranges, to its owner only", async () => {
    const { asset } = await generated();
    const handler = createStorageHandler({ storagePath: storageRoot });
    const url = `http://localhost/api/storage/${USER}/${asset.id}.png`;

    const full = await handler(new Request(url, { headers: { "x-user-id": USER } }));
    expect(full.status).toBe(200);
    expect(full.headers.get("Content-Type")).toBe("image/png");
    expect(new Uint8Array(await full.arrayBuffer())).toEqual(PNG);

    const ranged = await handler(
      new Request(url, { headers: { "x-user-id": USER, Range: "bytes=0-7" } })
    );
    expect(ranged.status).toBe(206);
    expect(new Uint8Array(await ranged.arrayBuffer())).toEqual(PNG.slice(0, 8));

    const foreign = await handler(
      new Request(url, { headers: { "x-user-id": "2" } })
    );
    expect(foreign.status).toBe(404);
  });

  it("refuses to delete or rename while the folder is unreachable, and keeps the row", async () => {
    const { asset, folder, file } = await generated();
    const moved = `${folder.path}-unplugged`;
    await fs.rename(folder.path, moved);
    const caller = createCaller(makeCtx());

    await expect(caller.assets.delete({ id: asset.id })).rejects.toThrow(
      /Project folder not found/
    );
    await expect(
      caller.assets.update({ id: asset.id, name: "red fox" })
    ).rejects.toThrow(/Project folder not found/);

    const row = await Asset.find(USER, asset.id);
    expect(row?.workspace_path).toBe("Generated/fox-in-snow.png");
    expect(row?.name).toBe("fox in snow");

    // After the folder is back the asset resolves again without re-import.
    await fs.rename(moved, folder.path);
    expect(await fs.readFile(file)).toEqual(Buffer.from(PNG));
    expect(
      await bytesOf(asset)
    ).toEqual(PNG);
  });

  it("refuses to move an entity while the destination folder is unreachable, and keeps it whole", async () => {
    const a = await projectWithFolder(USER, "Film A");
    const b = await projectWithFolder(USER, "Film B");
    await run((await workflowIn(a.project.id, FoxImage.nodeType, "hero")).id);
    const [hero] = await assetsOf(a.project.id);
    hero!.metadata = {
      ...hero!.metadata,
      nodetool_entity: { kind: "character", name: "hero", descriptor: "a fox" }
    };
    await hero!.save();
    await fs.rm(b.folder.path, { recursive: true, force: true });

    await expect(
      createCaller(makeCtx()).projects.assignDocument({
        projectId: b.project.id,
        type: "entity",
        ref: hero!.id
      })
    ).rejects.toThrow(/Project folder not found/);

    const row = (await Asset.find(USER, hero!.id))!;
    expect(row.project_id).toBe(a.project.id);
    expect(row.workspace_path).toBe("Generated/hero.png");
    expect(
      await fs.readFile(path.join(a.folder.path, "Generated", "hero.png"))
    ).toEqual(Buffer.from(PNG));
  });

  it("a run does not save into another folder when its project's folder is gone", async () => {
    const a = await projectWithFolder(USER, "Film A");
    const workflow = await workflowIn(a.project.id, FoxImage.nodeType, "fox in snow");
    await fs.rm(a.folder.path, { recursive: true, force: true });

    await expect(run(workflow.id)).rejects.toThrow(/Project folder not found/);

    expect(await assetsOf(a.project.id)).toEqual([]);
    expect(existsSync(path.join(storageRoot, USER))).toBe(false);
  });
});
