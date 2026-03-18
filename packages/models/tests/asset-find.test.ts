import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { setGlobalAdapterResolver, ModelObserver } from "../src/base-model.js";
import { MemoryAdapterFactory } from "../src/memory-adapter.js";
import { Asset } from "../src/asset.js";
import type { ModelClass } from "../src/base-model.js";

const factory = new MemoryAdapterFactory();

async function setup() {
  factory.clear();
  setGlobalAdapterResolver((schema) => factory.getAdapter(schema));
  await (Asset as unknown as ModelClass).createTable();
}

describe("Asset.find", () => {
  beforeEach(setup);
  afterEach(() => ModelObserver.clear());

  it("returns asset when user matches", async () => {
    const asset = await (Asset as unknown as ModelClass<Asset>).create({
      user_id: "u1",
      name: "test.jpg",
      content_type: "image/jpeg",
    });

    const found = await Asset.find("u1", asset.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(asset.id);
    expect(found!.name).toBe("test.jpg");
  });

  it("returns null when user does not match", async () => {
    const asset = await (Asset as unknown as ModelClass<Asset>).create({
      user_id: "u1",
      name: "test.jpg",
      content_type: "image/jpeg",
    });

    const found = await Asset.find("u2", asset.id);
    expect(found).toBeNull();
  });

  it("returns null for nonexistent asset id", async () => {
    const found = await Asset.find("u1", "nonexistent-id");
    expect(found).toBeNull();
  });
});

describe("Asset.paginate – additional filters", () => {
  beforeEach(setup);
  afterEach(() => ModelObserver.clear());

  it("filters by workflowId", async () => {
    await (Asset as unknown as ModelClass<Asset>).create({
      user_id: "u1",
      name: "a.txt",
      content_type: "text/plain",
      workflow_id: "wf1",
    });
    await (Asset as unknown as ModelClass<Asset>).create({
      user_id: "u1",
      name: "b.txt",
      content_type: "text/plain",
      workflow_id: "wf2",
    });

    const [results] = await Asset.paginate("u1", { workflowId: "wf1" });
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("a.txt");
  });

  it("filters by nodeId", async () => {
    await (Asset as unknown as ModelClass<Asset>).create({
      user_id: "u1",
      name: "a.txt",
      content_type: "text/plain",
      node_id: "n1",
    });
    await (Asset as unknown as ModelClass<Asset>).create({
      user_id: "u1",
      name: "b.txt",
      content_type: "text/plain",
      node_id: "n2",
    });

    const [results] = await Asset.paginate("u1", { nodeId: "n1" });
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("a.txt");
  });

  it("filters by jobId", async () => {
    await (Asset as unknown as ModelClass<Asset>).create({
      user_id: "u1",
      name: "a.txt",
      content_type: "text/plain",
      job_id: "j1",
    });
    await (Asset as unknown as ModelClass<Asset>).create({
      user_id: "u1",
      name: "b.txt",
      content_type: "text/plain",
      job_id: "j2",
    });

    const [results] = await Asset.paginate("u1", { jobId: "j1" });
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("a.txt");
  });
});

describe("Asset.searchAssetsGlobal", () => {
  beforeEach(setup);
  afterEach(() => ModelObserver.clear());

  it("searches by name substring", async () => {
    await (Asset as unknown as ModelClass<Asset>).create({
      user_id: "u1",
      name: "vacation-photo.jpg",
      content_type: "image/jpeg",
    });
    await (Asset as unknown as ModelClass<Asset>).create({
      user_id: "u1",
      name: "work-doc.pdf",
      content_type: "application/pdf",
    });
    await (Asset as unknown as ModelClass<Asset>).create({
      user_id: "u1",
      name: "photo-album.zip",
      content_type: "application/zip",
    });

    const [results, , paths] = await Asset.searchAssetsGlobal("u1", "photo");
    expect(results).toHaveLength(2);
    const names = results.map((a) => a.name).sort();
    expect(names).toEqual(["photo-album.zip", "vacation-photo.jpg"]);
    expect(paths).toHaveLength(2);
  });

  it("filters by contentType", async () => {
    await (Asset as unknown as ModelClass<Asset>).create({
      user_id: "u1",
      name: "photo.jpg",
      content_type: "image/jpeg",
    });
    await (Asset as unknown as ModelClass<Asset>).create({
      user_id: "u1",
      name: "photo.png",
      content_type: "image/png",
    });
    await (Asset as unknown as ModelClass<Asset>).create({
      user_id: "u1",
      name: "photo-notes.txt",
      content_type: "text/plain",
    });

    const [results] = await Asset.searchAssetsGlobal("u1", "photo", {
      contentType: "image",
    });
    expect(results).toHaveLength(2);
  });

  it("returns empty for no matches", async () => {
    await (Asset as unknown as ModelClass<Asset>).create({
      user_id: "u1",
      name: "doc.txt",
      content_type: "text/plain",
    });

    const [results] = await Asset.searchAssetsGlobal("u1", "nonexistent");
    expect(results).toHaveLength(0);
  });

  it("scoped to user", async () => {
    await (Asset as unknown as ModelClass<Asset>).create({
      user_id: "u1",
      name: "shared-file.txt",
      content_type: "text/plain",
    });
    await (Asset as unknown as ModelClass<Asset>).create({
      user_id: "u2",
      name: "shared-file.txt",
      content_type: "text/plain",
    });

    const [results] = await Asset.searchAssetsGlobal("u1", "shared");
    expect(results).toHaveLength(1);
    expect(results[0].user_id).toBe("u1");
  });
});

describe("Asset.getAssetPathInfo", () => {
  beforeEach(setup);
  afterEach(() => ModelObserver.clear());

  it("returns Home for root-level assets", async () => {
    const asset = await (Asset as unknown as ModelClass<Asset>).create({
      user_id: "u1",
      name: "root-file.txt",
      content_type: "text/plain",
      parent_id: "u1",
    });

    const info = await Asset.getAssetPathInfo("u1", [asset.id]);
    expect(info[asset.id]).toEqual({
      folder_name: "Home",
      folder_path: "Home",
      folder_id: "u1",
    });
  });

  it("returns folder path for nested assets", async () => {
    const folder = await (Asset as unknown as ModelClass<Asset>).create({
      user_id: "u1",
      name: "Photos",
      content_type: "folder",
      parent_id: "u1",
    });
    const file = await (Asset as unknown as ModelClass<Asset>).create({
      user_id: "u1",
      name: "sunset.jpg",
      content_type: "image/jpeg",
      parent_id: folder.id,
    });

    const info = await Asset.getAssetPathInfo("u1", [file.id]);
    expect(info[file.id].folder_name).toBe("Photos");
    expect(info[file.id].folder_path).toBe("Home / Photos");
    expect(info[file.id].folder_id).toBe(folder.id);
  });

  it("returns empty object for empty input", async () => {
    const info = await Asset.getAssetPathInfo("u1", []);
    expect(info).toEqual({});
  });

  it("handles deeply nested folders", async () => {
    const f1 = await (Asset as unknown as ModelClass<Asset>).create({
      user_id: "u1",
      name: "Level1",
      content_type: "folder",
      parent_id: "u1",
    });
    const f2 = await (Asset as unknown as ModelClass<Asset>).create({
      user_id: "u1",
      name: "Level2",
      content_type: "folder",
      parent_id: f1.id,
    });
    const file = await (Asset as unknown as ModelClass<Asset>).create({
      user_id: "u1",
      name: "deep.txt",
      content_type: "text/plain",
      parent_id: f2.id,
    });

    const info = await Asset.getAssetPathInfo("u1", [file.id]);
    expect(info[file.id].folder_path).toBe("Home / Level1 / Level2");
    expect(info[file.id].folder_name).toBe("Level2");
  });
});

describe("Asset.getAssetsRecursive", () => {
  beforeEach(setup);
  afterEach(() => ModelObserver.clear());

  it("returns empty assets for nonexistent folder", async () => {
    const result = await Asset.getAssetsRecursive("u1", "nonexistent");
    expect(result).toEqual({ assets: [] });
  });

  it("recursively fetches nested assets", async () => {
    const folder = await (Asset as unknown as ModelClass<Asset>).create({
      user_id: "u1",
      name: "Root Folder",
      content_type: "folder",
    });
    const subfolder = await (Asset as unknown as ModelClass<Asset>).create({
      user_id: "u1",
      name: "Sub Folder",
      content_type: "folder",
      parent_id: folder.id,
    });
    await (Asset as unknown as ModelClass<Asset>).create({
      user_id: "u1",
      name: "file1.txt",
      content_type: "text/plain",
      parent_id: folder.id,
    });
    await (Asset as unknown as ModelClass<Asset>).create({
      user_id: "u1",
      name: "file2.txt",
      content_type: "text/plain",
      parent_id: subfolder.id,
    });

    const result = await Asset.getAssetsRecursive("u1", folder.id);
    expect(result.assets).toHaveLength(1);
    const rootFolder = result.assets[0];
    expect(rootFolder.name).toBe("Root Folder");
    expect(Array.isArray(rootFolder.children)).toBe(true);
    const children = rootFolder.children as Record<string, unknown>[];
    expect(children).toHaveLength(2);

    const sub = children.find((c) => c.name === "Sub Folder");
    expect(sub).toBeDefined();
    expect(Array.isArray(sub!.children)).toBe(true);
    const subChildren = sub!.children as Record<string, unknown>[];
    expect(subChildren).toHaveLength(1);
    expect(subChildren[0].name).toBe("file2.txt");
  });
});
