import {
  collectAndRewriteAssets,
  resolveAssetUrls
} from "../assetSubstitution";
import { CAST_ASSET_SCHEME } from "../castTypes";
import type { CastAsset, CastEvent } from "../castTypes";

function makeEvent(t: number, message: Record<string, unknown>): CastEvent {
  return { t, message: message as CastEvent["message"] };
}

describe("collectAndRewriteAssets", () => {
  it("rewrites asset:// URLs to cast-asset:// scheme", () => {
    const events = [
      makeEvent(0, { type: "output", uri: "asset://abc-123" })
    ];
    const result = collectAndRewriteAssets(events);
    expect(result.events[0].message.uri).toBe(`${CAST_ASSET_SCHEME}abc-123`);
    expect(result.assets).toHaveLength(1);
    expect(result.assets[0].key).toBe("abc-123");
    expect(result.assets[0].originalUri).toBe("asset://abc-123");
  });

  it("rewrites /api/storage/ URLs to cast-asset:// scheme", () => {
    const events = [
      makeEvent(0, {
        type: "output",
        uri: "http://localhost:7777/api/storage/img-456.png"
      })
    ];
    const result = collectAndRewriteAssets(events);
    expect(result.events[0].message.uri).toBe(
      `${CAST_ASSET_SCHEME}img-456.png`
    );
    expect(result.assets).toHaveLength(1);
    expect(result.assets[0].key).toBe("img-456.png");
  });

  it("deduplicates assets with the same key", () => {
    const events = [
      makeEvent(0, { type: "output", uri: "asset://same-id" }),
      makeEvent(100, { type: "output", uri: "asset://same-id" })
    ];
    const result = collectAndRewriteAssets(events);
    expect(result.assets).toHaveLength(1);
    expect(result.events[0].message.uri).toBe(`${CAST_ASSET_SCHEME}same-id`);
    expect(result.events[1].message.uri).toBe(`${CAST_ASSET_SCHEME}same-id`);
  });

  it("handles nested objects and arrays in event messages", () => {
    const events = [
      makeEvent(0, {
        type: "chunk",
        data: {
          images: ["asset://img-1", "asset://img-2"],
          nested: { url: "asset://img-3" }
        }
      })
    ];
    const result = collectAndRewriteAssets(events);
    const data = result.events[0].message.data as Record<string, unknown>;
    const images = data.images as string[];
    const nested = data.nested as Record<string, unknown>;
    expect(images[0]).toBe(`${CAST_ASSET_SCHEME}img-1`);
    expect(images[1]).toBe(`${CAST_ASSET_SCHEME}img-2`);
    expect(nested.url).toBe(`${CAST_ASSET_SCHEME}img-3`);
    expect(result.assets).toHaveLength(3);
  });

  it("uses contentTypeHint callback when provided", () => {
    const events = [
      makeEvent(0, { type: "output", uri: "asset://photo-1" })
    ];
    const hint = jest.fn().mockReturnValue("image/png");
    const result = collectAndRewriteAssets(events, hint);
    expect(hint).toHaveBeenCalledWith("asset://photo-1");
    expect(result.assets[0].contentType).toBe("image/png");
    expect(result.assets[0].file).toBe("photo-1.png");
  });

  it("defaults to application/octet-stream when no hint", () => {
    const events = [
      makeEvent(0, { type: "output", uri: "asset://unknown-file" })
    ];
    const result = collectAndRewriteAssets(events);
    expect(result.assets[0].contentType).toBe("application/octet-stream");
    expect(result.assets[0].file).toBe("unknown-file.bin");
  });

  it("passes through events with no asset URLs unchanged", () => {
    const events = [
      makeEvent(0, { type: "progress", percent: 50 }),
      makeEvent(100, { type: "complete", message: "done" })
    ];
    const result = collectAndRewriteAssets(events);
    expect(result.events[0].message).toEqual({
      type: "progress",
      percent: 50
    });
    expect(result.events[1].message).toEqual({
      type: "complete",
      message: "done"
    });
    expect(result.assets).toHaveLength(0);
  });

  it("preserves event timestamps", () => {
    const events = [
      makeEvent(0, { type: "output", uri: "asset://a" }),
      makeEvent(500, { type: "output", uri: "asset://b" })
    ];
    const result = collectAndRewriteAssets(events);
    expect(result.events[0].t).toBe(0);
    expect(result.events[1].t).toBe(500);
  });

  it("handles empty events array", () => {
    const result = collectAndRewriteAssets([]);
    expect(result.events).toHaveLength(0);
    expect(result.assets).toHaveLength(0);
  });

  it("maps common MIME types to correct extensions", () => {
    const mimes: Array<[string, string]> = [
      ["image/jpeg", "jpg"],
      ["image/webp", "webp"],
      ["image/gif", "gif"],
      ["audio/mpeg", "mp3"],
      ["audio/wav", "wav"],
      ["video/mp4", "mp4"],
      ["video/webm", "webm"],
      ["application/json", "json"]
    ];
    for (const [mime, ext] of mimes) {
      const events = [
        makeEvent(0, { type: "output", uri: `asset://${ext}-file` })
      ];
      const hint = jest.fn().mockReturnValue(mime);
      const result = collectAndRewriteAssets(events, hint);
      expect(result.assets[0].file).toBe(`${ext}-file.${ext}`);
    }
  });
});

