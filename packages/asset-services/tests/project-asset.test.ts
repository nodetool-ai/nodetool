/**
 * Assets as files in a project folder (PRD T3): one file plus one row,
 * readable names, collision suffixes, rename, replace, delete, and the
 * key-miss lookup that serves the file under the asset's id key.
 *
 * Every case runs against a local directory and against a storage-backed
 * folder (a key prefix in an object store), through the same `Workspace`
 * interface.
 */
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Asset,
  initTestDb,
  LOOSE_PROJECT_ID,
  ModelObserver,
  saveAssetInProject
} from "@nodetool-ai/models";
import {
  createLocalWorkspace,
  createWorkspace,
  setProjectFolderResolver,
  type ProjectFolderResolution,
  type Workspace
} from "@nodetool-ai/runtime";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";
import {
  createAssetModelInterface,
  createStoredAsset,
  updateAssetBytesModelInterface
} from "../src/asset-model-interface.js";
import {
  getAssetStorageKey,
  retrieveAssetBytes
} from "../src/asset-paths.js";
import {
  lookupExternalAssetPath,
  lookupProjectAssetFile
} from "../src/external-asset-lookup.js";
import {
  DirectoryNames,
  GENERATED_DIRECTORY,
  IMPORTED_DIRECTORY,
  claimFile,
  deleteProjectAssetFile,
  moveProjectAssetFile,
  projectAssetFileStem,
  renameProjectAssetFile,
  replaceProjectAssetBytes,
  saveProjectAsset
} from "../src/project-asset.js";
import {
  PARTIAL_HASH_SPAN,
  ProjectFolderUnavailableError,
  partialContentHash,
  partialContentHashOfFile
} from "../src/project-asset-file.js";
import { ProjectAssetStorageAdapter } from "../src/project-asset-storage.js";
import { getAssetAdapter } from "../src/storage.js";

vi.mock("../src/storage.js", () => ({ getAssetAdapter: vi.fn() }));

const USER = "owner";
const PROJECT = "project-a";
/** A 1x1 PNG, so the thumbnail generator has a real image. */
const PNG = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64"
  )
);

interface Folder {
  workspace: Workspace;
  /** Every file in the folder, as project-relative paths. */
  files(): Promise<string[]>;
}

let root: string;
/** The asset store, as the server builds it for an object-store backend. */
let assetStore: ProjectAssetStorageAdapter;
let rawStore: InMemoryStorageAdapter;
let folders: Map<string, Folder>;
let unreachable: string | null;

function listing(workspace: Workspace): () => Promise<string[]> {
  return async () =>
    (await workspace.list("", { recursive: true })).map((e) => e.path).sort();
}

const kinds = {
  /** A real directory on this host. */
  local: (projectId: string): Folder => {
    const workspace = createLocalWorkspace(join(root, projectId));
    return { workspace, files: listing(workspace) };
  },
  /** A key prefix in the object store the assets live in. */
  storage: (projectId: string): Folder => {
    const workspace = createWorkspace(rawStore, {
      prefix: `workspaces/${USER}/${projectId}`
    });
    return { workspace, files: listing(workspace) };
  }
} as const;

beforeEach(async () => {
  initTestDb();
  root = await mkdtemp(join(tmpdir(), "nodetool-project-asset-"));
  rawStore = new InMemoryStorageAdapter();
  assetStore = new ProjectAssetStorageAdapter(rawStore);
  vi.mocked(getAssetAdapter).mockReturnValue(assetStore);
  folders = new Map();
  unreachable = null;
});

afterEach(async () => {
  ModelObserver.clear();
  setProjectFolderResolver(null);
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});

function useFolders(kind: keyof typeof kinds): void {
  setProjectFolderResolver(
    async (projectId): Promise<ProjectFolderResolution> => {
      // The loose id names Personal's folder, as the host resolver does.
      const id =
        !projectId || projectId === LOOSE_PROJECT_ID ? "personal" : projectId;
      if (id === unreachable) {
        return { ok: false, projectId: id, reason: `Project folder not found: ${id}` };
      }
      let folder = folders.get(id);
      if (!folder) {
        folder = kinds[kind](id);
        folders.set(id, folder);
      }
      return { ok: true, projectId: id, workspace: folder.workspace };
    }
  );
}

function folder(projectId = PROJECT): Folder {
  const found = folders.get(projectId);
  if (!found) throw new Error(`no folder for ${projectId}`);
  return found;
}

/** Keys in the asset store that hold an asset's bytes (not a thumbnail). */
async function legacyAssetKeys(): Promise<string[]> {
  return (await rawStore.list(""))
    .entries.map((entry) => entry.key)
    .filter((key) => !key.startsWith("workspaces/") && !key.includes("_thumb"));
}

function fox(extra: Partial<Parameters<typeof saveProjectAsset>[0]> = {}) {
  return saveProjectAsset({
    projectId: PROJECT,
    userId: USER,
    name: "fox in snow",
    contentType: "image/png",
    bytes: PNG,
    ...extra
  } as Parameters<typeof saveProjectAsset>[0]);
}

