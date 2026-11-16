import { describe, expect, it } from "vitest";
import { isRefDocumentKind, refsOf } from "../src/closure.js";

const A = "0123456789abcdef0123456789abcdef";
const B = "fedcba9876543210fedcba9876543210";
const C = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

describe("refsOf", () => {
  it("reads asset locators, storage URLs, id fields and id-keyed maps", () => {
    const timeline = {
      clips: [
        { id: "c1", sourceUri: `asset://${A}.mp4` },
        { id: "c2", thumbnail: `https://host/api/storage/${B}_thumb.jpg?x=1` }
      ],
      media: { durationsByAssetId: { [C]: 1200, "not-an-id": 3 } }
    };
    expect(refsOf("timeline", timeline)).toEqual([A, C, B].sort());
  });

  it("reads asset id fields of a workflow graph, single and listed", () => {
    const graph = {
      nodes: [
        { id: "n1", data: { image: { type: "image", asset_id: A } } },
        { id: "n2", data: { assetIds: [B, "short"] } },
        { id: "n3", data: { owner: `/api/storage/user/${C}.png` } }
      ],
      edges: []
    };
    expect(refsOf("workflow", graph)).toEqual([A, B, C].sort());
  });

  it("parses JSON text and returns each id once", () => {
    const text = JSON.stringify({ a: `asset://${A}`, b: `asset://${A}.png` });
    expect(refsOf("timeline", text)).toEqual([A]);
  });

  it("ignores a 32-character value under a field that names no asset", () => {
    expect(refsOf("workflow", { id: A, hash: B })).toEqual([]);
  });

  it("refuses a kind without a set function", () => {
    expect(isRefDocumentKind("storyboard")).toBe(false);
    expect(() => refsOf("storyboard" as never, {})).toThrow(
      "No reference set function for storyboard"
    );
  });
});