describe("resolveAssetUrls", () => {
  it("replaces cast-asset://key with resolved URLs", () => {
    const assets: CastAsset[] = [
      {
        key: "img-1",
        file: "img-1.png",
        contentType: "image/png",
        originalUri: "asset://img-1"
      }
    ];
    const events = [
      makeEvent(0, { type: "output", uri: `${CAST_ASSET_SCHEME}img-1` })
    ];
    const resolve = (file: string) => `/static/assets/${file}`;
    const result = resolveAssetUrls(events, assets, resolve);
    expect(result[0].message.uri).toBe("/static/assets/img-1.png");
  });

  it("leaves unknown cast-asset:// keys untouched", () => {
    const assets: CastAsset[] = [];
    const events = [
      makeEvent(0, {
        type: "output",
        uri: `${CAST_ASSET_SCHEME}unknown-key`
      })
    ];
    const resolve = (file: string) => `/static/${file}`;
    const result = resolveAssetUrls(events, assets, resolve);
    expect(result[0].message.uri).toBe(`${CAST_ASSET_SCHEME}unknown-key`);
  });

  it("handles events with no cast-asset:// references", () => {
    const assets: CastAsset[] = [
      {
        key: "img-1",
        file: "img-1.png",
        contentType: "image/png"
      }
    ];
    const events = [
      makeEvent(0, { type: "progress", percent: 75 })
    ];
    const resolve = (file: string) => `/static/${file}`;
    const result = resolveAssetUrls(events, assets, resolve);
    expect(result[0].message).toEqual({ type: "progress", percent: 75 });
  });

  it("resolves multiple assets in nested structures", () => {
    const assets: CastAsset[] = [
      { key: "a", file: "a.png", contentType: "image/png" },
      { key: "b", file: "b.mp4", contentType: "video/mp4" }
    ];
    const events = [
      makeEvent(0, {
        type: "output",
        data: {
          image: `${CAST_ASSET_SCHEME}a`,
          video: `${CAST_ASSET_SCHEME}b`
        }
      })
    ];
    const resolve = (file: string) => `/cdn/${file}`;
    const result = resolveAssetUrls(events, assets, resolve);
    const data = result[0].message.data as Record<string, unknown>;
    expect(data.image).toBe("/cdn/a.png");
    expect(data.video).toBe("/cdn/b.mp4");
  });

  it("preserves event timestamps", () => {
    const events = [
      makeEvent(0, { type: "a" }),
      makeEvent(1000, { type: "b" })
    ];
    const result = resolveAssetUrls(events, [], (f) => f);
    expect(result[0].t).toBe(0);
    expect(result[1].t).toBe(1000);
  });

  it("handles empty events array", () => {
    const result = resolveAssetUrls([], [], (f) => f);
    expect(result).toHaveLength(0);
  });
});
