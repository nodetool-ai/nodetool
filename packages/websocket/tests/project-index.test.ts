/**
 * The asset index follows the project folder (PRD D4, T4, US6, US7), through
 * the server's own surfaces: the asset response reports a missing file,
 * `relinkExternal` points the asset at another file, Remove deletes the row,
 * and the index is reconciled when a project is opened and when NodeTool
 * writes into its folder.
 *
 * Every case runs with project folders as local directories and as key
 * prefixes in the object store the assets live in.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  Asset,
  ModelObserver,
  Workspace as WorkspaceRow,
  initTestDb
} from "@nodetool-ai/models";
import {
  FileStorageAdapter,
  InMemoryStorageAdapter,
  type StorageAdapter
} from "@nodetool-ai/storage";
import type { Workspace } from "@nodetool-ai/runtime";

const mocks = vi.hoisted(() => ({ adapter: null as StorageAdapter | null }));

vi.mock("@nodetool-ai/asset-services/storage", async (orig) => {
  const actual =
    await orig<typeof import("@nodetool-ai/asset-services/storage")>();
  return { ...actual, getAssetAdapter: () => mocks.adapter };
});

import {
  resolveProjectWorkspace,
  setWorkspaceChangeNotifier,
  setWorkspaceCloudStorage,
  workspaceFromRow
} from "@nodetool-ai/execution/service";
import { ProjectAssetStorageAdapter } from "@nodetool-ai/asset-services/project-asset-storage";
import { saveProjectAsset } from "@nodetool-ai/asset-services/project-asset";
import { isProjectAssetOffline } from "@nodetool-ai/asset-services/project-asset-file";
import {
  flushProjectReconciles,
  reconcileProjectIndex
} from "@nodetool-ai/project-services/project-index";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";
import { lookupExternalAssetPath } from "../src/lib/external-asset-lookup.js";
import { retrieveAssetBytes } from "../src/lib/asset-paths.js";
import { toAssetResponse } from "../src/lib/asset-response.js";
import { createStorageHandler } from "../src/storage-api.js";
import { initWorkspaceChangeEvents } from "../src/lib/workflow-workspace.js";
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
const REPLACEMENT = Uint8Array.from([...PNG, 4, 2]);

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

let folders: ProjectFolderFixture;
let tmpDir: string;
let storageRoot: string;
/** Fetch a `get_url` the way a client does. */
let serve: (url: string) => Promise<Uint8Array | null>;

/** The project's folder, unobserved: writes through it are another app's. */
function folderOf(row: WorkspaceRow): Workspace {
  const workspace = workspaceFromRow(row);
  if (!workspace) throw new Error("no workspace for row");
  return workspace;
}

async function reload(asset: Asset): Promise<Asset> {
  const found = await Asset.find(USER, asset.id);
  if (!found) throw new Error(`asset ${asset.id} is gone`);
  return found;
}

async function bytesOf(asset: Asset): Promise<Uint8Array | null> {
  const bytes = await retrieveAssetBytes(
    mocks.adapter!,
    USER,
    asset.id,
    asset.content_type
  );
  return bytes ? new Uint8Array(bytes) : null;
}

function saveFox(projectId: string): Promise<Asset> {
  return saveProjectAsset({
    projectId,
    userId: USER,
    name: "fox",
    contentType: "image/png",
    bytes: PNG
  });
}

beforeEach(async () => {
  initTestDb();
  folders = await useProjectFolders([USER]);
  tmpDir = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "project-index-"))
  );
  storageRoot = path.join(tmpDir, "storage");
  vi.stubEnv("NODETOOL_ENV", "development");
  vi.stubEnv("NODETOOL_STORAGE_BACKEND", "file");
  vi.stubEnv("NODETOOL_LOCAL_FILE_ROOTS", "*");
});

