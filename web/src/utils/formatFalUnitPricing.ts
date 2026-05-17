import type { FalUnitPricing } from "../stores/ApiTypes";
import { relativeTime } from "./formatDateAndTime";

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

/** Compact label for node chrome (e.g. $0.04). */
export function formatFalUnitPricingShort(p: FalUnitPricing): string {
  return formatMoney(p.unit_price, p.currency);
}

/** Tooltip body: price, source + snapshot time, endpoint. */
export function formatFalUnitPricingTooltip(p: FalUnitPricing): string {
  const price = `${formatMoney(p.unit_price, p.currency)} per ${p.billing_unit}`;
  const sourceLabel =
    p.source === "live"
      ? "Live price"
      : p.source === "bundle"
        ? "Bundle list price"
        : "List price";
  const when = p.checked_at
    ? (() => {
        const rel = relativeTime(p.checked_at);
        const relDisplay = rel === "just now" ? "now" : rel;
        return `${sourceLabel} · ${relDisplay}`;
      })()
    : sourceLabel;
  return [price, when, `Endpoint: ${p.endpoint_id}`].filter(Boolean).join("\n");
}