describe.each(["local", "storage"] as const)(
  "project assets in a %s folder",
  (kind) => {
    beforeEach(() => useFolders(kind));

    it("saves an image named 'fox in snow' as one file in Generated/ and one row", async () => {
      const asset = await fox({
        provenance: { workflow_id: "wf", node_id: "node", job_id: "job" }
      });

      expect(await folder().files()).toEqual(["Generated/fox-in-snow.png"]);
      expect(await legacyAssetKeys()).toEqual([]);

      const row = await Asset.find(USER, asset.id);
      expect(row?.project_id).toBe(PROJECT);
      expect(row?.workspace_path).toBe("Generated/fox-in-snow.png");
      expect(row?.name).toBe("fox in snow");
      expect(row?.size).toBe(PNG.byteLength);
      expect(row).toMatchObject({
        workflow_id: "wf",
        node_id: "node",
        job_id: "job"
      });
      expect(row?.metadata).toMatchObject({
        workspace_size: PNG.byteLength,
        workspace_hash: partialContentHash(PNG)
      });
      expect(typeof row?.metadata?.["workspace_mtime"]).toBe("number");
      expect(await Asset.paginate(USER, {})).toHaveProperty("0.length", 1);
    });

    it("serves the file's bytes under the asset's id key", async () => {
      const asset = await fox();
      const key = getAssetStorageKey(USER, asset.id, asset.content_type);

      expect(await assetStore.retrieve(assetStore.uriForKey(key))).toEqual(PNG);
      expect(await assetStore.exists(assetStore.uriForKey(key))).toBe(true);
      expect(await assetStore.stat(assetStore.uriForKey(key))).toMatchObject({
        key,
        size: PNG.byteLength
      });
      expect(
        await retrieveAssetBytes(assetStore, USER, asset.id, asset.content_type)
      ).toEqual(PNG);
      expect(await rawStore.exists(rawStore.uriForKey(key))).toBe(false);
    });

    it("resolves the id key to the file only for its owner and its extension", async () => {
      const asset = await fox();

      expect(await lookupProjectAssetFile(`${USER}/${asset.id}.png`)).toMatchObject({
        path: "Generated/fox-in-snow.png"
      });
      expect(await lookupProjectAssetFile(`${USER}/${asset.id}`)).not.toBeNull();
      expect(await lookupProjectAssetFile(`someone-else/${asset.id}.png`)).toBeNull();
      expect(await lookupProjectAssetFile(`${USER}/${asset.id}.jpg`)).toBeNull();
      expect(await lookupProjectAssetFile(`${asset.id}.png`)).toBeNull();
      // The 12-character id an agent tool returns names the same file.
      expect(
        await lookupProjectAssetFile(`${USER}/${asset.id.slice(0, 12)}.png`)
      ).toMatchObject({ path: "Generated/fox-in-snow.png" });
      expect(await lookupProjectAssetFile(`${USER}/${asset.id.slice(0, 11)}.png`)).toBeNull();
      expect(await lookupProjectAssetFile(`${USER}/${asset.id.slice(0, 13)}.png`)).toBeNull();
      expect(
        await lookupProjectAssetFile(`someone-else/${asset.id.slice(0, 12)}.png`)
      ).toBeNull();
    });

    it("does not resolve a short id that two of the owner's assets share", async () => {
      const prefix = "abcdef012345";
      await fox();
      for (const tail of ["0", "1"]) {
        await Asset.create({
          id: `${prefix}${tail.repeat(20)}`,
          user_id: USER,
          project_id: PROJECT,
          name: "twin",
          content_type: "image/png",
          workspace_path: `Generated/twin-${tail}.png`
        });
        await folder().workspace.write(`Generated/twin-${tail}.png`, PNG);
      }

      expect(await lookupProjectAssetFile(`${USER}/${prefix}.png`)).toBeNull();
      expect(
        await lookupProjectAssetFile(`${USER}/${prefix}${"0".repeat(20)}.png`)
      ).toMatchObject({ path: "Generated/twin-0.png" });
    });

    it("gives the path of the real file for a local folder, and none for a storage-backed one", async () => {
      const asset = await fox();
      const key = getAssetStorageKey(USER, asset.id, asset.content_type);
      const expected =
        kind === "local"
          ? join(root, PROJECT, "Generated", "fox-in-snow.png")
          : null;

      expect(await lookupExternalAssetPath(key)).toBe(expected);
      expect(await assetStore.localPath(assetStore.uriForKey(key))).toBe(expected);
      if (expected) expect(await readFile(expected)).toEqual(Buffer.from(PNG));
    });

    it("gives a second output of the same name a suffixed file and its own row", async () => {
      const first = await fox();
      const second = await fox({ bytes: new Uint8Array([1, 2, 3]) });
      const third = await fox();

      expect(second.id).not.toBe(first.id);
      expect(first.workspace_path).toBe("Generated/fox-in-snow.png");
      expect(second.workspace_path).toBe("Generated/fox-in-snow-2.png");
      expect(third.workspace_path).toBe("Generated/fox-in-snow-3.png");
      expect(await folder().files()).toEqual([
        "Generated/fox-in-snow-2.png",
        "Generated/fox-in-snow-3.png",
        "Generated/fox-in-snow.png"
      ]);
      expect(
        await retrieveAssetBytes(assetStore, USER, second.id, second.content_type)
      ).toEqual(new Uint8Array([1, 2, 3]));
      expect(
        await retrieveAssetBytes(assetStore, USER, first.id, first.content_type)
      ).toEqual(PNG);
    });

    it("keeps names that differ only by case apart", async () => {
      const lower = await fox({ name: "fox" });
      const upper = await fox({ name: "FOX" });

      expect(lower.workspace_path).toBe("Generated/fox.png");
      expect(upper.workspace_path).toBe("Generated/FOX-2.png");
    });

    it("writes concurrent saves of one name to distinct files", async () => {
      const saved = await Promise.all(
        Array.from({ length: 12 }, (_, i) =>
          fox({ contentType: "text/plain", bytes: new Uint8Array([i]) })
        )
      );

      const paths = saved.map((asset) => asset.workspace_path);
      expect(new Set(paths).size).toBe(12);
      expect(await folder().files()).toHaveLength(12);
      for (const [i, asset] of saved.entries()) {
        expect(
          await retrieveAssetBytes(assetStore, USER, asset.id, asset.content_type)
        ).toEqual(new Uint8Array([i]));
      }
    });

    it("stays fast when one name has been used many times", async () => {
      const count = 150;
      for (let i = 0; i < count; i++) {
        await fox({ contentType: "text/plain", bytes: new Uint8Array([i]) });
      }
      const workspace = folder().workspace;
      const exists = vi.spyOn(workspace, "exists");
      const lookups = vi.spyOn(Asset, "findByWorkspacePath");

      const next = await fox({ contentType: "text/plain", bytes: new Uint8Array([7]) });

      expect(next.workspace_path).toBe(`Generated/fox-in-snow-${count + 1}.txt`);
      // One listing finds the free name. Nothing is probed once per taken name.
      expect(exists.mock.calls.length).toBeLessThanOrEqual(2);
      expect(lookups.mock.calls.length).toBeLessThanOrEqual(2);
    });

    // ── F9: a save never replaces a file ───────────────────────────────────

    it("does not replace a file another process wrote after the name was chosen", async () => {
      await fox({ name: "seed" });
      const workspace = folder().workspace;
      const theirs = new Uint8Array([4, 2]);
      // The second process writes the same name in the window between this
      // save's directory listing and its write, and has no row yet.
      const list = workspace.list.bind(workspace);
      vi.spyOn(workspace, "list").mockImplementationOnce(async (path, opts) => {
        const entries = await list(path, opts);
        await workspace.write("Generated/fox-in-snow.png", theirs);
        return entries;
      });

      const mine = await fox();

      expect(mine.workspace_path).toBe("Generated/fox-in-snow-2.png");
      expect(await workspace.read("Generated/fox-in-snow.png")).toEqual(theirs);
      expect(
        await retrieveAssetBytes(assetStore, USER, mine.id, mine.content_type)
      ).toEqual(PNG);
    });

    it("gives two processes that chose the same name two files", async () => {
      await fox({ name: "seed" });
      const workspace = folder().workspace;
      // Neither process sees the other: each lists the directory before
      // either writes, and no row exists yet for either file.
      vi.spyOn(workspace, "list").mockResolvedValue([]);
      vi.spyOn(Asset, "findByWorkspacePath").mockResolvedValue([]);

      const first = await fox({ bytes: new Uint8Array([1]) });
      const second = await fox({ bytes: new Uint8Array([2]) });
      vi.restoreAllMocks();
      vi.mocked(getAssetAdapter).mockReturnValue(assetStore);

      expect(first.workspace_path).toBe("Generated/fox-in-snow.png");
      expect(second.workspace_path).toBe("Generated/fox-in-snow-2.png");
      expect(
        await retrieveAssetBytes(assetStore, USER, first.id, first.content_type)
      ).toEqual(new Uint8Array([1]));
      expect(
        await retrieveAssetBytes(assetStore, USER, second.id, second.content_type)
      ).toEqual(new Uint8Array([2]));
    });

    it("does not replace a file that appears while an asset is renamed onto its name", async () => {
      const asset = await fox();
      const workspace = folder().workspace;
      const theirs = new Uint8Array([4, 2]);
      const list = workspace.list.bind(workspace);
      vi.spyOn(workspace, "list").mockImplementationOnce(async (path, opts) => {
        const entries = await list(path, opts);
        await workspace.write("Generated/red-fox.png", theirs);
        return entries;
      });

      const change = await renameProjectAssetFile(asset, "red fox");
      await asset.save();
      await change?.commit();

      expect(asset.workspace_path).toBe("Generated/red-fox-2.png");
      expect(await workspace.read("Generated/red-fox.png")).toEqual(theirs);
      expect(
        await retrieveAssetBytes(assetStore, USER, asset.id, asset.content_type)
      ).toEqual(PNG);
    });

    // ── F8: an asset's file moves with it to another project ───────────────

    it("moves the file into the other project's folder with the asset", async () => {
      const asset = await fox();

      await saveAssetInProject(asset, "project-b");

      const row = await Asset.find(USER, asset.id);
      expect(row?.project_id).toBe("project-b");
      expect(row?.workspace_path).toBe("Generated/fox-in-snow.png");
      expect(await folder("project-b").files()).toEqual(["Generated/fox-in-snow.png"]);
      // No file is left behind without a row.
      expect(await folder().files()).toEqual([]);
      expect(
        await retrieveAssetBytes(assetStore, USER, asset.id, asset.content_type)
      ).toEqual(PNG);
    });

    it("moving a file to the loose bucket puts it in Personal's folder under Personal's project id", async () => {
      const asset = await fox();

      await saveAssetInProject(asset, LOOSE_PROJECT_ID);

      const row = await Asset.find(USER, asset.id);
      // The row names the project whose folder holds the file, because the
      // reconcile of that folder finds its rows by project id and path. A
      // row left as "default" would be indexed a second time as a new asset.
      expect(row?.project_id).toBe("personal");
      expect(row?.workspace_path).toBe("Generated/fox-in-snow.png");
      expect(await folder("personal").files()).toEqual([
        "Generated/fox-in-snow.png"
      ]);
      expect(await folder().files()).toEqual([]);
      expect(
        (
          await Asset.findByWorkspacePath(
            USER,
            "personal",
            "Generated/fox-in-snow.png"
          )
        ).map((found) => found.id)
      ).toEqual([asset.id]);
      expect(
        await Asset.findByWorkspacePath(
          USER,
          LOOSE_PROJECT_ID,
          "Generated/fox-in-snow.png"
        )
      ).toEqual([]);
    });

    it("moving a file already in Personal to the loose bucket leaves one file and one row", async () => {
      const asset = await fox({ projectId: null });
      expect(asset.project_id).toBe("personal");

      await saveAssetInProject(asset, LOOSE_PROJECT_ID);

      const row = await Asset.find(USER, asset.id);
      expect(row?.project_id).toBe("personal");
      expect(await folder("personal").files()).toEqual([
        "Generated/fox-in-snow.png"
      ]);
    });

    it("takes a free name when the other project already has a file of that name", async () => {
      const theirs = await fox({
        projectId: "project-b",
        bytes: new Uint8Array([7, 7])
      });
      const mine = await fox();

      await saveAssetInProject(mine, "project-b");

      expect((await Asset.find(USER, mine.id))?.workspace_path).toBe(
        "Generated/fox-in-snow-2.png"
      );
      expect((await Asset.find(USER, theirs.id))?.workspace_path).toBe(
        "Generated/fox-in-snow.png"
      );
      expect(await folder("project-b").files()).toEqual([
        "Generated/fox-in-snow-2.png",
        "Generated/fox-in-snow.png"
      ]);
      // Each asset serves its own bytes, never the other's.
      expect(
        await retrieveAssetBytes(assetStore, USER, mine.id, mine.content_type)
      ).toEqual(PNG);
      expect(
        await retrieveAssetBytes(assetStore, USER, theirs.id, theirs.content_type)
      ).toEqual(new Uint8Array([7, 7]));
      expect(await folder().files()).toEqual([]);
    });

    it("deleting a moved asset deletes its own file and leaves the other asset's", async () => {
      const theirs = await fox({
        projectId: "project-b",
        bytes: new Uint8Array([7, 7])
      });
      const mine = await fox();
      await saveAssetInProject(mine, "project-b");

      const moved = (await Asset.find(USER, mine.id))!;
      expect(await deleteProjectAssetFile(moved)).toBe(true);
      await moved.delete();

      expect(await folder("project-b").files()).toEqual(["Generated/fox-in-snow.png"]);
      expect(
        await retrieveAssetBytes(assetStore, USER, theirs.id, theirs.content_type)
      ).toEqual(new Uint8Array([7, 7]));
    });

    it("leaves the asset and its file where they were when the row cannot be saved", async () => {
      const asset = await fox();
      vi.spyOn(Asset.prototype, "save").mockRejectedValueOnce(new Error("disk full"));

      await expect(saveAssetInProject(asset, "project-b")).rejects.toThrow("disk full");

      expect(asset.project_id).toBe(PROJECT);
      expect(asset.workspace_path).toBe("Generated/fox-in-snow.png");
      expect(await folder().files()).toEqual(["Generated/fox-in-snow.png"]);
      expect(await folder("project-b").files()).toEqual([]);
      expect((await Asset.find(USER, asset.id))?.project_id).toBe(PROJECT);
    });

    it("keeps both files until the moved row is saved", async () => {
      const asset = await fox();

      const move = await moveProjectAssetFile(asset, "project-b");

      expect(asset.project_id).toBe("project-b");
      expect(await folder().files()).toEqual(["Generated/fox-in-snow.png"]);
      expect(await folder("project-b").files()).toEqual(["Generated/fox-in-snow.png"]);
      await asset.save();
      await move.commit();
      expect(await folder().files()).toEqual([]);
    });

    it("refuses the move when a folder cannot be reached or the file is gone", async () => {
      const asset = await fox();
      unreachable = "project-b";
      await expect(saveAssetInProject(asset, "project-b")).rejects.toBeInstanceOf(
        ProjectFolderUnavailableError
      );
      unreachable = null;
      await folder().workspace.delete("Generated/fox-in-snow.png");
      await expect(saveAssetInProject(asset, "project-b")).rejects.toThrow(
        /not in the project folder/
      );

      const row = await Asset.find(USER, asset.id);
      expect(row?.project_id).toBe(PROJECT);
      expect(row?.workspace_path).toBe("Generated/fox-in-snow.png");
      expect(folders.get("project-b") ? await folder("project-b").files() : []).toEqual([]);
    });

    it("changes only the project of an asset that keeps no file in a folder", async () => {
      const legacy = await createStoredAsset({
        userId: USER,
        projectId: PROJECT,
        name: "old",
        contentType: "image/png",
        content: PNG
      });

      await saveAssetInProject(legacy, "project-b");

      const row = await Asset.find(USER, legacy.id);
      expect(row?.project_id).toBe("project-b");
      expect(row?.workspace_path).toBeNull();
      expect(
        await retrieveAssetBytes(assetStore, USER, legacy.id, legacy.content_type)
      ).toEqual(PNG);
    });

    it("does not reuse the path of an asset whose file is gone", async () => {
      const first = await fox();
      await folder().workspace.delete("Generated/fox-in-snow.png");

      const second = await fox({ bytes: new Uint8Array([9]) });

      expect(second.workspace_path).toBe("Generated/fox-in-snow-2.png");
      expect(
        await retrieveAssetBytes(assetStore, USER, first.id, first.content_type)
      ).toBeNull();
    });

    it("keeps Generated/ flat whatever the name holds", async () => {
      const asset = await fox({ name: "../nested/dir\\fox: in?snow" });

      expect(asset.workspace_path).toBe("Generated/nested-dir-fox-in-snow.png");
      expect(await folder().files()).toEqual(["Generated/nested-dir-fox-in-snow.png"]);
    });

    it("puts an import in the directory the caller names", async () => {
      const asset = await fox({ directory: IMPORTED_DIRECTORY, name: "clip.png" });

      expect(asset.workspace_path).toBe("Imported/clip.png");
      expect(GENERATED_DIRECTORY).toBe("Generated");
    });

    it("refuses the directory NodeTool reserves", async () => {
      await expect(fox({ directory: ".nodetool/cache" })).rejects.toThrow(/reserves/);
      await expect(fox({ path: ".nodetool/project.json" })).rejects.toThrow(/reserves/);
      await expect(fox({ path: "../outside.png" })).rejects.toThrow(/outside/);
      expect(await Asset.paginate(USER, {})).toHaveProperty("0.length", 0);
    });

    it("writes to the exact path a caller chose and keeps one row for that file", async () => {
      const first = await fox({ path: "renders/final.png" });
      const again = await fox({
        path: "renders/final.png",
        bytes: new Uint8Array([4, 5]),
        name: "final cut"
      });

      expect(first.workspace_path).toBe("renders/final.png");
      expect(again.id).toBe(first.id);
      expect(await folder().files()).toEqual(["renders/final.png"]);
      expect(await Asset.paginate(USER, {})).toHaveProperty("0.length", 1);
      const row = await Asset.find(USER, first.id);
      expect(row?.name).toBe("final cut");
      expect(row?.size).toBe(2);
      expect(row?.metadata?.["workspace_hash"]).toBe(
        partialContentHash(new Uint8Array([4, 5]))
      );
      expect(
        await retrieveAssetBytes(assetStore, USER, first.id, first.content_type)
      ).toEqual(new Uint8Array([4, 5]));
    });

    it("takes the bytes from a file on this host", async () => {
      const source = join(root, "source.png");
      await writeFile(source, PNG);

      const asset = await saveProjectAsset({
        projectId: PROJECT,
        userId: USER,
        name: "from disk",
        contentType: "image/png",
        localPath: source
      });

      expect(asset.workspace_path).toBe("Generated/from-disk.png");
      expect(asset.metadata?.["workspace_hash"]).toBe(partialContentHash(PNG));
      expect(
        await retrieveAssetBytes(assetStore, USER, asset.id, asset.content_type)
      ).toEqual(PNG);
      expect(existsSync(source)).toBe(true);
    });

    /**
     * Another app saves `path` once, the way an editor does: a whole new file
     * put in place in one step. It lands when the copy of a file on this
     * host into the folder starts, whichever workspace method makes the copy.
     */
    function competingSaveDuringCopy(
      bytes: string,
      after?: () => Promise<never>
    ): void {
      const created = kinds[kind](PROJECT);
      folders.set(PROJECT, created);
      const workspace = created.workspace as unknown as Record<
        string,
        (...args: unknown[]) => Promise<unknown>
      >;
      let saved = false;
      for (const method of ["absorb", "absorbNew"]) {
        const original = workspace[method];
        if (typeof original !== "function") continue;
        workspace[method] = async (from: unknown, to: unknown, ...rest) => {
          if (!saved) {
            saved = true;
            await created.workspace.write(to as string, bytes);
            if (after) await after();
          }
          return original.call(created.workspace, from, to, ...rest);
        };
      }
    }

    it("never replaces a file another app saved over the name during the copy", async () => {
      const source = join(root, "take.mp4");
      await writeFile(source, "the import");
      competingSaveDuringCopy("the creator's take");

      const asset = await saveProjectAsset({
        projectId: PROJECT,
        userId: USER,
        name: "take",
        contentType: "video/mp4",
        localPath: source
      });

      expect(asset.workspace_path).toBe("Generated/take-2.mp4");
      expect(await folder().files()).toEqual([
        "Generated/take-2.mp4",
        "Generated/take.mp4"
      ]);
      const read = async (path: string): Promise<string> =>
        Buffer.from((await folder().workspace.read(path))!).toString();
      expect(await read("Generated/take.mp4")).toBe("the creator's take");
      expect(await read("Generated/take-2.mp4")).toBe("the import");
    });

    it("keeps a file another app saved over the name when the copy fails", async () => {
      const source = join(root, "take.mp4");
      await writeFile(source, "the import");
      competingSaveDuringCopy("the creator's take", () =>
        Promise.reject(new Error("copy failed"))
      );

      await expect(
        saveProjectAsset({
          projectId: PROJECT,
          userId: USER,
          name: "take",
          contentType: "video/mp4",
          localPath: source
        })
      ).rejects.toThrow("copy failed");

      expect(await folder().files()).toEqual(["Generated/take.mp4"]);
      expect(
        Buffer.from((await folder().workspace.read("Generated/take.mp4"))!).toString()
      ).toBe("the creator's take");
    });

    it("writes nothing and creates no row when the folder cannot be reached", async () => {
      await fox();
      unreachable = PROJECT;

      await expect(fox()).rejects.toBeInstanceOf(ProjectFolderUnavailableError);
      await expect(fox()).rejects.toThrow(/Project folder not found/);

      expect(await folder().files()).toEqual(["Generated/fox-in-snow.png"]);
      expect(await legacyAssetKeys()).toEqual([]);
      expect(await Asset.paginate(USER, {})).toHaveProperty("0.length", 1);
    });

    it("removes the file when its row cannot be saved", async () => {
      vi.spyOn(Asset.prototype, "save").mockRejectedValueOnce(new Error("disk full"));

      await expect(fox()).rejects.toThrow("disk full");

      expect(await folder().files()).toEqual([]);
      expect(await Asset.paginate(USER, {})).toHaveProperty("0.length", 0);
    });

    it("keeps a caller's file when the row for its exact path cannot be saved", async () => {
      vi.spyOn(Asset.prototype, "save").mockRejectedValueOnce(new Error("disk full"));

      await expect(fox({ path: "renders/final.png" })).rejects.toThrow("disk full");

      expect(await folder().files()).toEqual(["renders/final.png"]);
    });

    it("renames the file with the asset and removes the old file after the row is saved", async () => {
      const asset = await fox();

      const change = await renameProjectAssetFile(asset, "red fox");
      asset.name = "red fox";
      expect(asset.workspace_path).toBe("Generated/red-fox.png");
      // Both files exist until the row has moved on.
      expect(await folder().files()).toEqual([
        "Generated/fox-in-snow.png",
        "Generated/red-fox.png"
      ]);
      await asset.save();
      await change?.commit();

      expect(await folder().files()).toEqual(["Generated/red-fox.png"]);
      expect((await Asset.find(USER, asset.id))?.workspace_path).toBe(
        "Generated/red-fox.png"
      );
      expect(
        await retrieveAssetBytes(assetStore, USER, asset.id, asset.content_type)
      ).toEqual(PNG);
    });

    it("undoes a rename whose row was not saved", async () => {
      const asset = await fox();
      const before = { ...asset.metadata };

      const change = await renameProjectAssetFile(asset, "red fox");
      await change?.undo();

      expect(asset.workspace_path).toBe("Generated/fox-in-snow.png");
      expect(asset.metadata).toEqual(before);
      expect(await folder().files()).toEqual(["Generated/fox-in-snow.png"]);
    });

    it("suffixes a rename onto a name another file has, and leaves that file alone", async () => {
      const other = await fox({ name: "red fox", bytes: new Uint8Array([1]) });
      const asset = await fox();

      const change = await renameProjectAssetFile(asset, "red fox");
      await asset.save();
      await change?.commit();

      expect(asset.workspace_path).toBe("Generated/red-fox-2.png");
      expect(
        await retrieveAssetBytes(assetStore, USER, other.id, other.content_type)
      ).toEqual(new Uint8Array([1]));
      expect(await folder().files()).toEqual([
        "Generated/red-fox-2.png",
        "Generated/red-fox.png"
      ]);
    });

    it("leaves the file alone when a rename does not change its name", async () => {
      const asset = await fox();

      expect(await renameProjectAssetFile(asset, "fox   in snow")).toBeNull();
      expect(await renameProjectAssetFile(asset, "fox in snow.png")).toBeNull();
      expect(await folder().files()).toEqual(["Generated/fox-in-snow.png"]);
    });

    it("refuses to rename or delete when the folder cannot be reached", async () => {
      const asset = await fox();
      unreachable = PROJECT;

      await expect(renameProjectAssetFile(asset, "red fox")).rejects.toBeInstanceOf(
        ProjectFolderUnavailableError
      );
      await expect(deleteProjectAssetFile(asset)).rejects.toBeInstanceOf(
        ProjectFolderUnavailableError
      );
      expect(asset.workspace_path).toBe("Generated/fox-in-snow.png");
      expect(await folder().files()).toEqual(["Generated/fox-in-snow.png"]);
    });

    it("writes new bytes into the same file", async () => {
      const asset = await fox();

      const change = await replaceProjectAssetBytes(asset, new Uint8Array([8, 8, 8]));
      await asset.save();
      await change?.commit();

      expect(await folder().files()).toEqual(["Generated/fox-in-snow.png"]);
      const row = await Asset.find(USER, asset.id);
      expect(row?.size).toBe(3);
      expect(row?.metadata?.["workspace_hash"]).toBe(
        partialContentHash(new Uint8Array([8, 8, 8]))
      );
      expect(
        await retrieveAssetBytes(assetStore, USER, asset.id, asset.content_type)
      ).toEqual(new Uint8Array([8, 8, 8]));
      expect(await legacyAssetKeys()).toEqual([]);
    });

    it("moves the file to the new extension when the content type changes", async () => {
      const asset = await fox();
      asset.content_type = "image/jpeg";

      const change = await replaceProjectAssetBytes(asset, new Uint8Array([1, 1]));
      expect(await folder().files()).toEqual([
        "Generated/fox-in-snow.jpg",
        "Generated/fox-in-snow.png"
      ]);
      await asset.save();
      await change?.commit();

      expect(await folder().files()).toEqual(["Generated/fox-in-snow.jpg"]);
      expect(
        await retrieveAssetBytes(assetStore, USER, asset.id, "image/jpeg")
      ).toEqual(new Uint8Array([1, 1]));
    });

    it("deletes the file with the asset", async () => {
      const kept = await fox({ name: "kept" });
      const asset = await fox();

      expect(await deleteProjectAssetFile(asset)).toBe(true);
      await asset.delete();

      expect(await folder().files()).toEqual(["Generated/kept.png"]);
      expect(await deleteProjectAssetFile(asset)).toBe(false);
      expect(
        await retrieveAssetBytes(assetStore, USER, kept.id, kept.content_type)
      ).toEqual(PNG);
    });

    it("still serves an asset created before project folders from its legacy key", async () => {
      const legacy = await createStoredAsset({
        userId: USER,
        name: "old",
        contentType: "image/png",
        content: PNG
      });
      const key = getAssetStorageKey(USER, legacy.id, legacy.content_type);

      expect(legacy.workspace_path).toBeNull();
      expect(await rawStore.retrieve(rawStore.uriForKey(key))).toEqual(PNG);
      expect(
        await retrieveAssetBytes(assetStore, USER, legacy.id, legacy.content_type)
      ).toEqual(PNG);
      expect(await lookupProjectAssetFile(key)).toBeNull();
      expect(await renameProjectAssetFile(legacy, "renamed")).toBeNull();
      expect(await replaceProjectAssetBytes(legacy, PNG)).toBeNull();
      expect(await deleteProjectAssetFile(legacy)).toBe(false);
      expect([...folders.values()].length).toBe(0);
    });

    it("saves context.createAsset output as a project file and rewrites it in place", async () => {
      const asset = await createAssetModelInterface({
        userId: USER,
        projectId: PROJECT,
        workflowId: "wf",
        jobId: "job",
        nodeId: "node",
        name: "fox in snow",
        contentType: "image/png",
        content: PNG,
        metadata: { generation_id: "gen" }
      });

      expect(asset.workspace_path).toBe("Generated/fox-in-snow.png");
      expect(asset.project_id).toBe(PROJECT);
      expect(asset.parent_id).toBe(USER);
      expect(asset.metadata).toMatchObject({ generation_id: "gen" });
      expect(asset).toMatchObject({ workflow_id: "wf", job_id: "job", node_id: "node" });
      expect(await legacyAssetKeys()).toEqual([]);

      expect(
        await updateAssetBytesModelInterface({
          userId: "other",
          assetId: asset.id,
          content: new Uint8Array([7])
        })
      ).toBeNull();
      expect(
        await updateAssetBytesModelInterface({
          userId: USER,
          assetId: asset.id,
          content: new Uint8Array([7])
        })
      ).toMatchObject({ id: asset.id });

      expect(await folder().files()).toEqual(["Generated/fox-in-snow.png"]);
      expect(await legacyAssetKeys()).toEqual([]);
      expect(
        await retrieveAssetBytes(assetStore, USER, asset.id, asset.content_type)
      ).toEqual(new Uint8Array([7]));
      expect((await Asset.find(USER, asset.id))?.size).toBe(1);
    });

    it("saves a run with no project into the folder the resolver names for it", async () => {
      const asset = await createAssetModelInterface({
        userId: USER,
        name: "loose",
        contentType: "text/plain",
        content: new Uint8Array([1])
      });

      expect(asset.project_id).toBe("personal");
      expect(await folder("personal").files()).toEqual(["Generated/loose.txt"]);
    });
  }
);

