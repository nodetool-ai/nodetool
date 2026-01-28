import { titleizeString } from "./titleizeString";

describe("titleizeString", () => {
  it("converts underscore separated string to title case", () => {
    expect(titleizeString("hello_world")).toBe("Hello World");
  });

  it("converts space separated string to title case", () => {
    expect(titleizeString("hello world")).toBe("Hello World");
  });

  it("converts multiple spaces/underscores to single space", () => {
    expect(titleizeString("hello   world")).toBe("Hello World");
    expect(titleizeString("hello___world")).toBe("Hello World");
  });

  it("converts mixed separators", () => {
    expect(titleizeString("hello_world test")).toBe("Hello World Test");
  });

  it("handles single word", () => {
    expect(titleizeString("hello")).toBe("Hello");
  });

  it("handles empty string", () => {
    expect(titleizeString("")).toBe("");
  });

  it("capitalizes first letter of each word", () => {
    expect(titleizeString("API")).toBe("Api");
    expect(titleizeString("JSON")).toBe("Json");
  });

  it("handles all lowercase", () => {
    expect(titleizeString("all lowercase")).toBe("All Lowercase");
  });

  it("handles mixed case input", () => {
    expect(titleizeString("hello WORLD")).toBe("Hello World");
  });
});
