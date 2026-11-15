import type { ProviderCreditResponse } from "@nodetool-ai/protocol/api-schemas/settings.js";

/**
 * Format a provider credit amount for the given locale: a currency amount
 * with its symbol, or a plain count of credits or characters.
 */
export function formatCreditAmount(
  amount: number,
  credit: Pick<ProviderCreditResponse, "unit" | "currency">,
  locale: string
): string {
  const value = Math.max(amount, 0);
  if (credit.unit === "currency" && credit.currency) {
    try {
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency: credit.currency
      }).format(value);
    } catch {
      // An unknown currency code falls through to a plain number.
    }
  }
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: credit.unit === "currency" ? 2 : 0
  }).format(value);
}
