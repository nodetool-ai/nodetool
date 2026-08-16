/**
 * User credits and subscription plans — the Studio product's billing layer.
 *
 * The ledger stores grants only. Spend is never written here: every provider
 * call already lands in `nodetool_predictions` with its USD cost, so
 *
 *   balance = sum(ledger.delta) - ceil(prediction spend / USD_PER_CREDIT)
 *
 * Plans accrue lazily: the first balance read in a month inserts that month's
 * grant, keyed `plan:<userId>:<periodKey>` so the primary key makes double
 * accrual impossible. No cron, no payment state — a payment provider webhook
 * would write `topup` rows and flip `plan_id`; until then plan switches are
 * instant and top-ups are stubbed.
 */
import { and, eq, sql } from "drizzle-orm";
import { NODETOOL_PROVIDER_ID } from "@nodetool-ai/protocol";

import { getDb } from "./db.js";
import { creditLedger, userSubscriptions } from "./schema/credits.js";
import { predictions } from "./schema/predictions.js";
import { createTimeOrderedUuid } from "./base-model.js";

/** One credit is one US cent of provider spend. */
export const USD_PER_CREDIT = 0.01;

export interface CreditPlan {
  id: string;
  name: string;
  /** Credits granted at the start of each calendar month (UTC). */
  monthlyCredits: number;
  /** Display price; billing itself is not implemented. */
  priceUsdPerMonth: number;
  blurb: string;
}

export const CREDIT_PLANS: readonly CreditPlan[] = [
  {
    id: "free",
    name: "Free",
    monthlyCredits: 300,
    priceUsdPerMonth: 0,
    blurb: "Try both creation paths with a monthly starter allowance."
  },
  {
    id: "creator",
    name: "Creator",
    monthlyCredits: 3_000,
    priceUsdPerMonth: 12,
    blurb: "Enough for regular short-form work: stills, clips, and voice."
  },
  {
    id: "pro",
    name: "Pro",
    monthlyCredits: 10_000,
    priceUsdPerMonth: 40,
    blurb: "Headroom for daily production and longer cuts."
  }
] as const;

export const DEFAULT_PLAN_ID = "free";

export const planById = (planId: string): CreditPlan | null =>
  CREDIT_PLANS.find((p) => p.id === planId) ?? null;

