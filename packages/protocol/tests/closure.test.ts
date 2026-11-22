import { describe, expect, it } from "vitest";
import { encodeSketchLayerData } from "../src/api-schemas/sketch.js";
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

  it("reads a storyboard's cast, takes and scene-clip references", () => {
    const board = {
      entityIds: [A],
      shots: [
        {
          id: "s1",
          keyframe: { type: "image", asset_id: B },
          clip_versions: [{ type: "video", uri: `asset://${C}.mp4` }]
        }
      ],
      sceneClips: [{ id: "k1", shot_ids: ["s1"], reference_entity_ids: [A] }]
    };
    expect(refsOf("storyboard", board)).toEqual([A, B, C].sort());
  });

  it("reads the image inside a sketch layer's envelope and the sketch thumbnail", () => {
    const bounds = { x: 0, y: 0, width: 4, height: 4 };
    const sketch = {
      document: {
        layers: [
          { id: "l1", data: encodeSketchLayerData(`asset://${A}.png`, bounds) },
          { id: "l2", data: encodeSketchLayerData("data:image/png;base64,AAAA", bounds) },
          { id: "l3", data: "ntlayer:not base64 json" }
        ]
      },
      thumbnail_asset_id: B
    };
    expect(refsOf("sketch", sketch)).toEqual([A, B].sort());
  });

  it("reads apps, scripts and JS scripts like any other document", () => {
    expect(refsOf("application", { widgets: [{ props: { src: `/api/storage/${A}.png` } }] })).toEqual([A]);
    expect(refsOf("script", { characters: [{ entityId: B }] })).toEqual([B]);
    expect(refsOf("jsscript", { source: "return 1", resources: [{ asset_id: C }] })).toEqual([C]);
  });

  it("refuses a kind without a set function", () => {
    expect(isRefDocumentKind("project")).toBe(false);
    expect(() => refsOf("project" as never, {})).toThrow(
      "No reference set function for project"
    );
  });
});
