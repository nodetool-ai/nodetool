/**
 * @jest-environment node
 */
import { isMarkdownText } from "../editorUtils";

describe("isMarkdownText", () => {
  it("returns false for empty string", () => {
    expect(isMarkdownText("")).toBe(false);
  });

  it("returns false for plain text", () => {
    expect(isMarkdownText("Hello world, this is plain text.")).toBe(false);
  });

  it("detects headers", () => {
    expect(isMarkdownText("# Heading 1")).toBe(true);
    expect(isMarkdownText("## Heading 2")).toBe(true);
    expect(isMarkdownText("###### Heading 6")).toBe(true);
  });

  it("detects bold text", () => {
    expect(isMarkdownText("This is **bold** text")).toBe(true);
  });

  it("detects italic text", () => {
    expect(isMarkdownText("This is *italic* text")).toBe(true);
  });

  it("detects links", () => {
    expect(isMarkdownText("Click [here](https://example.com)")).toBe(true);
  });

  it("detects unordered lists", () => {
    expect(isMarkdownText("* Item one")).toBe(true);
    expect(isMarkdownText("- Item one")).toBe(true);
    expect(isMarkdownText("+ Item one")).toBe(true);
  });

  it("detects ordered lists", () => {
    expect(isMarkdownText("1. First item")).toBe(true);
    expect(isMarkdownText("42. Forty-second item")).toBe(true);
  });

  it("detects blockquotes", () => {
    expect(isMarkdownText("> This is a quote")).toBe(true);
  });

  it("detects code blocks", () => {
    expect(isMarkdownText("```\ncode here\n```")).toBe(true);
  });

  it("detects inline code", () => {
    expect(isMarkdownText("Use `console.log` for debugging")).toBe(true);
  });

  it("returns false for non-string input", () => {
    expect(isMarkdownText(null as unknown as string)).toBe(false);
    expect(isMarkdownText(undefined as unknown as string)).toBe(false);
  });
});
