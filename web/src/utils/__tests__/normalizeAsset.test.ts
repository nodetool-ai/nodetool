/**
 * @jest-environment node
 */
import { normalizeAssetUrls, normalizeAssetList } from "../normalizeAsset";

jest.mock("../../stores/BASE_URL", () => ({
  withApiBase: (url: string | null | undefined) => {
    if (!url) return url;
    if (typeof url !== "string") return url;
    if (!url.startsWith("/")) return url;
    return `http://localhost:7777${url}`;
  }
}));

describe("normalizeAsset", () => {
  describe("normalizeAssetUrls", () => {
    it("prefixes relative get_url with base URL", () => {
      const asset = { get_url: "/api/storage/file.png", thumb_url: null };
      const result = normalizeAssetUrls(asset);
      expect(result.get_url).toBe("http://localhost:7777/api/storage/file.png");
    });

    it("prefixes relative thumb_url with base URL", () => {
      const asset = { get_url: null, thumb_url: "/api/storage/thumb.png" };
      const result = normalizeAssetUrls(asset);
      expect(result.thumb_url).toBe(
        "http://localhost:7777/api/storage/thumb.png"
      );
    });

    it("leaves absolute URLs unchanged", () => {
      const asset = {
        get_url: "https://cdn.example.com/file.png",
        thumb_url: "https://cdn.example.com/thumb.png"
      };
      const result = normalizeAssetUrls(asset);
      expect(result.get_url).toBe("https://cdn.example.com/file.png");
      expect(result.thumb_url).toBe("https://cdn.example.com/thumb.png");
    });

    it("handles null URLs gracefully", () => {
      const asset = { get_url: null, thumb_url: null };
      const result = normalizeAssetUrls(asset);
      expect(result.get_url).toBeNull();
      expect(result.thumb_url).toBeNull();
    });

    it("handles undefined URLs gracefully", () => {
      const asset = { get_url: undefined, thumb_url: undefined };
      const result = normalizeAssetUrls(asset);
      expect(result.get_url).toBeUndefined();
      expect(result.thumb_url).toBeUndefined();
    });

    it("preserves additional properties on the asset", () => {
      const asset = {
        id: "asset-123",
        name: "test.png",
        get_url: "/api/storage/file.png",
        thumb_url: "/api/storage/thumb.png"
      };
      const result = normalizeAssetUrls(asset);
      expect(result.id).toBe("asset-123");
      expect(result.name).toBe("test.png");
    });

    it("returns falsy input unchanged", () => {
      const result = normalizeAssetUrls(null as unknown as { get_url: null; thumb_url: null });
      expect(result).toBeNull();
    });
  });

  describe("normalizeAssetList", () => {
    it("normalizes URLs for all assets in a list", () => {
      const assets = [
        { get_url: "/api/storage/a.png", thumb_url: "/api/storage/a_thumb.png" },
        { get_url: "/api/storage/b.png", thumb_url: null }
      ];
      const result = normalizeAssetList(assets);
      expect(result[0].get_url).toBe(
        "http://localhost:7777/api/storage/a.png"
      );
      expect(result[0].thumb_url).toBe(
        "http://localhost:7777/api/storage/a_thumb.png"
      );
      expect(result[1].get_url).toBe(
        "http://localhost:7777/api/storage/b.png"
      );
      expect(result[1].thumb_url).toBeNull();
    });

    it("returns empty array for empty input", () => {
      const result = normalizeAssetList([]);
      expect(result).toEqual([]);
    });
  });
});
