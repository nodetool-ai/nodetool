/**
 * @jest-environment node
 */
import {
  falCreditsDetailSuggestsKeysLink,
  formatCredits,
} from "../falCredits";
import type { FalCredits } from "../falCredits";

describe("falCreditsDetailSuggestsKeysLink", () => {
  it("returns false for null/undefined/empty", () => {
    expect(falCreditsDetailSuggestsKeysLink(undefined)).toBe(false);
    expect(falCreditsDetailSuggestsKeysLink("")).toBe(false);
    expect(falCreditsDetailSuggestsKeysLink("   ")).toBe(false);
  });

  it('returns false when detail contains "reach fal"', () => {
    expect(
      falCreditsDetailSuggestsKeysLink("Could not reach fal servers")
    ).toBe(false);
  });

  it('returns false when detail contains "try again later"', () => {
    expect(
      falCreditsDetailSuggestsKeysLink("Service unavailable, try again later")
    ).toBe(false);
  });

  it("returns true for other error details", () => {
    expect(falCreditsDetailSuggestsKeysLink("Invalid API key")).toBe(true);
    expect(falCreditsDetailSuggestsKeysLink("Insufficient credits")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(falCreditsDetailSuggestsKeysLink("REACH FAL")).toBe(false);
    expect(falCreditsDetailSuggestsKeysLink("Try Again Later")).toBe(false);
  });
});

describe("formatCredits", () => {
  it('returns "N/A" when credit_balance is undefined', () => {
    expect(formatCredits({})).toBe("N/A");
  });

  it("formats a plain number balance", () => {
    expect(formatCredits({ credit_balance: 12.5 })).toBe("$12.50");
    expect(formatCredits({ credit_balance: 0 })).toBe("$0.00");
  });

  it("formats an object balance with amount and currency", () => {
    const data: FalCredits = {
      credit_balance: { amount: 42.1234, currency: "USD" },
    };
    const result = formatCredits(data);
    expect(result).toContain("42.12");
  });

  it("defaults currency to USD when not specified", () => {
    const data: FalCredits = {
      credit_balance: { amount: 10 },
    };
    const result = formatCredits(data);
    expect(result).toContain("10");
  });

  it('returns "N/A" when amount is missing from the object', () => {
    const data: FalCredits = {
      credit_balance: { currency: "EUR" },
    };
    expect(formatCredits(data)).toBe("N/A");
  });

  it("falls back to plain format for an unrecognized currency code", () => {
    const data: FalCredits = {
      credit_balance: { amount: 5.5, currency: "NOTREAL" },
    };
    const result = formatCredits(data);
    expect(result).toContain("5.5");
    expect(result).toContain("NOTREAL");
  });
});