describe("local folder files on disk", () => {
  beforeEach(() => useFolders("local"));

  it("changes the file on disk on rename and delete", async () => {
    const asset = await fox();
    const dir = join(root, PROJECT, "Generated");
    expect(await readdir(dir)).toEqual(["fox-in-snow.png"]);

    const change = await renameProjectAssetFile(asset, "red fox");
    await asset.save();
    await change?.commit();
    expect(await readdir(dir)).toEqual(["red-fox.png"]);
    expect(await readFile(join(dir, "red-fox.png"))).toEqual(Buffer.from(PNG));

    await deleteProjectAssetFile(asset);
    await asset.delete();
    expect(await readdir(dir)).toEqual([]);
  });

  it("records the size and mtime the file has on disk", async () => {
    const asset = await fox();
    const info = await stat(join(root, PROJECT, "Generated", "fox-in-snow.png"));

    expect(asset.metadata?.["workspace_size"]).toBe(info.size);
    expect(Math.trunc(Number(asset.metadata?.["workspace_mtime"]))).toBe(
      Math.trunc(info.mtimeMs)
    );
  });

  it("serves bytes edited in another app under the same id", async () => {
    const asset = await fox();
    await writeFile(
      join(root, PROJECT, "Generated", "fox-in-snow.png"),
      new Uint8Array([5, 5])
    );

    expect(
      await retrieveAssetBytes(assetStore, USER, asset.id, asset.content_type)
    ).toEqual(new Uint8Array([5, 5]));
  });
});

