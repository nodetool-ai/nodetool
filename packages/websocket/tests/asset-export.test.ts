/**
 * Tests for export-time asset resolution — how a stored ref becomes bytes for
 * the storyboard zip and the `.nodetool` workflow bundle.
 *
 * Run with:
 *   npm run test --workspace=packages/websocket -- asset-export
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";
import { initTestDb, Asset } from "@nodetool-ai/models";

const adapter = new InMemoryStorageAdapter();

vi.mock("../src/lib/storage.js", () => ({
  getAssetAdapter: () => adapter,
  getTempAdapter: () => adapter
}));

const { resolveAssetBytesForExport } = await import(
  "../src/lib/asset-export.js"
);

const bytes = new Uint8Array([1, 2, 3, 4]);

async function makeAsset(userId: string): Promise<Asset> {
  return (await Asset.create({
    user_id: userId,
    name: "still.jpg",
    content_type: "image/jpeg",
    parent_id: userId
  })) as Asset;
}

describe("resolveAssetBytesForExport", () => {
  beforeEach(async () => {
    initTestDb();
    for (const key of (await adapter.list("")).entries) {
      await adapter.delete(adapter.uriForKey(key.key));
    }
  });

  it("reads a suffixed asset ref from the owner-prefixed key", async () => {
    const asset = await makeAsset("user-1");
    await adapter.store(`user-1/${asset.id}.jpg`, bytes, "image/jpeg");

    expect(await resolveAssetBytesForExport(`asset://${asset.id}.jpg`)).toEqual(
      bytes
    );
  });

  it("reads a bare asset ref from the owner-prefixed key", async () => {
    const asset = await makeAsset("user-1");
    await adapter.store(`user-1/${asset.id}.jpg`, bytes, "image/jpeg");

    expect(await resolveAssetBytesForExport(`asset://${asset.id}`)).toEqual(
      bytes
    );
  });

  it("falls back to the flat legacy key when no owner-prefixed object exists", async () => {
    const asset = await makeAsset("user-1");
    await adapter.store(`${asset.id}.jpg`, bytes, "image/jpeg");

    expect(await resolveAssetBytesForExport(`asset://${asset.id}.jpg`)).toEqual(
      bytes
    );
  });

  it("reads a ref that already carries the owner prefix", async () => {
    await adapter.store("user-1/a1.jpg", bytes, "image/jpeg");

    expect(await resolveAssetBytesForExport("asset://user-1/a1.jpg")).toEqual(
      bytes
    );
  });

  it("returns null when the object is stored under no candidate key", async () => {
    const asset = await makeAsset("user-1");
    await adapter.store(`user-2/${asset.id}.jpg`, bytes, "image/jpeg");

    expect(await resolveAssetBytesForExport(`asset://${asset.id}.jpg`)).toBeNull();
  });
});
