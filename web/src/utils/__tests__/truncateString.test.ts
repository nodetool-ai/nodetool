/**
 * @jest-environment node
 */
import { truncateString } from "../truncateString";

describe("truncateString", () => {
  it("should not truncate strings shorter than max length", () => {
    expect(truncateString("hello", 10)).toBe("hello");
    expect(truncateString("short text", 50)).toBe("short text");
    expect(truncateString("", 10)).toBe("");
  });

  it("should truncate strings longer than max length with ellipsis", () => {
    expect(truncateString("this is a very long string", 10)).toBe("this is a…");
    expect(truncateString("abcdefghijklmnopqrstuvwxyz", 5)).toBe("abcd…");
  });

  it("should handle string exactly at max length", () => {
    expect(truncateString("exact", 5)).toBe("exact");
    expect(truncateString("ten chars.", 10)).toBe("ten chars.");
  });

  it("should use default max length of 50", () => {
    const longString = "a".repeat(60);
    const result = truncateString(longString);
    expect(result.length).toBe(50);
    expect(result).toBe("a".repeat(49) + "…");
  });

  it("should handle very small max lengths", () => {
    expect(truncateString("hello", 1)).toBe("…");
    expect(truncateString("hello", 2)).toBe("h…");
    expect(truncateString("hello", 3)).toBe("he…");
  });

  it("should handle unicode strings correctly", () => {
    expect(truncateString("こんにちは世界", 5)).toBe("こんにち…");
    // Emojis can take multiple characters, so adjust expectation
    expect(truncateString("👋🌍🎉🎊🎈", 3)).toBe("👋…");
  });

  it("should handle multi-word strings", () => {
    expect(truncateString("The quick brown fox jumps", 15)).toBe("The quick brow…");
  });

  it("should handle strings with special characters", () => {
    expect(truncateString("hello@world.com", 10)).toBe("hello@wor…");
    expect(truncateString("path/to/file.txt", 10)).toBe("path/to/f…");
  });

  it("should handle empty string with various max lengths", () => {
    expect(truncateString("", 10)).toBe("");
    expect(truncateString("", 100)).toBe("");
  });
});
