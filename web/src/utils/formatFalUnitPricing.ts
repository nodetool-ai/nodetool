import type { FalUnitPricing } from "../stores/ApiTypes";
import { relativeTime } from "./formatDateAndTime";

/**
 * fal.ai exposes a single `unit_price` + `billing_unit` per endpoint from
 * `GET https://api.fal.ai/v1/models/pricing`.
 *
 * For some endpoints (e.g. ChatGPT Images) `billing_unit` is `"units"` — their
 * public tier tables are finer-grained than this scalar row.
 */

// Constructing an Intl.NumberFormat costs ~60x formatting with one, and these
// run per FAL node on the canvas. Keyed by the two inputs that vary; bounded by
// the currencies fal.ai bills in.
const MONEY_FORMATTERS = new Map<string, Intl.NumberFormat>();

function moneyFormatter(currency: string, digits: number): Intl.NumberFormat {
  const key = `${currency}:${digits}`;
  let formatter = MONEY_FORMATTERS.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: digits,
      maximumFractionDigits: 4,
    });
    MONEY_FORMATTERS.set(key, formatter);
  }
  return formatter;
}

function formatMoney(amount: number, currency: string): string {
  try {
    const digits = amount > 0 && amount < 0.01 ? 4 : 2;
    return moneyFormatter(currency.toUpperCase(), digits).format(amount);
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
  return /\bunits?\b|\bcredits?\b/i.test(p.billing_unit.trim());
}

/** Label for historical per-run estimate from fal.ai pricing/estimate API. */
export function formatFalPerRunEstimate(totalCost: number, currency: string): string {
  return `~${formatMoney(totalCost, currency)} per run (historical avg)`;
}

const UNIT_ABBREVIATIONS: Record<string, string> = {
  second: "s",
  seconds: "s",
  megapixel: "MP",
  megapixels: "MP",
  minute: "min",
  minutes: "min",
  characters: "chars"
};

const COUNT_ABBREVIATIONS: Record<string, string> = {
  "1000": "1K",
  "1m": "1M"
};

/**
 * Compact form of a fal `billing_unit` for the chip: "seconds" -> "s",
 * "megapixels" -> "MP", "images" -> "image", "1000 characters" -> "1K chars".
 * Empty when the unit is blank or a bare count.
 */
function falUnitSuffix(billingUnit: string): string {
  const words = billingUnit.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0 || (words.length === 1 && /^\d+$/.test(words[0]))) {
    return "";
  }
  const counted = /^\d/.test(words[0]);
  if (counted) {
    words[0] = COUNT_ABBREVIATIONS[words[0]] ?? words[0];
  }
  const last = words.length - 1;
  const abbreviation = UNIT_ABBREVIATIONS[words[last]];
  if (abbreviation) {
    words[last] = abbreviation;
  } else if (!counted && /[^s]s$/.test(words[last])) {
    words[last] = words[last].slice(0, -1);
  }
  return words.join(" ");
}

/**
 * Compact label for node chrome: `unit_price` with its unit ("$0.07 / s"),
 * since most fal endpoints bill per second or megapixel, not per run.
 */
export function formatFalUnitPricingShort(p: FalUnitPricing): string {
  if (isFalVagueBillingSummary(p)) {
    return "pricing varies";
  }
  const money = formatMoney(p.unit_price, p.currency);
  const unit = falUnitSuffix(p.billing_unit);
  return unit === "" ? money : `${money} / ${unit}`;
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
