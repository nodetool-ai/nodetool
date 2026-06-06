/**
 * @jest-environment node
 */
import {
  formatTimecode,
  parseTimecode,
  parseSeconds
} from "../InspectorPrimitives.helpers";

describe("formatTimecode", () => {
  it("formats 0ms as 00:00:00:00", () => {
    expect(formatTimecode(0, 30)).toBe("00:00:00:00");
  });

  it("formats 1 second at 30fps", () => {
    expect(formatTimecode(1000, 30)).toBe("00:00:01:00");
  });

  it("formats fractional frames", () => {
    // 500ms at 30fps = 15 frames
    expect(formatTimecode(500, 30)).toBe("00:00:00:15");
  });

  it("formats 1 minute", () => {
    expect(formatTimecode(60000, 24)).toBe("00:01:00:00");
  });

  it("formats 1 hour", () => {
    expect(formatTimecode(3600000, 24)).toBe("01:00:00:00");
  });

  it("formats complex time", () => {
    // 1h 30m 45s 12f at 24fps = 5445000ms + 12/24*1000 = 5445500ms
    expect(formatTimecode(5445500, 24)).toBe("01:30:45:12");
  });

  it("handles negative ms as 00:00:00:00", () => {
    expect(formatTimecode(-100, 30)).toBe("00:00:00:00");
  });

  it("handles fractional fps by rounding", () => {
    // 29.97fps → 30fps
    expect(formatTimecode(1000, 29.97)).toBe("00:00:01:00");
  });

  it("handles 0 fps by using 1", () => {
    expect(formatTimecode(1000, 0)).toBe("00:00:01:00");
  });
});

describe("parseTimecode", () => {
  it("parses HH:MM:SS:FF at 30fps", () => {
    expect(parseTimecode("00:00:01:00", 30)).toBe(1000);
  });

  it("parses HH:MM:SS:FF at 24fps", () => {
    expect(parseTimecode("01:30:45:12", 24)).toBe(5445500);
  });

  it("parses M:SS", () => {
    // 1:30 = 90 seconds = 90000ms
    expect(parseTimecode("1:30", 30)).toBe(90000);
  });

  it("parses plain number as ms", () => {
    expect(parseTimecode("5000", 30)).toBe(5000);
  });

  it("parses floating-point number as ms (rounded)", () => {
    expect(parseTimecode("1500.7", 24)).toBe(1501);
  });

  it("returns null for empty string", () => {
    expect(parseTimecode("", 30)).toBeNull();
  });

  it("returns null for whitespace", () => {
    expect(parseTimecode("   ", 30)).toBeNull();
  });

  it("returns null for non-numeric input", () => {
    expect(parseTimecode("abc", 30)).toBeNull();
  });

  it("returns null for negative plain number", () => {
    expect(parseTimecode("-100", 30)).toBeNull();
  });

  it("parses single number as seconds", () => {
    // "30" with no colons = 30ms (plain number)
    expect(parseTimecode("30", 24)).toBe(30);
  });

  it("parses HH:MM:SS", () => {
    expect(parseTimecode("01:00:00", 24)).toBe(3600000);
  });

  it("returns null for too many colons", () => {
    expect(parseTimecode("1:2:3:4:5", 30)).toBeNull();
  });

  it("returns null for non-digit colon parts", () => {
    expect(parseTimecode("1:ab:3", 30)).toBeNull();
  });
});

describe("parseSeconds", () => {
  it("parses '4.6s' as 4600ms", () => {
    expect(parseSeconds("4.6s")).toBe(4600);
  });

  it("parses '4.6S' case-insensitive", () => {
    expect(parseSeconds("4.6S")).toBe(4600);
  });

  it("parses plain number without suffix", () => {
    expect(parseSeconds("2.5")).toBe(2500);
  });

  it("trims whitespace", () => {
    expect(parseSeconds("  3.0s  ")).toBe(3000);
  });

  it("returns null for empty string", () => {
    expect(parseSeconds("")).toBeNull();
  });

  it("returns null for whitespace-only", () => {
    expect(parseSeconds("   ")).toBeNull();
  });

  it("returns null for negative number", () => {
    expect(parseSeconds("-1s")).toBeNull();
  });

  it("returns null for non-numeric", () => {
    expect(parseSeconds("abc")).toBeNull();
  });

  it("rounds to nearest millisecond", () => {
    expect(parseSeconds("1.5005")).toBe(1501);
  });
});
