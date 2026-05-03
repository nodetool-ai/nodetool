import { Asset } from "../ApiTypes";
import {
  assetToResultValue,
  groupWorkflowAssetsByNodeResult
} from "../workflowResultHydration";

const baseAsset = (overrides: Partial<Asset>): Asset => ({
  id: "asset-1",
  user_id: "user-1",
  workflow_id: "wf-1",
  parent_id: "user-1",
  name: "file.bin",
  content_type: "application/octet-stream",
  metadata: null,
  created_at: "2026-01-01T00:00:00Z",
  get_url: null,
  thumb_url: null,
  ...overrides
});

describe("assetToResultValue edge cases", () => {
  describe("audio assets", () => {
    it("maps audio/mpeg to audio type", () => {
      const result = assetToResultValue(
        baseAsset({
          id: "aud-1",
          name: "track.mp3",
          content_type: "audio/mpeg"
        })
      );

      expect(result).toEqual({
        type: "audio",
        uri: "asset://aud-1.mp3",
        asset_id: "aud-1",
        metadata: undefined
      });
    });

    it("maps audio/wav to audio type", () => {
      const result = assetToResultValue(
        baseAsset({
          id: "aud-2",
          name: "sample.wav",
          content_type: "audio/wav"
        })
      );

      expect(result).toEqual({
        type: "audio",
        uri: "asset://aud-2.wav",
        asset_id: "aud-2",
        metadata: undefined
      });
    });

    it("maps audio/ogg to audio type", () => {
      const result = assetToResultValue(
        baseAsset({
          id: "aud-3",
          name: "clip.ogg",
          content_type: "audio/ogg"
        })
      );

      expect(result).toEqual({
        type: "audio",
        uri: "asset://aud-3.ogg",
        asset_id: "aud-3",
        metadata: undefined
      });
    });
  });

  describe("3D model assets", () => {
    it("maps model/gltf-binary to model_3d type with glb format", () => {
      const result = assetToResultValue(
        baseAsset({
          id: "model-1",
          name: "scene.glb",
          content_type: "model/gltf-binary"
        })
      );

      expect(result).toEqual({
        type: "model_3d",
        uri: "asset://model-1.glb",
        asset_id: "model-1",
        metadata: undefined,
        format: "glb"
      });
    });

    it("maps model/gltf+json to model_3d type with gltf format", () => {
      const result = assetToResultValue(
        baseAsset({
          id: "model-2",
          name: "scene.gltf",
          content_type: "model/gltf+json"
        })
      );

      expect(result).toEqual({
        type: "model_3d",
        uri: "asset://model-2.gltf",
        asset_id: "model-2",
        metadata: undefined,
        format: "gltf"
      });
    });
  });

  describe("document assets", () => {
    it("maps application/pdf to document type", () => {
      const result = assetToResultValue(
        baseAsset({
          id: "doc-1",
          name: "report.pdf",
          content_type: "application/pdf"
        })
      );

      expect(result).toEqual({
        type: "document",
        uri: "asset://doc-1.pdf",
        asset_id: "doc-1",
        metadata: undefined
      });
    });

    it("maps text/plain to document type", () => {
      const result = assetToResultValue(
        baseAsset({
          id: "doc-2",
          name: "notes.txt",
          content_type: "text/plain"
        })
      );

      expect(result).toEqual({
        type: "document",
        uri: "asset://doc-2.txt",
        asset_id: "doc-2",
        metadata: undefined
      });
    });

    it("maps text/csv to document type", () => {
      const result = assetToResultValue(
        baseAsset({
          id: "doc-3",
          name: "data.csv",
          content_type: "text/csv"
        })
      );

      expect(result).toEqual({
        type: "document",
        uri: "asset://doc-3.csv",
        asset_id: "doc-3",
        metadata: undefined
      });
    });
  });

  describe("unknown content types fallback to asset", () => {
    it("maps application/octet-stream to asset type", () => {
      const result = assetToResultValue(
        baseAsset({
          id: "unknown-1",
          name: "data.bin",
          content_type: "application/octet-stream"
        })
      );

      expect(result).toEqual({
        type: "asset",
        uri: "asset://unknown-1.bin",
        asset_id: "unknown-1",
        metadata: undefined
      });
    });

    it("maps application/json to asset type", () => {
      const result = assetToResultValue(
        baseAsset({
          id: "unknown-2",
          name: "config.json",
          content_type: "application/json"
        })
      );

      expect(result).toEqual({
        type: "asset",
        uri: "asset://unknown-2.json",
        asset_id: "unknown-2",
        metadata: undefined
      });
    });
  });

  describe("MIME type normalization with charset", () => {
    it("strips charset from content_type before matching", () => {
      const result = assetToResultValue(
        baseAsset({
          id: "html-2",
          name: "page.html",
          content_type: "text/html; charset=utf-8"
        })
      );

      expect(result).toEqual({
        type: "html",
        uri: "asset://html-2.html",
        asset_id: "html-2",
        metadata: undefined
      });
    });

    it("handles uppercase content_type", () => {
      const result = assetToResultValue(
        baseAsset({
          id: "img-up",
          name: "photo.PNG",
          content_type: "Image/PNG"
        })
      );

      expect(result).toEqual({
        type: "image",
        uri: "asset://img-up.png",
        asset_id: "img-up",
        metadata: undefined
      });
    });
  });

  describe("extension extraction from file name", () => {
    it("falls back to MIME extension map when name has no extension", () => {
      const result = assetToResultValue(
        baseAsset({
          id: "noext-1",
          name: "screenshot",
          content_type: "image/png"
        })
      );

      expect(result.uri).toBe("asset://noext-1.png");
    });

    it("uses empty extension when MIME is unknown and name has no extension", () => {
      const result = assetToResultValue(
        baseAsset({
          id: "noext-2",
          name: "mystery",
          content_type: "application/x-custom"
        })
      );

      expect(result.uri).toBe("asset://noext-2");
    });

    it("uses file name extension over MIME map when valid", () => {
      const result = assetToResultValue(
        baseAsset({
          id: "ext-1",
          name: "photo.jpeg",
          content_type: "image/jpeg"
        })
      );

      expect(result.uri).toBe("asset://ext-1.jpeg");
    });

    it("falls back to MIME map when file extension has invalid characters", () => {
      const result = assetToResultValue(
        baseAsset({
          id: "badext-1",
          name: "file.a b",
          content_type: "image/png"
        })
      );

      expect(result.uri).toBe("asset://badext-1.png");
    });
  });

  describe("metadata propagation", () => {
    it("passes metadata through when present", () => {
      const result = assetToResultValue(
        baseAsset({
          id: "meta-1",
          name: "image.png",
          content_type: "image/png",
          metadata: { width: 1920, height: 1080 }
        })
      );

      expect(result.metadata).toEqual({ width: 1920, height: 1080 });
    });

    it("sets metadata to undefined when null", () => {
      const result = assetToResultValue(
        baseAsset({
          id: "meta-2",
          name: "image.png",
          content_type: "image/png",
          metadata: null
        })
      );

      expect(result.metadata).toBeUndefined();
    });
  });

  describe("video duration handling", () => {
    it("sets duration to undefined when not provided", () => {
      const result = assetToResultValue(
        baseAsset({
          id: "vid-2",
          name: "clip.mp4",
          content_type: "video/mp4"
        })
      );

      expect(result.duration).toBeUndefined();
    });
  });

  describe("model_3d format when extension is empty", () => {
    it("sets format to undefined when no extension is available", () => {
      const result = assetToResultValue(
        baseAsset({
          id: "model-3",
          name: "untitled",
          content_type: "model/obj"
        })
      );

      expect(result).toMatchObject({
        type: "model_3d",
        format: undefined
      });
    });
  });
});

