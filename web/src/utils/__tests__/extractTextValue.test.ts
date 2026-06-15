import { extractTextValue } from "../extractTextValue";

describe("extractTextValue", () => {
  it("returns the string directly for string values", () => {
    expect(extractTextValue("hello")).toBe("hello");
    expect(extractTextValue("")).toBe("");
  });

  it("returns empty string for null and undefined", () => {
    expect(extractTextValue(null)).toBe("");
    expect(extractTextValue(undefined)).toBe("");
  });

  it("returns empty string for numbers and booleans", () => {
    expect(extractTextValue(42)).toBe("");
    expect(extractTextValue(true)).toBe("");
  });

  it("extracts .value from objects", () => {
    expect(extractTextValue({ value: "from value" })).toBe("from value");
  });

  it("extracts .text from objects", () => {
    expect(extractTextValue({ type: "text", text: "from text" })).toBe(
      "from text"
    );
  });

  it("extracts .data from objects", () => {
    expect(extractTextValue({ data: "from data" })).toBe("from data");
  });

  it("extracts .content from objects", () => {
    expect(extractTextValue({ content: "from content" })).toBe("from content");
  });

  it("prioritizes .value over other fields", () => {
    expect(
      extractTextValue({ value: "val", text: "txt", data: "dat" })
    ).toBe("val");
  });

  it("recurses through .output wrapper", () => {
    expect(extractTextValue({ output: "nested" })).toBe("nested");
    expect(extractTextValue({ output: { value: "deep" } })).toBe("deep");
  });

  it("joins array items with newlines", () => {
    expect(extractTextValue(["line1", "line2"])).toBe("line1\nline2");
  });

  it("filters empty items from arrays", () => {
    expect(extractTextValue(["a", null, "", "b"])).toBe("a\nb");
  });

  it("recursively extracts from array of objects", () => {
    expect(
      extractTextValue([{ value: "first" }, { text: "second" }])
    ).toBe("first\nsecond");
  });

  it("handles nested output in arrays", () => {
    expect(
      extractTextValue([{ output: "chunk1" }, { output: "chunk2" }])
    ).toBe("chunk1\nchunk2");
  });

  it("returns empty string for objects without known keys", () => {
    expect(extractTextValue({ unknown: "field" })).toBe("");
  });

  it("returns empty string for an empty object", () => {
    expect(extractTextValue({})).toBe("");
  });
});
