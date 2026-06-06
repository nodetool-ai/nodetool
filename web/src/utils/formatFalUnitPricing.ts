import type { FalUnitPricing } from "../stores/ApiTypes";
import { relativeTime } from "./formatDateAndTime";

/**
 * fal.ai exposes a single `unit_price` + `billing_unit` per endpoint from
 * `GET https://api.fal.ai/v1/models/pricing`.
 *
 * For some endpoints (e.g. ChatGPT Images) `billing_unit` is `"units"` — their
 * public tier tables are finer-grained than this scalar row.
 */

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

/**
 * fal only returns `{ unit_price, billing_unit }` per endpoint. When `billing_unit`
 * is vague (e.g. `"units"`), treat the figure as UI-warn-worthy: tiered /
 * proportional billing may diverge strongly from what users expect one image/run to cost.
 */
export function isFalVagueBillingSummary(p: { billing_unit: string }): boolean {
  return /\bunits?\b/i.test(p.billing_unit.trim());
}

/** Label for historical per-run estimate from fal.ai pricing/estimate API. */
export function formatFalPerRunEstimate(totalCost: number, currency: string): string {
  return `~${formatMoney(totalCost, currency)} per run (historical avg)`;
}

/** Compact label for node chrome (fal monetary `unit_price`). */
export function formatFalUnitPricingShort(p: FalUnitPricing): string {
  return formatMoney(p.unit_price, p.currency);
}

/** Snapshot age for tooltip (uses `checked_at`). */
function formatFalPricingAgeLine(p: FalUnitPricing): string {
  if (p.checked_at == null || String(p.checked_at).trim() === "") {
    return "Price · date unknown";
  }
  return `Price from ${relativeTime(p.checked_at)}`;
}

/** Tooltip: short stack; extra line only for vague summaries. */
export function formatFalUnitPricingTooltip(p: FalUnitPricing): string {
  const vague = isFalVagueBillingSummary(p);
  const money = `${formatMoney(p.unit_price, p.currency)} per ${p.billing_unit}`;
  const when = formatFalPricingAgeLine(p);

  return [
    vague ? `${money} (SEE DETAILS)` : money,
    vague
      ? "\nVaries by resolution and quality.\nView on fal.ai to see detailed pricing.\n"
      : null,
    when,
    `Endpoint: ${p.endpoint_id}`,
  ]
    .filter((s): s is string => Boolean(s))
    .join("\n");
}
