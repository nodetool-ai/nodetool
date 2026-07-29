import {
  formatDuration,
  formatNextFire,
  formatSchedule
} from "../triggerSchedule";

const NOW = Date.parse("2026-07-26T12:00:00.000Z");

describe("formatDuration", () => {
  it("formats seconds, minutes, hours, and days", () => {
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(300)).toBe("5m");
    expect(formatDuration(330)).toBe("5m 30s");
    expect(formatDuration(3600)).toBe("1h");
    expect(formatDuration(5400)).toBe("1h 30m");
    expect(formatDuration(172800)).toBe("2d");
  });

  it("returns null for missing, zero, or non-finite input", () => {
    expect(formatDuration(undefined)).toBeNull();
    expect(formatDuration(null)).toBeNull();
    expect(formatDuration(0)).toBeNull();
    expect(formatDuration(Number.NaN)).toBeNull();
  });
});

describe("formatNextFire", () => {
  it("counts down to a future fire", () => {
    expect(formatNextFire("2026-07-26T12:04:00.000Z", NOW)).toBe("next in 4m");
  });

  it("says due now for a timestamp that has passed", () => {
    expect(formatNextFire("2026-07-26T11:59:00.000Z", NOW)).toBe("due now");
  });

  it("returns null rather than 'Invalid Date' for missing or junk input", () => {
    expect(formatNextFire(null, NOW)).toBeNull();
    expect(formatNextFire(undefined, NOW)).toBeNull();
    expect(formatNextFire("not-a-date", NOW)).toBeNull();
  });
});

describe("formatSchedule", () => {
  it("combines cadence and countdown", () => {
    expect(formatSchedule(300, "2026-07-26T12:04:00.000Z", NOW)).toBe(
      "Runs every 5m — next in 4m"
    );
  });

  it("degrades to whichever field is present", () => {
    expect(formatSchedule(300, null, NOW)).toBe("Runs every 5m");
    expect(formatSchedule(null, "2026-07-26T12:04:00.000Z", NOW)).toBe(
      "Next in 4m"
    );
  });

  it("returns null when the server sent neither field", () => {
    expect(formatSchedule(undefined, undefined, NOW)).toBeNull();
  });
});
