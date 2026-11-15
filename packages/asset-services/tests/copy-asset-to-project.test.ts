/**
 * Using an asset of another project copies it into this one (PRD D10, US10).
 * Personal is the library: the copy is a new file in the destination's
 * `Imported/` directory with its own row, and the same unchanged source is
 * copied once.
 *
 * Every case runs against a local directory and against a storage-backed
 * folder, through the same `Workspace` interface.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Asset, initTestDb, ModelObserver } from "@nodetool-ai/models";
import { ENTITY_METADATA_KEY, readEntityMarker } from "@nodetool-ai/protocol";
import {
  createLocalWorkspace,
  createWorkspace,
  setProjectFolderResolver,
  type ProjectFolderResolution,
  type Workspace
} from "@nodetool-ai/runtime";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";
import {
  createStoredAsset,
  updateAssetBytesModelInterface
} from "../src/asset-model-interface.js";
import { retrieveAssetBytes } from "../src/asset-paths.js";
import {
  AssetCopyError,
  COPIED_FROM_ASSET_KEY,
  COPIED_FROM_HASH_KEY,
  copyAssetToProject
} from "../src/copy-asset-to-project.js";
import {
  deleteProjectAssetFile,
  saveProjectAsset
} from "../src/project-asset.js";
import {
  ProjectFolderUnavailableError,
  partialContentHash
} from "../src/project-asset-file.js";
import { ProjectAssetStorageAdapter } from "../src/project-asset-storage.js";
import { getAssetAdapter } from "../src/storage.js";

vi.mock("../src/storage.js", () => ({ getAssetAdapter: vi.fn() }));

const USER = "owner";
const PERSONAL = "personal:owner";
const PROJECT_A = "project-a";
/** A 1x1 PNG, so the thumbnail generator has a real image. */
const PNG = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64"
  )
);
const EDITED = new Uint8Array([7, 7, 7]);

let root: string;
let rawStore: InMemoryStorageAdapter;
let assetStore: ProjectAssetStorageAdapter;
let workspaces: Map<string, Workspace>;
let unreachable: string | null;

const kinds = {
  local: (projectId: string): Workspace =>
    createLocalWorkspace(join(root, encodeURIComponent(projectId))),
  storage: (projectId: string): Workspace =>
    createWorkspace(rawStore, {
      prefix: `workspaces/${USER}/${encodeURIComponent(projectId)}`
    })
} as const;

