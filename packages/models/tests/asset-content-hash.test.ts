/**
 * `nodetool_assets.content_hash`: the SHA-256 of an asset's whole file in its
 * project folder, filled in by a background job (PRD T3).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { ModelObserver } from "../src/base-model.js";
import { initTestDb } from "../src/db.js";
import { Asset } from "../src/asset.js";
import {
  migrations,
  SQLiteMigrationAdapter
} from "../src/migrations/index.js";

const HASH = "a".repeat(64);
const FINGERPRINT = {
  workspace_size: 3,
  workspace_mtime: 1_700_000_000_000,
  workspace_hash: "partial"
};

function createAsset(metadata: Record<string, unknown> | null): Promise<Asset> {
  return Asset.create<Asset>({
    user_id: "u1",
    project_id: "p1",
    name: "fox",
    content_type: "image/png",
    workspace_path: "Generated/fox.png",
    metadata
  });
}

describe("Asset.content_hash", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  it("defaults to null and round-trips through a save", async () => {
    const asset = await createAsset(FINGERPRINT);
    expect(asset.content_hash).toBeNull();
    expect((await Asset.find("u1", asset.id))!.content_hash).toBeNull();

    asset.content_hash = HASH;
    await asset.save();
    expect((await Asset.find("u1", asset.id))!.content_hash).toBe(HASH);
  });

  it("recordContentHash stores the hash and nothing else, and sends no change event", async () => {
    const asset = await createAsset(FINGERPRINT);
    // Renamed by a request that arrived while the file was being hashed.
    const renamed = (await Asset.find("u1", asset.id))!;
    renamed.name = "red fox";
    await renamed.save();
    const events: string[] = [];
    ModelObserver.subscribe((_instance, event) => events.push(event), "Asset");

    expect(await asset.recordContentHash(HASH, FINGERPRINT)).toBe(true);

    expect(asset.content_hash).toBe(HASH);
    const found = (await Asset.find("u1", asset.id))!;
    expect(found.content_hash).toBe(HASH);
    expect(found.name).toBe("red fox");
    expect(found.updated_at).toBe(renamed.updated_at);
    expect(events).toEqual([]);
  });

  it("recordContentHash refuses when the fingerprint changed since it was read", async () => {
    const asset = await createAsset(FINGERPRINT);
    const changed = (await Asset.find("u1", asset.id))!;
    changed.metadata = { ...FINGERPRINT, workspace_mtime: 1_700_000_000_999 };
    await changed.save();

    expect(await asset.recordContentHash(HASH, FINGERPRINT)).toBe(false);

    expect(asset.content_hash).toBeNull();
    expect((await Asset.find("u1", asset.id))!.content_hash).toBeNull();
  });

  it("recordContentHash refuses for a row that was deleted, and does not bring it back", async () => {
    const asset = await createAsset(null);
    await (await Asset.find("u1", asset.id))!.delete();

    expect(await asset.recordContentHash(HASH, null)).toBe(false);
    expect(await Asset.find("u1", asset.id)).toBeNull();
  });

  it("recordContentHash writes only the caller's own row", async () => {
    const asset = await createAsset(FINGERPRINT);
    const other = await Asset.create<Asset>({
      user_id: "u2",
      project_id: "p1",
      name: "fox",
      content_type: "image/png",
      workspace_path: "Generated/fox.png",
      metadata: FINGERPRINT
    });

    expect(await asset.recordContentHash(HASH, FINGERPRINT)).toBe(true);
    expect((await Asset.find("u2", other.id))!.content_hash).toBeNull();
  });
});

describe("add_asset_content_hash migration", () => {
  const migration = migrations.find((m) => m.name === "add_asset_content_hash");

  it("adds the nullable column to an existing assets table, once", async () => {
    expect(migration).toBeDefined();
    const adapter = new SQLiteMigrationAdapter(new Database(":memory:"));
    await adapter.execute(
      "CREATE TABLE nodetool_assets (id TEXT PRIMARY KEY, user_id TEXT NOT NULL)"
    );
    await adapter.execute(
      "INSERT INTO nodetool_assets (id, user_id) VALUES ('a1', 'u1')"
    );
    expect(await adapter.columnExists("nodetool_assets", "content_hash")).toBe(
      false
    );

    await migration!.up(adapter);
    await migration!.up(adapter);

    expect(await adapter.columnExists("nodetool_assets", "content_hash")).toBe(
      true
    );
    const row = await adapter.fetchone(
      "SELECT content_hash FROM nodetool_assets WHERE id = ?",
      ["a1"]
    );
    expect(row?.content_hash).toBeNull();
  });

  it("runs after the migration that adds the file path the hash belongs to", () => {
    const names = migrations.map((m) => m.name);
    expect(names.indexOf("add_asset_content_hash")).toBeGreaterThan(
      names.indexOf("add_asset_workspace_path")
    );
  });
});
