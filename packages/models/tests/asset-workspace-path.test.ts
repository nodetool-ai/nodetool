/**
 * `nodetool_assets.workspace_path`: the path of an asset's file relative to
 * the folder of its project (PRD T3).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { ModelObserver } from "../src/base-model.js";
import { initTestDb } from "../src/db.js";
import {
  Asset,
  saveAssetInProject,
  setAssetFileMover,
  type AssetFileMover
} from "../src/asset.js";
import {
  moveDocumentToProject,
  reassignProjectDocuments
} from "../src/project-membership.js";
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

describe("changing the project of an asset", () => {
  beforeEach(() => initTestDb());
  afterEach(() => {
    setAssetFileMover(null);
    ModelObserver.clear();
  });

  const ENTITY = { nodetool_entity: { kind: "character", name: "Mara", descriptor: "a fox" } };

  async function fileAsset(extra: Record<string, unknown> = {}): Promise<Asset> {
    return Asset.create<Asset>({
      user_id: "u1",
      project_id: "p1",
      name: "fox",
      content_type: "image/png",
      workspace_path: "Generated/fox.png",
      ...extra
    });
  }

  /** A mover that records its calls and "moves" the file to a new name. */
  function recordingMover(log: string[]): AssetFileMover {
    return async (asset, projectId) => {
      log.push(`move ${asset.id} to ${projectId}`);
      const previous = { project: asset.project_id, path: asset.workspace_path };
      asset.project_id = projectId;
      asset.workspace_path = "Generated/fox-2.png";
      return {
        commit: async () => {
          log.push("commit");
        },
        undo: async () => {
          asset.project_id = previous.project;
          asset.workspace_path = previous.path;
          log.push("undo");
        }
      };
    };
  }

  it("is a column write for an asset that keeps no file in a folder", async () => {
    const asset = await Asset.create<Asset>({
      user_id: "u1",
      project_id: "p1",
      name: "old",
      content_type: "image/png"
    });

    await saveAssetInProject(asset, "p2");

    expect((await Asset.find("u1", asset.id))!.project_id).toBe("p2");
  });

  it("refuses to change the project of a file asset when no mover is installed", async () => {
    const asset = await fileAsset();

    await expect(saveAssetInProject(asset, "p2")).rejects.toThrow(
      /no asset file mover is installed/
    );

    const row = await Asset.find("u1", asset.id);
    expect(row!.project_id).toBe("p1");
    expect(row!.workspace_path).toBe("Generated/fox.png");
  });

  it("saves the project and the path the mover set, then removes the old file", async () => {
    const log: string[] = [];
    setAssetFileMover(recordingMover(log));
    const asset = await fileAsset();

    await saveAssetInProject(asset, "p2");

    const row = await Asset.find("u1", asset.id);
    expect(row!.project_id).toBe("p2");
    expect(row!.workspace_path).toBe("Generated/fox-2.png");
    expect(log).toEqual([`move ${asset.id} to p2`, "commit"]);
  });

  it("does not call the mover when the project does not change", async () => {
    const log: string[] = [];
    setAssetFileMover(recordingMover(log));
    const asset = await fileAsset();
    asset.name = "renamed";

    await saveAssetInProject(asset, "p1");

    expect(log).toEqual([]);
    expect((await Asset.find("u1", asset.id))!.name).toBe("renamed");
  });

  it("moves an entity's file when the entity is assigned to another project", async () => {
    const log: string[] = [];
    setAssetFileMover(recordingMover(log));
    const entity = await fileAsset({ metadata: ENTITY });
    const plain = await fileAsset({ workspace_path: "Generated/plain.png" });

    expect(await moveDocumentToProject("u1", "entity", entity.id, "p2")).toBe(true);
    // An asset with no entity marker is not an entity and is left alone.
    expect(await moveDocumentToProject("u1", "entity", plain.id, "p2")).toBe(false);

    expect(log).toEqual([`move ${entity.id} to p2`, "commit"]);
    expect((await Asset.find("u1", entity.id))!.project_id).toBe("p2");
    expect((await Asset.find("u1", plain.id))!.project_id).toBe("p1");
  });

  it("moves each file asset one by one when a project's documents are reassigned", async () => {
    const log: string[] = [];
    setAssetFileMover(recordingMover(log));
    const withFile = await fileAsset();
    const withoutFile = await Asset.create<Asset>({
      user_id: "u1",
      project_id: "p1",
      name: "old",
      content_type: "image/png"
    });
    const elsewhere = await fileAsset({ project_id: "p9" });

    const moved = await reassignProjectDocuments("u1", "p1", "p2");

    expect(moved).toBe(2);
    expect(log).toEqual([`move ${withFile.id} to p2`, "commit"]);
    expect((await Asset.find("u1", withFile.id))!.workspace_path).toBe(
      "Generated/fox-2.png"
    );
    expect((await Asset.find("u1", withoutFile.id))!.project_id).toBe("p2");
    expect((await Asset.find("u1", elsewhere.id))!.project_id).toBe("p9");
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
