import { asImageRef } from "./imageRef";

describe("asImageRef", () => {
  it("returns undefined for null", () => {
    expect(asImageRef(null)).toBeUndefined();
  });

  it("returns undefined for non-object values", () => {
    expect(asImageRef("string")).toBeUndefined();
    expect(asImageRef(42)).toBeUndefined();
    expect(asImageRef(undefined)).toBeUndefined();
  });

  it("extracts uri, width, height, and data from a valid object", () => {
    const ref = asImageRef({
      uri: "http://example.com/img.png",
      width: 100,
      height: 200,
      data: "blob"
    });
    expect(ref).toEqual({
      uri: "http://example.com/img.png",
      width: 100,
      height: 200,
      data: "blob"
    });
  });

  it("returns undefined fields for wrong types", () => {
    const ref = asImageRef({ uri: 123, width: "bad", height: null });
    expect(ref).toEqual({
      uri: undefined,
      width: undefined,
      height: undefined,
      data: undefined
    });
  });

  it("handles partial objects", () => {
    const ref = asImageRef({ uri: "test.png" });
    expect(ref).toEqual({
      uri: "test.png",
      width: undefined,
      height: undefined,
      data: undefined
    });
  });
});

