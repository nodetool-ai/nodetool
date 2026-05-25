/**
 * @jest-environment node
 */
import { getAssetUrl } from "../assetHelpers";

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
