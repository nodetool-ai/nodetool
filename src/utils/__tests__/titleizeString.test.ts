import { titleizeString } from "../titleizeString";

describe("titleizeString", () => {
  it("titleizes simple lowercase string", () => {
    expect(titleizeString("hello world")).toBe("Hello World");
  });

  it("handles single word", () => {
    expect(titleizeString("hello")).toBe("Hello");
  });

  it("handles underscore-separated words", () => {
    expect(titleizeString("hello_world_test")).toBe("Hello World Test");
  });

  it("handles mixed separators", () => {
    expect(titleizeString("hello_world test")).toBe("Hello World Test");
  });

  it("handles already capitalized words", () => {
    expect(titleizeString("Hello World")).toBe("Hello World");
  });

  it("handles multiple spaces", () => {
    expect(titleizeString("hello   world")).toBe("Hello World");
  });

  it("handles empty string", () => {
    expect(titleizeString("")).toBe("");
  });

  it("handles only spaces", () => {
    expect(titleizeString("   ")).toBe("");
  });

  it("handles camelCase", () => {
    expect(titleizeString("helloWorld")).toBe("Helloworld");
  });

  it("handles kebab-case", () => {
    expect(titleizeString("hello-world")).toBe("Hello World");
  });
});
