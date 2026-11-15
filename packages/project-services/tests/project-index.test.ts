/**
 * The asset index of a project folder (PRD T4, D4, D9, US6, US7): one test
 * per row of the reconcile table, moved and deleted files, relink, rows on
 * first use, the directories the scan skips, and its cost.
 *
 * Every case runs against a local directory and against a storage-backed
 * folder (a key prefix in an object store), through the same `Workspace`
 * interface.
 */
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Asset,
  ModelChangeEvent,
  ModelObserver,
  initTestDb
} from "@nodetool-ai/models";
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
import {
  getAssetStorageKey,
  getAssetThumbnailKey,
  retrieveAssetBytes
} from "@nodetool-ai/asset-services/asset-paths";
import { lookupExternalAssetPath } from "@nodetool-ai/asset-services/external-asset-lookup";
import {
  ProjectAssetRelinkError,
  relinkProjectAsset,
  renameProjectAssetFile,
  saveProjectAsset
} from "@nodetool-ai/asset-services/project-asset";
import {
  ProjectFolderUnavailableError,
  isProjectAssetOffline,
  partialContentHash
} from "@nodetool-ai/asset-services/project-asset-file";
import { ProjectAssetStorageAdapter } from "@nodetool-ai/asset-services/project-asset-storage";
import { getAssetAdapter } from "@nodetool-ai/asset-services/storage";
import {
  OPEN_RECONCILE_INTERVAL_MS,
  ProjectIndex,
  RECONCILE_DEBOUNCE_MS,
  RECONCILE_MAX_WAIT_MS,
  ensureAssetForPath,
  flushProjectReconciles,
  reconcileProjectIndex,
  reconcileProjectOnOpen,
  scheduleProjectReconcile
} from "../src/project-index.js";

vi.mock("@nodetool-ai/asset-services/storage", () => ({
  getAssetAdapter: vi.fn()
}));

const USER = "owner";
const PROJECT = "project-a";
/** A 1x1 PNG. */
const PNG = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64"
  )
);
const text = (value: string): Uint8Array => new TextEncoder().encode(value);

let root: string;
let rawStore: InMemoryStorageAdapter;
/** The asset store readers resolve an asset's id key through. */
let assetStore: StorageAdapter;
let workspaces: Map<string, Workspace>;
let unreachable: boolean;

const kinds = {
  /** A real directory on this host. */
  local: (projectId: string): Workspace =>
    createLocalWorkspace(join(root, "projects", projectId)),
  /** A key prefix in the object store the assets live in. */
  storage: (projectId: string): Workspace =>
    createWorkspace(rawStore, { prefix: `workspaces/${USER}/${projectId}` })
} as const;

function useFolders(kind: keyof typeof kinds): void {
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
      if (unreachable) {
        return { ok: false, projectId: id, reason: `Project folder not found: ${id}` };
      }
      let workspace = workspaces.get(id);
      if (!workspace) {
        workspace = kinds[kind](id);
        workspaces.set(id, workspace);
      }
      return { ok: true, projectId: id, workspace };
    }
  );
}

/** The project's folder. Writes through it stand for another app's. */
function folder(kind: keyof typeof kinds, projectId = PROJECT): Workspace {
  let workspace = workspaces.get(projectId);
  if (!workspace) {
    workspace = kinds[kind](projectId);
    workspaces.set(projectId, workspace);
  }
  return workspace;
}

async function rowsOf(projectId = PROJECT): Promise<Asset[]> {
  return Asset.listProjectFiles(USER, projectId);
}

async function reload(asset: Asset): Promise<Asset> {
  const found = await Asset.find(USER, asset.id);
  if (!found) throw new Error(`asset ${asset.id} is gone`);
  return found;
}

/** The bytes a document that references the asset by id gets. */
async function bytesOf(asset: Asset): Promise<Uint8Array | null> {
  const bytes = await retrieveAssetBytes(
    assetStore,
    USER,
    asset.id,
    asset.content_type
  );
  return bytes ? new Uint8Array(bytes) : null;
}

