/**
 * @jest-environment node
 */
import {
  formatKieCredits,
  kieCreditsDetailSuggestsKeysLink,
} from "../kieCredits";
import type { KieCredits } from "../kieCredits";

describe("kieCreditsDetailSuggestsKeysLink", () => {
  it("returns false for null/undefined/empty", () => {
    expect(kieCreditsDetailSuggestsKeysLink(undefined)).toBe(false);
    expect(kieCreditsDetailSuggestsKeysLink("")).toBe(false);
  });

  it('returns false when detail contains "reach kie"', () => {
    expect(
      kieCreditsDetailSuggestsKeysLink("Could not reach kie.ai servers"),
    ).toBe(false);
  });

  it("returns true for auth errors", () => {
    expect(kieCreditsDetailSuggestsKeysLink("Unauthorized")).toBe(true);
  });
});

describe("formatKieCredits", () => {
  it('returns "N/A" when credit_balance is undefined', () => {
    expect(formatKieCredits({})).toBe("N/A");
  });

  it("formats integer credits", () => {
    expect(formatKieCredits({ credit_balance: 100 })).toBe("100 credits");
    expect(formatKieCredits({ credit_balance: 0 })).toBe("0 credits");
  });

  it("formats object balance", () => {
    const data: KieCredits = {
      credit_balance: { amount: 1234, currency: "credits" },
    };
    expect(formatKieCredits(data)).toMatch(/1[.,]234 credits/);
  });
});
