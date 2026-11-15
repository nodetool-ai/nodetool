/**
 * Assets from before project folders move into their project's folder in the
 * background (project folders PRD T9 step 4, issue #7602), as a client sees
 * it: the project reports the move while it runs, every asset keeps its id,
 * and the URL the asset response hands out serves the same bytes before and
 * after.
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
  assets,
  getPortableDb,
  initTestDb
} from "@nodetool-ai/models";
import {
  FileStorageAdapter,
  InMemoryStorageAdapter,
  type StorageAdapter
} from "@nodetool-ai/storage";
import type { Workspace } from "@nodetool-ai/runtime";
import { projectDirectoryId } from "@nodetool-ai/protocol";

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
import { projectAssetMoveJob } from "@nodetool-ai/project-services/project-asset-move-job";
import {
  cancelProjectReconciles,
  flushProjectReconciles
} from "@nodetool-ai/project-services/project-index";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";
import { lookupExternalAssetPath } from "../src/lib/external-asset-lookup.js";
import { getAssetStorageKey } from "../src/lib/asset-paths.js";
import { toAssetResponse } from "../src/lib/asset-response.js";
import { createStorageHandler } from "../src/storage-api.js";
import {
  projectWithFolder,
  useProjectFolders,
  type ProjectFolderFixture
} from "./project-folder-fixture.js";

const createCaller = createCallerFactory(appRouter);
const USER = "1";
/** A 1x1 PNG. */
const FOX = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64"
  )
);
const UPLOAD = new TextEncoder().encode("shot list");

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
/** Whether an object is stored under a raw key, without the key-miss lookup. */
let rawExists: (key: string) => Promise<boolean>;
/** The bytes a client gets from the URL of an asset response. */
let serve: (url: string) => Promise<Uint8Array | null>;

function folderOf(row: WorkspaceRow): Workspace {
  const workspace = workspaceFromRow(row);
  if (!workspace) throw new Error("no workspace for row");
  return workspace;
}

async function reload(asset: { id: string }): Promise<Asset> {
  const found = await Asset.find(USER, asset.id);
  if (!found) throw new Error(`asset ${asset.id} is gone`);
  return found;
}

/** An asset as it was before project folders: a row plus a stored object. */
async function legacyAsset(
  projectId: string,
  name: string,
  parentId: string | null,
  bytes: Uint8Array,
  contentType: string
): Promise<Asset> {
  const asset = await Asset.create<Asset>({
    user_id: USER,
    project_id: projectId,
    parent_id: parentId,
    name,
    content_type: contentType,
    size: bytes.byteLength
  });
  await mocks.adapter?.store(
    getAssetStorageKey(USER, asset.id, contentType),
    bytes,
    contentType
  );
  return asset;
}

/** Rows are moved once they have gone unchanged for a while. Age them. */
async function ageRows(): Promise<void> {
  await getPortableDb()
    .update(assets)
    .set({ updated_at: "2024-01-01T00:00:00.000Z" });
}

beforeEach(async () => {
  initTestDb();
  folders = await useProjectFolders([USER]);
  tmpDir = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "project-asset-move-"))
  );
  storageRoot = path.join(tmpDir, "storage");
  vi.stubEnv("NODETOOL_ENV", "development");
  vi.stubEnv("NODETOOL_STORAGE_BACKEND", "file");
});

