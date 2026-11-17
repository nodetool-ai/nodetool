/**
 * The move of one legacy asset into its project folder, stopped between two
 * steps the way a process that dies there stops, and run again. A file a
 * creator put in the folder is never removed because its bytes match, and
 * the legacy object is never deleted unless the file holds its bytes now.
 *
 * Every case runs against a local directory and against a storage-backed
 * folder, through the same `Workspace`.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Asset, ModelObserver, initTestDb, moveTargetOf } from "@nodetool-ai/models";
import { ProjectDirectoryResolver } from "@nodetool-ai/protocol";
import {
  createLocalWorkspace,
  createWorkspace,
  type Workspace
} from "@nodetool-ai/runtime";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";
import { getAssetStorageKey } from "../src/asset-paths.js";
import {
  moveLegacyAssetIntoFolder,
  type LegacyAssetMoveOutcome,
  type LegacyAssetMoveStep
} from "../src/legacy-asset-move.js";
import { storeLegacyAssetBytes } from "../src/project-asset.js";

const USER = "owner";
const PROJECT = "project-a";

let root: string;
let store: InMemoryStorageAdapter;
let workspace: Workspace;

const kinds = {
  local: (): Workspace => createLocalWorkspace(join(root, "folder")),
  storage: (): Workspace =>
    createWorkspace(new InMemoryStorageAdapter(), { prefix: `workspaces/${PROJECT}` })
} as const;

beforeEach(async () => {
  initTestDb();
  root = await mkdtemp(join(tmpdir(), "nodetool-legacy-move-"));
  store = new InMemoryStorageAdapter();
});

afterEach(async () => {
  ModelObserver.clear();
  await rm(root, { recursive: true, force: true });
});

function bytesOf(seed: number, length = 2048): Uint8Array {
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) bytes[i] = (seed * 31 + i * 7) % 251;
  return bytes;
}

function same(a: Uint8Array | null, b: Uint8Array): boolean {
  return a !== null && Buffer.from(a).equals(Buffer.from(b));
}

function keyOf(asset: Asset): string {
  return getAssetStorageKey(USER, asset.id, asset.content_type);
}

/** An asset from before project folders: a row plus an object in the store. */
async function legacyAsset(bytes: Uint8Array): Promise<Asset> {
  const asset = await Asset.create<Asset>({
    user_id: USER,
    project_id: PROJECT,
    parent_id: null,
    name: "fox",
    content_type: "image/png",
    size: bytes.byteLength
  });
  await store.store(keyOf(asset), bytes, "image/png");
  return asset;
}

function storedObject(asset: Asset): Promise<Uint8Array | null> {
  return store.retrieve(store.uriForKey(keyOf(asset)));
}

/** A bytes update of a legacy asset, as `updateAssetBytes` makes it. */
async function updateBytes(asset: Asset, bytes: Uint8Array): Promise<void> {
  const loaded = await Asset.find(USER, asset.id);
  if (!loaded) throw new Error("asset is gone");
  await storeLegacyAssetBytes(loaded, async () => {
    await store.store(keyOf(loaded), bytes, loaded.content_type);
    loaded.size = bytes.byteLength;
    await loaded.save();
  });
}

function move(
  asset: Asset,
  killedAfter?: LegacyAssetMoveStep
): Promise<LegacyAssetMoveOutcome> {
  return moveLegacyAssetIntoFolder(USER, asset.id, {
    storage: store,
    workspace,
    projectId: PROJECT,
    resolver: new ProjectDirectoryResolver(PROJECT, new Map()),
    afterStep: (step) => {
      if (step === killedAfter) throw new Error(`killed after ${step}`);
    }
  });
}

async function files(): Promise<string[]> {
  return (await workspace.list("", { recursive: true }))
    .filter((entry) => !entry.isDirectory)
    .map((entry) => entry.path)
    .sort();
}

describe.each(["local", "storage"] as const)("the move into a %s folder", (kind) => {
  beforeEach(() => {
    workspace = kinds[kind]();
  });

  it("keeps a creator's file at the recorded target that the move did not publish", async () => {
    const earlier = bytesOf(1);
    const newer = bytesOf(2);
    const asset = await legacyAsset(earlier);
    await expect(move(asset, "claimed")).rejects.toThrow("killed after claimed");
    expect(moveTargetOf((await Asset.find(USER, asset.id))!)).toBe("fox.png");
    expect(await files()).toEqual([]);
    // The creator copies the same bytes to that path on their own, and a
    // bytes update stores newer bytes for the asset.
    await workspace.write("fox.png", earlier);
    await updateBytes(asset, newer);

    expect(await move(asset)).toEqual({ status: "moved", path: "fox-2.png" });

    expect(await files()).toEqual(["fox-2.png", "fox.png"]);
    expect(same(await workspace.read("fox.png"), earlier)).toBe(true);
    expect(same(await workspace.read("fox-2.png"), newer)).toBe(true);
    expect((await Asset.find(USER, asset.id))?.workspace_path).toBe("fox-2.png");
  });

  it("keeps a creator's file that replaced the published copy with the same bytes", async () => {
    const earlier = bytesOf(1);
    const newer = bytesOf(2);
    const asset = await legacyAsset(earlier);
    await expect(move(asset, "copied")).rejects.toThrow("killed after copied");
    // A creator saves a file of the same bytes over the copy, later.
    await new Promise((resolve) => setTimeout(resolve, 20));
    await workspace.write("fox.png", earlier);
    await updateBytes(asset, newer);

    expect(await move(asset)).toEqual({ status: "moved", path: "fox-2.png" });

    expect(same(await workspace.read("fox.png"), earlier)).toBe(true);
    expect(same(await workspace.read("fox-2.png"), newer)).toBe(true);
  });

  it("replaces its own published copy of bytes the asset no longer has", async () => {
    const earlier = bytesOf(1);
    const newer = bytesOf(2);
    const asset = await legacyAsset(earlier);
    await expect(move(asset, "copied")).rejects.toThrow("killed after copied");
    await updateBytes(asset, newer);

    expect(await move(asset)).toEqual({ status: "moved", path: "fox.png" });

    expect(await files()).toEqual(["fox.png"]);
    expect(same(await workspace.read("fox.png"), newer)).toBe(true);
    expect(await storedObject(asset)).toBeNull();
  });

  it("keeps the stored object when the file changed after the row was pointed at it", async () => {
    const original = bytesOf(1);
    const replaced = bytesOf(2);
    const asset = await legacyAsset(original);
    await expect(move(asset, "switched")).rejects.toThrow("killed after switched");
    expect((await Asset.find(USER, asset.id))?.workspace_path).toBe("fox.png");
    // The file in the folder is replaced while the move is stopped.
    await workspace.write("fox.png", replaced);

    const outcome = await move(asset);

    expect(outcome.status).toBe("waiting");
    expect(same(await storedObject(asset), original)).toBe(true);
    expect(same(await workspace.read("fox.png"), replaced)).toBe(true);
  });

  it("deletes the stored object once the file holds its bytes", async () => {
    const original = bytesOf(1);
    const asset = await legacyAsset(original);
    await expect(move(asset, "switched")).rejects.toThrow("killed after switched");

    expect(await move(asset)).toEqual({ status: "moved", path: "fox.png" });

    expect(await storedObject(asset)).toBeNull();
    expect(same(await workspace.read("fox.png"), original)).toBe(true);
    expect(moveTargetOf((await Asset.find(USER, asset.id))!)).toBeNull();
  });
});
