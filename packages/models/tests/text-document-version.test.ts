import { beforeEach, describe, expect, it } from "vitest";
import { initTestDb } from "../src/db.js";
import { Asset } from "../src/asset.js";
import { TextDocumentVersion } from "../src/text-document-version.js";

const makeAsset = async () =>
  Asset.create<Asset>({
    user_id: "u1",
    name: "notes.md",
    content_type: "text/markdown",
    parent_id: null
  });

describe("TextDocumentVersion", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("numbers versions per document, newest first", async () => {
    const asset = await makeAsset();
    await TextDocumentVersion.snapshot({ assetId: asset.id, userId: "u1", content: "a", saveType: "manual" });
    await TextDocumentVersion.snapshot({ assetId: asset.id, userId: "u1", content: "b", saveType: "autosave" });
    const listed = await TextDocumentVersion.listForAsset(asset.id);
    expect(listed.map((v) => [v.version, v.content])).toEqual([[2, "b"], [1, "a"]]);
    expect(listed[0].content_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("keeps one version per cause: the state before its first write", async () => {
    const asset = await makeAsset();
    const first = await TextDocumentVersion.snapshot({
      assetId: asset.id, userId: "u1", content: "before turn", saveType: "agent_turn", causeId: "turn-1"
    });
    const second = await TextDocumentVersion.snapshot({
      assetId: asset.id, userId: "u1", content: "after first edit", saveType: "agent_turn", causeId: "turn-1"
    });
    expect(second.id).toBe(first.id);
    expect(second.content).toBe("before turn");
    expect(await TextDocumentVersion.listForAsset(asset.id)).toHaveLength(1);
  });

  it("prunes only interval checkpoints", async () => {
    const asset = await makeAsset();
    await TextDocumentVersion.snapshot({ assetId: asset.id, userId: "u1", content: "m", saveType: "manual" });
    for (const content of ["1", "2", "3"]) {
      await TextDocumentVersion.snapshot({ assetId: asset.id, userId: "u1", content, saveType: "autosave" });
    }
    await TextDocumentVersion.pruneAutosaves(asset.id, 1);
    const kept = await TextDocumentVersion.listForAsset(asset.id);
    expect(kept.map((v) => v.content)).toEqual(["3", "m"]);
  });
});
