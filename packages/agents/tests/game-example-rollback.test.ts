import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTopDownRoomGame } from "@nodetool-ai/game-runtime";
import { Asset, ModelObserver, initTestDb } from "@nodetool-ai/models";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";
import { installExampleGameAssets } from "../src/game-examples.js";

const USER = "example-rollback-owner";
const PROJECT = "example-rollback-project";
let directory: string;
let gamesDir: string;

describe("example game asset rollback", () => {
  beforeEach(async () => {
    initTestDb();
    directory = await mkdtemp(join(tmpdir(), "game-example-rollback-"));
    gamesDir = join(directory, "examples", "games");
    const assetsDir = join(directory, "assets", "nodetool-base", "games", "rollback");
    await mkdir(gamesDir, { recursive: true });
    await mkdir(assetsDir, { recursive: true });
    const bytes = new Uint8Array([1, 2, 3, 4]);
    await writeFile(join(assetsDir, "sprite.png"), bytes);
    const document = createTopDownRoomGame("rollback-fixture");
    for (const binding of Object.values(document.assets)) {
      binding.assetId = "package://nodetool-base/games/rollback/sprite.png";
      binding.digest = createHash("sha256").update(bytes).digest("hex");
    }
    await writeFile(join(gamesDir, "rollback.game.json"), JSON.stringify({
      name: "Rollback", description: "Multi-asset rollback", controls: "Arrows",
      posterUri: "package://nodetool-base/games/rollback/sprite.png", document
    }));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    ModelObserver.clear();
    await rm(directory, { recursive: true, force: true });
  });

  it.each([0, 2])("continues independent blob and row cleanup after failures at entry %i", async (failedIndex) => {
    const storage = new InMemoryStorageAdapter();
    const installed = await installExampleGameAssets(USER, PROJECT, { examplesDir: join(directory, "examples", "workflows") }, "rollback", storage);
    const assets = Object.values(installed.document.assets);
    expect(assets).toHaveLength(4);
    const rows = await Promise.all(assets.map((binding) => Asset.find(USER, binding.assetId)));
    expect(rows.every((row) => row instanceof Asset)).toBe(true);
    const entries = (await storage.list("")).entries;
    expect(entries).toHaveLength(4);
    const failedBlob = entries[failedIndex]!.uri;
    const failedRow = rows[(failedIndex + 1) % rows.length]!;
    const blobError = new Error("blob deletion unavailable");
    const rowError = new Error("row deletion unavailable");
    const originalDelete = storage.delete.bind(storage);
    const blobDelete = vi.spyOn(storage, "delete").mockImplementation(async (uri) => {
      if (uri === failedBlob) { throw blobError; }
      return originalDelete(uri);
    });
    const originalRowDelete = Asset.prototype.delete;
    const rowDelete = vi.spyOn(Asset.prototype, "delete").mockImplementation(async function (this: Asset) {
      if (this.id === failedRow.id) { throw rowError; }
      await originalRowDelete.call(this);
    });
    const failure = await installed.rollback().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(AggregateError);
    expect(failure).toMatchObject({ errors: expect.arrayContaining([blobError, rowError]) });
    expect(blobDelete.mock.calls.map(([uri]) => uri).sort()).toEqual(entries.map(({ uri }) => uri).sort());
    expect(rowDelete.mock.instances.map((asset) => asset.id).sort()).toEqual(assets.map((asset) => asset.assetId).sort());
    expect((await storage.list("")).entries.map(({ uri }) => uri)).toEqual([failedBlob]);
    for (const binding of assets) {
      expect(await Asset.find(USER, binding.assetId)).toEqual(binding.assetId === failedRow.id ? expect.objectContaining({ id: failedRow.id }) : null);
    }
    blobDelete.mockImplementation(originalDelete);
    rowDelete.mockImplementation(originalRowDelete);
    blobDelete.mockClear();
    rowDelete.mockClear();
    await installed.rollback();
    expect(blobDelete.mock.calls).toEqual([[failedBlob]]);
    expect(rowDelete.mock.instances.map((asset) => asset.id)).toEqual([failedRow.id]);
    await installed.rollback();
    expect(blobDelete).toHaveBeenCalledTimes(1);
    expect(rowDelete).toHaveBeenCalledTimes(1);
    expect((await storage.list("")).entries).toEqual([]);
    expect(await Asset.find(USER, failedRow.id)).toBeNull();
  });

  it("retains the store failure and retry handle after a write-then-reject and cleanup failures", async () => {
    const storage = new InMemoryStorageAdapter();
    const originalStore = storage.store.bind(storage);
    const originalDelete = storage.delete.bind(storage);
    const originalRowDelete = Asset.prototype.delete;
    const failure = new Error("fourth store failed after writing");
    const rows: Asset[] = [];
    const writes: string[] = [];
    vi.spyOn(storage, "store").mockImplementation(async (...args) => {
      const uri = await originalStore(...args);
      const row = await Asset.find(USER, basename(args[0], ".png"));
      if (!(row instanceof Asset)) { throw new Error("Store did not follow an owned asset row"); }
      rows.push(row);
      writes.push(uri);
      if (writes.length === 4) { throw failure; }
      return uri;
    });
    const blobFailure = new Error("first blob cleanup failed");
    const rowFailure = new Error("middle row cleanup failed");
    const deletes = vi.spyOn(storage, "delete").mockImplementation(async (uri) => {
      if (uri === writes[0]) { throw blobFailure; }
      return originalDelete(uri);
    });
    const rowDeletes = vi.spyOn(Asset.prototype, "delete").mockImplementation(async function (this: Asset) {
      if (this.id === rows[1]?.id) { throw rowFailure; }
      await originalRowDelete.call(this);
    });
    const error = await installExampleGameAssets(USER, PROJECT, { examplesDir: join(directory, "examples", "workflows") }, "rollback", storage)
      .catch((caught: unknown) => caught);
    expect(writes).toHaveLength(4);
    expect(error).toMatchObject({ message: failure.message, cause: failure, errors: expect.arrayContaining([blobFailure, rowFailure]), rollback: expect.any(Function) });
    expect(deletes).toHaveBeenCalledTimes(4);
    expect(rowDeletes).toHaveBeenCalledTimes(4);
    expect((await storage.list("")).entries.map(({ uri }) => uri)).toEqual([writes[0]]);
    expect(await Asset.find(USER, rows[3]!.id)).toBeNull();
    deletes.mockImplementation(originalDelete);
    rowDeletes.mockImplementation(originalRowDelete);
    if (!(error instanceof Error) || !("rollback" in error) || typeof error.rollback !== "function") { throw new Error("Missing cleanup retry handle"); }
    await error.rollback();
    await error.rollback();
    expect(deletes).toHaveBeenCalledTimes(5);
    expect(rowDeletes).toHaveBeenCalledTimes(5);
    expect((await storage.list("")).entries).toEqual([]);
    for (const row of rows) { expect(await Asset.find(USER, row.id)).toBeNull(); }
  });

  it("rethrows the identical installation error when cleanup succeeds", async () => {
    const storage = new InMemoryStorageAdapter();
    const originalStore = storage.store.bind(storage);
    const failure = new Error("store failed after writing");
    const rows: string[] = [];
    vi.spyOn(storage, "store").mockImplementation(async (...args) => {
      await originalStore(...args);
      rows.push(basename(args[0], ".png"));
      if (rows.length === 4) { throw failure; }
      return storage.uriForKey(args[0]);
    });
    await expect(installExampleGameAssets(USER, PROJECT, { examplesDir: join(directory, "examples", "workflows") }, "rollback", storage)).rejects.toBe(failure);
    expect(rows).toHaveLength(4);
    expect((await storage.list("")).entries).toEqual([]);
    for (const id of rows) { expect(await Asset.find(USER, id)).toBeNull(); }
  });

  it("refuses to overwrite or remove bytes already at a new row's destination", async () => {
    const storage = new InMemoryStorageAdapter();
    const originalStore = storage.store.bind(storage);
    const sentinel = new Uint8Array([9, 8, 7]);
    let occupied = "";
    vi.spyOn(storage, "exists").mockImplementation(async (uri) => {
      occupied = uri;
      await originalStore(uri.slice("memory://".length), sentinel);
      return true;
    });
    const store = vi.spyOn(storage, "store");
    const remove = vi.spyOn(storage, "delete");
    const rowDelete = vi.spyOn(Asset.prototype, "delete");
    await expect(installExampleGameAssets(USER, PROJECT, { examplesDir: join(directory, "examples", "workflows") }, "rollback", storage)).rejects.toThrow("destination already exists");
    expect(store).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(rowDelete).toHaveBeenCalledTimes(1);
    expect(await storage.retrieve(occupied)).toEqual(sentinel);
    expect(await Asset.find(USER, rowDelete.mock.instances[0]!.id)).toBeNull();
  });
});
