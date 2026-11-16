/**
 * Project folder selfcheck (`nodetool harness gate`, harness id
 * `project-folders`): the life of one asset in a temporary project folder,
 * end to end, with no browser and no network.
 *
 * Create it through the server write path, rename it outside NodeTool, copy
 * and hard-link it, delete it and bring it back. Every step asserts what a
 * user sees: the asset keeps its ID, a copy never takes over a row, and a lost
 * file marks the row offline instead of removing it (PRD T4, US5 to US7, D9).
 * The finer cases of each row live in `project-index.test.ts`.
 */
import { link, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Asset, ModelObserver, initTestDb } from "@nodetool-ai/models";
import {
  createLocalWorkspace,
  setProjectFolderResolver,
  type ProjectFolderResolution
} from "@nodetool-ai/runtime";
import { FileStorageAdapter, type StorageAdapter } from "@nodetool-ai/storage";
import { retrieveAssetBytes } from "@nodetool-ai/asset-services/asset-paths";
import { lookupExternalAssetPath } from "@nodetool-ai/asset-services/external-asset-lookup";
import { saveProjectAsset } from "@nodetool-ai/asset-services/project-asset";
import { isProjectAssetOffline } from "@nodetool-ai/asset-services/project-asset-file";
import { getAssetAdapter } from "@nodetool-ai/asset-services/storage";
import {
  COPY_GRACE_MS,
  cancelProjectReconciles,
  flushProjectReconciles,
  reconcileProjectIndex
} from "../src/project-index.js";

vi.mock("@nodetool-ai/asset-services/storage", () => ({
  getAssetAdapter: vi.fn()
}));

const USER = "selfcheck-user";
const PROJECT = "selfcheck-project";
/** A 1x1 PNG. */
const PNG = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64"
  )
);

let root: string;
let folderDir: string;
let assetStore: StorageAdapter;

async function bytesOf(asset: Asset): Promise<Uint8Array | null> {
  const bytes = await retrieveAssetBytes(
    assetStore,
    USER,
    asset.id,
    asset.content_type
  );
  return bytes ? new Uint8Array(bytes) : null;
}

async function reload(id: string): Promise<Asset> {
  const found = await Asset.find(USER, id);
  if (!found) throw new Error(`asset ${id} is gone`);
  return found;
}

beforeEach(async () => {
  initTestDb();
  root = await mkdtemp(join(tmpdir(), "nodetool-project-selfcheck-"));
  folderDir = join(root, "projects", PROJECT);
  await mkdir(folderDir, { recursive: true });
  assetStore = new FileStorageAdapter(join(root, "assets"), {
    externalPathLookup: lookupExternalAssetPath
  });
  vi.mocked(getAssetAdapter).mockReturnValue(assetStore);
  const workspace = createLocalWorkspace(folderDir);
  setProjectFolderResolver(
    async (projectId): Promise<ProjectFolderResolution> => ({
      ok: true,
      projectId: projectId ?? "personal",
      workspace
    })
  );
});

afterEach(async () => {
  await flushProjectReconciles();
  cancelProjectReconciles();
  vi.useRealTimers();
  ModelObserver.clear();
  setProjectFolderResolver(null);
  await rm(root, { recursive: true, force: true });
});

describe("project folder selfcheck", () => {
  it("keeps one asset through a rename, a copy, a hard link and a lost file", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });

    // Create: one file in Generated/, one row that names it.
    const asset = await saveProjectAsset({
      projectId: PROJECT,
      userId: USER,
      name: "fox",
      contentType: "image/png",
      bytes: PNG
    });
    expect(asset.workspace_path).toBe("Generated/fox.png");
    expect(new Uint8Array(await readFile(join(folderDir, "Generated", "fox.png")))).toEqual(PNG);
    expect(await reconcileProjectIndex(PROJECT, USER)).toMatchObject({
      files: 1,
      unchanged: 1,
      moved: [],
      offline: [],
      created: []
    });

    // Rename on disk: the same asset follows its file.
    await mkdir(join(folderDir, "Reviewed"));
    await rename(
      join(folderDir, "Generated", "fox.png"),
      join(folderDir, "Reviewed", "fox-final.png")
    );
    expect(await reconcileProjectIndex(PROJECT, USER)).toMatchObject({
      moved: [asset.id],
      offline: [],
      created: []
    });
    expect((await reload(asset.id)).workspace_path).toBe("Reviewed/fox-final.png");
    expect(await bytesOf(asset)).toEqual(PNG);

    // Copy and hard link: neither takes the row from the original, and
    // neither is taken for a move. Both wait for the follow-up reconcile.
    await writeFile(join(folderDir, "Reviewed", "fox-copy.png"), PNG);
    await link(
      join(folderDir, "Reviewed", "fox-final.png"),
      join(folderDir, "Reviewed", "fox-linked.png")
    );
    const waiting = await reconcileProjectIndex(PROJECT, USER);
    expect(waiting.moved).toEqual([]);
    expect(waiting.created).toEqual([]);
    expect([...waiting.deferred].sort()).toEqual([
      "Reviewed/fox-copy.png",
      "Reviewed/fox-linked.png"
    ]);
    expect((await reload(asset.id)).workspace_path).toBe("Reviewed/fox-final.png");
    await vi.advanceTimersByTimeAsync(COPY_GRACE_MS + 1_000);
    await flushProjectReconciles();
    const rows = await Asset.listProjectFiles(USER, PROJECT);
    expect(rows.map((row) => row.workspace_path).sort()).toEqual([
      "Reviewed/fox-copy.png",
      "Reviewed/fox-final.png",
      "Reviewed/fox-linked.png"
    ]);
    expect(rows.map((row) => row.id)).toContain(asset.id);
    expect((await reload(asset.id)).workspace_path).toBe("Reviewed/fox-final.png");

    // Delete the copies and the original: the row stays, marked offline.
    await rm(join(folderDir, "Reviewed"), { recursive: true });
    const lost = await reconcileProjectIndex(PROJECT, USER);
    expect(lost.offline).toContain(asset.id);
    expect(lost.moved).toEqual([]);
    const offline = await reload(asset.id);
    expect(isProjectAssetOffline(offline)).toBe(true);
    expect(offline.workspace_path).toBe("Reviewed/fox-final.png");
    expect(await Asset.listProjectFiles(USER, PROJECT)).toHaveLength(3);

    // The file comes back at the recorded path: the same row is restored.
    await mkdir(join(folderDir, "Reviewed"));
    await writeFile(join(folderDir, "Reviewed", "fox-final.png"), PNG);
    expect((await reconcileProjectIndex(PROJECT, USER)).restored).toContain(asset.id);
    const restored = await reload(asset.id);
    expect(isProjectAssetOffline(restored)).toBe(false);
    expect(await bytesOf(restored)).toEqual(PNG);
  });
});
