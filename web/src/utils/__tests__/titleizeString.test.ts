import { titleizeString } from "../titleizeString";

describe("titleizeString", () => {
  it("converts snake_case to Title Case", () => {
    expect(titleizeString("hello_world")).toBe("Hello World");
  });

  it("converts spaces to Title Case", () => {
    expect(titleizeString("hello world")).toBe("Hello World");
  });

  it("handles single word", () => {
    expect(titleizeString("hello")).toBe("Hello");
  });

  it("handles empty string", () => {
    expect(titleizeString("")).toBe("");
  });

  it("preserves original casing of first letters", () => {
    expect(titleizeString("HELLO_WORLD")).toBe("Hello World");
  });

  it("handles multiple consecutive spaces", () => {
    expect(titleizeString("hello   world")).toBe("Hello World");
  });

  it("handles multiple consecutive underscores", () => {
    expect(titleizeString("hello___world")).toBe("Hello World");
  });

  it("handles single leading space", () => {
    expect(titleizeString(" hello")).toBe(" Hello");
  });

  it("handles mixed underscores and spaces", () => {
    expect(titleizeString("hello_world test")).toBe("Hello World Test");
  });
});
