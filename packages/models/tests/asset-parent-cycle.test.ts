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

/**
 * The parent rule itself, moved here from the tRPC router when the sandbox's
 * `update_asset` capability grew a second caller for it. Testing it against a
 * real database, rather than through a mocked model behind a route, is what
 * makes it evidence about the rule instead of about the double.
 */
describe("Asset.validateParent", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  const folder = (name: string, parentId: string) =>
    Asset.create<Asset>({
      user_id: "u1",
      name,
      content_type: "folder",
      parent_id: parentId
    });

  it("accepts the synthetic Home folder and a real folder", async () => {
    const home = await folder("Home-child", "u1");
    const other = await folder("Other", "u1");
    expect(await Asset.validateParent("u1", home, "u1")).toBeNull();
    expect(await Asset.validateParent("u1", home, other.id)).toBeNull();
  });

  it("rejects an asset as its own parent", async () => {
    const a = await folder("A", "u1");
    expect(await Asset.validateParent("u1", a, a.id)).toContain(
      "its own parent"
    );
  });

  it("rejects a parent that does not exist", async () => {
    const a = await folder("A", "u1");
    expect(await Asset.validateParent("u1", a, "nope")).toContain(
      "not found"
    );
  });

  it("rejects a parent that is not a folder", async () => {
    const a = await folder("A", "u1");
    const file = await Asset.create<Asset>({
      user_id: "u1",
      name: "pic.png",
      content_type: "image/png",
      parent_id: "u1"
    });
    expect(await Asset.validateParent("u1", a, file.id)).toContain(
      "must be a folder"
    );
  });

  it("rejects moving a folder into its own descendant", async () => {
    const outer = await folder("outer", "u1");
    const inner = await folder("inner", outer.id);
    const deeper = await folder("deeper", inner.id);
    expect(await Asset.validateParent("u1", outer, deeper.id)).toContain(
      "descendants"
    );
  });

  it("rejects another user's folder as a parent", async () => {
    const mine = await folder("mine", "u1");
    const theirs = await Asset.create<Asset>({
      user_id: "u2",
      name: "theirs",
      content_type: "folder",
      parent_id: "u2"
    });
    // `find` is user-scoped, so someone else's folder is indistinguishable
    // from one that is not there — which is the answer a caller should get.
    expect(await Asset.validateParent("u1", mine, theirs.id)).toContain(
      "not found"
    );
  });

  it("terminates on a pre-existing cycle above the new parent", async () => {
    const a = await folder("A", "u1");
    const b = await folder("B", a.id);
    a.parent_id = b.id;
    await a.save();
    const loose = await folder("loose", "u1");
    // The walk breaks on the repeated id instead of spinning; `loose` is not
    // in the cycle, so nothing is refused.
    expect(await Asset.validateParent("u1", loose, b.id)).toBeNull();
  });
});
