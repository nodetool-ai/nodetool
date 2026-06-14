import { typeFor } from "../types";

describe("typeFor", () => {
  it("returns 'null' for null and undefined", () => {
    expect(typeFor(null)).toBe("null");
    expect(typeFor(undefined)).toBe("null");
  });

  it("returns 'string' for strings", () => {
    expect(typeFor("hello")).toBe("string");
    expect(typeFor("")).toBe("string");
  });

  it("returns 'number' for numbers", () => {
    expect(typeFor(42)).toBe("number");
    expect(typeFor(0)).toBe("number");
    expect(typeFor(NaN)).toBe("number");
  });

  it("returns 'boolean' for booleans", () => {
    expect(typeFor(true)).toBe("boolean");
    expect(typeFor(false)).toBe("boolean");
  });

  it("returns 'array' for arrays", () => {
    expect(typeFor([])).toBe("array");
    expect(typeFor([1, 2, 3])).toBe("array");
  });

  it("returns the .type property for typed objects", () => {
    expect(typeFor({ type: "image", uri: "test.png" })).toBe("image");
    expect(typeFor({ type: "video", data: [] })).toBe("video");
    expect(typeFor({ type: "audio" })).toBe("audio");
  });

  it("returns 'object' for plain objects without type", () => {
    expect(typeFor({})).toBe("object");
    expect(typeFor({ key: "value" })).toBe("object");
  });
});
