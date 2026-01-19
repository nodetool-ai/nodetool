import { truncateString } from "../truncateString";

describe("truncateString", () => {
  it("returns original string when length is less than max", () => {
    expect(truncateString("hello", 10)).toBe("hello");
  });

  it("truncates string when length equals max", () => {
    expect(truncateString("hello", 5)).toBe("hello");
  });

  it("truncates string with ellipsis when exceeding max", () => {
    expect(truncateString("hello world", 8)).toBe("hello w…");
  });

  it("handles empty string", () => {
    expect(truncateString("", 5)).toBe("");
  });

  it("handles max length of 0", () => {
    expect(truncateString("hello", 0)).toBe("hell…");
  });

  it("handles max length of 1", () => {
    expect(truncateString("hello", 1)).toBe("…");
  });

  it("handles string with special characters", () => {
    expect(truncateString("hello@world.com", 10)).toBe("hello@wor…");
  });

  it("handles string exactly one character over max", () => {
    expect(truncateString("ab", 1)).toBe("…");
  });
});
