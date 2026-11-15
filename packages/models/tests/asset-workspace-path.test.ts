/**
 * `nodetool_assets.workspace_path`: the path of an asset's file relative to
 * the folder of its project (PRD T3).
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

describe("Asset.workspace_path", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  it("defaults to null for an asset outside a project folder", async () => {
    const asset = await Asset.create<Asset>({
      user_id: "u1",
      name: "pic.png",
      content_type: "image/png"
    });
    expect(asset.workspace_path).toBeNull();
    expect((await Asset.find("u1", asset.id))!.workspace_path).toBeNull();
  });

  it("round-trips the path and survives an update of another field", async () => {
    const asset = await Asset.create<Asset>({
      user_id: "u1",
      project_id: "p1",
      name: "fox in snow",
      content_type: "image/png",
      workspace_path: "Generated/fox-in-snow.png"
    });
    asset.name = "red fox";
    await asset.save();

    const found = await Asset.find("u1", asset.id);
    expect(found!.workspace_path).toBe("Generated/fox-in-snow.png");
    expect(found!.name).toBe("red fox");
  });

  it("finds rows by path within one user's project only", async () => {
    const path = "Generated/fox-in-snow.png";
    const mine = await Asset.create<Asset>({
      user_id: "u1",
      project_id: "p1",
      name: "fox",
      content_type: "image/png",
      workspace_path: path
    });
    await Asset.create<Asset>({
      user_id: "u1",
      project_id: "p2",
      name: "fox",
      content_type: "image/png",
      workspace_path: path
    });
    await Asset.create<Asset>({
      user_id: "u2",
      project_id: "p1",
      name: "fox",
      content_type: "image/png",
      workspace_path: path
    });
    await Asset.create<Asset>({
      user_id: "u1",
      project_id: "p1",
      name: "other",
      content_type: "image/png",
      workspace_path: "Generated/other.png"
    });

    const found = await Asset.findByWorkspacePath("u1", "p1", path);
    expect(found.map((a) => a.id)).toEqual([mine.id]);
    expect(await Asset.findByWorkspacePath("u1", "p1", "Generated/none.png")).toEqual(
      []
    );
  });
});

describe("Asset.listProjectFiles", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  it("lists the user's assets that keep a file in the project's folder, and no others", async () => {
    const inFolder = await Asset.create<Asset>({
      user_id: "u1",
      project_id: "p1",
      name: "fox",
      content_type: "image/png",
      workspace_path: "Generated/fox.png"
    });
    // No file in a folder, another project, another user.
    await Asset.create<Asset>({
      user_id: "u1",
      project_id: "p1",
      name: "legacy",
      content_type: "image/png"
    });
    await Asset.create<Asset>({
      user_id: "u1",
      project_id: "p2",
      name: "fox",
      content_type: "image/png",
      workspace_path: "Generated/fox.png"
    });
    await Asset.create<Asset>({
      user_id: "u2",
      project_id: "p1",
      name: "fox",
      content_type: "image/png",
      workspace_path: "Generated/fox.png"
    });

    const listed = await Asset.listProjectFiles("u1", "p1");

    expect(listed.map((a) => a.id)).toEqual([inFolder.id]);
    expect(await Asset.listProjectFiles("u1", "none")).toEqual([]);
  });
});

describe("add_asset_workspace_path migration", () => {
  const migration = migrations.find(
    (m) => m.name === "add_asset_workspace_path"
  );

  it("adds the nullable column to an existing assets table, once", async () => {
    expect(migration).toBeDefined();
    const adapter = new SQLiteMigrationAdapter(new Database(":memory:"));
    await adapter.execute(
      "CREATE TABLE nodetool_assets (id TEXT PRIMARY KEY, user_id TEXT NOT NULL)"
    );
    await adapter.execute(
      "INSERT INTO nodetool_assets (id, user_id) VALUES ('a1', 'u1')"
    );
    expect(await adapter.columnExists("nodetool_assets", "workspace_path")).toBe(
      false
    );

    await migration!.up(adapter);
    await migration!.up(adapter);

    expect(await adapter.columnExists("nodetool_assets", "workspace_path")).toBe(
      true
    );
    const row = await adapter.fetchone(
      "SELECT workspace_path FROM nodetool_assets WHERE id = ?",
      ["a1"]
    );
    expect(row?.workspace_path).toBeNull();
  });

  it("is the newest migration", () => {
    expect(migrations.at(-1)?.name).toBe("add_asset_workspace_path");
  });
});
