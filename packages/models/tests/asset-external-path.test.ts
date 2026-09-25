/**
 * `nodetool_assets.external_path`: the in-place file reference a large local
 * import records instead of copying bytes under the storage root.
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

describe("Asset.external_path", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  it("defaults to null for a managed asset", async () => {
    const asset = await Asset.create<Asset>({
      user_id: "u1",
      name: "pic.png",
      content_type: "image/png"
    });
    expect(asset.external_path).toBeNull();
    expect((await Asset.find("u1", asset.id))!.external_path).toBeNull();
  });

  it("round-trips the path and the change-detection metadata", async () => {
    const asset = await Asset.create<Asset>({
      user_id: "u1",
      name: "clip.mp4",
      content_type: "video/mp4",
      external_path: "/media/clip.mp4",
      metadata: { external_size: 42, external_mtime: 1_700_000_000_000 }
    });
    const found = await Asset.find("u1", asset.id);
    expect(found!.external_path).toBe("/media/clip.mp4");
    expect(found!.metadata).toEqual({
      external_size: 42,
      external_mtime: 1_700_000_000_000
    });
  });
});

describe("add_asset_external_path migration", () => {
  const migration = migrations.find((m) => m.name === "add_asset_external_path");

  it("adds the nullable column to an existing assets table, once", async () => {
    expect(migration).toBeDefined();
    const adapter = new SQLiteMigrationAdapter(new Database(":memory:"));
    await adapter.execute(
      "CREATE TABLE nodetool_assets (id TEXT PRIMARY KEY, user_id TEXT NOT NULL)"
    );
    await adapter.execute(
      "INSERT INTO nodetool_assets (id, user_id) VALUES ('a1', 'u1')"
    );

    await migration!.up(adapter);
    await migration!.up(adapter);

    expect(await adapter.columnExists("nodetool_assets", "external_path")).toBe(
      true
    );
    const row = await adapter.fetchone(
      "SELECT external_path FROM nodetool_assets WHERE id = ?",
      ["a1"]
    );
    expect(row?.external_path).toBeNull();
  });
});