describe("claimFile with kept directory names", () => {
  it("lists a directory once and still skips every name in use", async () => {
    const workspace = createLocalWorkspace(join(root, PROJECT));
    await workspace.write("Shots/FOX.png", PNG, "image/png");
    // A row that records a name whose file is gone keeps that name taken.
    await Asset.create<Asset>({
      user_id: USER,
      project_id: PROJECT,
      name: "gone",
      content_type: "image/png",
      workspace_path: "Shots/fox-2.png"
    });
    const list = vi.spyOn(workspace, "list");
    const names = new DirectoryNames();
    const owner = { userId: USER, projectId: PROJECT };

    const claimed: string[] = [];
    for (let i = 0; i < 3; i++) {
      claimed.push(
        await claimFile(workspace, owner, "Shots", "fox", "png", PNG, "image/png",
          undefined, undefined, names)
      );
    }

    expect(claimed).toEqual(["Shots/fox-3.png", "Shots/fox-4.png", "Shots/fox-5.png"]);
    expect(list).toHaveBeenCalledTimes(1);
    expect((await readdir(join(root, PROJECT, "Shots"))).sort()).toEqual([
      "FOX.png",
      "fox-3.png",
      "fox-4.png",
      "fox-5.png"
    ]);
  });
});

describe("with no project folder resolver installed", () => {
  it("refuses to save and leaves key lookups to the legacy key", async () => {
    setProjectFolderResolver(null);

    await expect(fox()).rejects.toThrow(/no project folder resolver/);
    expect(await lookupProjectAssetFile(`${USER}/${"a".repeat(32)}.png`)).toBeNull();
    expect(await Asset.paginate(USER, {})).toHaveProperty("0.length", 0);
  });
});

