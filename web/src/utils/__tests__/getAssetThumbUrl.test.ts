import { getAssetThumbUrl } from "../getAssetThumbUrl";

describe("getAssetThumbUrl", () => {
  it("returns fallback URL when asset has no data", () => {
    const asset = { id: "test-id", type: "text" } as any;
    const result = getAssetThumbUrl(asset, "/images/placeholder.png");
    expect(result).toBe("/images/placeholder.png");
  });

  it("returns fallback URL when asset type is not image", () => {
    const asset = { id: "test-id", type: "text", data: "some data" } as any;
    const result = getAssetThumbUrl(asset, "/images/placeholder.png");
    expect(result).toBe("/images/placeholder.png");
  });

  it("returns fallback URL when asset data is null", () => {
    const asset = { id: "test-id", type: "image", data: null } as any;
    const result = getAssetThumbUrl(asset, "/images/placeholder.png");
    expect(result).toBe("/images/placeholder.png");
  });

  it("returns fallback URL for invalid data type", () => {
    const asset = { id: "test-id", type: "image", data: 12345 } as any;
    const result = getAssetThumbUrl(asset, "/images/placeholder.png");
    expect(result).toBe("/images/placeholder.png");
  });

  it("uses default fallback when none provided", () => {
    const asset = { id: "test-id", type: "text" } as any;
    const result = getAssetThumbUrl(asset);
    expect(result).toBe("/images/placeholder.png");
  });

  it("handles empty asset ref", () => {
    const asset = {} as any;
    const result = getAssetThumbUrl(asset, "/images/placeholder.png");
    expect(result).toBe("/images/placeholder.png");
  });
});
