/**
 * Regression: a cyclic `parent_id` chain used to hang the process.
 *
 * better-sqlite3 is synchronous, so the awaits inside these recursive walks
 * never yield to the macrotask queue — an unterminated descent starves the
 * event loop and wedges the whole server rather than merely overflowing the
 * stack or timing out one request.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ModelObserver } from "../src/base-model.js";
import { initTestDb } from "../src/db.js";
import { Asset } from "../src/asset.js";

describe("Asset recursion with cyclic parent links", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  it("getAssetPathInfo terminates on a two-folder cycle", async () => {
    const a = await Asset.create<Asset>({
      user_id: "u1",
      name: "A",
      content_type: "folder",
      parent_id: "u1"
    });
    const b = await Asset.create<Asset>({
      user_id: "u1",
      name: "B",
      content_type: "folder",
      parent_id: a.id
    });
    // Close the loop: A -> B -> A.
    a.parent_id = b.id;
    await a.save();

    const file = await Asset.create<Asset>({
      user_id: "u1",
      name: "trapped.txt",
      content_type: "text/plain",
      parent_id: b.id
    });

    const info = await Asset.getAssetPathInfo("u1", [file.id]);
    expect(info[file.id].folder_id).toBe(b.id);
    expect(info[file.id].folder_path).toContain("B");
  });

  it("getAssetPathInfo terminates on a self-parented folder", async () => {
    const f = await Asset.create<Asset>({
      user_id: "u1",
      name: "Loop",
      content_type: "folder",
      parent_id: "u1"
    });
    f.parent_id = f.id;
    await f.save();

    const file = await Asset.create<Asset>({
      user_id: "u1",
      name: "x.txt",
      content_type: "text/plain",
      parent_id: f.id
    });

    const info = await Asset.getAssetPathInfo("u1", [file.id]);
    expect(info[file.id].folder_name).toBe("Loop");
  });

  it("getAssetsRecursive terminates on a two-folder cycle", async () => {
    const a = await Asset.create<Asset>({
      user_id: "u1",
      name: "A",
      content_type: "folder",
      parent_id: "u1"
    });
    const b = await Asset.create<Asset>({
      user_id: "u1",
      name: "B",
      content_type: "folder",
      parent_id: a.id
    });
    a.parent_id = b.id;
    await a.save();

    const result = await Asset.getAssetsRecursive("u1", a.id);
    expect(result.assets).toHaveLength(1);
    const children = result.assets[0].children as Record<string, unknown>[];
    expect(children.map((c) => c.name)).toEqual(["B"]);
    // B's child is A, already visited — the descent stops instead of looping.
    const bChildren = children[0].children as Record<string, unknown>[];
    expect(bChildren.map((c) => c.name)).toEqual(["A"]);
    expect((bChildren[0].children as unknown[]) ?? []).toEqual([]);
  });
});
