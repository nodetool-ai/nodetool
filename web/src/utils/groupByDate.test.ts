import { groupByDate } from "./groupByDate";

describe("groupByDate", () => {
  const now = new Date("2026-05-07T12:00:00Z");

  it("returns 'Today' for the same day", () => {
    expect(groupByDate(new Date("2026-05-07T08:00:00Z"), now)).toBe("Today");
  });

  it("returns 'Yesterday' for the previous day", () => {
    expect(groupByDate(new Date("2026-05-06T23:00:00Z"), now)).toBe(
      "Yesterday"
    );
  });

  it("returns 'N days ago' for 2-6 days back", () => {
    expect(groupByDate(new Date("2026-05-04T10:00:00Z"), now)).toBe(
      "3 days ago"
    );
    expect(groupByDate(new Date("2026-05-01T10:00:00Z"), now)).toBe(
      "6 days ago"
    );
  });

  it("delegates to relativeTime for 7+ days", () => {
    const result = groupByDate(new Date("2026-04-20T10:00:00Z"), now);
    expect(result).toMatch(/ago/);
  });

  it("accepts ISO date strings", () => {
    expect(groupByDate("2026-05-07T03:00:00Z", now)).toBe("Today");
  });

  it("uses current date as default for now parameter", () => {
    const today = new Date();
    expect(groupByDate(today)).toBe("Today");
  });
});
