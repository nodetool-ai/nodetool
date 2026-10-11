import {
  formatDuration,
  formatNextFire,
  formatSchedule
} from "../triggerSchedule";

describe("triggerSchedule", () => {
  const now = Date.parse("2026-01-01T00:00:00Z");

  describe("formatDuration", () => {
    it.each([
      [45, "45s"],
      [60, "1m"],
      [90, "1m 30s"],
      [3600, "1h"],
      [5400, "1h 30m"],
      [86400, "1d"],
      [90000, "1d 1h"]
    ])("formats %d seconds as %s", (seconds, expected) => {
      expect(formatDuration(seconds)).toBe(expected);
    });

    it.each([null, undefined, 0, -5, NaN, Infinity])(
      "returns null for %s",
      (value) => {
        expect(formatDuration(value as number | null | undefined)).toBeNull();
      }
    );
  });

  describe("formatNextFire", () => {
    it("formats a future timestamp", () => {
      expect(formatNextFire("2026-01-01T00:04:00Z", now)).toBe("next in 4m");
    });

    it("rounds sub-second futures up to 1s", () => {
      expect(formatNextFire(new Date(now + 200).toISOString(), now)).toBe(
        "next in 1s"
      );
    });

    it("reports due now for past timestamps", () => {
      expect(formatNextFire("2025-12-31T23:00:00Z", now)).toBe("due now");
    });

    it("returns null for missing or invalid input", () => {
      expect(formatNextFire(null, now)).toBeNull();
      expect(formatNextFire("", now)).toBeNull();
      expect(formatNextFire("not a date", now)).toBeNull();
    });
  });

  describe("formatSchedule", () => {
    it("combines cadence and next fire", () => {
      expect(formatSchedule(300, "2026-01-01T00:04:00Z", now)).toBe(
        "Runs every 5m — next in 4m"
      );
    });

    it("shows only cadence when next fire is missing", () => {
      expect(formatSchedule(300, null, now)).toBe("Runs every 5m");
    });

    it("capitalizes next fire when cadence is missing", () => {
      expect(formatSchedule(undefined, "2026-01-01T00:04:00Z", now)).toBe(
        "Next in 4m"
      );
    });

    it("returns null when neither field is usable", () => {
      expect(formatSchedule(null, undefined, now)).toBeNull();
    });
  });
});
