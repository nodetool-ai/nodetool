/**
 * @jest-environment node
 */
import {
  formatCurvePoints,
  formatGradientStops,
  formatNumberList,
  formatTimecode,
  parseCurvePoints,
  parseGradientStops,
  parseNumberList,
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

describe("parseNumberList", () => {
  it("reads a comma- or space-separated list", () => {
    expect(parseNumberList("4, 2 1")).toEqual([4, 2, 1]);
  });

  it("reads empty as an empty list", () => {
    expect(parseNumberList("  ")).toEqual([]);
  });

  it("refuses a non-number", () => {
    expect(parseNumberList("4, wide")).toBeNull();
  });

  it("round-trips through formatNumberList", () => {
    expect(parseNumberList(formatNumberList([0.02, 0.01]))).toEqual([
      0.02, 0.01
    ]);
  });
});

describe("parseGradientStops", () => {
  it("reads offset:color pairs", () => {
    expect(parseGradientStops("0:#000000, 1:#ffffff")).toEqual([
      { offset: 0, color: "#000000" },
      { offset: 1, color: "#ffffff" }
    ]);
  });

  it("sorts by offset and clamps to 0..1", () => {
    expect(parseGradientStops("2:#fff, 0.5:#888")).toEqual([
      { offset: 0.5, color: "#888" },
      { offset: 1, color: "#fff" }
    ]);
  });

  it("refuses a stop with no colour", () => {
    expect(parseGradientStops("0:")).toBeNull();
  });

  it("round-trips through formatGradientStops", () => {
    const stops = [
      { offset: 0, color: "#000000" },
      { offset: 1, color: "#ffffff" }
    ];
    expect(parseGradientStops(formatGradientStops(stops))).toEqual(stops);
  });
});

describe("parseCurvePoints", () => {
  it("reads x,y pairs", () => {
    expect(parseCurvePoints("0,0 0.5,0.6 1,1")).toEqual([
      { x: 0, y: 0 },
      { x: 0.5, y: 0.6 },
      { x: 1, y: 1 }
    ]);
  });

  it("refuses a pair that is not x,y", () => {
    expect(parseCurvePoints("0,0 0.5")).toBeNull();
  });

  it("round-trips through formatCurvePoints", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 1, y: 1 }
    ];
    expect(parseCurvePoints(formatCurvePoints(points))).toEqual(points);
  });
});
