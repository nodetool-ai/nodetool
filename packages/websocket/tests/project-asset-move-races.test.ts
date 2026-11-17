/**
 * Asset requests that race the move of an asset's bytes from before project
 * folders into its project's folder (docs/workspaces.md, "Existing assets
 * move into the folder").
 *
 * Each request loads the row before the move starts and writes after the
 * move has named the file on the row and deleted the legacy object. The
 * request must not undo the move, leave the moved file without a row, or
 * copy the file under a second name, any of which the reconcile turns into a
 * second asset.
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
  initTestDb,
  moveTargetOf
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
  setWorkspaceCloudStorage,
  workspaceFromRow
} from "@nodetool-ai/execution/service";
import type { LegacyAssetMoveStep } from "@nodetool-ai/asset-services/legacy-asset-move";
import { ProjectAssetStorageAdapter } from "@nodetool-ai/asset-services/project-asset-storage";
import {
  ProjectAssetMoveJob,
  type ProjectAssetMoveReport
} from "@nodetool-ai/project-services/project-asset-move-job";
import {
  cancelProjectReconciles,
  flushProjectReconciles,
  reconcileProjectIndex
} from "@nodetool-ai/project-services/project-index";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";
import { lookupExternalAssetPath } from "../src/lib/external-asset-lookup.js";
import { getAssetStorageKey } from "../src/lib/asset-paths.js";
import {
  projectWithFolder,
  useProjectFolders,
  type ProjectFolderFixture
} from "./project-folder-fixture.js";

const createCaller = createCallerFactory(appRouter);
const USER = "1";
const NOTES = new TextEncoder().encode("shot list");
const NOTES_V2 = new TextEncoder().encode("shot list, second draft");

function makeCtx(userId = USER): Context {
  return {
    userId,
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false
  } as Context;
}

let folders: ProjectFolderFixture;
let tmpDir: string;
let storageRoot: string;
/** Whether an object is stored under a raw key, without the key-miss lookup. */
let rawExists: (key: string) => Promise<boolean>;

function store(): StorageAdapter {
  if (!mocks.adapter) throw new Error("no asset store");
  return mocks.adapter;
}

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

/** Every file in the folder, by path. */
async function folderFiles(row: WorkspaceRow): Promise<string[]> {
  const entries = await folderOf(row).list("", { recursive: true });
  return entries
    .filter((entry) => !entry.isDirectory)
    .map((entry) => entry.path)
    .sort();
}

/** An asset as it was before project folders: a row plus a stored object. */
async function legacyNotes(projectId: string, size: number | null): Promise<Asset> {
  const asset = await Asset.create<Asset>({
    user_id: USER,
    project_id: projectId,
    parent_id: null,
    name: "notes",
    content_type: "text/plain",
    size
  });
  await store().store(
    getAssetStorageKey(USER, asset.id, "text/plain"),
    NOTES,
    "text/plain"
  );
  // Rows are moved once they have gone unchanged for a while.
  await getPortableDb().update(assets).set({
    created_at: "2024-01-01T00:00:00.000Z",
    updated_at: "2024-01-01T00:00:00.000Z"
  });
  return asset;
}

/**
 * One pass of the move over the project. With `killAfter`, the move of each
 * asset stops after that step, as a process that dies there stops.
 */
function moveAll(
  projectId: string,
  killAfter: LegacyAssetMoveStep | null = null
): Promise<ProjectAssetMoveReport> {
  return new ProjectAssetMoveJob({
    settleMs: 0,
    storage: store,
    afterStep: (step) => {
      if (step === killAfter) throw new Error(`killed after ${step}`);
    }
  }).run(projectId, USER);
}

/**
 * Let the request that loads `asset` first go on only after a pass of the
 * move: the request holds the row as it was before the move began.
 */
function moveAfterFirstLoad(
  asset: Asset,
  projectId: string,
  killAfter: LegacyAssetMoveStep | null = null
): {
  report: () => ProjectAssetMoveReport | null;
} {
  let started = false;
  let report: ProjectAssetMoveReport | null = null;
  const find = Asset.find.bind(Asset);
  vi.spyOn(Asset, "find").mockImplementation(async (userId, id) => {
    const found = await find(userId, id);
    if (!started && id === asset.id) {
      started = true;
      report = await moveAll(projectId, killAfter);
    }
    return found;
  });
  return { report: () => report };
}

beforeEach(async () => {
  initTestDb();
  folders = await useProjectFolders([USER]);
  tmpDir = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "project-asset-move-races-"))
  );
  storageRoot = path.join(tmpDir, "storage");
  vi.stubEnv("NODETOOL_ENV", "development");
  vi.stubEnv("NODETOOL_STORAGE_BACKEND", "file");
});