/** Calendar-month key, UTC — "2026-08". */
export const periodKeyFor = (now: Date): string =>
  `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

export interface UserSubscription {
  userId: string;
  planId: string;
  status: string;
  updatedAt: string;
}

export interface CreditStatus {
  userId: string;
  plan: CreditPlan;
  periodKey: string;
  /** All grants ever recorded, in credits. */
  grantedCredits: number;
  /** All prediction spend ever recorded, rounded up, in credits. */
  spentCredits: number;
  /** grantedCredits - spentCredits, floored at 0 for display. */
  balanceCredits: number;
  spentUsd: number;
}

export type CreditDecision =
  | { allowed: true; status: CreditStatus }
  | { allowed: false; reason: string; status: CreditStatus };

const toSubscription = (row: Record<string, unknown>): UserSubscription => ({
  userId: String(row.user_id),
  planId: String(row.plan_id ?? DEFAULT_PLAN_ID),
  status: String(row.status ?? "active"),
  updatedAt: String(row.updated_at ?? "")
});

/** The user's subscription, creating the default (free) row on first read. */
export async function getSubscription(
  userId: string
): Promise<UserSubscription> {
  const db = getDb();
  const rows = await db
    .select()
    .from(userSubscriptions)
    .where(eq(userSubscriptions.user_id, userId))
    .limit(1);
  if (rows[0]) return toSubscription(rows[0]);

  const now = new Date().toISOString();
  try {
    await db.insert(userSubscriptions).values({
      user_id: userId,
      plan_id: DEFAULT_PLAN_ID,
      status: "active",
      created_at: now,
      updated_at: now
    });
  } catch {
    // Concurrent first read created it; fall through to the re-read.
  }
  const created = await db
    .select()
    .from(userSubscriptions)
    .where(eq(userSubscriptions.user_id, userId))
    .limit(1);
  return toSubscription(created[0]);
}

export async function setSubscriptionPlan(
  userId: string,
  planId: string
): Promise<UserSubscription> {
  const plan = planById(planId);
  if (!plan) throw new Error(`Unknown plan "${planId}".`);
  await getSubscription(userId);
  const db = getDb();
  await db
    .update(userSubscriptions)
    .set({ plan_id: plan.id, updated_at: new Date().toISOString() })
    .where(eq(userSubscriptions.user_id, userId));
  // Accrue the new plan's grant for the current month right away, so an
  // upgrade is usable the moment it happens (the id keys on plan too, so an
  // upgraded month carries both grants — acceptable, and simpler than
  // proration).
  await ensureMonthlyGrant(userId, new Date());
  return getSubscription(userId);
}

/**
 * Insert this month's plan grant if it isn't there yet. Idempotent via the
 * primary key `plan:<userId>:<planId>:<periodKey>`.
 */
export async function ensureMonthlyGrant(
  userId: string,
  now: Date
): Promise<void> {
  const subscription = await getSubscription(userId);
  const plan = planById(subscription.planId) ?? planById(DEFAULT_PLAN_ID)!;
  if (subscription.status !== "active" || plan.monthlyCredits <= 0) return;

  const periodKey = periodKeyFor(now);
  const id = `plan:${userId}:${plan.id}:${periodKey}`;
  const db = getDb();
  const existing = await db
    .select({ id: creditLedger.id })
    .from(creditLedger)
    .where(eq(creditLedger.id, id))
    .limit(1);
  if (existing[0]) return;
  try {
    await db.insert(creditLedger).values({
      id,
      user_id: userId,
      delta: plan.monthlyCredits,
      kind: "plan_grant",
      description: `${plan.name} plan — ${periodKey}`,
      period_key: periodKey,
      created_at: now.toISOString()
    });
  } catch {
    // Lost a race with a concurrent accrual of the same id — already granted.
  }
}

/** Record a top-up or manual adjustment. */
export async function grantCredits(
  userId: string,
  delta: number,
  kind: "topup" | "adjustment",
  description?: string
): Promise<void> {
  if (!Number.isFinite(delta) || delta === 0) {
    throw new Error("Credit delta must be a non-zero number.");
  }
  const db = getDb();
  await db.insert(creditLedger).values({
    id: createTimeOrderedUuid(),
    user_id: userId,
    delta: Math.trunc(delta),
    kind,
    description: description ?? null,
    period_key: null,
    created_at: new Date().toISOString()
  });
}

/** Balance, plan, and totals — accrues the current month's grant first. */
export async function creditStatus(userId: string): Promise<CreditStatus> {
  const now = new Date();
  await ensureMonthlyGrant(userId, now);
  const subscription = await getSubscription(userId);
  const plan = planById(subscription.planId) ?? planById(DEFAULT_PLAN_ID)!;

  const db = getDb();
  const grantRows = await db
    .select({
      total: sql<number>`COALESCE(SUM(${creditLedger.delta}), 0)`
    })
    .from(creditLedger)
    .where(eq(creditLedger.user_id, userId));
  const grantedCredits = Number(grantRows[0]?.total ?? 0);

  // Only the managed provider's spend counts against credits — BYOK
  // predictions (fal_ai, anthropic, …) ride the user's own keys and must
  // never drain the balance.
  const spendRows = await db
    .select({ total: sql<number>`COALESCE(SUM(${predictions.cost}), 0)` })
    .from(predictions)
    .where(
      and(
        eq(predictions.user_id, userId),
        eq(predictions.provider, NODETOOL_PROVIDER_ID)
      )
    );
  const spentUsd = Number(spendRows[0]?.total ?? 0);
  const spentCredits = Math.ceil(spentUsd / USD_PER_CREDIT);

  return {
    userId,
    plan,
    periodKey: periodKeyFor(now),
    grantedCredits,
    spentCredits,
    balanceCredits: Math.max(0, grantedCredits - spentCredits),
    spentUsd
  };
}

/**
 * The pre-spend gate. `estimatedUsd` is a floor (unpriceable nodes estimate
 * 0), so the check is: the balance must cover the estimate, and must be
 * positive at all. Callers decide whether the gate is on at all
 * (NODETOOL_CREDITS_ENFORCED).
 */
export async function checkCredits(
  userId: string,
  estimatedUsd: number
): Promise<CreditDecision> {
  const status = await creditStatus(userId);
  const estimatedCredits = Math.ceil(
    Math.max(0, estimatedUsd) / USD_PER_CREDIT
  );
  if (status.balanceCredits <= 0) {
    return {
      allowed: false,
      reason: `Out of credits on the ${status.plan.name} plan. Upgrade or top up to continue.`,
      status
    };
  }
  if (estimatedCredits > status.balanceCredits) {
    return {
      allowed: false,
      reason: `This run needs about ${estimatedCredits} credits but ${status.balanceCredits} remain.`,
      status
    };
  }
  return { allowed: true, status };
}
