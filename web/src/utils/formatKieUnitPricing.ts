import type { KieUnitPricing } from "../stores/ApiTypes";
import { relativeTime } from "./formatDateAndTime";

export function isKieVagueBillingSummary(p: Pick<KieUnitPricing, "billing_unit" | "tier_count">): boolean {
  if ((p.tier_count ?? 1) > 1) {
    return true;
  }
  return /\bvaries\b/i.test(p.billing_unit.trim());
}

function formatCreditAmount(amount: number): string {
  const digits = Number.isInteger(amount) ? 0 : 1;
  return `${new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(amount)} credits`;
}

function formatKiePerUnitLine(
  p: KieUnitPricing,
  { vague }: { vague: boolean },
): string {
  const amount = formatCreditAmount(p.unit_price);
  if (vague) {
    return `From ${amount}`;
  }
  const unit = p.billing_unit.trim();
  if (unit === "" || unit === "run") {
    return amount;
  }
  return `${amount} per ${unit}`;
}

/** Compact label for node chrome. */
export function formatKieUnitPricingShort(p: KieUnitPricing): string {
  const base = formatCreditAmount(p.unit_price);
  if (isKieVagueBillingSummary(p)) {
    return `from ${base}`;
  }
  const unit = p.billing_unit.trim();
  if (unit === "" || unit === "run") {
    return base;
  }
  return `${base} / ${unit}`;
}

function formatKiePricingAgeLine(p: KieUnitPricing): string {
  if (p.checked_at == null || String(p.checked_at).trim() === "") {
    return "Price · date unknown";
  }
  return `Price from ${relativeTime(p.checked_at)}`;
}

export function formatKieUnitPricingTooltip(p: KieUnitPricing): string {
  const vague = isKieVagueBillingSummary(p);
  const perUnit = formatKiePerUnitLine(p, { vague });
  const when = formatKiePricingAgeLine(p);
  const usd =
    p.usd_price != null && Number.isFinite(p.usd_price)
      ? `\n≈ $${p.usd_price.toFixed(4)} USD`
      : null;

  return [
    vague ? `${perUnit} (lowest tier — see kie.ai for full pricing)` : perUnit,
    vague ? "Varies by resolution, duration, and quality." : null,
    usd,
    when,
    `Model: ${p.model_id}`,
  ]
    .filter((s): s is string => Boolean(s))
    .join("\n");
}

export function kiePricingExternalUrl(p: KieUnitPricing): string {
  if (p.pricing_url != null && p.pricing_url.trim() !== "") {
    return p.pricing_url;
  }
  return `https://kie.ai/pricing`;
}
