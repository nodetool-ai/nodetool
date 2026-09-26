/**
 * @jest-environment node
 */
import {
  getAssetMediaUrl,
  getAssetUrl,
  isAssetOffline
} from "../assetHelpers";

describe("getAssetUrl", () => {
  it("returns the get_url when present", () => {
    const asset = { get_url: "https://cdn.example.com/file.png" };
    expect(getAssetUrl(asset)).toBe("https://cdn.example.com/file.png");
  });

  it("returns null when get_url is missing", () => {
    const asset = { id: "abc", name: "photo.jpg" };
    expect(getAssetUrl(asset)).toBeNull();
  });

  it("returns null when get_url is null", () => {
    const asset = { get_url: null };
    expect(getAssetUrl(asset)).toBeNull();
  });

  it("returns null when get_url is undefined", () => {
    const asset = { get_url: undefined };
    expect(getAssetUrl(asset)).toBeNull();
  });

  it("returns null for null input", () => {
    expect(getAssetUrl(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(getAssetUrl(undefined)).toBeNull();
  });

  it("returns null for non-object input", () => {
    expect(getAssetUrl(42)).toBeNull();
    expect(getAssetUrl("string")).toBeNull();
  });

  it("returns empty string when get_url is empty", () => {
    const asset = { get_url: "" };
    expect(getAssetUrl(asset)).toBe("");
  });
});

describe("getAssetMediaUrl", () => {
  const external = {
    get_url: "/api/storage/u1/a1.mp4",
    offline: false,
    metadata: { external_size: 10, external_mtime: 1700000000123.75 }
  };

  it("adds the recorded mtime to an in-place asset's URL", () => {
    expect(getAssetMediaUrl(external)).toBe(
      "/api/storage/u1/a1.mp4?v=1700000000123"
    );
  });

  it("changes when a relink records a new mtime", () => {
    const relinked = {
      ...external,
      metadata: { external_size: 10, external_mtime: 1700000999000 }
    };
    expect(getAssetMediaUrl(relinked)).not.toBe(getAssetMediaUrl(external));
  });

  it("appends to a URL that already has a query", () => {
    expect(
      getAssetMediaUrl({ ...external, get_url: "http://h/x.mp4?token=1" })
    ).toBe("http://h/x.mp4?token=1&v=1700000000123");
  });

  it("returns get_url unchanged for a managed asset", () => {
    expect(
      getAssetMediaUrl({
        get_url: "/api/storage/u1/a2.png",
        metadata: { external_mtime: 5 }
      })
    ).toBe("/api/storage/u1/a2.png");
    expect(getAssetMediaUrl({ get_url: null, offline: false })).toBeNull();
  });
});

describe("isAssetOffline", () => {
  it("is true only when the server flagged the asset offline", () => {
    expect(isAssetOffline({ offline: true })).toBe(true);
    expect(isAssetOffline({ offline: false })).toBe(false);
    expect(isAssetOffline({ id: "a" })).toBe(false);
    expect(isAssetOffline(null)).toBe(false);
  });
});