describe("projectAssetFileStem", () => {
  it.each([
    ["fox in snow", "image/png", "fox-in-snow"],
    ["  Fox   in\tSnow  ", "image/png", "Fox-in-Snow"],
    ["fox.png", "image/png", "fox"],
    ["fox.PNG", "image/png", "fox"],
    ["photo.jpeg", "image/jpeg", "photo"],
    ["photo.jpg", "image/png", "photo.jpg"],
    ["notes.txt", "text/plain", "notes"],
    ["a/b\\c:d*e?f\"g<h>i|j", "image/png", "a-b-c-d-e-f-g-h-i-j"],
    ["..hidden", "image/png", "hidden"],
    ["trailing...", "image/png", "trailing"],
    ["", "image/png", "asset"],
    ["???", "image/png", "asset"],
    ["CON", "image/png", "CON-file"],
    ["nul", "text/plain", "nul-file"],
    ["NUL.demo", "image/png", "NUL-file.demo"],
    ["com1.tar.gz", "image/png", "com1-file.tar.gz"],
    ["console.log", "image/png", "console.log"],
    ["Füchse im Schnee ❄", "image/png", "Füchse-im-Schnee-❄"],
    ["x".repeat(300), "image/png", "x".repeat(100)]
  ])("%j as %s is %j", (name, contentType, stem) => {
    expect(projectAssetFileStem(name, contentType)).toBe(stem);
  });
});

