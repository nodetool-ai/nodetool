import {
  assetIdFromLocator,
  assetLocator,
  mediaRefFromAsset
} from "../mediaRef";

describe("mediaRefFromAsset", () => {
  it("writes asset:// and asset_id, not the HTTP fetch path", () => {
    const uploaded = {
      id: "87c6124bc9684facabb8cb3575dcb8ad",
      get_url: "/api/storage/1/87c6124bc9684facabb8cb3575dcb8ad.bin"
    };
    expect(mediaRefFromAsset(uploaded, "video")).toEqual({
      type: "video",
      uri: "asset://87c6124bc9684facabb8cb3575dcb8ad",
      asset_id: "87c6124bc9684facabb8cb3575dcb8ad"
    });
  });
});

describe("assetLocator", () => {
  it("is the asset:// form of the id", () => {
    expect(assetLocator("img-1")).toBe("asset://img-1");
  });
});

describe("assetIdFromLocator", () => {
  it("reads a bare id", () => {
    expect(assetIdFromLocator("asset://abc")).toBe("abc");
  });

  it("strips a file extension", () => {
    expect(assetIdFromLocator("asset://abc.mp4")).toBe("abc");
  });

  it("ignores a non-asset URI", () => {
    expect(assetIdFromLocator("/api/storage/1/abc.bin")).toBeUndefined();
    expect(assetIdFromLocator(undefined)).toBeUndefined();
  });
});
