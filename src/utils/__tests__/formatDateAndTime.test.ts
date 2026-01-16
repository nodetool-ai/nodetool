import { secondsToHMS, prettyDate, relativeTime, getTimestampForFilename } from "../formatDateAndTime";

describe("formatDateAndTime utilities", () => {
  describe("secondsToHMS", () => {
    it("converts zero seconds to HH:MM:SS", () => {
      expect(secondsToHMS(0)).toBe("00:00:00");
    });

    it("converts seconds only", () => {
      expect(secondsToHMS(45)).toBe("00:00:45");
    });

    it("converts minutes and seconds", () => {
      expect(secondsToHMS(125)).toBe("00:02:05");
    });

    it("converts hours, minutes, and seconds", () => {
      expect(secondsToHMS(3661)).toBe("01:01:01");
    });

    it("handles large values", () => {
      expect(secondsToHMS(90061)).toBe("25:01:01");
    });

    it("handles fractional seconds (floors)", () => {
      expect(secondsToHMS(30.7)).toBe("00:00:30");
    });
  });

  describe("prettyDate", () => {
    it("returns dash for undefined input", () => {
      expect(prettyDate(undefined)).toBe("-");
    });

    it("returns dash for empty string", () => {
      expect(prettyDate("")).toBe("-");
    });

    it("handles numeric timestamp (milliseconds)", () => {
      const timestamp = 1704067200000; // 2024-01-01 00:00:00 UTC
      const result = prettyDate(timestamp);
      expect(result).toContain("2024");
      expect(result).toContain("00:00:00");
    });

    it("handles ISO date string", () => {
      const result = prettyDate("2024-01-15T10:30:00");
      expect(result).toContain("2024");
      expect(result).toContain("01:30:00 PM"); // 12h format default
    });

    it("uses 24h format when specified", () => {
      const result = prettyDate("2024-01-15T10:30:00", "normal", { timeFormat: "24h" });
      expect(result).toContain("10:30:00"); // 24h format
    });

    it("uses verbose format", () => {
      const result = prettyDate("2024-01-15T10:30:00", "verbose", { timeFormat: "12h" });
      expect(result).toContain("January 15"); // verbose format
    });

    it("handles invalid date gracefully", () => {
      const result = prettyDate("not-a-date");
      expect(result).toBe("Invalid Date");
    });

    it("handles space-separated date (non-ISO)", () => {
      const result = prettyDate("2024-01-15 10:30:00");
      expect(result).toContain("2024");
    });
  });

  describe("relativeTime", () => {
    it("returns 'just now' for current time", () => {
      const now = new Date();
      const result = relativeTime(now);
      expect(result).toBe("just now");
    });

    it("returns seconds ago for recent times", () => {
      const past = new Date(Date.now() - 30000); // 30 seconds ago
      const result = relativeTime(past);
      expect(result).toBe("30 seconds ago");
    });

    it("returns minutes ago", () => {
      const past = new Date(Date.now() - 300000); // 5 minutes ago
      const result = relativeTime(past);
      expect(result).toBe("5 minutes ago");
    });

    it("returns singular minute", () => {
      const past = new Date(Date.now() - 60000); // 1 minute ago
      const result = relativeTime(past);
      expect(result).toBe("1 minute ago");
    });

    it("returns hours ago", () => {
      const past = new Date(Date.now() - 7200000); // 2 hours ago
      const result = relativeTime(past);
      expect(result).toBe("2 hours ago");
    });

    it("returns days ago", () => {
      const past = new Date(Date.now() - 172800000); // 2 days ago
      const result = relativeTime(past);
      expect(result).toBe("2 days ago");
    });

    it("returns weeks ago", () => {
      const past = new Date(Date.now() - 1209600000); // 2 weeks ago
      const result = relativeTime(past);
      expect(result).toBe("2 weeks ago");
    });

    it("returns months ago", () => {
      const past = new Date(Date.now() - 5184000000); // ~2 months ago
      const result = relativeTime(past);
      expect(result).toBe("2 months ago");
    });

    it("returns years ago", () => {
      const past = new Date(Date.now() - 63072000000); // ~2 years ago
      const result = relativeTime(past);
      expect(result).toBe("2 years ago");
    });
  });

  describe("getTimestampForFilename", () => {
    it("includes time by default", () => {
      const result = getTimestampForFilename();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/);
    });

    it("excludes time when specified", () => {
      const result = getTimestampForFilename(false);
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("returns valid date format with time", () => {
      const result = getTimestampForFilename(true);
      const parts = result.split("_");
      expect(parts[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(parts[1]).toMatch(/^\d{2}-\d{2}-\d{2}$/);
    });
  });
});
