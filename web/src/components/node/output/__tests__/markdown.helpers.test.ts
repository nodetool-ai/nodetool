/**
 * @jest-environment node
 */
import { isLikelyMarkdown } from "../markdown.helpers";

describe("isLikelyMarkdown", () => {
  it("returns false for empty or very short strings", () => {
    expect(isLikelyMarkdown("")).toBe(false);
    expect(isLikelyMarkdown("hello")).toBe(false);
    expect(isLikelyMarkdown("ab")).toBe(false);
  });

  it("detects headings", () => {
    expect(isLikelyMarkdown("# Heading one")).toBe(true);
    expect(isLikelyMarkdown("## Sub heading")).toBe(true);
    expect(isLikelyMarkdown("###### H6 heading")).toBe(true);
  });

  it("detects fenced code blocks", () => {
    expect(isLikelyMarkdown("some text\n```js\nconsole.log();\n```")).toBe(
      true
    );
    expect(isLikelyMarkdown("```\ncode here\n```")).toBe(true);
  });

  it("detects unordered lists", () => {
    expect(isLikelyMarkdown("- item one\n- item two")).toBe(true);
    expect(isLikelyMarkdown("* item one")).toBe(true);
    expect(isLikelyMarkdown("+ item one")).toBe(true);
  });

  it("detects ordered lists", () => {
    expect(isLikelyMarkdown("1. First item\n2. Second item")).toBe(true);
  });

  it("detects inline links", () => {
    expect(isLikelyMarkdown("Check [this link](https://example.com)")).toBe(
      true
    );
  });

  it("detects image references", () => {
    expect(isLikelyMarkdown("![alt text](image.png)")).toBe(true);
  });

  it("detects blockquotes", () => {
    expect(isLikelyMarkdown("> This is a quote")).toBe(true);
  });

  it("detects tables", () => {
    expect(isLikelyMarkdown("| col1 | col2 |\n|------|------|")).toBe(true);
  });

  it("detects inline code", () => {
    expect(isLikelyMarkdown("Use the `console.log` function")).toBe(true);
  });

  it("detects horizontal rules", () => {
    expect(isLikelyMarkdown("text\n---\nmore text")).toBe(true);
    expect(isLikelyMarkdown("text\n***\nmore text")).toBe(true);
  });

  it("detects bold and italic", () => {
    expect(isLikelyMarkdown("This is **bold** text")).toBe(true);
    expect(isLikelyMarkdown("This is __bold__ text")).toBe(true);
    expect(isLikelyMarkdown("This is *italic* text")).toBe(true);
    expect(isLikelyMarkdown("This is _italic_ text")).toBe(true);
  });

  it("returns false for plain text", () => {
    expect(isLikelyMarkdown("Just a normal sentence without any markup")).toBe(
      false
    );
    expect(isLikelyMarkdown("Another plain text paragraph here")).toBe(false);
  });
});
