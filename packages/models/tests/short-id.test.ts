/**
 * `DBModel.get` resolves a 12-char short id (`resource-id.ts` in protocol) by
 * prefix, and only then: the exact key still wins, an ambiguous prefix is an
 * error, and a key that is not the short form never reaches the prefix query.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { shortResourceId } from "@nodetool-ai/protocol";
import { ModelObserver } from "../src/base-model.js";
import { initTestDb } from "../src/db.js";
import { Asset } from "../src/asset.js";
import { Workflow } from "../src/workflow.js";

describe("DBModel.get with a short resource id", () => {
  beforeEach(() => {
    initTestDb();
  });
  afterEach(() => ModelObserver.clear());

  it("resolves the 12-char prefix to the one row it names", async () => {
    const asset = await Asset.create<Asset>({
      user_id: "u1",
      name: "hero.png",
      content_type: "image/png"
    });
    const short = shortResourceId(asset.id);
    expect(short).toHaveLength(12);
    const found = await Asset.find("u1", short);
    expect(found?.id).toBe(asset.id);
    expect(await Asset.find("u2", short)).toBeNull();
  });

  it("refuses a prefix that matches more than one row", async () => {
    const shared = "0123456789ab";
    await Asset.create<Asset>({
      id: `${shared}cdef0123456789abcdef`,
      user_id: "u1",
      name: "a.png",
      content_type: "image/png"
    });
    await Asset.create<Asset>({
      id: `${shared}fedcba9876543210fedc`,
      user_id: "u1",
      name: "b.png",
      content_type: "image/png"
    });
    await expect(Asset.get<Asset>(shared)).rejects.toThrow(
      /matches more than one row/
    );
  });

  it("does not prefix-match a key that is not the short form", async () => {
    const wf = await Workflow.create<Workflow>({
      user_id: "u1",
      name: "wf",
      graph: { nodes: [], edges: [] }
    });
    // 11 and 13 chars, and uppercase: none is a short id.
    expect(await Workflow.get<Workflow>(wf.id.slice(0, 11))).toBeNull();
    expect(await Workflow.get<Workflow>(wf.id.slice(0, 13))).toBeNull();
    expect(
      await Workflow.get<Workflow>(wf.id.slice(0, 12).toUpperCase())
    ).toBeNull();
    expect(await Workflow.get<Workflow>("nonexistent-id")).toBeNull();
  });
});
