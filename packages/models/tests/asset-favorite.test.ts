/**
 * `nodetool_assets.favorite`: the star a user sets on an asset, and the
 * Favorites listing that reads it across folders.
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

describe("Asset.favorite", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  it("defaults to false and round-trips a star", async () => {
    const asset = await Asset.create<Asset>({
      user_id: "u1",
      name: "pic.png",
      content_type: "image/png"
    });
    expect(asset.favorite).toBe(false);
    expect((await Asset.find("u1", asset.id))!.favorite).toBe(false);

    asset.favorite = true;
    await asset.save();
    expect((await Asset.find("u1", asset.id))!.favorite).toBe(true);
  });

  it("lists the user's starred assets from every folder", async () => {
    const inHome = await Asset.create<Asset>({
      user_id: "u1",
      parent_id: "u1",
      name: "a.png",
      content_type: "image/png",
      favorite: true
    });
    const inFolder = await Asset.create<Asset>({
      user_id: "u1",
      parent_id: "folder-1",
      name: "b.png",
      content_type: "image/png",
      favorite: true
    });
    await Asset.create<Asset>({
      user_id: "u1",
      parent_id: "u1",
      name: "c.png",
      content_type: "image/png"
    });
    await Asset.create<Asset>({
      user_id: "u2",
      name: "d.png",
      content_type: "image/png",
      favorite: true
    });

    const [favorites] = await Asset.paginate("u1", { favorite: true });
    expect(favorites.map((a) => a.id).sort()).toEqual(
      [inHome.id, inFolder.id].sort()
    );
  });
});

describe("add_asset_favorite migration", () => {
  const migration = migrations.find((m) => m.name === "add_asset_favorite");

  it("adds the column, unstarred, to an existing assets table, once", async () => {
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

    expect(await adapter.columnExists("nodetool_assets", "favorite")).toBe(true);
    const row = await adapter.fetchone(
      "SELECT favorite FROM nodetool_assets WHERE id = ?",
      ["a1"]
    );
    expect(row?.favorite).toBe(0);
  });
});
