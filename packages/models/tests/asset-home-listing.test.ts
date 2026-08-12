/**
 * Regression: assets written server-side (chat media generation, the
 * generate-media RPC, workflow node outputs) carry a null `parent_id`.
 * `getFolderInfo` reports those as living in "Home", but the Home listing
 * matched `parent_id = <userId>` exactly — so a generated image existed, was
 * downloadable by id, and was invisible in the asset browser.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ModelObserver } from "../src/base-model.js";
import { initTestDb } from "../src/db.js";
import { Asset } from "../src/asset.js";

describe("Asset.paginate home folder", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  it("lists parentless assets in the user's home folder", async () => {
    const generated = await Asset.create<Asset>({
      user_id: "u1",
      name: "image_1",
      content_type: "image/png",
      parent_id: null
    });
    const uploaded = await Asset.create<Asset>({
      user_id: "u1",
      name: "upload.png",
      content_type: "image/png",
      parent_id: "u1"
    });

    const [items] = await Asset.paginate("u1", { parentId: "u1" });
    expect(items.map((a) => a.id).sort()).toEqual(
      [generated.id, uploaded.id].sort()
    );
  });

  it("keeps a nested folder's listing to its own children", async () => {
    await Asset.create<Asset>({
      user_id: "u1",
      name: "image_1",
      content_type: "image/png",
      parent_id: null
    });
    const nested = await Asset.create<Asset>({
      user_id: "u1",
      name: "in-folder.png",
      content_type: "image/png",
      parent_id: "folder-1"
    });

    const [items] = await Asset.paginate("u1", { parentId: "folder-1" });
    expect(items.map((a) => a.id)).toEqual([nested.id]);
  });

  it("still lists only parentless assets when asked for them explicitly", async () => {
    const orphan = await Asset.create<Asset>({
      user_id: "u1",
      name: "image_1",
      content_type: "image/png",
      parent_id: null
    });
    await Asset.create<Asset>({
      user_id: "u1",
      name: "upload.png",
      content_type: "image/png",
      parent_id: "u1"
    });

    const [items] = await Asset.paginate("u1", { parentId: null });
    expect(items.map((a) => a.id)).toEqual([orphan.id]);
  });

  it("does not leak another user's parentless assets into home", async () => {
    await Asset.create<Asset>({
      user_id: "u2",
      name: "theirs.png",
      content_type: "image/png",
      parent_id: null
    });

    const [items] = await Asset.paginate("u1", { parentId: "u1" });
    expect(items).toEqual([]);
  });
});