function saveImage(name: string, bytes: Uint8Array = PNG): Promise<Asset> {
  return saveProjectAsset({
    projectId: PROJECT,
    userId: USER,
    name,
    contentType: "image/png",
    bytes
  });
}

beforeEach(async () => {
  initTestDb();
  root = await mkdtemp(join(tmpdir(), "nodetool-project-index-"));
  rawStore = new InMemoryStorageAdapter();
  workspaces = new Map();
  unreachable = false;
});

afterEach(async () => {
  await flushProjectReconciles();
  vi.useRealTimers();
  ModelObserver.clear();
  setProjectFolderResolver(null);
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});

describe.each(["local", "storage"] as const)(
  "reconcileProjectIndex (%s folder)",
  (kind) => {
    beforeEach(() => useFolders(kind));

    describe("the reconcile table", () => {
      it("file present, fingerprint equal: changes nothing", async () => {
        const asset = await saveImage("fox");
        const events: ModelChangeEvent[] = [];
        ModelObserver.subscribe((_instance, event) => events.push(event), "Asset");

        const report = await reconcileProjectIndex(PROJECT, USER);

        expect(report).toMatchObject({
          files: 1,
          unchanged: 1,
          updated: [],
          moved: [],
          offline: [],
          restored: [],
          created: []
        });
        const after = await reload(asset);
        expect(after.updated_at).toBe(asset.updated_at);
        expect(after.metadata).toEqual(asset.metadata);
        expect(events).toEqual([]);
      });

      it("file present, fingerprint differs: records the new fingerprint and keeps the id", async () => {
        const asset = await saveImage("fox");
        const edited = Uint8Array.from([...PNG, 1, 2, 3]);
        // Another app saves over the file.
        await folder(kind).write("Generated/fox.png", edited);

        const report = await reconcileProjectIndex(PROJECT, USER);

        expect(report.updated).toEqual([asset.id]);
        const rows = await rowsOf();
        expect(rows.map((row) => row.id)).toEqual([asset.id]);
        expect(rows[0]).toMatchObject({
          workspace_path: "Generated/fox.png",
          size: edited.byteLength
        });
        expect(rows[0]?.metadata).toMatchObject({
          workspace_size: edited.byteLength,
          workspace_hash: partialContentHash(edited)
        });
        expect(await bytesOf(asset)).toEqual(edited);
        // A second pass finds nothing left to do.
        expect((await reconcileProjectIndex(PROJECT, USER)).updated).toEqual([]);
      });

      it("file absent, exactly one unindexed file has the fingerprint: points the row at that file", async () => {
        const asset = await saveImage("fox");
        await folder(kind).move("Generated/fox.png", "shots/hero.png");

        const report = await reconcileProjectIndex(PROJECT, USER);

        expect(report.moved).toEqual([asset.id]);
        expect(report.created).toEqual([]);
        const rows = await rowsOf();
        expect(rows.map((row) => row.id)).toEqual([asset.id]);
        expect(rows[0]?.workspace_path).toBe("shots/hero.png");
        expect(isProjectAssetOffline(rows[0]!)).toBe(false);
      });

      it("file absent, no match: marks the row offline and keeps it", async () => {
        const asset = await saveImage("fox");
        await folder(kind).delete("Generated/fox.png");

        const report = await reconcileProjectIndex(PROJECT, USER);

        expect(report.offline).toEqual([asset.id]);
        const rows = await rowsOf();
        expect(rows.map((row) => row.id)).toEqual([asset.id]);
        expect(rows[0]?.workspace_path).toBe("Generated/fox.png");
        expect(isProjectAssetOffline(rows[0]!)).toBe(true);
      });

      it("file absent, several matches: marks the row offline instead of guessing", async () => {
        const asset = await saveImage("fox");
        const workspace = folder(kind);
        await workspace.copy("Generated/fox.png", "copies/one.dat");
        await workspace.copy("Generated/fox.png", "copies/two.dat");
        await workspace.delete("Generated/fox.png");

        const report = await reconcileProjectIndex(PROJECT, USER);

        expect(report.offline).toEqual([asset.id]);
        expect(report.moved).toEqual([]);
        const [row, ...rest] = await rowsOf();
        expect(rest).toEqual([]);
        expect(row?.workspace_path).toBe("Generated/fox.png");
        expect(isProjectAssetOffline(row!)).toBe(true);
      });

      it("one file two missing rows could have moved to goes to neither", async () => {
        const first = await saveImage("fox");
        const second = await saveImage("wolf");
        const workspace = folder(kind);
        await workspace.move("Generated/fox.png", "kept.dat");
        await workspace.delete("Generated/wolf.png");

        const report = await reconcileProjectIndex(PROJECT, USER);

        expect(report.moved).toEqual([]);
        expect([...report.offline].sort()).toEqual([first.id, second.id].sort());
        expect((await reload(first)).workspace_path).toBe("Generated/fox.png");
        expect((await reload(second)).workspace_path).toBe("Generated/wolf.png");
      });

      it.each([
        ["image", "art/fox.png", "image/png"],
        ["video", "footage/take.mp4", "video/mp4"],
        ["audio", "sound/theme.wav", "audio/wav"],
        ["3D", "models/chair.glb", "model/gltf-binary"]
      ])(
        "%s file present, no row: creates a row and builds no thumbnail",
        async (_label, path, contentType) => {
          await folder(kind).write(path, PNG);

          const report = await reconcileProjectIndex(PROJECT, USER);

          const [row, ...rest] = await rowsOf();
          expect(rest).toEqual([]);
          expect(report.created).toEqual([row?.id]);
          expect(row).toMatchObject({
            user_id: USER,
            project_id: PROJECT,
            parent_id: USER,
            name: path.slice(path.lastIndexOf("/") + 1),
            content_type: contentType,
            workspace_path: path,
            size: PNG.byteLength
          });
          expect(row?.metadata).toMatchObject({
            workspace_size: PNG.byteLength,
            workspace_hash: partialContentHash(PNG)
          });
          expect(await bytesOf(row!)).toEqual(PNG);
          expect(
            await assetStore.exists(
              assetStore.uriForKey(getAssetThumbnailKey(USER, row!.id))
            )
          ).toBe(false);
          // The row is found again, not created a second time.
          expect((await reconcileProjectIndex(PROJECT, USER)).created).toEqual([]);
          expect(await rowsOf()).toHaveLength(1);
        }
      );

      it("other file present, no row: creates nothing", async () => {
        await folder(kind).write("notes/plan.txt", text("plan"));
        await folder(kind).write("data.json", text("{}"));

        const report = await reconcileProjectIndex(PROJECT, USER);

        expect(report.files).toBe(2);
        expect(report.created).toEqual([]);
        expect(await rowsOf()).toEqual([]);
      });
    });

    it("renaming a file and reconciling keeps the asset id, and the id still resolves the bytes", async () => {
      const asset = await saveImage("fox");
      expect(await bytesOf(asset)).toEqual(PNG);
      await folder(kind).move("Generated/fox.png", "Generated/fox-final.png");
      // The id resolves nothing while the row still names the old path.
      expect(await bytesOf(asset)).toBeNull();

      await reconcileProjectIndex(PROJECT, USER);

      const after = await reload(asset);
      expect(after.id).toBe(asset.id);
      expect(after.workspace_path).toBe("Generated/fox-final.png");
      expect(await bytesOf(asset)).toEqual(PNG);
      const key = getAssetStorageKey(USER, asset.id, asset.content_type);
      expect(await assetStore.exists(assetStore.uriForKey(key))).toBe(true);
    });

    it("deleting a file leaves the row offline, every reader reports it missing, and a file that comes back restores it", async () => {
      const asset = await saveImage("fox");
      await folder(kind).delete("Generated/fox.png");
      await reconcileProjectIndex(PROJECT, USER);

      const offline = await reload(asset);
      expect(isProjectAssetOffline(offline)).toBe(true);
      const uri = assetStore.uriForKey(
        getAssetStorageKey(USER, asset.id, asset.content_type)
      );
      expect(await assetStore.retrieve(uri)).toBeNull();
      expect(await assetStore.exists(uri)).toBe(false);
      expect(await assetStore.stat(uri)).toBeNull();
      expect(await assetStore.localPath(uri)).toBeNull();

      // A file put back at the path the row names is the asset again.
      const restoredBytes = Uint8Array.from([...PNG, 7]);
      await folder(kind).write("Generated/fox.png", restoredBytes);
      // Until the reconcile sees it, the row still reads as missing.
      expect(await assetStore.retrieve(uri)).toBeNull();

      const report = await reconcileProjectIndex(PROJECT, USER);

      expect(report.restored).toEqual([asset.id]);
      const restored = await reload(asset);
      expect(isProjectAssetOffline(restored)).toBe(false);
      expect(await bytesOf(asset)).toEqual(restoredBytes);
    });

    it("relink with a replacement file from outside the folder brings the asset back under the same id", async () => {
      const asset = await saveImage("fox");
      await folder(kind).delete("Generated/fox.png");
      await reconcileProjectIndex(PROJECT, USER);
      const offline = await reload(asset);
      expect(isProjectAssetOffline(offline)).toBe(true);

      const replacement = Uint8Array.from([...PNG, 4, 5]);
      const outside = join(root, "elsewhere");
      await mkdir(outside, { recursive: true });
      await writeFile(join(outside, "new fox.png"), replacement);

      expect(
        await relinkProjectAsset(offline, {
          localPath: join(outside, "new fox.png")
        })
      ).toBe(true);

      const after = await reload(asset);
      expect(after.id).toBe(asset.id);
      expect(after.workspace_path).toBe("Generated/new fox.png");
      expect(after.size).toBe(replacement.byteLength);
      expect(isProjectAssetOffline(after)).toBe(false);
      expect(after.metadata).toMatchObject({
        workspace_hash: partialContentHash(replacement)
      });
      expect(await bytesOf(asset)).toEqual(replacement);
      expect(await folder(kind).read("Generated/new fox.png")).toEqual(replacement);
      // One row, and the reconcile agrees with it.
      const report = await reconcileProjectIndex(PROJECT, USER);
      expect(report).toMatchObject({ unchanged: 1, created: [], offline: [] });
      expect(await rowsOf()).toHaveLength(1);
    });

    it("relink copies a replacement of the same name to the path the asset had", async () => {
      const asset = await saveImage("fox");
      await folder(kind).delete("Generated/fox.png");
      await reconcileProjectIndex(PROJECT, USER);
      const outside = join(root, "elsewhere");
      await mkdir(outside, { recursive: true });
      await writeFile(join(outside, "fox.png"), PNG);

      await relinkProjectAsset(await reload(asset), {
        localPath: join(outside, "fox.png")
      });

      expect((await reload(asset)).workspace_path).toBe("Generated/fox.png");
      expect(await bytesOf(asset)).toEqual(PNG);
    });

    it("relink accepts a file already in the folder and leaves it where it is", async () => {
      const asset = await saveImage("fox");
      const workspace = folder(kind);
      await workspace.delete("Generated/fox.png");
      const replacement = Uint8Array.from([...PNG, 9]);
      await workspace.write("retakes/fox v2.png", replacement);
      // The retake is media, so the reconcile gives it its own row first.
      await workspace.write("retakes/notes.txt", text("use v2"));
      await reconcileProjectIndex(PROJECT, USER);
      const retake = (await rowsOf()).find(
        (row) => row.workspace_path === "retakes/fox v2.png"
      );
      expect(retake).toBeDefined();

      // A file that belongs to another asset is refused.
      await expect(
        relinkProjectAsset(await reload(asset), { path: "retakes/fox v2.png" })
      ).rejects.toBeInstanceOf(ProjectAssetRelinkError);
      await expect(
        relinkProjectAsset(await reload(asset), { path: "retakes/missing.png" })
      ).rejects.toBeInstanceOf(ProjectAssetRelinkError);
      expect(isProjectAssetOffline(await reload(asset))).toBe(true);

      // Remove deletes that row and nothing else. The file stays.
      await retake!.delete();
      await relinkProjectAsset(await reload(asset), {
        path: "retakes/fox v2.png"
      });

      const after = await reload(asset);
      expect(after.workspace_path).toBe("retakes/fox v2.png");
      expect(isProjectAssetOffline(after)).toBe(false);
      expect(await bytesOf(asset)).toEqual(replacement);
      expect(await workspace.read("retakes/fox v2.png")).toEqual(replacement);
      expect((await rowsOf()).map((row) => row.id)).toEqual([asset.id]);
    });

    it("a folder with a text file and a PNG produces one row, for the PNG, and ensureAssetForPath gives the text file its row", async () => {
      const workspace = folder(kind);
      await workspace.write("notes.txt", text("hello"));
      await workspace.write("fox.png", PNG);

      await reconcileProjectIndex(PROJECT, USER);

      const [png, ...rest] = await rowsOf();
      expect(rest).toEqual([]);
      expect(png?.workspace_path).toBe("fox.png");

      const note = await ensureAssetForPath(PROJECT, USER, "notes.txt");

      expect(note).toMatchObject({
        project_id: PROJECT,
        name: "notes.txt",
        content_type: "text/plain",
        workspace_path: "notes.txt",
        size: 5
      });
      expect(note.metadata).toMatchObject({
        workspace_hash: partialContentHash(text("hello"))
      });
      expect(await bytesOf(note)).toEqual(text("hello"));
      expect((await rowsOf()).map((row) => row.id).sort()).toEqual(
        [png!.id, note.id].sort()
      );
      // First use creates the row once. Later uses find it.
      expect((await ensureAssetForPath(PROJECT, USER, "notes.txt")).id).toBe(note.id);
      expect((await ensureAssetForPath(PROJECT, USER, "fox.png")).id).toBe(png!.id);
      expect(await rowsOf()).toHaveLength(2);
      await expect(
        ensureAssetForPath(PROJECT, USER, "absent.txt")
      ).rejects.toThrow("No file at absent.txt");
    });

    it("skips dot-directories and node_modules, and keeps a row that names a file inside one", async () => {
      const workspace = folder(kind);
      await workspace.write(".git/objects/logo.png", PNG);
      await workspace.write("node_modules/pkg/icon.png", PNG);
      await workspace.write("src/.cache/thumb.png", PNG);
      await workspace.write("src/app/node_modules/dep/pic.png", PNG);
      await workspace.write("src/seen.png", PNG);
      // A caller chose a path in a skipped directory for its asset.
      const hidden = await saveProjectAsset({
        projectId: PROJECT,
        userId: USER,
        name: "hidden",
        contentType: "image/png",
        bytes: PNG,
        path: ".exports/hidden.png"
      });

      const report = await reconcileProjectIndex(PROJECT, USER);

      expect(report.files).toBe(1);
      expect(report.offline).toEqual([]);
      const rows = await rowsOf();
      expect(rows.map((row) => row.workspace_path).sort()).toEqual([
        ".exports/hidden.png",
        "src/seen.png"
      ]);
      expect(isProjectAssetOffline(await reload(hidden))).toBe(false);

      // Its file is still looked at: once it is gone the row goes offline.
      await workspace.delete(".exports/hidden.png");
      expect((await reconcileProjectIndex(PROJECT, USER)).offline).toEqual([
        hidden.id
      ]);
    });

    it("leaves a file alone while a rename waits for its row", async () => {
      const asset = await saveImage("fox");
      const change = await renameProjectAssetFile(asset, "wolf");
      expect(change).not.toBeNull();
      // Both files exist and the row is not saved yet.
      expect(await folder(kind).exists("Generated/wolf.png")).toBe(true);

      const during = await reconcileProjectIndex(PROJECT, USER);
      expect(during).toMatchObject({ created: [], moved: [], offline: [] });

      await asset.save();
      const between = await reconcileProjectIndex(PROJECT, USER);
      expect(between).toMatchObject({ created: [], moved: [], offline: [] });

      await change!.commit();
      const after = await reconcileProjectIndex(PROJECT, USER);
      expect(after).toMatchObject({ unchanged: 1, created: [], offline: [] });
      const rows = await rowsOf();
      expect(rows.map((row) => row.id)).toEqual([asset.id]);
      expect(rows[0]?.workspace_path).toBe("Generated/wolf.png");
    });

    it("does not bring back a row that was deleted while the scan ran", async () => {
      const asset = await saveImage("fox");
      await folder(kind).delete("Generated/fox.png");
      const list = vi.spyOn(Asset, "listProjectFiles");
      list.mockImplementationOnce(async (userId, projectId) => {
        list.mockRestore();
        const rows = await Asset.listProjectFiles(userId, projectId);
        // Remove deletes the row after the reconcile read it.
        await asset.delete();
        return rows;
      });

      const report = await reconcileProjectIndex(PROJECT, USER);

      expect(report.offline).toEqual([]);
      expect(await Asset.find(USER, asset.id)).toBeNull();
    });

    it("changes no row when the folder cannot be reached", async () => {
      const asset = await saveImage("fox");
      unreachable = true;

      await expect(reconcileProjectIndex(PROJECT, USER)).rejects.toBeInstanceOf(
        ProjectFolderUnavailableError
      );

      unreachable = false;
      expect(isProjectAssetOffline(await reload(asset))).toBe(false);
    });

    it("changes no row when a directory cannot be listed", async () => {
      const asset = await saveImage("fox");
      const workspace = folder(kind);
      vi.spyOn(workspace, "list").mockRejectedValue(new Error("bucket is down"));

      await expect(reconcileProjectIndex(PROJECT, USER)).rejects.toThrow(
        "bucket is down"
      );

      expect(isProjectAssetOffline(await reload(asset))).toBe(false);
    });

    it("emits the asset change events open views refresh on", async () => {
      const gone = await saveImage("fox");
      const workspace = folder(kind);
      await workspace.delete("Generated/fox.png");
      await workspace.write("new.png", Uint8Array.from([...PNG, 1]));
      const events: Array<[string, ModelChangeEvent]> = [];
      ModelObserver.subscribe(
        (instance, event) => events.push([(instance as Asset).id, event]),
        "Asset"
      );

      const report = await reconcileProjectIndex(PROJECT, USER);

      expect(events).toEqual([
        [gone.id, ModelChangeEvent.UPDATED],
        [report.created[0], ModelChangeEvent.CREATED]
      ]);
    });

    describe("cost", () => {
      /** Counts the calls a reconcile makes on the folder. */
      function counted(inner: Workspace): {
        workspace: Workspace;
        calls: Record<"list" | "stat" | "read" | "materialize", number>;
      } {
        const calls = { list: 0, stat: 0, read: 0, materialize: 0 };
        const workspace = Object.create(inner) as Workspace;
        workspace.list = (path, opts) => {
          calls.list++;
          return inner.list(path, opts);
        };
        workspace.stat = (path) => {
          calls.stat++;
          return inner.stat(path);
        };
        workspace.read = (path) => {
          calls.read++;
          return inner.read(path);
        };
        workspace.materialize = (path) => {
          calls.materialize++;
          return inner.materialize(path);
        };
        return { workspace, calls };
      }

      /**
       * A folder of `count` files in 50 directories. Per directory: 10 media
       * files with rows, 2 media files with no row, 1 row whose file moved
       * and 1 row whose file is gone. The rest are text files.
       */
      async function populate(projectId: string, count: number): Promise<void> {
        const workspace = folder(kind, projectId);
        const directories = 50;
        const perDirectory = count / directories;
        const rows: Array<Record<string, unknown>> = [];
        const row = (path: string, bytes: Uint8Array): void => {
          rows.push({
            user_id: USER,
            project_id: projectId,
            parent_id: USER,
            name: path,
            content_type: "image/png",
            workspace_path: path,
            size: bytes.byteLength,
            metadata: {
              workspace_size: bytes.byteLength,
              workspace_mtime: 0,
              workspace_hash: partialContentHash(bytes)
            }
          });
        };
        for (let d = 0; d < directories; d++) {
          await workspace.mkdir(`dir-${d}`);
          const writes: Promise<void>[] = [];
          for (let f = 0; f < perDirectory; f++) {
            const media = f < 13;
            const path = `dir-${d}/file-${f}.${media ? "png" : "txt"}`;
            // Every file has its own bytes and its own size class.
            const bytes = text(`${projectId}/${path}`.padEnd(40 + (f % 7), "."));
            writes.push(workspace.write(path, bytes));
            if (f < 10) row(path, bytes);
            // The row names a path the file is no longer at.
            if (f === 12) row(`dir-${d}/before-move.png`, bytes);
          }
          row(`dir-${d}/deleted.png`, text(`deleted ${d}`));
          await Promise.all(writes);
        }
        for (const data of rows) await Asset.create(data);
        // Give the rows of present files the mtime the folder reports.
        const listed = new Map(
          (await workspace.list("", { recursive: true })).map((entry) => [
            entry.path,
            entry.modifiedAt
          ])
        );
        for (const asset of await Asset.listProjectFiles(USER, projectId)) {
          const mtime = listed.get(asset.workspace_path ?? "");
          if (mtime === undefined) continue;
          asset.metadata = { ...asset.metadata, workspace_mtime: mtime };
          await asset.save();
        }
      }

      async function measure(
        projectId: string,
        count: number
      ): Promise<{
        calls: Record<"list" | "stat" | "read" | "materialize", number>;
        queries: number;
        report: Awaited<ReturnType<typeof reconcileProjectIndex>>;
      }> {
        await populate(projectId, count);
        const { workspace, calls } = counted(folder(kind, projectId));
        workspaces.set(projectId, workspace);
        const listRows = vi.spyOn(Asset, "listProjectFiles");
        const findByPath = vi.spyOn(Asset, "findByWorkspacePath");
        const report = await reconcileProjectIndex(projectId, USER);
        const queries = listRows.mock.calls.length + findByPath.mock.calls.length;
        listRows.mockRestore();
        findByPath.mockRestore();
        return { calls, queries, report };
      }

      it(
        "a folder of 50,000 files reconciles with a number of operations that grows linearly",
        async () => {
          const small = await measure("small", 5_000);
          const large = await measure("large", 50_000);

          // The same work per directory at both sizes.
          for (const { report, count } of [
            { report: small.report, count: 5_000 },
            { report: large.report, count: 50_000 }
          ]) {
            expect(report.files).toBe(count);
            expect(report.unchanged).toBe(500);
            expect(report.moved).toHaveLength(50);
            expect(report.offline).toHaveLength(50);
            expect(report.created).toHaveLength(100);
          }
          // One listing per directory plus the root, whatever the file count.
          expect(small.calls.list).toBe(51);
          expect(large.calls.list).toBe(51);
          // The rows come from one query, and no row is looked up by path.
          expect(small.queries).toBe(1);
          expect(large.queries).toBe(1);
          // No file is read whole or looked at on its own.
          expect(large.calls.read).toBe(0);
          expect(large.calls.stat).toBe(0);
          // A file is hashed only when it has no row and is media, or has the
          // size of a missing row. Ten times the files, at most ten times the
          // hashes. Text files with no missing row of their size are not read.
          expect(small.calls.materialize).toBeGreaterThanOrEqual(150);
          expect(large.calls.materialize).toBeLessThanOrEqual(
            small.calls.materialize * 10
          );
          expect(large.calls.materialize).toBeLessThan(50_000);
        },
        300_000
      );
    });
  }
);