beforeEach(async () => {
  initTestDb();
  root = await mkdtemp(join(tmpdir(), "nodetool-copy-asset-"));
  rawStore = new InMemoryStorageAdapter();
  assetStore = new ProjectAssetStorageAdapter(rawStore);
  vi.mocked(getAssetAdapter).mockReturnValue(assetStore);
  workspaces = new Map();
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
      // A loose or missing project id is Personal, as on the server.
      const id =
        !projectId || projectId === "default" ? PERSONAL : projectId;
      if (id === unreachable) {
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

async function files(projectId: string): Promise<string[]> {
  const workspace = workspaces.get(projectId);
  if (!workspace) return [];
  return (await workspace.list("", { recursive: true }))
    .filter((entry) => !entry.isDirectory)
    .map((entry) => entry.path)
    .sort();
}

function bytesOf(asset: Asset): Promise<Uint8Array | null> {
  return retrieveAssetBytes(assetStore, USER, asset.id, asset.content_type);
}

function personalImage(
  name = "fox in snow",
  metadata: Record<string, unknown> | null = null
): Promise<Asset> {
  return saveProjectAsset({
    projectId: PERSONAL,
    userId: USER,
    name,
    contentType: "image/png",
    bytes: PNG,
    directory: "Library",
    metadata
  });
}

describe.each(["local", "storage"] as const)(
  "copying an asset into a project, %s folders",
  (kind) => {
    beforeEach(() => useFolders(kind));

    it("copies a Personal image into the project's Imported/ as a new asset", async () => {
      const original = await personalImage();

      const { asset: copy, copied } = await copyAssetToProject({
        userId: USER,
        assetId: original.id,
        projectId: PROJECT_A
      });

      expect(copied).toBe(true);
      expect(copy.id).not.toBe(original.id);
      expect(await files(PROJECT_A)).toEqual(["Imported/fox-in-snow.png"]);
      const row = await Asset.find(USER, copy.id);
      expect(row).toMatchObject({
        project_id: PROJECT_A,
        workspace_path: "Imported/fox-in-snow.png",
        name: "fox in snow",
        content_type: "image/png"
      });
      expect(row?.metadata).toMatchObject({
        [COPIED_FROM_ASSET_KEY]: original.id,
        [COPIED_FROM_HASH_KEY]: partialContentHash(PNG),
        workspace_hash: partialContentHash(PNG)
      });
      expect(await bytesOf(copy)).toEqual(PNG);
      expect(await files(PERSONAL)).toEqual(["Library/fox-in-snow.png"]);
    });

    it("returns the existing copy when the same Personal asset is picked again", async () => {
      const original = await personalImage();
      const first = await copyAssetToProject({
        userId: USER,
        assetId: original.id,
        projectId: PROJECT_A
      });

      const second = await copyAssetToProject({
        userId: USER,
        assetId: original.id,
        projectId: PROJECT_A
      });

      expect(second.copied).toBe(false);
      expect(second.asset.id).toBe(first.asset.id);
      expect(await files(PROJECT_A)).toEqual(["Imported/fox-in-snow.png"]);
      expect(await Asset.listByProject(USER, PROJECT_A)).toHaveLength(1);
    });

    it("makes one copy when two picks of the same asset arrive together", async () => {
      const original = await personalImage();

      const results = await Promise.all(
        [1, 2, 3].map(() =>
          copyAssetToProject({
            userId: USER,
            assetId: original.id,
            projectId: PROJECT_A
          })
        )
      );

      expect(new Set(results.map((r) => r.asset.id)).size).toBe(1);
      expect(await files(PROJECT_A)).toEqual(["Imported/fox-in-snow.png"]);
    });

    it("leaves the Personal original unchanged when the copy is edited or deleted", async () => {
      const original = await personalImage();
      const { asset: copy } = await copyAssetToProject({
        userId: USER,
        assetId: original.id,
        projectId: PROJECT_A
      });

      await updateAssetBytesModelInterface({
        userId: USER,
        assetId: copy.id,
        content: EDITED
      });
      expect(await bytesOf(copy)).toEqual(EDITED);
      expect(await bytesOf(original)).toEqual(PNG);

      const edited = await Asset.find(USER, copy.id);
      if (!edited) throw new Error("copy row is gone");
      expect(await deleteProjectAssetFile(edited)).toBe(true);
      await edited.delete();

      expect(await Asset.find(USER, original.id)).toMatchObject({
        project_id: PERSONAL,
        workspace_path: "Library/fox-in-snow.png"
      });
      expect(await bytesOf(original)).toEqual(PNG);
      expect(await files(PERSONAL)).toEqual(["Library/fox-in-snow.png"]);
    });

    it("keeps an edited copy when the same unchanged source is picked again", async () => {
      const original = await personalImage();
      const { asset: copy } = await copyAssetToProject({
        userId: USER,
        assetId: original.id,
        projectId: PROJECT_A
      });
      await updateAssetBytesModelInterface({
        userId: USER,
        assetId: copy.id,
        content: EDITED
      });

      const again = await copyAssetToProject({
        userId: USER,
        assetId: original.id,
        projectId: PROJECT_A
      });

      expect(again.asset.id).toBe(copy.id);
      expect(await bytesOf(again.asset)).toEqual(EDITED);
    });

    it("leaves the copy unchanged when the original is edited or deleted, and copies the changed original anew", async () => {
      const original = await personalImage();
      const { asset: copy } = await copyAssetToProject({
        userId: USER,
        assetId: original.id,
        projectId: PROJECT_A
      });

      await updateAssetBytesModelInterface({
        userId: USER,
        assetId: original.id,
        content: EDITED
      });
      expect(await bytesOf(copy)).toEqual(PNG);

      const fresh = await copyAssetToProject({
        userId: USER,
        assetId: original.id,
        projectId: PROJECT_A
      });
      expect(fresh.copied).toBe(true);
      expect(fresh.asset.id).not.toBe(copy.id);
      expect(await bytesOf(fresh.asset)).toEqual(EDITED);
      expect(await files(PROJECT_A)).toEqual([
        "Imported/fox-in-snow-2.png",
        "Imported/fox-in-snow.png"
      ]);

      const current = await Asset.find(USER, original.id);
      if (!current) throw new Error("original row is gone");
      await deleteProjectAssetFile(current);
      await current.delete();
      expect(await bytesOf(copy)).toEqual(PNG);
      expect(await Asset.find(USER, copy.id)).toMatchObject({
        project_id: PROJECT_A
      });
    });

    it("returns an asset of the project itself without copying it", async () => {
      const own = await saveProjectAsset({
        projectId: PROJECT_A,
        userId: USER,
        name: "own",
        contentType: "image/png",
        bytes: PNG
      });

      const result = await copyAssetToProject({
        userId: USER,
        assetId: own.id,
        projectId: PROJECT_A
      });

      expect(result).toMatchObject({ copied: false });
      expect(result.asset.id).toBe(own.id);
      expect(await files(PROJECT_A)).toEqual(["Generated/own.png"]);
    });

    it("treats a loose asset as Personal's", async () => {
      const loose = await createStoredAsset({
        userId: USER,
        name: "old",
        contentType: "image/png",
        content: PNG
      });

      const inPersonal = await copyAssetToProject({
        userId: USER,
        assetId: loose.id,
        projectId: PERSONAL
      });
      expect(inPersonal).toMatchObject({ copied: false });
      expect(inPersonal.asset.id).toBe(loose.id);

      const inA = await copyAssetToProject({
        userId: USER,
        assetId: loose.id,
        projectId: PROJECT_A
      });
      expect(inA.copied).toBe(true);
      expect(await files(PROJECT_A)).toEqual(["Imported/old.png"]);
      expect(await bytesOf(inA.asset)).toEqual(PNG);
    });

    it("copies an entity as an entity, with its swapped reference image", async () => {
      const swapped = await personalImage("swapped look");
      const entity = await personalImage("hero", {
        [ENTITY_METADATA_KEY]: {
          kind: "character",
          name: "Hero",
          descriptor: "a tall hero",
          reference_asset_id: swapped.id
        }
      });

      const { asset: copy } = await copyAssetToProject({
        userId: USER,
        assetId: entity.id,
        projectId: PROJECT_A
      });

      const marker = readEntityMarker(copy.metadata);
      expect(marker).toMatchObject({ kind: "character", name: "Hero" });
      const reference = await Asset.find(USER, String(marker?.reference_asset_id));
      expect(reference?.id).not.toBe(swapped.id);
      expect(reference).toMatchObject({
        project_id: PROJECT_A,
        workspace_path: "Imported/swapped-look.png"
      });
      expect(reference?.metadata?.[COPIED_FROM_ASSET_KEY]).toBe(swapped.id);
      // The original entity still shows its own reference image.
      expect(
        readEntityMarker((await Asset.find(USER, entity.id))?.metadata)
      ).toMatchObject({ reference_asset_id: swapped.id });
    });

    it("writes nothing when the project's folder cannot be reached", async () => {
      const original = await personalImage();
      unreachable = PROJECT_A;

      await expect(
        copyAssetToProject({ userId: USER, assetId: original.id, projectId: PROJECT_A })
      ).rejects.toBeInstanceOf(ProjectFolderUnavailableError);
      expect(await Asset.listByProject(USER, PROJECT_A)).toEqual([]);
    });

    it("refuses a folder, a missing asset and another user's asset", async () => {
      const folderRow = new Asset({
        user_id: USER,
        name: "Folder",
        content_type: "folder",
        project_id: PERSONAL
      });
      await folderRow.save();
      const theirs = await saveProjectAsset({
        projectId: "theirs",
        userId: "someone-else",
        name: "theirs",
        contentType: "image/png",
        bytes: PNG
      });

      for (const assetId of [folderRow.id, "0".repeat(32), theirs.id]) {
        await expect(
          copyAssetToProject({ userId: USER, assetId, projectId: PROJECT_A })
        ).rejects.toBeInstanceOf(AssetCopyError);
      }
      expect(await files(PROJECT_A)).toEqual([]);
    });
  }
);
