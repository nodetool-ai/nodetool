/**
 * @jest-environment node
 */
import { asImageRef } from "../imageRef";

describe("asImageRef", () => {
  it("returns undefined for null", () => {
    expect(asImageRef(null)).toBeUndefined();
  });

  it("returns undefined for undefined", () => {
    expect(asImageRef(undefined)).toBeUndefined();
  });

  it("returns undefined for non-object primitives", () => {
    expect(asImageRef(42)).toBeUndefined();
    expect(asImageRef("string")).toBeUndefined();
    expect(asImageRef(true)).toBeUndefined();
  });

  it("extracts uri, width, height from a valid object", () => {
    const result = asImageRef({ uri: "http://img.png", width: 100, height: 200 });
    expect(result).toEqual({ uri: "http://img.png", width: 100, height: 200, data: undefined });
  });

  it("returns undefined fields when types do not match", () => {
    const result = asImageRef({ uri: 123, width: "not a number", height: null });
    expect(result).toEqual({ uri: undefined, width: undefined, height: undefined, data: undefined });
  });

  it("passes through data field as-is", () => {
    const buf = new Uint8Array([1, 2, 3]);
    const result = asImageRef({ data: buf });
    expect(result?.data).toBe(buf);
  });

  it("handles empty object", () => {
    const result = asImageRef({});
    expect(result).toEqual({ uri: undefined, width: undefined, height: undefined, data: undefined });
  });
});

