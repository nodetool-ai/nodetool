import { titleizeString } from "../titleizeString";

describe("titleizeString", () => {
  it("converts a simple string to title case", () => {
    expect(titleizeString("hello world")).toBe("Hello World");
  });

  it("handles single word", () => {
    expect(titleizeString("hello")).toBe("Hello");
  });

  it("handles empty string", () => {
    expect(titleizeString("")).toBe("");
  });

  it("handles already capitalized words", () => {
    expect(titleizeString("Hello World")).toBe("Hello World");
  });

  it("handles multiple spaces (collapsed to single space)", () => {
    expect(titleizeString("hello   world")).toBe("Hello World");
  });

  it("handles leading/trailing spaces (preserved)", () => {
    expect(titleizeString("  hello world  ")).toBe("  Hello World  ");
  });

  it("handles special characters (hyphens not treated as separators)", () => {
    expect(titleizeString("hello-world")).toBe("Hello-world");
  });

  it("handles numbers (not treated as separators)", () => {
    expect(titleizeString("hello123world")).toBe("Hello123world");
  });

  it("handles camelCase input by capitalizing first letter only", () => {
    expect(titleizeString("helloWorld")).toBe("Helloworld");
  });

  it("handles snake_case input by treating underscores as spaces", () => {
    expect(titleizeString("hello_world_test")).toBe("Hello World Test");
  });
});
