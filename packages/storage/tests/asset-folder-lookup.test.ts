/**
 * `setAssetFolderPathLookup`: an adapter a host builds over the asset folder,
 * with no lookup of its own, resolves a missed key through the installed one.
 * That is how a CLI command reads an asset whose bytes are a file in its
 * project folder. An adapter over any other root never does.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  FileStorageAdapter,
  setAssetFolderPathLookup
} from "../src/file-storage-adapter.js";

const KEY = "u1/0123456789abcdef0123456789abcdef.png";
const BYTES = Buffer.from("the file in the project folder");

let dir: string;
let assets: string;
let projectFile: string;
let lookup: ReturnType<typeof vi.fn<(key: string) => Promise<string | null>>>;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "nodetool-asset-folder-lookup-"));
  assets = join(dir, "assets");
  projectFile = join(dir, "project", "Generated", "fox-in-snow.png");
  await mkdir(join(dir, "project", "Generated"), { recursive: true });
  await writeFile(projectFile, BYTES);
  vi.stubEnv("ASSET_FOLDER", assets);
  lookup = vi.fn(async (key: string) => (key === KEY ? projectFile : null));
});

afterEach(async () => {
  setAssetFolderPathLookup(null);
  vi.unstubAllEnvs();
  await rm(dir, { recursive: true, force: true });
});

describe("an adapter over the asset folder", () => {
  it("cannot read a project file until the lookup is installed", async () => {
    const adapter = new FileStorageAdapter(assets);
    const uri = adapter.uriForKey(KEY);

    expect(await adapter.retrieve(uri)).toBeNull();
    expect(await adapter.exists(uri)).toBe(false);
    expect(await adapter.localPath(uri)).toBeNull();
    expect(lookup).not.toHaveBeenCalled();
  });

  it("reads, stats and locates the project file once the lookup is installed", async () => {
    // Built before the install, as a context that outlives it would be.
    const adapter = new FileStorageAdapter(assets);
    const uri = adapter.uriForKey(KEY);
    setAssetFolderPathLookup(lookup);

    expect(await adapter.retrieve(uri)).toEqual(BYTES);
    expect(await adapter.exists(uri)).toBe(true);
    expect(await adapter.stat(uri)).toMatchObject({ key: KEY, size: BYTES.length });
    expect(await adapter.localPath(uri)).toBe(projectFile);
    expect(lookup).toHaveBeenCalledWith(KEY);
  });

  it("still serves an object under the root without asking the lookup", async () => {
    const adapter = new FileStorageAdapter(assets);
    await adapter.store(KEY, Buffer.from("stored object"));
    setAssetFolderPathLookup(lookup);

    expect(await adapter.retrieve(adapter.uriForKey(KEY))).toEqual(
      Buffer.from("stored object")
    );
    expect(lookup).not.toHaveBeenCalled();
  });

  it("never deletes or replaces the file the lookup names", async () => {
    const adapter = new FileStorageAdapter(assets);
    setAssetFolderPathLookup(lookup);

    expect(await adapter.delete(adapter.uriForKey(KEY))).toBe(false);

    expect(await readFile(projectFile)).toEqual(BYTES);
  });

  it("prefers the lookup it was built with", async () => {
    const own = vi.fn(async () => null);
    const adapter = new FileStorageAdapter(assets, { externalPathLookup: own });
    setAssetFolderPathLookup(lookup);

    expect(await adapter.retrieve(adapter.uriForKey(KEY))).toBeNull();
    expect(own).toHaveBeenCalledWith(KEY);
    expect(lookup).not.toHaveBeenCalled();
  });
});

describe("an adapter over another root", () => {
  it("never resolves a key through the asset folder lookup", async () => {
    setAssetFolderPathLookup(lookup);
    // A workspace or a temp store: a missed key there is a missing file.
    const workspace = new FileStorageAdapter(join(dir, "workspace"));
    const uri = workspace.uriForKey(KEY);

    expect(await workspace.retrieve(uri)).toBeNull();
    expect(await workspace.exists(uri)).toBe(false);
    expect(await workspace.stat(uri)).toBeNull();
    expect(await workspace.localPath(uri)).toBeNull();
    expect(lookup).not.toHaveBeenCalled();
  });
});
