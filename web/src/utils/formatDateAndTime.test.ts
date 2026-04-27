import {
  secondsToHMS,
  prettyDate,
  relativeTime,
  getTimestampForFilename
} from "./formatDateAndTime";

describe("formatDateAndTime", () => {
  describe("secondsToHMS", () => {
    it("formats 0 seconds", () => {
      expect(secondsToHMS(0)).toBe("00:00:00");
    });

    it("formats seconds only", () => {
      expect(secondsToHMS(45)).toBe("00:00:45");
    });

    it("formats minutes and seconds", () => {
      expect(secondsToHMS(125)).toBe("00:02:05");
    });

    it("formats hours, minutes, and seconds", () => {
      expect(secondsToHMS(3661)).toBe("01:01:01");
    });

    it("handles large values", () => {
      expect(secondsToHMS(86400)).toBe("24:00:00");
    });

    it("truncates fractional seconds", () => {
      expect(secondsToHMS(1.9)).toBe("00:00:01");
    });
  });

  describe("prettyDate", () => {
    it("returns dash for undefined input", () => {
      expect(prettyDate(undefined)).toBe("-");
    });

    it("returns 'Invalid Date' for garbage input", () => {
      expect(prettyDate("not-a-date")).toBe("Invalid Date");
    });

    it("formats a valid ISO date in normal mode (12h)", () => {
      const result = prettyDate("2024-06-15T14:30:00");
      expect(result).toContain("2024");
      expect(result).toContain("06");
      expect(result).toContain("15");
    });

    it("formats a valid ISO date in normal mode (24h)", () => {
      const result = prettyDate("2024-06-15T14:30:00", "normal", { timeFormat: "24h" });
      expect(result).toContain("14:30:00");
    });

    it("handles numeric timestamp", () => {
      const ts = new Date("2024-06-15T14:30:00").getTime();
      const result = prettyDate(ts);
      expect(result).not.toBe("-");
      expect(result).not.toBe("Invalid Date");
    });

    it("handles date strings with space instead of T", () => {
      const result = prettyDate("2024-06-15 14:30:00");
      expect(result).not.toBe("Invalid Date");
    });

    it("formats verbose style (12h)", () => {
      const result = prettyDate("2024-06-15T14:30:00", "verbose");
      expect(result).toContain("|");
    });

    it("formats verbose style (24h)", () => {
      const result = prettyDate("2024-06-15T14:30:00", "verbose", { timeFormat: "24h" });
      expect(result).toContain("|");
      expect(result).toContain("14:30");
    });
  });

  describe("relativeTime", () => {
    it("returns 'just now' for the current time", () => {
      expect(relativeTime(new Date())).toBe("just now");
    });

    it("formats seconds ago", () => {
      const past = new Date(Date.now() - 30 * 1000);
      expect(relativeTime(past)).toBe("30 sec ago");
    });

    it("formats 1 second singular", () => {
      const past = new Date(Date.now() - 1000);
      expect(relativeTime(past)).toBe("1 sec ago");
    });

    it("formats minutes ago", () => {
      const past = new Date(Date.now() - 5 * 60 * 1000);
      expect(relativeTime(past)).toBe("5 min ago");
    });

    it("formats 1 minute singular", () => {
      const past = new Date(Date.now() - 60 * 1000);
      expect(relativeTime(past)).toBe("1 min ago");
    });

    it("formats hours ago", () => {
      const past = new Date(Date.now() - 3 * 3600 * 1000);
      expect(relativeTime(past)).toBe("3 hours ago");
    });

    it("formats 1 hour singular", () => {
      const past = new Date(Date.now() - 3600 * 1000);
      expect(relativeTime(past)).toBe("1 hour ago");
    });

    it("formats days ago", () => {
      const past = new Date(Date.now() - 2 * 86400 * 1000);
      expect(relativeTime(past)).toBe("2 days ago");
    });

    it("accepts a string date", () => {
      const past = new Date(Date.now() - 7 * 86400 * 1000).toISOString();
      expect(relativeTime(past)).toBe("1 week ago");
    });
  });

  describe("getTimestampForFilename", () => {
    it("returns date-time format by default", () => {
      const result = getTimestampForFilename();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/);
    });

    it("returns date-only when includeTime is false", () => {
      const result = getTimestampForFilename(false);
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});
