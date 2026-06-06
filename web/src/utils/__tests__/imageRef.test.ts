/**
 * @jest-environment node
 */
import { asImageRef, unwrapOutput } from "../imageRef";

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

describe("unwrapOutput", () => {
  it("returns primitives as-is", () => {
    expect(unwrapOutput(42)).toBe(42);
    expect(unwrapOutput("hello")).toBe("hello");
    expect(unwrapOutput(true)).toBe(true);
  });

  it("returns null/undefined as-is", () => {
    expect(unwrapOutput(null)).toBeNull();
    expect(unwrapOutput(undefined)).toBeUndefined();
  });

  it("unwraps last element of array recursively", () => {
    expect(unwrapOutput([1, 2, 3])).toBe(3);
    expect(unwrapOutput([[10, 20]])).toBe(20);
  });

  it("returns undefined for empty array", () => {
    expect(unwrapOutput([])).toBeUndefined();
  });

  it("unwraps by handle name when provided", () => {
    expect(unwrapOutput({ image: "data:png", text: "hi" }, "image")).toBe("data:png");
  });

  it("unwraps 'output' key as fallback when no handle matches", () => {
    expect(unwrapOutput({ output: "result" })).toBe("result");
  });

  it("returns object as-is when neither handle nor 'output' key exists", () => {
    const obj = { foo: "bar" };
    expect(unwrapOutput(obj)).toBe(obj);
  });

  it("prefers handle over 'output' key", () => {
    expect(unwrapOutput({ output: "fallback", myHandle: "preferred" }, "myHandle")).toBe("preferred");
  });

  it("unwraps nested arrays then objects", () => {
    const value = [{ output: "deep" }];
    expect(unwrapOutput(value)).toBe("deep");
  });

  it("unwraps nested arrays with handle", () => {
    const value = [{ image: "img1" }, { image: "img2" }];
    expect(unwrapOutput(value, "image")).toBe("img2");
  });
});