afterEach(async () => {
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
  "asset requests that race the move of their bytes (%s)",
  (mode) => {
    beforeEach(() => {
      vi.stubEnv("NODETOOL_WORKSPACE_STORAGE", mode);
      if (mode === "local") {
        mocks.adapter = new FileStorageAdapter(storageRoot, {
          externalPathLookup: lookupExternalAssetPath
        });
        setWorkspaceCloudStorage(null);
        rawExists = async (key) =>
          fs.stat(path.join(storageRoot, key)).then(
            () => true,
            () => false
          );
      } else {
        // The server hands project folders the asset store itself, so one
        // bucket holds both.
        const bucket = new InMemoryStorageAdapter();
        const adapter = new ProjectAssetStorageAdapter(bucket);
        mocks.adapter = adapter;
        setWorkspaceCloudStorage(adapter);
        rawExists = (key) => bucket.exists(bucket.uriForKey(key));
      }
    });

    it("an update that loaded the row before the move keeps the moved file on the row", async () => {
      const { project, folder } = await projectWithFolder(USER, "Film");
      const notes = await legacyNotes(project.id, NOTES.byteLength);
      const move = moveAfterFirstLoad(notes, project.id);

      const response = await createCaller(makeCtx()).assets.update({
        id: notes.id,
        metadata: { note: "edited" }
      });

      expect(move.report()?.moved).toEqual([notes.id]);
      const row = await reload(notes);
      expect(row.workspace_path).toBe("notes.txt");
      expect(row.metadata?.["note"]).toBe("edited");
      expect(row.metadata?.["workspace_size"]).toBe(NOTES.byteLength);
      expect(moveTargetOf(row)).toBeNull();
      expect(response.id).toBe(notes.id);
      expect(await folderOf(folder).read("notes.txt")).toEqual(NOTES);
      expect(
        await rawExists(getAssetStorageKey(USER, notes.id, "text/plain"))
      ).toBe(false);
      // The file has its row, so the reconcile makes no second asset.
      expect((await reconcileProjectIndex(project.id, USER)).created).toEqual([]);
      expect((await Asset.listByProject(USER, project.id)).map((a) => a.id)).toEqual([
        notes.id
      ]);
    });

    it.each(["switched", "legacy_deleted"] as const)(
      "an update that loaded the row before a move that stopped after %s lets the next pass finish it",
      async (step) => {
        const { project, folder } = await projectWithFolder(USER, "Film");
        const notes = await legacyNotes(project.id, NOTES.byteLength);
        const move = moveAfterFirstLoad(notes, project.id, step);

        await createCaller(makeCtx()).assets.update({
          id: notes.id,
          metadata: { note: "edited" }
        });

        expect(move.report()?.failed).toEqual([notes.id]);
        const row = await reload(notes);
        expect(row.workspace_path).toBe("notes.txt");
        expect(row.metadata?.["note"]).toBe("edited");
        // The move's record stays, so the next pass finishes the move.
        expect(moveTargetOf(row)).toBe("notes.txt");
        expect((await moveAll(project.id)).moved).toEqual([notes.id]);
        const done = await reload(notes);
        expect(done.workspace_path).toBe("notes.txt");
        expect(done.metadata?.["note"]).toBe("edited");
        expect(moveTargetOf(done)).toBeNull();
        expect(await folderFiles(folder)).toEqual(["notes.txt"]);
        expect(
          await rawExists(getAssetStorageKey(USER, notes.id, "text/plain"))
        ).toBe(false);
        expect((await reconcileProjectIndex(project.id, USER)).created).toEqual([]);
      }
    );

    it("a rename that loaded the row before the move renames the moved file", async () => {
      const { project, folder } = await projectWithFolder(USER, "Film");
      const notes = await legacyNotes(project.id, NOTES.byteLength);
      moveAfterFirstLoad(notes, project.id);

      await createCaller(makeCtx()).assets.update({
        id: notes.id,
        name: "draft"
      });

      const row = await reload(notes);
      expect(row.name).toBe("draft");
      expect(row.workspace_path).toBe("draft.txt");
      expect(await folderFiles(folder)).toEqual(["draft.txt"]);
      expect(await folderOf(folder).read("draft.txt")).toEqual(NOTES);
      expect((await reconcileProjectIndex(project.id, USER)).created).toEqual([]);
    });

    it.each([
      ["finished", null, "moved"],
      ["stopped after switched", "switched", "failed"],
      ["stopped after legacy_deleted", "legacy_deleted", "failed"]
    ] as const)("a delete that loaded the row before a move that %s removes the moved file", async (_case, step, outcome) => {
      const { project, folder } = await projectWithFolder(USER, "Film");
      const notes = await legacyNotes(project.id, NOTES.byteLength);
      const move = moveAfterFirstLoad(notes, project.id, step);

      const response = await createCaller(makeCtx()).assets.delete({
        id: notes.id
      });

      expect(move.report()?.[outcome]).toEqual([notes.id]);
      expect(response.deleted_asset_ids).toEqual([notes.id]);
      expect(await Asset.find(USER, notes.id)).toBeNull();
      expect(await folderFiles(folder)).toEqual([]);
      expect(
        await rawExists(getAssetStorageKey(USER, notes.id, "text/plain"))
      ).toBe(false);
      // Nothing is left for the reconcile to bring back as a new asset.
      expect((await reconcileProjectIndex(project.id, USER)).created).toEqual([]);
      expect(await Asset.listByProject(USER, project.id)).toEqual([]);
    });

    it("a resource delete that loaded the row before the move removes the moved file", async () => {
      const { project, folder } = await projectWithFolder(USER, "Film");
      const notes = await legacyNotes(project.id, NOTES.byteLength);
      const move = moveAfterFirstLoad(notes, project.id);

      await createCaller(makeCtx()).resources.delete({
        ref: { kind: "asset", id: notes.id }
      });

      expect(move.report()?.moved).toEqual([notes.id]);
      expect(await Asset.find(USER, notes.id)).toBeNull();
      expect(await folderFiles(folder)).toEqual([]);
      expect((await reconcileProjectIndex(project.id, USER)).created).toEqual([]);
    });

    it("a finalize that runs after a move stopped after its copy leaves the bytes to the move", async () => {
      const { project, folder } = await projectWithFolder(USER, "Film");
      const upload = await legacyNotes(project.id, null);
      const key = getAssetStorageKey(USER, upload.id, "text/plain");
      const objectUri = store().uriForKey(key);
      // The finalize recorded the size and reads the object. A move runs
      // first and stops with its copy in the folder and no file on the row.
      const adapter = store();
      const retrieve = adapter.retrieve.bind(adapter);
      let started = false;
      let report: ProjectAssetMoveReport | null = null;
      vi.spyOn(adapter, "retrieve").mockImplementation(async (uri) => {
        if (!started && uri === objectUri) {
          started = true;
          report = await moveAll(project.id, "copied");
        }
        return retrieve(uri);
      });

      const response = await createCaller(makeCtx()).assets.finalizeUpload({
        asset_id: upload.id
      });

      expect(report).not.toBeNull();
      expect(report?.failed).toEqual([upload.id]);
      expect(response.id).toBe(upload.id);
      // The bytes stay under the key, beside the move's copy.
      expect((await reload(upload)).workspace_path).toBeNull();
      expect(await folderFiles(folder)).toEqual(["notes.txt"]);
      expect(await rawExists(key)).toBe(true);

      // The next pass finishes the move with the copy it made.
      expect((await moveAll(project.id)).moved).toEqual([upload.id]);
      expect((await reload(upload)).workspace_path).toBe("notes.txt");
      expect(await folderFiles(folder)).toEqual(["notes.txt"]);
      expect(await rawExists(key)).toBe(false);
      expect((await reconcileProjectIndex(project.id, USER)).created).toEqual([]);
    });

    it.each([
      ["the moved file holds the uploaded bytes", NOTES],
      ["the upload was replaced after the move copied it", NOTES_V2]
    ])(
      "a finalize that runs after the move took the upload writes no second file: %s",
      async (_case, uploaded) => {
        const { project, folder } = await projectWithFolder(USER, "Film");
        // A client-direct upload whose row was not finalized yet.
        const upload = await legacyNotes(project.id, null);
        const key = getAssetStorageKey(USER, upload.id, "text/plain");
        const objectUri = store().uriForKey(key);
        // The finalize recorded the size and reads the object. The move runs
        // first, and the object the finalize reads is `uploaded`.
        const adapter = store();
        const retrieve = adapter.retrieve.bind(adapter);
        let started = false;
        let report: ProjectAssetMoveReport | null = null;
        vi.spyOn(adapter, "retrieve").mockImplementation(async (uri) => {
          if (!started && uri === objectUri) {
            started = true;
            report = await moveAll(project.id);
            return uploaded;
          }
          return retrieve(uri);
        });

        const response = await createCaller(makeCtx()).assets.finalizeUpload({
          asset_id: upload.id
        });

        expect(report).not.toBeNull();
        expect(report?.moved).toEqual([upload.id]);
        expect(response.id).toBe(upload.id);
        expect(await folderFiles(folder)).toEqual(["notes.txt"]);
        expect(await folderOf(folder).read("notes.txt")).toEqual(uploaded);
        const row = await reload(upload);
        expect(row.workspace_path).toBe("notes.txt");
        expect(row.size).toBe(uploaded.byteLength);
        expect(row.metadata?.["workspace_size"]).toBe(uploaded.byteLength);
        expect(response.size).toBe(uploaded.byteLength);
        expect(await rawExists(key)).toBe(false);
        expect((await reconcileProjectIndex(project.id, USER)).created).toEqual([]);
        expect((await Asset.listByProject(USER, project.id)).map((a) => a.id)).toEqual([
          upload.id
        ]);
      }
    );
  }
);
