import { serializeValue } from "../serializeValue";

describe("serializeValue", () => {
  it("returns null for null value", () => {
    expect(serializeValue(null)).toBeNull();
  });

  it("returns null for undefined value", () => {
    expect(serializeValue(undefined)).toBeNull();
  });

  it("returns string as-is", () => {
    expect(serializeValue("hello")).toBe("hello");
  });

  it("returns string with spaces as-is", () => {
    expect(serializeValue("hello world")).toBe("hello world");
  });

  it("converts number to string", () => {
    expect(serializeValue(42)).toBe("42");
  });

  it("converts negative number to string", () => {
    expect(serializeValue(-3.14)).toBe("-3.14");
  });

  it("converts boolean true to string", () => {
    expect(serializeValue(true)).toBe("true");
  });

  it("converts boolean false to string", () => {
    expect(serializeValue(false)).toBe("false");
  });

  it("converts object to formatted JSON string", () => {
    const obj = { name: "test", value: 123 };
    expect(serializeValue(obj)).toBe('{\n  "name": "test",\n  "value": 123\n}');
  });

  it("converts array to JSON string", () => {
    const arr = [1, 2, 3];
    expect(serializeValue(arr)).toBe("[\n  1,\n  2,\n  3\n]");
  });

  it("returns null for circular reference", () => {
    const obj: { value?: unknown } = {};
    obj.value = obj;
    expect(serializeValue(obj)).toBeNull();
  });

  it("handles nested objects", () => {
    const obj = { outer: { inner: { deep: "value" } } };
    const result = serializeValue(obj);
    expect(result).toContain("deep");
    expect(result).toContain("value");
  });

  it("handles empty object", () => {
    expect(serializeValue({})).toBe("{}");
  });

  it("handles empty array", () => {
    expect(serializeValue([])).toBe("[]");
  });

  it("handles special characters in string", () => {
    const result = serializeValue('line1\nline2\ttab');
    // JSON.stringify preserves actual newline and tab characters in strings
    expect(result).toContain("line1");
    expect(result).toContain("line2");
    expect(result).toContain("tab");
    // Verify it's a string representation
    expect(typeof result).toBe("string");
  });

  it("handles unicode characters", () => {
    expect(serializeValue("Hello 世界 🌍")).toBe("Hello 世界 🌍");
  });
});
