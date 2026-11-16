/**
 * A large file in a local project folder is copied in chunks. Saving an asset
 * from a file on disk, and renaming or moving an asset's file, must not read
 * the whole file into memory (PF06).
 */
import { mkdtemp, open, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Asset,
  initTestDb,
  ModelObserver
} from "@nodetool-ai/models";
import {
  createLocalWorkspace,
  setProjectFolderResolver,
  type ProjectFolderResolution
} from "@nodetool-ai/runtime";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";
import {
  moveProjectAssetToDirectory,
  renameProjectAssetFile,
  saveProjectAsset
} from "../src/project-asset.js";
import { ProjectAssetStorageAdapter } from "../src/project-asset-storage.js";
import { getAssetAdapter } from "../src/storage.js";

vi.mock("../src/storage.js", () => ({ getAssetAdapter: vi.fn() }));

const USER = "owner";
const PROJECT = "project-a";
const SIZE = 96 * 1024 * 1024;
/** Reading the whole file would add at least SIZE of Buffer memory. */
const MAX_EXTRA_BYTES = 32 * 1024 * 1024;

let root: string;
let source: string;

/** A sparse file of `size` bytes with a marker at each end. */
async function sparseFile(path: string, size: number): Promise<void> {
  const handle = await open(path, "w");
  try {
    await handle.write(Buffer.from("HEAD"), 0, 4, 0);
    await handle.write(Buffer.from("TAIL"), 0, 4, size - 4);
  } finally {
    await handle.close();
  }
}

/** Run `work` and report the most Buffer memory it ever held beyond its start. */
async function peakBufferGrowth<T>(
  work: () => Promise<T>
): Promise<{ result: T; growth: number }> {
  const base = process.memoryUsage().arrayBuffers;
  let peak = base;
  const timer = setInterval(() => {
    peak = Math.max(peak, process.memoryUsage().arrayBuffers);
  }, 2);
  try {
    const result = await work();
    return {
      result,
      growth: Math.max(peak, process.memoryUsage().arrayBuffers) - base
    };
  } finally {
    clearInterval(timer);
  }
}

beforeEach(async () => {
  initTestDb();
  root = await mkdtemp(join(tmpdir(), "nodetool-large-files-"));
  source = join(root, "outside", "big.bin");
  await import("node:fs/promises").then((fs) =>
    fs.mkdir(join(root, "outside"), { recursive: true })
  );
  await sparseFile(source, SIZE);
  const rawStore = new InMemoryStorageAdapter();
  vi.mocked(getAssetAdapter).mockReturnValue(
    new ProjectAssetStorageAdapter(rawStore)
  );
  const workspace = createLocalWorkspace(join(root, "folder"));
  setProjectFolderResolver(
    async (projectId): Promise<ProjectFolderResolution> => ({
      ok: true,
      projectId: projectId ?? PROJECT,
      workspace
    })
  );
});

afterEach(async () => {
  ModelObserver.clear();
  setProjectFolderResolver(null);
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});

function saveBig() {
  return saveProjectAsset({
    projectId: PROJECT,
    userId: USER,
    name: "big file",
    contentType: "application/octet-stream",
    localPath: source
  });
}

describe("large files in a local project folder", () => {
  it("saves an asset from a file on disk without reading it whole", async () => {
    const { result: asset, growth } = await peakBufferGrowth(saveBig);
    const row = await Asset.find(USER, asset.id);
    expect(row?.size).toBe(SIZE);
    const file = join(root, "folder", row?.workspace_path ?? "missing");
    expect((await stat(file)).size).toBe(SIZE);
    expect(growth).toBeLessThan(MAX_EXTRA_BYTES);
  });

  it("renames an asset's file without reading it whole", async () => {
    const asset = await saveBig();
    const { result: change, growth } = await peakBufferGrowth(async () =>
      renameProjectAssetFile(asset, "renamed big file")
    );
    expect(change).not.toBeNull();
    expect(asset.workspace_path).toBe("Generated/renamed-big-file.bin");
    expect(
      (await stat(join(root, "folder", "Generated/renamed-big-file.bin"))).size
    ).toBe(SIZE);
    expect(growth).toBeLessThan(MAX_EXTRA_BYTES);
    await change?.undo();
  });

  it("moves an asset's file to another directory without reading it whole", async () => {
    const asset = await saveBig();
    const { result: change, growth } = await peakBufferGrowth(async () =>
      moveProjectAssetToDirectory(asset, "footage")
    );
    expect(change).not.toBeNull();
    expect(asset.workspace_path).toBe("footage/big-file.bin");
    expect((await stat(join(root, "folder", "footage/big-file.bin"))).size).toBe(
      SIZE
    );
    expect(growth).toBeLessThan(MAX_EXTRA_BYTES);
    await change?.undo();
  });

  it("leaves no empty file behind when the copy fails", async () => {
    await expect(
      saveProjectAsset({
        projectId: PROJECT,
        userId: USER,
        name: "gone",
        contentType: "application/octet-stream",
        localPath: join(root, "outside", "missing.bin")
      })
    ).rejects.toThrow();
    const generated = join(root, "folder", "Generated");
    const left = await readdir(generated).catch(() => [] as string[]);
    expect(left).toEqual([]);
    expect(await Asset.paginate(USER, {})).toHaveProperty("0.length", 0);
  });
});
