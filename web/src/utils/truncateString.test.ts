import { truncateString } from "./truncateString";

describe("truncateString", () => {
  it("returns string unchanged when within limit", () => {
    expect(truncateString("Hello", 10)).toBe("Hello");
  });

  it("returns string unchanged when exactly at limit", () => {
    expect(truncateString("12345", 5)).toBe("12345");
  });

  it("truncates and adds ellipsis when exceeding limit", () => {
    expect(truncateString("Hello world", 5)).toBe("Hell…");
  });

  it("uses default maxLength of 50", () => {
    const short = "a".repeat(50);
    expect(truncateString(short)).toBe(short);

    const long = "a".repeat(51);
    expect(truncateString(long)).toBe("a".repeat(49) + "…");
  });

  it("handles empty string", () => {
    expect(truncateString("", 5)).toBe("");
  });

  it("handles maxLength of 1", () => {
    expect(truncateString("ab", 1)).toBe("…");
  });
});
