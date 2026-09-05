import { parseISO, isValid, format } from "../dateFormat";

// Run with TZ=UTC so local getters match the ISO strings below.

describe("parseISO", () => {
  it("parses an ISO datetime string", () => {
    const date = parseISO("2023-04-05T09:07:03Z");
    expect(date.getTime()).toBe(Date.UTC(2023, 3, 5, 9, 7, 3));
  });

  it("parses ISO datetime strings via the Date constructor", () => {
    const date = parseISO("2023-04-05T14:30:00Z");
    expect(isValid(date)).toBe(true);
    expect(date.getUTCHours()).toBe(14);
    expect(date.getUTCMinutes()).toBe(30);
  });

  it("parses date-only strings at local midnight", () => {
    const originalTimezone = process.env.TZ;
    process.env.TZ = "America/Los_Angeles";
    try {
      const date = parseISO("2024-01-01");
      expect(date.getFullYear()).toBe(2024);
      expect(date.getMonth()).toBe(0);
      expect(date.getDate()).toBe(1);
      expect(date.getHours()).toBe(0);
    } finally {
      if (originalTimezone === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = originalTimezone;
      }
    }
  });

  it("parses a date-only string to midnight local time", () => {
    const date = parseISO("2023-04-05");
    expect(date.getFullYear()).toBe(2023);
    expect(date.getMonth()).toBe(3);
    expect(date.getDate()).toBe(5);
    expect(date.getHours()).toBe(0);
    expect(date.getMinutes()).toBe(0);
  });

  it("returns an invalid Date for impossible dates", () => {
    expect(isValid(parseISO("2023-02-30"))).toBe(false);
  });

  it("returns an invalid Date for month 13", () => {
    expect(isValid(parseISO("2023-13-01"))).toBe(false);
  });

  it("returns an invalid Date for garbage input", () => {
    expect(isValid(parseISO("not-a-date"))).toBe(false);
  });
});

describe("isValid", () => {
  it("accepts a real date", () => {
    expect(isValid(new Date("2023-01-15T00:00:00Z"))).toBe(true);
    expect(isValid(new Date(2023, 0, 1))).toBe(true);
  });

  it("rejects an invalid date", () => {
    expect(isValid(new Date(NaN))).toBe(false);
    expect(isValid(new Date("invalid"))).toBe(false);
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
    expect(format(new Date(2023, 3, 5, 0, 0, 0), "PPpp")).toBe(
      "Apr 5, 2023, 12:00:00 AM"
    );
  });

  it("throws on an unsupported pattern", () => {
    expect(() => format(morning, "yyyy-MM-dd")).toThrow(
      "Unsupported date format pattern"
    );
    expect(() => format(morning, "MMM d, yyyy · HH:mm")).toThrow(
      "Unsupported date format pattern"
    );
  });
});
