import { extractTextValue } from "./extractTextValue";

describe("extractTextValue", () => {
  it("returns empty string for null and undefined", () => {
    expect(extractTextValue(null)).toBe("");
    expect(extractTextValue(undefined)).toBe("");
  });

  it("returns empty string for numbers and booleans", () => {
    expect(extractTextValue(42)).toBe("");
    expect(extractTextValue(true)).toBe("");
  });

  it("returns raw strings as-is", () => {
    expect(extractTextValue("hello world")).toBe("hello world");
    expect(extractTextValue("")).toBe("");
  });

  it("extracts .value from objects", () => {
    expect(extractTextValue({ value: "from value" })).toBe("from value");
  });

  it("extracts .text from objects", () => {
    expect(extractTextValue({ text: "from text" })).toBe("from text");
  });

  it("extracts .data from objects", () => {
    expect(extractTextValue({ data: "from data" })).toBe("from data");
  });

  it("extracts .content from objects", () => {
    expect(extractTextValue({ content: "from content" })).toBe("from content");
  });

  it("prefers .value over .text", () => {
    expect(extractTextValue({ value: "val", text: "txt" })).toBe("val");
  });

  it("recursively resolves .output", () => {
    expect(extractTextValue({ output: "direct" })).toBe("direct");
    expect(extractTextValue({ output: { text: "nested" } })).toBe("nested");
  });

  it("joins array items with newlines", () => {
    expect(extractTextValue(["line1", "line2", "line3"])).toBe(
      "line1\nline2\nline3"
    );
  });

  it("filters empty items from arrays", () => {
    expect(extractTextValue(["a", null, "", "b"])).toBe("a\nb");
  });

  it("recursively resolves objects inside arrays", () => {
    expect(extractTextValue([{ text: "one" }, { value: "two" }])).toBe(
      "one\ntwo"
    );
  });

  it("returns empty string for objects with no recognized keys", () => {
    expect(extractTextValue({ unknown: "nope" })).toBe("");
  });
});
