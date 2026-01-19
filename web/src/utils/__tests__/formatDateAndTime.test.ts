import {
  secondsToHMS,
  prettyDate,
  relativeTime,
  getTimestampForFilename
} from "../formatDateAndTime";

describe("formatDateAndTime", () => {
  describe("secondsToHMS", () => {
    it("converts 0 seconds to 00:00:00", () => {
      expect(secondsToHMS(0)).toBe("00:00:00");
    });

    it("converts seconds correctly", () => {
      expect(secondsToHMS(30)).toBe("00:00:30");
      expect(secondsToHMS(59)).toBe("00:00:59");
    });

    it("converts minutes correctly", () => {
      expect(secondsToHMS(60)).toBe("00:01:00");
      expect(secondsToHMS(90)).toBe("00:01:30");
      expect(secondsToHMS(3599)).toBe("00:59:59");
    });

    it("converts hours correctly", () => {
      expect(secondsToHMS(3600)).toBe("01:00:00");
      expect(secondsToHMS(3661)).toBe("01:01:01");
      expect(secondsToHMS(86399)).toBe("23:59:59");
    });

    it("converts large values correctly", () => {
      expect(secondsToHMS(86400)).toBe("24:00:00");
      expect(secondsToHMS(90061)).toBe("25:01:01");
    });

    it("handles negative values", () => {
      expect(secondsToHMS(-1)).toBe("-1:-1:-1");
    });
  });

  describe("prettyDate", () => {
    it("returns '-' for undefined input", () => {
      expect(prettyDate(undefined)).toBe("-");
    });

    it("handles ISO date strings", () => {
      const result = prettyDate("2026-01-15T10:30:00");
      expect(result).toContain("2026-01-15");
      expect(result).toContain("10:30");
    });

    it("handles ISO date strings with space", () => {
      const result = prettyDate("2026-01-15 10:30:00");
      expect(result).toContain("2026-01-15");
    });

    it("handles numeric timestamps", () => {
      const timestamp = 1702744200000;
      const result = prettyDate(timestamp);
      expect(result).toContain("2023");
    });

    it("returns 'Invalid Date' for invalid date strings", () => {
      const result = prettyDate("not-a-date");
      expect(result).toBe("Invalid Date");
    });

    it("uses 12h format by default", () => {
      const result = prettyDate("2026-01-15T10:30:00");
      expect(result).toMatch(/\d{4}-\d{2}-\d{2} \| \d{2}:\d{2}:\d{2} [AP]M/);
    });

    it("uses 24h format when specified", () => {
      const result = prettyDate("2026-01-15T10:30:00", "normal", { timeFormat: "24h" });
      expect(result).toMatch(/\d{2}\.\d{2}\.\d{4} \| \d{2}:\d{2}:\d{2}/);
    });

    it("uses verbose format", () => {
      const result = prettyDate("2026-01-15T10:30:00", "verbose");
      expect(result).toContain("|");
    });

    it("uses verbose format with 24h setting", () => {
      const result = prettyDate("2026-01-15T10:30:00", "verbose", { timeFormat: "24h" });
      expect(result).toContain("|");
    });
  });

  describe("relativeTime", () => {
    it("returns 'just now' for recent times", () => {
      const now = new Date();
      const result = relativeTime(now);
      expect(result).toBe("just now");
    });

    it("returns seconds ago", () => {
      const past = new Date(Date.now() - 30 * 1000);
      const result = relativeTime(past);
      expect(result).toBe("30 sec ago");
    });

    it("returns singular second", () => {
      const past = new Date(Date.now() - 1 * 1000);
      const result = relativeTime(past);
      expect(result).toBe("1 sec ago");
    });

    it("returns minutes ago", () => {
      const past = new Date(Date.now() - 5 * 60 * 1000);
      const result = relativeTime(past);
      expect(result).toBe("5 min ago");
    });

    it("returns singular minute", () => {
      const past = new Date(Date.now() - 1 * 60 * 1000);
      const result = relativeTime(past);
      expect(result).toBe("1 min ago");
    });

    it("returns hours ago", () => {
      const past = new Date(Date.now() - 3 * 60 * 60 * 1000);
      const result = relativeTime(past);
      expect(result).toBe("3 hours ago");
    });

    it("returns days ago", () => {
      const past = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      const result = relativeTime(past);
      expect(result).toBe("2 days ago");
    });

    it("returns weeks ago", () => {
      const past = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const result = relativeTime(past);
      expect(result).toBe("1 week ago");
    });

    it("returns months ago", () => {
      const past = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const result = relativeTime(past);
      expect(result).toBe("1 month ago");
    });

    it("returns years ago", () => {
      const past = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
      const result = relativeTime(past);
      expect(result).toBe("1 year ago");
    });

    it("handles string date input", () => {
      const past = new Date(Date.now() - 3600 * 1000);
      const result = relativeTime(past.toISOString());
      expect(result).toContain("hour");
    });

    it("handles future dates", () => {
      const future = new Date(Date.now() + 1000);
      const result = relativeTime(future);
      expect(result).toBe("just now");
    });
  });

  describe("getTimestampForFilename", () => {
    it("includes time by default", () => {
      const result = getTimestampForFilename(true);
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/);
    });

    it("excludes time when specified", () => {
      const result = getTimestampForFilename(false);
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("generates valid date format", () => {
      const withTime = getTimestampForFilename(true);
      const parts = withTime.split("_");
      expect(parts[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(parts[1]).toMatch(/^\d{2}-\d{2}-\d{2}$/);
    });
  });
});
