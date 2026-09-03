/**
 * User credits and subscription plans — the Studio product's billing layer.
 *
 * The ledger stores grants only. Spend is never written here: every provider
 * call already lands in `nodetool_predictions` with its USD cost, so
 *
 *   balance = sum(ledger.delta) - ceil(prediction spend / USD_PER_CREDIT)
 *
 * Grants accrue lazily on read, never on a schedule. A user seen for the
 * first time gets the welcome grant (`signup:<userId>`); every balance read
 * also inserts the current month's plan grant (`plan:<userId>:<planId>:
 * <periodKey>`). Both are keyed so the primary key makes a double grant
 * impossible — no cron, no payment state. A payment provider webhook would
 * write `topup` rows and flip `plan_id`; until then plan switches are instant
 * and top-ups are stubbed.
 */
import { and, eq, sql } from "drizzle-orm";
import { NODETOOL_MODELS, NODETOOL_PROVIDER_ID } from "@nodetool-ai/protocol";
import { isCreditModelAllowed, signupGrantCredits } from "@nodetool-ai/config";

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

/** Why a spend was refused — the caller maps it onto its own error code. */
export type CreditRefusal = "model_not_allowed" | "insufficient_credits";

export type CreditDecision =
  | { allowed: true; status: CreditStatus }
  | {
      allowed: false;
      refusal: CreditRefusal;
      reason: string;
      status: CreditStatus;
    };

/**
 * The managed models this server sells: the operator's whitelist, or the whole
 * catalog when they restricted none. Callers that render a menu use it to hide
 * what they could not run anyway. Empty in practice off the cloud profile,
 * where the `nodetool` provider is not registered at all.
 */
export const spendableModelIds = (): string[] =>
  NODETOOL_MODELS.filter((def) => isCreditModelAllowed(def.id)).map(
    (def) => def.id
  );

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

/**
 * Insert the one-time welcome grant for a user seen for the first time.
 * Idempotent via the primary key `signup:<userId>`, so it survives every
 * later balance read; a server configured with no welcome grant
 * (`NODETOOL_SIGNUP_CREDITS=0`) writes nothing.
 *
 * The amount is read per call rather than captured at module load, so raising
 * the grant reaches users who have not signed up yet without a restart — and
 * never re-grants the ones who already have their row.
 */
export async function ensureSignupGrant(userId: string): Promise<void> {
  const credits = signupGrantCredits();
  if (credits <= 0) return;

  const id = `signup:${userId}`;
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
      delta: credits,
      kind: "signup_grant",
      description: "Welcome credits",
      period_key: null,
      created_at: new Date().toISOString()
    });
  } catch {
    // Lost a race with a concurrent first read — already granted.
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

/** Balance, plan, and totals — accrues the welcome and month grants first. */
export async function creditStatus(userId: string): Promise<CreditStatus> {
  const now = new Date();
  await ensureSignupGrant(userId);
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
 * The pre-spend gate: two refusals, in the order the user can act on them.
 *
 * First, `models` — the managed model ids the work names — must all be open
 * for business on this server (`NODETOOL_CREDIT_MODELS`). A model the operator
 * did not whitelist is refused however full the balance is, because the spend
 * would land on a platform key the operator did not offer. Callers that do not
 * know the models pass none, and only the balance is checked; the provider
 * refuses a disallowed model again before it uses a key.
 *
 * Then the balance. `estimatedUsd` is a floor (unpriceable nodes estimate 0),
 * so the check is: the balance must cover the estimate, and must be positive
 * at all.
 */
export async function checkCredits(
  userId: string,
  estimatedUsd: number,
  models: readonly string[] = []
): Promise<CreditDecision> {
  const status = await creditStatus(userId);
  const refused = models.find((model) => !isCreditModelAllowed(model));
  if (refused !== undefined) {
    return {
      allowed: false,
      refusal: "model_not_allowed",
      reason: `Model "${refused}" is not available on this server.`,
      status
    };
  }
  const estimatedCredits = Math.ceil(
    Math.max(0, estimatedUsd) / USD_PER_CREDIT
  );
  if (status.balanceCredits <= 0) {
    return {
      allowed: false,
      refusal: "insufficient_credits",
      reason: `Out of credits on the ${status.plan.name} plan. Upgrade or top up to continue.`,
      status
    };
  }
  if (estimatedCredits > status.balanceCredits) {
    return {
      allowed: false,
      refusal: "insufficient_credits",
      reason: `This run needs about ${estimatedCredits} credits but ${status.balanceCredits} remain.`,
      status
    };
  }
  return { allowed: true, status };
}
