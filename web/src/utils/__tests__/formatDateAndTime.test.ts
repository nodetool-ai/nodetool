import { secondsToHMS, prettyDate, relativeTime, getTimestampForFilename } from "../formatDateAndTime";

describe("secondsToHMS", () => {
  it("converts seconds to HH:MM:SS format", () => {
    expect(secondsToHMS(0)).toBe("00:00:00");
    expect(secondsToHMS(59)).toBe("00:00:59");
    expect(secondsToHMS(60)).toBe("00:01:00");
    expect(secondsToHMS(3661)).toBe("01:01:01");
    expect(secondsToHMS(86400)).toBe("24:00:00");
  });

  it("converts large values to HH:MM:SS", () => {
    expect(secondsToHMS(90061)).toBe("25:01:01");
  });

  it("pads single digit values", () => {
    expect(secondsToHMS(5)).toBe("00:00:05");
    expect(secondsToHMS(65)).toBe("00:01:05");
    expect(secondsToHMS(3605)).toBe("01:00:05");
  });
});

describe("prettyDate", () => {
  it("returns '-' for undefined date", () => {
    expect(prettyDate(undefined)).toBe("-");
  });

  it("returns '-' for empty string", () => {
    expect(prettyDate("")).toBe("-");
  });

  it("parses ISO date string correctly", () => {
    const result = prettyDate("2026-01-15T10:30:00");
    expect(result).toContain("2026-01-15");
  });

  it("parses numeric timestamp in current year correctly", () => {
    const now = new Date();
    const timestamp = now.getTime();
    const result = prettyDate(timestamp);
    expect(result).toContain(now.getFullYear().toString());
  });

  it("uses 12h format by default", () => {
    const result = prettyDate("2026-01-15T10:30:00");
    expect(result).toMatch(/am|pm|AM|PM/);
  });

  it("uses 24h format when specified", () => {
    const result = prettyDate("2026-01-15T10:30:00", "normal", { timeFormat: "24h" });
    expect(result).toContain("10:30:00");
  });

  it("returns 'Invalid Date' for malformed string", () => {
    expect(prettyDate("not-a-date")).toBe("Invalid Date");
  });

  it("handles verbose format", () => {
    const result = prettyDate("2026-01-15T10:30:00", "verbose");
    expect(result).toContain("|");
  });
});

describe("relativeTime", () => {
  it("returns 'just now' for current time", () => {
    const now = new Date();
    expect(relativeTime(now)).toBe("just now");
  });

  it("returns seconds ago for recent times", () => {
    const past = new Date(Date.now() - 30000);
    expect(relativeTime(past)).toMatch(/seconds ago/);
  });

  it("returns minutes ago", () => {
    const past = new Date(Date.now() - 300000);
    expect(relativeTime(past)).toMatch(/minutes ago/);
  });

  it("returns hours ago", () => {
    const past = new Date(Date.now() - 7200000);
    expect(relativeTime(past)).toMatch(/hours ago/);
  });

  it("returns days ago", () => {
    const past = new Date(Date.now() - 172800000);
    expect(relativeTime(past)).toMatch(/days ago/);
  });

  it("returns singular unit", () => {
    const past = new Date(Date.now() - 86400000);
    expect(relativeTime(past)).toBe("1 day ago");
  });

  it("returns weeks ago", () => {
    const past = new Date(Date.now() - 604800000);
    const result = relativeTime(past);
    expect(result).toMatch(/week/);
  });

  it("returns months ago", () => {
    const past = new Date(Date.now() - 2592000000);
    const result = relativeTime(past);
    expect(result).toMatch(/month/);
  });

  it("returns years ago", () => {
    const past = new Date(Date.now() - 31536000000);
    const result = relativeTime(past);
    expect(result).toMatch(/year/);
  });
});

describe("getTimestampForFilename", () => {
  it("returns date format by default", () => {
    const result = getTimestampForFilename(false);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("includes time when requested", () => {
    const result = getTimestampForFilename(true);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/);
  });
});
