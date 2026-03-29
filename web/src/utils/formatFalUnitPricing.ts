import type { FalUnitPricing } from "../stores/ApiTypes";

function formatMoney(amount: number, currency: string): string {
  try {
    const digits = amount > 0 && amount < 0.01 ? 4 : 2;
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency.toUpperCase(),
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: digits,
      maximumFractionDigits: 4,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

/** Compact label for node chrome (e.g. $0.04 / images). */
export function formatFalUnitPricingShort(p: FalUnitPricing): string {
  return `${formatMoney(p.unit_price, p.currency)} / ${p.billing_unit}`;
}

/** Tooltip body: list price disclaimer + endpoint. */
export function formatFalUnitPricingTooltip(p: FalUnitPricing): string {
  const line1 = `${formatMoney(p.unit_price, p.currency)} per ${p.billing_unit} (FAL list price).`;
  return `${line1}\nEndpoint: ${p.endpoint_id}`;
}
