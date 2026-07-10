import {
  parseISO,
  isValid,
  format,
  formatDistanceToNow
} from "../dateFormat";

// Run with TZ=UTC so local getters match the ISO strings below.

describe("parseISO", () => {
  it("parses an ISO datetime string", () => {
    const date = parseISO("2023-04-05T09:07:03Z");
    expect(date.getTime()).toBe(Date.UTC(2023, 3, 5, 9, 7, 3));
  });

  it("returns an invalid Date for garbage input", () => {
    expect(isValid(parseISO("not-a-date"))).toBe(false);
  });
});

describe("isValid", () => {
  it("accepts a real date", () => {
    expect(isValid(new Date("2023-01-15T00:00:00Z"))).toBe(true);
  });

  it("rejects an invalid date", () => {
    expect(isValid(new Date(NaN))).toBe(false);
  });
});

describe("format", () => {
  const morning = new Date("2023-04-05T09:07:03Z");
  const afternoon = new Date("2023-12-25T13:05:00Z");
  const midnight = new Date("2023-04-05T00:30:00Z");
  const noon = new Date("2023-04-05T12:00:00Z");

  it("formats PPpp like date-fns en-US", () => {
    expect(format(morning, "PPpp")).toBe("Apr 5, 2023, 9:07:03 AM");
    expect(format(afternoon, "PPpp")).toBe("Dec 25, 2023, 1:05:00 PM");
  });

  it("handles midnight and noon in PPpp", () => {
    expect(format(midnight, "PPpp")).toBe("Apr 5, 2023, 12:30:00 AM");
    expect(format(noon, "PPpp")).toBe("Apr 5, 2023, 12:00:00 PM");
  });

  it("formats MMM d, yyyy · HH:mm", () => {
    expect(format(morning, "MMM d, yyyy · HH:mm")).toBe("Apr 5, 2023 · 09:07");
    expect(format(afternoon, "MMM d, yyyy · HH:mm")).toBe(
      "Dec 25, 2023 · 13:05"
    );
  });

  it("throws on an unsupported pattern", () => {
    expect(() => format(morning, "yyyy-MM-dd")).toThrow(
      "Unsupported date format pattern"
    );
  });
});

describe("formatDistanceToNow", () => {
  const ago = (ms: number) => new Date(Date.now() - ms);
  const MINUTE = 60_000;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;

  it("says less than a minute for very recent dates", () => {
    expect(formatDistanceToNow(ago(20_000), { addSuffix: true })).toBe(
      "less than a minute ago"
    );
  });

  it("formats minutes", () => {
    expect(formatDistanceToNow(ago(MINUTE), { addSuffix: true })).toBe(
      "1 minute ago"
    );
    expect(formatDistanceToNow(ago(5 * MINUTE), { addSuffix: true })).toBe(
      "5 minutes ago"
    );
  });

  it("formats hours", () => {
    expect(formatDistanceToNow(ago(HOUR), { addSuffix: true })).toBe(
      "about 1 hour ago"
    );
    expect(formatDistanceToNow(ago(3 * HOUR), { addSuffix: true })).toBe(
      "about 3 hours ago"
    );
  });

  it("formats days", () => {
    expect(formatDistanceToNow(ago(DAY), { addSuffix: true })).toBe(
      "1 day ago"
    );
    expect(formatDistanceToNow(ago(5 * DAY), { addSuffix: true })).toBe(
      "5 days ago"
    );
  });

  it("formats months", () => {
    expect(formatDistanceToNow(ago(40 * DAY), { addSuffix: true })).toBe(
      "about 1 month ago"
    );
    expect(formatDistanceToNow(ago(90 * DAY), { addSuffix: true })).toBe(
      "3 months ago"
    );
  });

  it("formats years", () => {
    expect(formatDistanceToNow(ago(400 * DAY), { addSuffix: true })).toBe(
      "about 1 year ago"
    );
    expect(formatDistanceToNow(ago(550 * DAY), { addSuffix: true })).toBe(
      "over 1 year ago"
    );
    expect(formatDistanceToNow(ago(700 * DAY), { addSuffix: true })).toBe(
      "almost 2 years ago"
    );
  });

  it("omits the suffix without addSuffix", () => {
    expect(formatDistanceToNow(ago(5 * MINUTE))).toBe("5 minutes");
  });

  it("phrases future dates with 'in'", () => {
    expect(formatDistanceToNow(ago(-5 * MINUTE), { addSuffix: true })).toBe(
      "in 5 minutes"
    );
  });
});
