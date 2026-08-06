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
  /** Whether the server refuses runs when the balance is empty. */
  enforced: z.boolean(),
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
