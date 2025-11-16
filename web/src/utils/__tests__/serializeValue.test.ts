import { describe, expect, it } from "vitest";
import { serializeValue } from "../serializeValue";

describe("serializeValue", () => {
  it("returns null for nullish values", () => {
    expect(serializeValue(null)).toBeNull();
    expect(serializeValue(undefined)).toBeNull();
  });

  it("returns strings unchanged", () => {
    expect(serializeValue("hello")).toBe("hello");
  });

  it("serializes numbers and booleans", () => {
    expect(serializeValue(123)).toBe("123");
    expect(serializeValue(true)).toBe("true");
    expect(serializeValue(false)).toBe("false");
  });

  it("serializes arrays via JSON", () => {
    expect(serializeValue(["a", "b"])).toBe('[\n  "a",\n  "b"\n]');
  });

  it("serializes objects via JSON", () => {
    expect(serializeValue({ foo: "bar" })).toBe('{\n  "foo": "bar"\n}');
  });

  it("returns null when JSON.stringify throws", () => {
    const circular: any = {};
    circular.self = circular;
    expect(serializeValue(circular)).toBeNull();
  });
});

