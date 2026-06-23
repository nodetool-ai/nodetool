import { describe, it, expect } from "vitest";
import { AssetCollectionNode } from "@nodetool-ai/core-nodes";

const drain = async (gen: AsyncGenerator<Record<string, unknown>>) => {
  const out: Record<string, unknown>[] = [];
  for await (const part of gen) out.push(part);
  return out;
};

describe("AssetCollectionNode", () => {
  it("streams each item with its index", async () => {
    const node = new AssetCollectionNode();
    node.assign({
      items: [
        { type: "image", uri: "a" },
        { type: "image", uri: "b" },
        { type: "image", uri: "c" }
      ]
    });
    await expect(drain(node.genProcess())).resolves.toEqual([
      { output: { type: "image", uri: "a" }, index: 0 },
      { output: { type: "image", uri: "b" }, index: 1 },
      { output: { type: "image", uri: "c" }, index: 2 }
    ]);
  });

  it("emits nothing for an empty collection", async () => {
    const node = new AssetCollectionNode();
    node.assign({ items: [] });
    await expect(drain(node.genProcess())).resolves.toEqual([]);
  });

  it("emits nothing when items is unset", async () => {
    const node = new AssetCollectionNode();
    await expect(drain(node.genProcess())).resolves.toEqual([]);
  });

  it("wraps a non-array items value into a single emission", async () => {
    const node = new AssetCollectionNode();
    node.assign({ items: { type: "image", uri: "solo" } });
    await expect(drain(node.genProcess())).resolves.toEqual([
      { output: { type: "image", uri: "solo" }, index: 0 }
    ]);
  });

  it("declares iteration correlation for the streamed handles", () => {
    expect(AssetCollectionNode.outputCorrelation.output.kind).toBe("iteration");
    expect(AssetCollectionNode.outputCorrelation.index.kind).toBe("iteration");
    expect(AssetCollectionNode.outputCorrelation.output.group).toBe(
      AssetCollectionNode.outputCorrelation.index.group
    );
  });
});
