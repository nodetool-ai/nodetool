/**
 * Tests for `nodetool storage migrate-keys` — moving flat asset objects under
 * their owner's prefix. Backed by an in-memory adapter stub so the behaviour
 * that matters (ordering of copy vs delete, idempotency, per-user scoping) is
 * observable without a real backend.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  allForMigration: vi.fn(),
  objects: new Map<string, Uint8Array>(),
  /** When set, `store` silently drops the write (simulates a backend fault). */
  dropWrites: { value: false }
}));

vi.mock("@nodetool-ai/models", () => ({
  Asset: { allForMigration: mocks.allForMigration }
}));

vi.mock("@nodetool-ai/config", () => ({
  loadAssetStorageConfig: () => ({ kind: "file", rootDir: "/tmp/assets" })
}));

vi.mock("@nodetool-ai/websocket", () => ({
  getAssetFileName: (id: string, contentType: string) =>
    `${id}.${contentType === "image/png" ? "png" : "bin"}`
}));

vi.mock("@nodetool-ai/storage", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/storage")>();
  return {
    ...actual,
    createStorageAdapter: () => ({
      uriForKey: (key: string) => `mem://${key}`,
      exists: async (uri: string) => mocks.objects.has(uri.slice(6)),
      retrieve: async (uri: string) => mocks.objects.get(uri.slice(6)) ?? null,
      store: async (key: string, bytes: Uint8Array) => {
        if (!mocks.dropWrites.value) mocks.objects.set(key, bytes);
        return `mem://${key}`;
      },
      delete: async (uri: string) => mocks.objects.delete(uri.slice(6))
    })
  };
});

import { migrateStorageKeys } from "../src/commands/storage.js";

function asset(id: string, userId: string, contentType = "image/png") {
  return { id, user_id: userId, content_type: contentType };
}

beforeEach(() => {
  mocks.objects.clear();
  mocks.dropWrites.value = false;
  mocks.allForMigration.mockReset();
});

describe("migrateStorageKeys", () => {
  it("moves a flat object under its owner's prefix", async () => {
    mocks.objects.set("a1.png", new Uint8Array([1, 2, 3]));
    mocks.allForMigration.mockResolvedValue([asset("a1", "user-1")]);

    const report = await migrateStorageKeys();

    expect(report.moved).toBe(1);
    expect(mocks.objects.has("user-1/a1.png")).toBe(true);
    expect(mocks.objects.has("a1.png")).toBe(false);
    expect([...mocks.objects.get("user-1/a1.png")!]).toEqual([1, 2, 3]);
  });

  it("moves the thumbnail alongside the object", async () => {
    mocks.objects.set("a1.png", new Uint8Array([1]));
    mocks.objects.set("a1_thumb.jpg", new Uint8Array([2]));
    mocks.allForMigration.mockResolvedValue([asset("a1", "user-1")]);

    const report = await migrateStorageKeys();

    expect(report.moved).toBe(2);
    expect(mocks.objects.has("user-1/a1_thumb.jpg")).toBe(true);
  });

  it("writes nothing on a dry run", async () => {
    mocks.objects.set("a1.png", new Uint8Array([1]));
    mocks.allForMigration.mockResolvedValue([asset("a1", "user-1")]);

    const report = await migrateStorageKeys({ dryRun: true });

    expect(report.moved).toBe(1);
    expect(mocks.objects.has("a1.png")).toBe(true);
    expect(mocks.objects.has("user-1/a1.png")).toBe(false);
  });

  it("is idempotent — a second run moves nothing", async () => {
    mocks.objects.set("a1.png", new Uint8Array([1]));
    mocks.allForMigration.mockResolvedValue([asset("a1", "user-1")]);

    await migrateStorageKeys();
    const second = await migrateStorageKeys();

    expect(second.moved).toBe(0);
    expect(second.alreadyMigrated).toBe(1);
  });

  it("leaves an already-prefixed object untouched even if a flat one lingers", async () => {
    mocks.objects.set("user-1/a1.png", new Uint8Array([9]));
    mocks.objects.set("a1.png", new Uint8Array([1]));
    mocks.allForMigration.mockResolvedValue([asset("a1", "user-1")]);

    const report = await migrateStorageKeys();

    expect(report.alreadyMigrated).toBe(1);
    expect([...mocks.objects.get("user-1/a1.png")!]).toEqual([9]);
  });

  it("counts an asset with no object as absent rather than failed", async () => {
    mocks.allForMigration.mockResolvedValue([asset("a1", "user-1")]);
    const report = await migrateStorageKeys();
    expect(report.missing).toBe(2); // object + thumbnail
    expect(report.failed).toBe(0);
    expect(report.entries).toHaveLength(0);
  });

  it("keeps each owner's objects in their own prefix", async () => {
    mocks.objects.set("a1.png", new Uint8Array([1]));
    mocks.objects.set("a2.png", new Uint8Array([2]));
    mocks.allForMigration.mockResolvedValue([
      asset("a1", "user-1"),
      asset("a2", "user-2")
    ]);

    await migrateStorageKeys();

    expect(mocks.objects.has("user-1/a1.png")).toBe(true);
    expect(mocks.objects.has("user-2/a2.png")).toBe(true);
    expect(mocks.objects.has("user-2/a1.png")).toBe(false);
  });

  it("skips folders, which have no bytes", async () => {
    mocks.allForMigration.mockResolvedValue([asset("f1", "user-1", "folder")]);
    const report = await migrateStorageKeys();
    expect(report.scanned).toBe(0);
  });

  it("narrows to one user when asked", async () => {
    mocks.allForMigration.mockResolvedValue([asset("a1", "user-1")]);
    await migrateStorageKeys({ userId: "user-1" });
    expect(mocks.allForMigration).toHaveBeenCalledWith("user-1");
  });

  it("keeps the original when the copy does not read back", async () => {
    mocks.objects.set("a1.png", new Uint8Array([1]));
    mocks.allForMigration.mockResolvedValue([asset("a1", "user-1")]);
    mocks.dropWrites.value = true;

    const report = await migrateStorageKeys();

    // The delete only runs after the target verifies, so an interrupted or
    // faulty write leaves the asset readable at its old key.
    expect(report.failed).toBeGreaterThan(0);
    expect(report.moved).toBe(0);
    expect(mocks.objects.has("a1.png")).toBe(true);
  });
});
