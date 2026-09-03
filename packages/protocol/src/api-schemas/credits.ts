import { z } from "zod";

// ── Shared shapes ──────────────────────────────────────────────────

export const creditPlan = z.object({
  id: z.string(),
  name: z.string(),
  monthlyCredits: z.number().int(),
  priceUsdPerMonth: z.number(),
  blurb: z.string()
});
export type CreditPlanSchema = z.infer<typeof creditPlan>;

export const creditStatusOutput = z.object({
  userId: z.string(),
  plan: creditPlan,
  /** Calendar-month key, UTC — "2026-08". */
  periodKey: z.string(),
  grantedCredits: z.number().int(),
  spentCredits: z.number().int(),
  balanceCredits: z.number().int(),
  spentUsd: z.number(),
  /**
   * The provider whose spend the balance meters ("nodetool"). BYOK providers
   * are never gated — both models coexist on one server.
   */
  meteredProvider: z.string(),
  /** True only on dev servers that opt into the no-payment test top-up. */
  testTopupEnabled: z.boolean(),
  /**
   * The managed model ids this server sells — the operator's
   * `NODETOOL_CREDIT_MODELS` whitelist, or the whole curated catalog when the
   * operator restricted none. Clients show these and hide the rest; the
   * server refuses the rest regardless.
   */
  spendableModels: z.array(z.string()),
  plans: z.array(creditPlan)
});
export type CreditStatusOutput = z.infer<typeof creditStatusOutput>;

// ── Inputs ─────────────────────────────────────────────────────────

export const setPlanInput = z.object({
  planId: z.string().min(1)
});

export const topupInput = z.object({
  /** Credits to add. Bounded until a payment provider fronts this. */
  credits: z.number().int().min(1).max(50_000)
});
