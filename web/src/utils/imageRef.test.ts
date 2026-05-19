import { asImageRef, unwrapOutput } from "./imageRef";

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

describe("unwrapOutput", () => {
  it("returns primitives unchanged", () => {
    expect(unwrapOutput("hello")).toBe("hello");
    expect(unwrapOutput(42)).toBe(42);
    expect(unwrapOutput(null)).toBeNull();
    expect(unwrapOutput(undefined)).toBeUndefined();
  });

  it("unwraps the last element of an array", () => {
    expect(unwrapOutput(["a", "b", "c"])).toBe("c");
  });

  it("returns undefined for an empty array", () => {
    expect(unwrapOutput([])).toBeUndefined();
  });

  it("recursively unwraps nested arrays", () => {
    expect(unwrapOutput([["nested", "deep"]])).toBe("deep");
  });

  it("extracts a named handle from an object", () => {
    expect(unwrapOutput({ image: "data", text: "hi" }, "image")).toBe("data");
  });

  it("extracts 'output' key when no handle is specified", () => {
    expect(unwrapOutput({ output: "result" })).toBe("result");
  });

  it("prefers named handle over 'output'", () => {
    expect(unwrapOutput({ output: "fallback", custom: "val" }, "custom")).toBe(
      "val"
    );
  });

  it("returns the object when no matching handle and no 'output' key", () => {
    const obj = { foo: "bar" };
    expect(unwrapOutput(obj)).toBe(obj);
  });

  it("unwraps array then extracts handle", () => {
    expect(unwrapOutput([{ image: "last" }], "image")).toBe("last");
  });
});
