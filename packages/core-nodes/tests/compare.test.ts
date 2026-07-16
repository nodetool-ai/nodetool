/**
 * Tests for compare.ts — CompareImagesNode.
 *
 * `score`/`equal` are a binary identity indicator ("same image?"), not a
 * perceptual similarity metric. These tests pin the four cases: inline bytes,
 * reference identity (uri / asset_id), the not-comparable mix, and two empty
 * (unwired) inputs.
 */

import { describe, it, expect } from "vitest";
import { CompareImagesNode, COMPARE_NODES } from "@nodetool-ai/core-nodes";

const bytes = (arr: number[]): Uint8Array => Uint8Array.from(arr);
const b64 = (arr: number[]): string => Buffer.from(arr).toString("base64");

describe("CompareImagesNode identity semantics", () => {
  it("two empty (unwired) inputs → equal true, score 1", async () => {
    const node = new CompareImagesNode({
      image_a: { type: "image", uri: "", asset_id: null, data: null },
      image_b: { type: "image", uri: "", asset_id: null, data: null }
    });
    const out = await node.process();
    expect(out.equal).toBe(true);
    expect(out.score).toBe(1);
  });

  it("different non-empty URIs → not equal, score 0 (no false equality)", async () => {
    const node = new CompareImagesNode({
      image_a: { type: "image", uri: "http://example.com/a.png" },
      image_b: { type: "image", uri: "http://example.com/b.png" }
    });
    const out = await node.process();
    expect(out.equal).toBe(false);
    expect(out.score).toBe(0);
  });

  it("identical non-empty URIs → equal, score 1", async () => {
    const node = new CompareImagesNode({
      image_a: { type: "image", uri: "http://example.com/same.png" },
      image_b: { type: "image", uri: "http://example.com/same.png" }
    });
    const out = await node.process();
    expect(out.equal).toBe(true);
    expect(out.score).toBe(1);
  });

  it("same asset_id → equal, different asset_id → not equal", async () => {
    const same = new CompareImagesNode({
      image_a: { type: "image", asset_id: "asset-1" },
      image_b: { type: "image", asset_id: "asset-1" }
    });
    expect((await same.process()).equal).toBe(true);

    const diff = new CompareImagesNode({
      image_a: { type: "image", asset_id: "asset-1" },
      image_b: { type: "image", asset_id: "asset-2" }
    });
    const out = await diff.process();
    expect(out.equal).toBe(false);
    expect(out.score).toBe(0);
  });

  it("identical inline bytes → equal, score 1", async () => {
    const node = new CompareImagesNode({
      image_a: { type: "image", data: b64([1, 2, 3, 4]) },
      image_b: { type: "image", data: b64([1, 2, 3, 4]) }
    });
    const out = await node.process();
    expect(out.equal).toBe(true);
    expect(out.score).toBe(1);
  });

  it("different inline bytes (same length) → not equal, score 0", async () => {
    const node = new CompareImagesNode({
      image_a: { type: "image", data: b64([1, 2, 3, 4]) },
      image_b: { type: "image", data: b64([1, 2, 9, 4]) }
    });
    const out = await node.process();
    expect(out.equal).toBe(false);
    expect(out.score).toBe(0);
  });

  it("inline bytes of different length → not equal", async () => {
    const node = new CompareImagesNode({
      image_a: { type: "image", data: bytes([1, 2, 3]) },
      image_b: { type: "image", data: bytes([1, 2, 3, 4]) }
    });
    expect((await node.process()).equal).toBe(false);
  });

  it("bytes vs a non-data URI → not comparable, equal false, score 0", async () => {
    const node = new CompareImagesNode({
      image_a: { type: "image", data: b64([1, 2, 3, 4]) },
      image_b: { type: "image", uri: "http://example.com/b.png" }
    });
    const out = await node.process();
    expect(out.equal).toBe(false);
    expect(out.score).toBe(0);
  });

  it("data: URI is treated as inline bytes and compared exactly", async () => {
    const payload = b64([10, 20, 30]);
    const node = new CompareImagesNode({
      image_a: { type: "image", uri: `data:image/png;base64,${payload}` },
      image_b: { type: "image", data: b64([10, 20, 30]) }
    });
    expect((await node.process()).equal).toBe(true);
  });

  it("still emits the comparison snapshot with labels", async () => {
    const node = new CompareImagesNode({
      image_a: { type: "image", uri: "u1" },
      image_b: { type: "image", uri: "u2" },
      label_a: "Before",
      label_b: "After"
    });
    const out = await node.process();
    const comparison = out.comparison as Record<string, unknown>;
    expect(comparison.type).toBe("image_comparison");
    expect(comparison.label_a).toBe("Before");
    expect(comparison.label_b).toBe("After");
  });
});

describe("COMPARE_NODES export", () => {
  it("includes CompareImagesNode", () => {
    expect(COMPARE_NODES.map((n) => n.nodeType)).toContain(
      "nodetool.compare.CompareImages"
    );
  });
});
