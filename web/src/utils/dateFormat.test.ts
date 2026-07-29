import { parseISO, isValid, format, formatDistanceToNow } from "./dateFormat";

describe("dateFormat", () => {
  describe("parseISO", () => {
    it("parses date-only string to midnight local time", () => {
      const date = parseISO("2023-04-05");
      expect(date.getFullYear()).toBe(2023);
      expect(date.getMonth()).toBe(3);
      expect(date.getDate()).toBe(5);
      expect(date.getHours()).toBe(0);
      expect(date.getMinutes()).toBe(0);
    });

    it("returns invalid date for impossible dates", () => {
      const date = parseISO("2023-02-30");
      expect(isValid(date)).toBe(false);
    });

    it("parses ISO datetime strings via Date constructor", () => {
      const date = parseISO("2023-04-05T14:30:00Z");
      expect(isValid(date)).toBe(true);
      expect(date.getUTCHours()).toBe(14);
      expect(date.getUTCMinutes()).toBe(30);
    });

    it("handles month 13 as invalid", () => {
      const date = parseISO("2023-13-01");
      expect(isValid(date)).toBe(false);
    });
  });

  describe("isValid", () => {
    it("returns true for valid dates", () => {
      expect(isValid(new Date(2023, 0, 1))).toBe(true);
    });

    it("returns false for invalid dates", () => {
      expect(isValid(new Date(NaN))).toBe(false);
      expect(isValid(new Date("invalid"))).toBe(false);
    });
  });

  describe("format", () => {
    it("formats PPpp pattern", () => {
      const date = new Date(2023, 3, 5, 9, 7, 3);
      const result = format(date, "PPpp");
      expect(result).toBe("Apr 5, 2023, 9:07:03 AM");
    });

    it("formats PPpp for PM times", () => {
      const date = new Date(2023, 3, 5, 14, 30, 45);
      const result = format(date, "PPpp");
      expect(result).toBe("Apr 5, 2023, 2:30:45 PM");
    });

    it("formats PPpp for noon (12 PM)", () => {
      const date = new Date(2023, 3, 5, 12, 0, 0);
      const result = format(date, "PPpp");
      expect(result).toBe("Apr 5, 2023, 12:00:00 PM");
    });

    it("formats PPpp for midnight (12 AM)", () => {
      const date = new Date(2023, 3, 5, 0, 0, 0);
      const result = format(date, "PPpp");
      expect(result).toBe("Apr 5, 2023, 12:00:00 AM");
    });

    it("formats MMM d, yyyy HH:mm pattern", () => {
      const date = new Date(2023, 3, 5, 9, 7);
      const result = format(date, "MMM d, yyyy · HH:mm");
      expect(result).toBe("Apr 5, 2023 · 09:07");
    });

    it("throws for unsupported patterns", () => {
      const date = new Date(2023, 3, 5);
      expect(() => format(date, "yyyy-MM-dd")).toThrow(
        "Unsupported date format pattern"
      );
    });
  });

  describe("formatDistanceToNow", () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date(2023, 3, 5, 12, 0, 0));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("returns 'less than a minute' for very recent times", () => {
      const date = new Date(2023, 3, 5, 12, 0, 0);
      expect(formatDistanceToNow(date)).toBe("less than a minute");
    });

    it("returns minutes for times within an hour", () => {
      const date = new Date(2023, 3, 5, 11, 50, 0);
      expect(formatDistanceToNow(date)).toBe("10 minutes");
    });

    it("returns '1 minute' for singular", () => {
      const date = new Date(2023, 3, 5, 11, 59, 0);
      expect(formatDistanceToNow(date)).toBe("1 minute");
    });

    it("returns 'about 1 hour' for ~1 hour", () => {
      const date = new Date(2023, 3, 5, 11, 0, 0);
      expect(formatDistanceToNow(date)).toBe("about 1 hour");
    });

    it("returns hours for times within a day", () => {
      const date = new Date(2023, 3, 5, 6, 0, 0);
      expect(formatDistanceToNow(date)).toBe("about 6 hours");
    });

    it("returns '1 day' for ~1 day", () => {
      const date = new Date(2023, 3, 4, 12, 0, 0);
      expect(formatDistanceToNow(date)).toBe("1 day");
    });

    it("returns days for times within a month", () => {
      const date = new Date(2023, 3, 1, 12, 0, 0);
      expect(formatDistanceToNow(date)).toMatch(/\d+ days/);
    });

    it("adds suffix when addSuffix: true", () => {
      const date = new Date(2023, 3, 5, 11, 50, 0);
      expect(formatDistanceToNow(date, { addSuffix: true })).toBe(
        "10 minutes ago"
      );
    });

    it("uses 'in' prefix for future dates with addSuffix", () => {
      const date = new Date(2023, 3, 5, 12, 10, 0);
      expect(formatDistanceToNow(date, { addSuffix: true })).toBe(
        "in 10 minutes"
      );
    });
  });
});