afterEach(async () => {
  await flushProjectReconciles();
  vi.unstubAllEnvs();
  ModelObserver.clear();
  setWorkspaceChangeNotifier(null);
  setWorkspaceCloudStorage(null);
  mocks.adapter = null;
  await folders.cleanup();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe.each(["local", "cloud"] as const)(
  "the asset index follows the project folder (%s)",
  (mode) => {
    beforeEach(async () => {
      vi.stubEnv("NODETOOL_WORKSPACE_STORAGE", mode);
      if (mode === "local") {
        mocks.adapter = new FileStorageAdapter(storageRoot, {
          externalPathLookup: lookupExternalAssetPath
        });
        setWorkspaceCloudStorage(null);
        const handler = createStorageHandler({ storagePath: storageRoot });
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
        const store = new ObjectStore();
        const adapter = new ProjectAssetStorageAdapter(store);
        mocks.adapter = adapter;
        setWorkspaceCloudStorage(adapter);
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

    it("an asset whose file was deleted reports offline, its URL serves nothing, and relink brings it back under the same id", async () => {
      const { project, folder } = await projectWithFolder(USER, "Film");
      const asset = await saveFox(project.id);
      const before = await toAssetResponse(asset);
      expect(before.offline).toBeUndefined();
      expect(await serve(before.get_url!)).toEqual(PNG);

      const workspace = folderOf(folder);
      await workspace.delete("Generated/fox.png");
      await reconcileProjectIndex(project.id, USER);

      const offline = await toAssetResponse(await reload(asset));
      expect(offline.id).toBe(asset.id);
      expect(offline.offline).toBe(true);
      expect(await serve(offline.get_url!)).toBeNull();
      expect(await bytesOf(asset)).toBeNull();

      // A replacement the user put in the folder, named by its folder path.
      await workspace.write("retakes/fox.dat", REPLACEMENT);
      const relinked = await createCaller(makeCtx()).assets.relinkExternal({
        id: asset.id,
        path: "retakes/fox.dat"
      });

      expect(relinked.id).toBe(asset.id);
      expect(relinked.offline).toBeUndefined();
      expect(relinked.size).toBe(REPLACEMENT.byteLength);
      expect(await serve(relinked.get_url!)).toEqual(REPLACEMENT);
      expect(await bytesOf(asset)).toEqual(REPLACEMENT);
      const row = await reload(asset);
      expect(row.workspace_path).toBe("retakes/fox.dat");
      expect(isProjectAssetOffline(row)).toBe(false);
      expect(await Asset.listProjectFiles(USER, project.id)).toHaveLength(1);
    });

    it("relink refuses a file of another media kind, a missing file, and a path outside the folder", async () => {
      const { project, folder } = await projectWithFolder(USER, "Film");
      const asset = await saveFox(project.id);
      const workspace = folderOf(folder);
      await workspace.write("sound/theme.wav", REPLACEMENT);
      const caller = createCaller(makeCtx());

      await expect(
        caller.assets.relinkExternal({ id: asset.id, path: "sound/theme.wav" })
      ).rejects.toThrow("The new file is audio/wav, but this asset is image/png");
      await expect(
        caller.assets.relinkExternal({ id: asset.id, path: "nowhere/fox.png" })
      ).rejects.toThrow("No file at nowhere/fox.png in the project folder");
      await expect(
        caller.assets.relinkExternal({ id: asset.id, path: "../other/fox.png" })
      ).rejects.toThrow("outside the workspace");
      await expect(
        caller.assets.relinkExternal({
          id: asset.id,
          path: ".nodetool/project.json"
        })
      ).rejects.toThrow("reserves");

      expect((await reload(asset)).workspace_path).toBe("Generated/fox.png");
      expect(await bytesOf(asset)).toEqual(PNG);
    });

    it("Remove deletes the row of an offline asset", async () => {
      const { project, folder } = await projectWithFolder(USER, "Film");
      const asset = await saveFox(project.id);
      await folderOf(folder).delete("Generated/fox.png");
      await reconcileProjectIndex(project.id, USER);
      expect(isProjectAssetOffline(await reload(asset))).toBe(true);

      const removed = await createCaller(makeCtx()).assets.delete({
        id: asset.id
      });

      expect(removed.deleted_asset_ids).toEqual([asset.id]);
      expect(await Asset.find(USER, asset.id)).toBeNull();
      // Nothing brings it back.
      await reconcileProjectIndex(project.id, USER);
      expect(await Asset.listProjectFiles(USER, project.id)).toEqual([]);
    });

    it("a client cannot set or clear the offline mark through a metadata update", async () => {
      const { project, folder } = await projectWithFolder(USER, "Film");
      const asset = await saveFox(project.id);
      const caller = createCaller(makeCtx());

      await caller.assets.update({
        id: asset.id,
        metadata: { workspace_offline: true, note: "mine" }
      });
      const online = await reload(asset);
      expect(isProjectAssetOffline(online)).toBe(false);
      expect(online.metadata).toMatchObject({ note: "mine" });

      await folderOf(folder).delete("Generated/fox.png");
      await reconcileProjectIndex(project.id, USER);
      await caller.assets.update({ id: asset.id, metadata: { note: "still" } });
      expect(isProjectAssetOffline(await reload(asset))).toBe(true);
    });

    it("opening a project reconciles its folder: media copied in gets a row, and a renamed file keeps its asset", async () => {
      const { project, folder } = await projectWithFolder(USER, "Film");
      const asset = await saveFox(project.id);
      const workspace = folderOf(folder);
      // Done in another app while the project was closed.
      await workspace.move("Generated/fox.png", "Generated/fox-final.png");
      await workspace.write("footage/take.png", REPLACEMENT);
      await workspace.write("notes.txt", "remember");

      await createCaller(makeCtx()).projects.get({ id: project.id });
      await flushProjectReconciles();

      const rows = await Asset.listProjectFiles(USER, project.id);
      expect(rows.map((row) => row.workspace_path).sort()).toEqual([
        "Generated/fox-final.png",
        "footage/take.png"
      ]);
      expect((await reload(asset)).workspace_path).toBe(
        "Generated/fox-final.png"
      );
      expect(await bytesOf(asset)).toEqual(PNG);
    });

    it("a write into the project folder reconciles it, and a write into another workspace does not", async () => {
      initWorkspaceChangeEvents();
      const { project } = await projectWithFolder(USER, "Film");
      const resolved = await resolveProjectWorkspace(project.id, USER);
      if (!resolved.ok) throw new Error(resolved.reason);

      // What an agent's file tool or a save node does.
      await resolved.workspace.write("shots/hero.png", PNG);
      await flushProjectReconciles();

      const rows = await Asset.listProjectFiles(USER, project.id);
      expect(rows.map((row) => row.workspace_path)).toEqual(["shots/hero.png"]);
      expect(await bytesOf(rows[0]!)).toEqual(PNG);

      // A workspace that is not the project's folder has no asset index.
      const other = (await WorkspaceRow.create({
        user_id: USER,
        name: "scratch",
        path:
          mode === "local"
            ? path.join(tmpDir, "scratch")
            : `workspaces/${USER}/scratch`,
        project_id: project.id
      })) as WorkspaceRow;
      const scratch = workspaceFromRow(other);
      if (!scratch) throw new Error("no scratch workspace");
      const scans = vi.spyOn(Asset, "listProjectFiles");
      await scratch.write("stray.png", PNG);
      await flushProjectReconciles();

      expect(scans).not.toHaveBeenCalled();
      scans.mockRestore();
      expect(await Asset.listProjectFiles(USER, project.id)).toHaveLength(1);
    });
  }
);

describe("relink with a file on this host (local folders)", () => {
  beforeEach(() => {
    vi.stubEnv("NODETOOL_WORKSPACE_STORAGE", "local");
    mocks.adapter = new FileStorageAdapter(storageRoot, {
      externalPathLookup: lookupExternalAssetPath
    });
  });

  it("copies a file from outside the folder into it", async () => {
    const { project, folder } = await projectWithFolder(USER, "Film");
    const asset = await saveFox(project.id);
    await folderOf(folder).delete("Generated/fox.png");
    await reconcileProjectIndex(project.id, USER);
    const outside = path.join(tmpDir, "downloads", "fox retake.png");
    await fs.mkdir(path.dirname(outside), { recursive: true });
    await fs.writeFile(outside, REPLACEMENT);

    const relinked = await createCaller(makeCtx()).assets.relinkExternal({
      id: asset.id,
      path: outside
    });

    expect(relinked.id).toBe(asset.id);
    expect(relinked.offline).toBeUndefined();
    const row = await reload(asset);
    expect(row.workspace_path).toBe("Generated/fox retake.png");
    expect(
      new Uint8Array(
        await fs.readFile(path.join(folder.path, "Generated", "fox retake.png"))
      )
    ).toEqual(REPLACEMENT);
    // The file outside the folder stays where it was.
    expect(new Uint8Array(await fs.readFile(outside))).toEqual(REPLACEMENT);
    expect(await bytesOf(asset)).toEqual(REPLACEMENT);
  });

  it("uses a picked file that is already in the folder where it is", async () => {
    const { project, folder } = await projectWithFolder(USER, "Film");
    const asset = await saveFox(project.id);
    const workspace = folderOf(folder);
    await workspace.delete("Generated/fox.png");
    await workspace.write("retakes/fox.dat", REPLACEMENT);
    await reconcileProjectIndex(project.id, USER);

    await createCaller(makeCtx()).assets.relinkExternal({
      id: asset.id,
      path: path.join(folder.path, "retakes", "fox.dat")
    });

    expect((await reload(asset)).workspace_path).toBe("retakes/fox.dat");
    expect(
      (await workspace.list("", { recursive: true })).map((entry) => entry.path)
    ).toEqual(["retakes/fox.dat"]);
    expect(await bytesOf(asset)).toEqual(REPLACEMENT);
  });
});
