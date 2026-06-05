import { extractAssetId } from "../outputAssetId";

describe("extractAssetId", () => {
  it("returns undefined for empty values", () => {
    expect(extractAssetId(undefined)).toBeUndefined();
    expect(extractAssetId(null)).toBeUndefined();
    expect(extractAssetId("")).toBeUndefined();
  });
  it("returns a plain string id", () => {
    expect(extractAssetId("asset-1")).toBe("asset-1");
  });
  it("reads asset_id then id from an object", () => {
    expect(extractAssetId({ uri: "x", asset_id: "a1" })).toBe("a1");
    expect(extractAssetId({ id: "i1" })).toBe("i1");
  });
  it("returns undefined for an object without an id", () => {
    expect(extractAssetId({ uri: "x" })).toBeUndefined();
  });
});