afterEach(async () => {
  await projectAssetMoveJob.idle();
  await flushProjectReconciles();
  cancelProjectReconciles();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  ModelObserver.clear();
  setWorkspaceCloudStorage(null);
  mocks.adapter = null;
  await folders.cleanup();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe.each(["local", "cloud"] as const)(
  "existing asset bytes move into the project folder (%s)",
  (mode) => {
    beforeEach(() => {
      vi.stubEnv("NODETOOL_WORKSPACE_STORAGE", mode);
      if (mode === "local") {
        mocks.adapter = new FileStorageAdapter(storageRoot, {
          externalPathLookup: lookupExternalAssetPath
        });
        setWorkspaceCloudStorage(null);
        const handler = createStorageHandler({ storagePath: storageRoot });
        rawExists = async (key) =>
          fs.stat(path.join(storageRoot, key)).then(
            () => true,
            () => false
          );
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
        // bucket holds both.
        const store = new ObjectStore();
        const adapter = new ProjectAssetStorageAdapter(store);
        mocks.adapter = adapter;
        setWorkspaceCloudStorage(adapter);
        rawExists = (key) => store.exists(store.uriForKey(key));
        // A signed URL names one object, and the bucket answers with it.
        serve = async (url) => {
          const key = decodeURIComponent(
            new URL(url, "http://localhost").pathname.replace(
              /^\/(api\/storage\/)?/,
              ""
            )
          );
          return store.retrieve(store.uriForKey(key));
        };
      }
    });

    it("the project reports the move, and each asset keeps its id and a URL that serves its bytes", async () => {
      const { project, folder } = await projectWithFolder(USER, "Film");
      const shots = await Asset.create<Asset>({
        user_id: USER,
        project_id: project.id,
        name: "Shots",
        content_type: "folder"
      });
      const fox = await legacyAsset(project.id, "fox", shots.id, FOX, "image/png");
      // An upload into a directory of the folder is filed under its id.
      const upload = await legacyAsset(
        project.id,
        "upload",
        projectDirectoryId(project.id, "Uploads"),
        UPLOAD,
        "text/plain"
      );
      await ageRows();
      const caller = createCaller(makeCtx());
      const before = {
        fox: await toAssetResponse(await reload(fox)),
        upload: await toAssetResponse(await reload(upload))
      };
      expect(await serve(before.fox.get_url ?? "")).toEqual(FOX);
      expect(await serve(before.upload.get_url ?? "")).toEqual(UPLOAD);

      // Opening the project finds the assets to move and reports the move.
      const opened = await caller.projects.get({ id: project.id });
      expect(opened.project.folder?.moving).toEqual({ done: 0, total: 2 });
      const listed = await caller.projects.list({});
      expect(
        listed.find((entry) => entry.id === project.id)?.folder?.moving
      ).toEqual({ done: 0, total: 2 });

      await projectAssetMoveJob.idle();

      const done = await caller.projects.get({ id: project.id });
      expect(done.project.folder?.moving ?? null).toBeNull();

      // Each file is in the folder under its former folder path and name.
      const workspace = folderOf(folder);
      expect((await reload(fox)).workspace_path).toBe("Shots/fox.png");
      expect((await reload(upload)).workspace_path).toBe("Uploads/upload.txt");
      expect(await workspace.read("Shots/fox.png")).toEqual(FOX);
      expect(await workspace.read("Uploads/upload.txt")).toEqual(UPLOAD);
      // No legacy object is left, and the folder row is gone.
      expect(await rawExists(getAssetStorageKey(USER, fox.id, "image/png"))).toBe(false);
      expect(await rawExists(getAssetStorageKey(USER, upload.id, "text/plain"))).toBe(false);
      expect(await Asset.find(USER, shots.id)).toBeNull();

      // Ids are unchanged, and the URL a document resolves an id to still
      // serves the bytes.
      const after = {
        fox: await toAssetResponse(await reload(fox)),
        upload: await toAssetResponse(await reload(upload))
      };
      expect(after.fox.id).toBe(fox.id);
      expect(after.upload.id).toBe(upload.id);
      expect(await serve(after.fox.get_url ?? "")).toEqual(FOX);
      expect(await serve(after.upload.get_url ?? "")).toEqual(UPLOAD);
      if (mode === "local") {
        // The id-based URL itself is the one handed out before the move.
        expect(after.fox.get_url).toBe(before.fox.get_url);
        expect(await serve(before.upload.get_url ?? "")).toEqual(UPLOAD);
      }

      // The asset browser lists each asset in the directory of its file.
      const inShots = await caller.assets.list({
        project_id: project.id,
        parent_id: projectDirectoryId(project.id, "Shots")
      });
      expect(inShots.assets.map((asset) => asset.id)).toEqual([fox.id]);
    });

    it("a project with nothing to move reports no move", async () => {
      const { project } = await projectWithFolder(USER, "Empty");
      const caller = createCaller(makeCtx());

      const opened = await caller.projects.get({ id: project.id });

      expect(opened.project.folder).not.toBeNull();
      expect(opened.project.folder?.moving ?? null).toBeNull();
    });
  }
);