describe("reconcileProjectIndex (local folder only)", () => {
  beforeEach(() => useFolders("local"));

  it("does not traverse a symlink to a directory outside the folder", async () => {
    const outside = join(root, "outside");
    await mkdir(join(outside, "nested"), { recursive: true });
    await writeFile(join(outside, "secret.png"), PNG);
    await writeFile(join(outside, "nested", "deep.png"), PNG);
    const workspace = folder("local");
    await workspace.write("inside.png", Uint8Array.from([...PNG, 1]));
    await symlink(outside, join(root, "projects", PROJECT, "linked"), "dir");
    // A linked file is not followed either.
    await symlink(
      join(outside, "secret.png"),
      join(root, "projects", PROJECT, "linked-file.png"),
      "file"
    );
    const list = vi.spyOn(workspace, "list");

    const report = await reconcileProjectIndex(PROJECT, USER);

    expect(report.files).toBe(1);
    expect((await rowsOf()).map((row) => row.workspace_path)).toEqual([
      "inside.png"
    ]);
    expect(list.mock.calls.map(([path]) => path)).toEqual([""]);
  });

  it("does not match a moved file through a symlink that leaves the folder", async () => {
    const asset = await saveImage("fox");
    const outside = join(root, "outside");
    await mkdir(outside, { recursive: true });
    const workspace = folder("local");
    // The file is moved out of the folder and linked back in.
    await writeFile(join(outside, "fox.png"), PNG);
    await workspace.delete("Generated/fox.png");
    await symlink(outside, join(root, "projects", PROJECT, "moved"), "dir");

    const report = await reconcileProjectIndex(PROJECT, USER);

    expect(report.moved).toEqual([]);
    expect(report.offline).toEqual([asset.id]);
    expect((await reload(asset)).workspace_path).toBe("Generated/fox.png");
  });
});

