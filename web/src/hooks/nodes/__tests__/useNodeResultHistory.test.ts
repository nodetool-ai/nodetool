/**
 * @jest-environment node
 */
import {
  assetToOutputValue,
  assetsToPreviewValue,
  nodeAssetsQueryKey
} from "../useNodeResultHistory";

const makeAsset = (overrides: Record<string, unknown> = {}) =>
  ({
    id: "asset-1",
    name: "test-asset.png",
    content_type: "image/png",
    get_url: "https://example.com/asset.png",
    thumb_url: "https://example.com/thumb.png",
    ...overrides
  }) as never;

describe("nodeAssetsQueryKey", () => {
  it("returns a tuple with the node id", () => {
    expect(nodeAssetsQueryKey("node-42")).toEqual([
      "assets",
      { node_id: "node-42" }
    ]);
  });

  it("returns null node_id when passed null", () => {
    expect(nodeAssetsQueryKey(null)).toEqual(["assets", { node_id: null }]);
  });
});

describe("assetToOutputValue", () => {
  it("returns image type for image content types", () => {
    const result = assetToOutputValue(makeAsset({ content_type: "image/png" }));
    expect(result).toEqual({
      type: "image",
      uri: "https://example.com/asset.png"
    });
  });

  it("returns video type for video content types", () => {
    const result = assetToOutputValue(
      makeAsset({
        content_type: "video/mp4",
        get_url: "https://example.com/video.mp4"
      })
    );
    expect(result).toEqual({
      type: "video",
      uri: "https://example.com/video.mp4"
    });
  });

  it("returns audio type for audio content types", () => {
    const result = assetToOutputValue(
      makeAsset({
        content_type: "audio/wav",
        get_url: "https://example.com/audio.wav"
      })
    );
    expect(result).toEqual({
      type: "audio",
      uri: "https://example.com/audio.wav"
    });
  });

  it("returns model_3d type for model content types", () => {
    const result = assetToOutputValue(
      makeAsset({
        content_type: "model/gltf-binary",
        name: "scene.glb",
        get_url: "https://example.com/scene.glb"
      })
    );
    expect(result).toEqual({
      type: "model_3d",
      uri: "https://example.com/scene.glb",
      name: "scene.glb"
    });
  });

  it("detects .glb files by name when content type is generic", () => {
    const result = assetToOutputValue(
      makeAsset({
        content_type: "application/octet-stream",
        name: "model.glb",
        get_url: "https://example.com/model.glb"
      })
    );
    expect(result).toEqual({
      type: "model_3d",
      uri: "https://example.com/model.glb",
      name: "model.glb"
    });
  });

  it("falls back to asset type for unknown content types", () => {
    const result = assetToOutputValue(
      makeAsset({
        content_type: "application/pdf",
        name: "doc.pdf",
        get_url: "https://example.com/doc.pdf"
      })
    );
    expect(result).toEqual({
      type: "asset",
      uri: "https://example.com/doc.pdf",
      name: "doc.pdf"
    });
  });

  it("falls back to thumb_url when get_url is nullish", () => {
    const result = assetToOutputValue(
      makeAsset({
        content_type: "image/jpeg",
        get_url: null,
        thumb_url: "https://example.com/thumb.jpg"
      })
    );
    expect(result).toEqual({
      type: "image",
      uri: "https://example.com/thumb.jpg"
    });
  });

  it("handles missing content_type gracefully", () => {
    const result = assetToOutputValue(
      makeAsset({
        content_type: undefined,
        name: "unknown-file",
        get_url: "https://example.com/file"
      })
    );
    expect(result).toEqual({
      type: "asset",
      uri: "https://example.com/file",
      name: "unknown-file"
    });
  });
});

describe("assetsToPreviewValue", () => {
  it("returns undefined for empty array", () => {
    expect(assetsToPreviewValue([])).toBeUndefined();
  });

  it("returns a single value (not array) for one asset", () => {
    const result = assetsToPreviewValue([makeAsset()]);
    expect(result).toEqual({
      type: "image",
      uri: "https://example.com/asset.png"
    });
    expect(Array.isArray(result)).toBe(false);
  });

  it("returns an array for multiple assets", () => {
    const assets = [
      makeAsset({
        id: "a1",
        content_type: "image/png",
        get_url: "https://example.com/1.png"
      }),
      makeAsset({
        id: "a2",
        content_type: "audio/mp3",
        get_url: "https://example.com/2.mp3"
      })
    ];
    const result = assetsToPreviewValue(assets);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
  });
});