describe("partialContentHash", () => {
  it("covers the first and last 1 MiB and the size, not the middle", async () => {
    const size = PARTIAL_HASH_SPAN * 3;
    const base = new Uint8Array(size).fill(1);
    const hash = partialContentHash(base);

    const middle = base.slice();
    middle[PARTIAL_HASH_SPAN + 10] = 2;
    const head = base.slice();
    head[10] = 2;
    const tail = base.slice();
    tail[size - 10] = 2;

    expect(partialContentHash(middle)).toBe(hash);
    expect(partialContentHash(head)).not.toBe(hash);
    expect(partialContentHash(tail)).not.toBe(hash);
    expect(partialContentHash(base.slice(0, size - 1))).not.toBe(hash);
  });

  it("hashes a file of up to 2 MiB whole", () => {
    const base = new Uint8Array(PARTIAL_HASH_SPAN + 100).fill(1);
    const changed = base.slice();
    changed[PARTIAL_HASH_SPAN + 50] = 2;

    expect(partialContentHash(changed)).not.toBe(partialContentHash(base));
    expect(partialContentHash(new Uint8Array(0))).toMatch(/^[0-9a-f]{64}$/);
  });

  it("gives a file on disk the hash its bytes have", async () => {
    const dir = await mkdtemp(join(tmpdir(), "nodetool-hash-"));
    try {
      for (const size of [0, 5, PARTIAL_HASH_SPAN + 7, PARTIAL_HASH_SPAN * 2 + 9]) {
        const bytes = new Uint8Array(size);
        for (let i = 0; i < size; i += 4099) bytes[i] = i % 251;
        const path = join(dir, `f-${size}`);
        await writeFile(path, bytes);
        expect(await partialContentHashOfFile(path)).toBe(partialContentHash(bytes));
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
