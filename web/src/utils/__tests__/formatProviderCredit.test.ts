import { formatCreditAmount } from "../formatProviderCredit";

describe("formatCreditAmount", () => {
  it("formats a currency balance with its symbol in the locale", () => {
    expect(formatCreditAmount(24.5, { unit: "currency", currency: "USD" }, "en")).toBe("$24.50");
    expect(formatCreditAmount(24.5, { unit: "currency", currency: "EUR" }, "de")).toMatch(/24,50\s€/);
  });

  it("formats credits as a whole number", () => {
    expect(formatCreditAmount(12345.6, { unit: "credits" }, "en")).toBe("12,346");
  });

  it("never shows a negative amount", () => {
    expect(formatCreditAmount(-3, { unit: "credits" }, "en")).toBe("0");
  });

  it("falls back to a plain number for an unknown currency code", () => {
    expect(formatCreditAmount(1.234, { unit: "currency", currency: "not-a-code" }, "en")).toBe("1.23");
  });
});