describe("reconcile triggers", () => {
  beforeEach(() => {
    useFolders("storage");
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  });

  it("debounces: a burst of changes reconciles once, after the folder is quiet", async () => {
    await folder("storage").write("fox.png", PNG);
    // The folder is flat, so each reconcile lists it once.
    const scans = vi.spyOn(folder("storage"), "list");

    scheduleProjectReconcile(PROJECT, USER);
    await vi.advanceTimersByTimeAsync(RECONCILE_DEBOUNCE_MS - 1);
    scheduleProjectReconcile(PROJECT, USER);
    await vi.advanceTimersByTimeAsync(RECONCILE_DEBOUNCE_MS - 1);
    scheduleProjectReconcile(PROJECT, USER);
    expect(scans).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(RECONCILE_DEBOUNCE_MS);
    await flushProjectReconciles();

    expect(scans).toHaveBeenCalledTimes(1);
    expect((await rowsOf()).map((row) => row.workspace_path)).toEqual(["fox.png"]);
  });

  it("does not wait forever while changes keep arriving", async () => {
    const scans = vi.spyOn(folder("storage"), "list");
    const step = RECONCILE_DEBOUNCE_MS - 100;
    for (let waited = 0; waited < RECONCILE_MAX_WAIT_MS; waited += step) {
      scheduleProjectReconcile(PROJECT, USER);
      await vi.advanceTimersByTimeAsync(step);
    }

    // It ran on its own, with a change still less than the quiet time old.
    expect(scans).toHaveBeenCalledTimes(1);
    await flushProjectReconciles();
    expect(scans).toHaveBeenCalledTimes(1);
  });

  it("reconciles on project open, and not again right after", async () => {
    // A project no earlier test reconciled.
    const OPENED = "project-opened";
    await folder("storage", OPENED).write("fox.png", PNG);
    const scans = vi.spyOn(folder("storage", OPENED), "list");

    reconcileProjectOnOpen(OPENED, USER);
    await vi.advanceTimersByTimeAsync(RECONCILE_DEBOUNCE_MS);
    await flushProjectReconciles();
    expect(scans).toHaveBeenCalledTimes(1);
    expect(await rowsOf(OPENED)).toHaveLength(1);

    reconcileProjectOnOpen(OPENED, USER);
    await vi.advanceTimersByTimeAsync(RECONCILE_DEBOUNCE_MS);
    await flushProjectReconciles();
    expect(scans).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(OPEN_RECONCILE_INTERVAL_MS);
    reconcileProjectOnOpen(OPENED, USER);
    await vi.advanceTimersByTimeAsync(RECONCILE_DEBOUNCE_MS);
    await flushProjectReconciles();
    expect(scans).toHaveBeenCalledTimes(2);
  });

  it("a scheduled reconcile of an unreachable folder does not throw", async () => {
    unreachable = true;
    ProjectIndex.schedule(PROJECT, USER);
    await vi.advanceTimersByTimeAsync(RECONCILE_DEBOUNCE_MS);
    await expect(ProjectIndex.flush()).resolves.toBeUndefined();
  });
});
