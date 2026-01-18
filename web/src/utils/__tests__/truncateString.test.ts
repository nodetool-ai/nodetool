import { truncateString } from "../truncateString";

describe("truncateString", () => {
  it("returns original string when length is less than maxLength", () => {
    expect(truncateString("hello", 10)).toBe("hello");
  });

  it("returns original string when length equals maxLength", () => {
    expect(truncateString("hello", 5)).toBe("hello");
  });

  it("truncates string longer than maxLength", () => {
    expect(truncateString("hello world", 8)).toBe("hello w…");
  });

  it("truncates to single character", () => {
    expect(truncateString("hello", 1)).toBe("…");
  });

  it("truncates to two characters", () => {
    expect(truncateString("hello", 2)).toBe("h…");
  });

  it("uses default maxLength of 50", () => {
    const shortString = "short";
    expect(truncateString(shortString)).toBe(shortString);
  });

  it("truncates long string with default maxLength", () => {
    const longString = "a".repeat(100);
    expect(truncateString(longString)).toHaveLength(50);
    expect(truncateString(longString)).toBe("a".repeat(49) + "…");
  });

  it("handles empty string", () => {
    expect(truncateString("")).toBe("");
  });

  it("handles maxLength of 0", () => {
    expect(truncateString("hello", 0)).toBe("…");
  });

  it("handles maxLength of 1 with empty string", () => {
    expect(truncateString("", 1)).toBe("");
  });

  it("truncates string with special characters", () => {
    // "hello world 🌍" is 14 chars, truncating to 10 means 9 chars + ellipsis
    expect(truncateString("hello world 🌍", 10)).toBe("hello wor…");
  });

  it("truncates string with newlines", () => {
    // "line1\nline2\nline3" is 17 chars, truncating to 10 means 9 chars + ellipsis
    expect(truncateString("line1\nline2\nline3", 10)).toBe("line1\nlin…");
  });

  it("truncates string with HTML", () => {
    // "<div>content</div>" is 18 chars, truncating to 10 means 9 chars + ellipsis
    expect(truncateString("<div>content</div>", 10)).toBe("<div>cont…");
  });

  it("preserves leading and trailing spaces in truncated result", () => {
    // "  hello world  " is 15 chars, truncating to 12 means 11 chars + ellipsis
    expect(truncateString("  hello world  ", 12)).toBe("  hello wor…");
  });

  it("truncates unicode string correctly", () => {
    const unicode = "こんにちは";
    expect(truncateString(unicode, 3)).toBe("こん…");
  });
});