describe("groupWorkflowAssetsByNodeResult edge cases", () => {
  it("returns empty object for empty array", () => {
    const grouped = groupWorkflowAssetsByNodeResult([]);
    expect(grouped).toEqual({});
  });

  it("filters out all assets without node_id", () => {
    const grouped = groupWorkflowAssetsByNodeResult([
      baseAsset({ id: "a1", node_id: null, name: "x.png", content_type: "image/png" }),
      baseAsset({ id: "a2", node_id: undefined as unknown as null, name: "y.png", content_type: "image/png" })
    ]);

    expect(grouped).toEqual({});
  });

  it("breaks ties by id when created_at is identical", () => {
    const grouped = groupWorkflowAssetsByNodeResult([
      baseAsset({
        id: "b-second",
        node_id: "node-1",
        name: "b.png",
        content_type: "image/png",
        created_at: "2026-01-01T00:00:00Z"
      }),
      baseAsset({
        id: "a-first",
        node_id: "node-1",
        name: "a.png",
        content_type: "image/png",
        created_at: "2026-01-01T00:00:00Z"
      })
    ]);

    const nodeResults = grouped["node-1"] as Array<Record<string, unknown>>;
    expect(nodeResults[0]).toMatchObject({ asset_id: "a-first" });
    expect(nodeResults[1]).toMatchObject({ asset_id: "b-second" });
  });

  it("separates assets into correct node groups", () => {
    const grouped = groupWorkflowAssetsByNodeResult([
      baseAsset({
        id: "x1",
        node_id: "node-a",
        name: "x.png",
        content_type: "image/png",
        created_at: "2026-01-01T00:00:01Z"
      }),
      baseAsset({
        id: "x2",
        node_id: "node-b",
        name: "y.mp3",
        content_type: "audio/mpeg",
        created_at: "2026-01-01T00:00:02Z"
      }),
      baseAsset({
        id: "x3",
        node_id: "node-a",
        name: "z.png",
        content_type: "image/png",
        created_at: "2026-01-01T00:00:03Z"
      })
    ]);

    expect(Object.keys(grouped).sort()).toEqual(["node-a", "node-b"]);
    expect(grouped["node-a"]).toHaveLength(2);
    expect(grouped["node-b"]).toHaveLength(1);
  });
});
