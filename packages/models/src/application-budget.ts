/**
 * Spend governance for published apps.
 *
 * A released app runs on the creator's secrets, so the creator needs a hard
 * stop rather than a report after the fact. Every run is checked against the
 * app's budget *before* the job is created, recorded in a ledger at its
 * pre-run estimate, and settled against the run's actual provider cost when it
 * finishes. Exceeding the budget fails the run with a typed error; nothing
 * silently spends.
 *
 * The ledger doubles as release telemetry: one row per
 * `(applicationId, version, invocationId)`.
 */
import { and, eq, gte, sql } from "drizzle-orm";

import { createTimeOrderedUuid } from "./base-model.js";
import { getDb } from "./db.js";
import {
  applicationBudgets,
  applicationInvocations
} from "./schema/application-budgets.js";

export type BudgetPeriod = "day" | "month" | "total";

export interface ApplicationBudget {
  applicationId: string;
  period: BudgetPeriod;
  /** Ceiling in USD over the period. Null = no spend ceiling. */
  maxUsd: number | null;
  /** Ceiling on run count over the period. Null = no count ceiling. */
  maxInvocations: number | null;
  updatedAt: string;
}

export interface ApplicationUsage {
  period: BudgetPeriod;
  /** Start of the current window, ISO. Null when the period is "total". */
  since: string | null;
  /** Settled cost plus the estimate of anything still in flight. */
  spentUsd: number;
  invocations: number;
}

export type BudgetDecision =
  | { allowed: true; usage: ApplicationUsage }
  | {
      allowed: false;
      reason: string;
      usage: ApplicationUsage;
      budget: ApplicationBudget;
    };

export interface InvocationRecord {
  id: string;
  applicationId: string;
  version: number | null;
  invocationId: string;
  operationId: string;
  estimatedUsd: number;
  actualUsd: number | null;
  status: string;
  createdAt: string;
  settledAt: string | null;
}

const toBudget = (row: Record<string, unknown>): ApplicationBudget => ({
  applicationId: String(row.application_id),
  period: (row.period as BudgetPeriod) ?? "month",
  maxUsd: row.max_usd == null ? null : Number(row.max_usd),
  maxInvocations:
    row.max_invocations == null ? null : Number(row.max_invocations),
  updatedAt: String(row.updated_at)
});

const toRecord = (row: Record<string, unknown>): InvocationRecord => ({
  id: String(row.id),
  applicationId: String(row.application_id),
  version: row.version == null ? null : Number(row.version),
  invocationId: String(row.invocation_id),
  operationId: String(row.operation_id ?? ""),
  estimatedUsd: Number(row.estimated_usd ?? 0),
  actualUsd: row.actual_usd == null ? null : Number(row.actual_usd),
  status: String(row.status ?? "running"),
  createdAt: String(row.created_at),
  settledAt: row.settled_at == null ? null : String(row.settled_at)
});

/** Start of the window a period covers, or null for "total". */
export const periodStart = (period: BudgetPeriod, now: Date): string | null => {
  if (period === "total") return null;
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  if (period === "month") start.setUTCDate(1);
  return start.toISOString();
};

export async function getApplicationBudget(
  applicationId: string
): Promise<ApplicationBudget | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(applicationBudgets)
    .where(eq(applicationBudgets.application_id, applicationId))
    .limit(1);
  const row = rows[0] as Record<string, unknown> | undefined;
  return row ? toBudget(row) : null;
}

export async function setApplicationBudget(
  applicationId: string,
  fields: {
    period?: BudgetPeriod;
    maxUsd?: number | null;
    maxInvocations?: number | null;
  }
): Promise<ApplicationBudget> {
  const db = getDb();
  const now = new Date().toISOString();
  const existing = await getApplicationBudget(applicationId);
  const next = {
    period: fields.period ?? existing?.period ?? "month",
    max_usd: fields.maxUsd !== undefined ? fields.maxUsd : (existing?.maxUsd ?? null),
    max_invocations:
      fields.maxInvocations !== undefined
        ? fields.maxInvocations
        : (existing?.maxInvocations ?? null),
    updated_at: now
  };

  if (existing) {
    const rows = await db
      .update(applicationBudgets)
      .set(next)
      .where(eq(applicationBudgets.application_id, applicationId))
      .returning();
    return toBudget(rows[0] as Record<string, unknown>);
  }
  const rows = await db
    .insert(applicationBudgets)
    .values({ application_id: applicationId, created_at: now, ...next })
    .returning();
  return toBudget(rows[0] as Record<string, unknown>);
}

/**
 * What the app has spent in the current window. An in-flight run counts at its
 * estimate — a crashed run must not free spend it may already have incurred.
 */
export async function applicationUsage(
  applicationId: string,
  period: BudgetPeriod,
  now = new Date()
): Promise<ApplicationUsage> {
  const db = getDb();
  const since = periodStart(period, now);
  const conditions = [eq(applicationInvocations.application_id, applicationId)];
  if (since) {
    conditions.push(gte(applicationInvocations.created_at, since));
  }
  const rows = await db
    .select({
      spent: sql<number>`sum(coalesce(${applicationInvocations.actual_usd}, ${applicationInvocations.estimated_usd}))`,
      count: sql<number>`count(*)`
    })
    .from(applicationInvocations)
    .where(and(...conditions));
  const row = rows[0] as { spent: number | null; count: number } | undefined;
  return {
    period,
    since,
    spentUsd: Number(row?.spent ?? 0),
    invocations: Number(row?.count ?? 0)
  };
}

/**
 * Decide whether a run may start. Call before creating the job — the whole
 * point is that an over-budget run never reaches a provider.
 *
 * `estimatedUsd` comes from the caller's pre-run estimate
 * (`@nodetool-ai/node-sdk`'s `cost-estimate`), so the check accounts for what
 * this run is about to cost, not only what has already been spent.
 */
export async function checkApplicationBudget(
  applicationId: string,
  estimatedUsd: number,
  now = new Date()
): Promise<BudgetDecision> {
  const budget = await getApplicationBudget(applicationId);
  if (!budget) {
    // No budget configured: unmetered, as a draft app the creator runs itself.
    return {
      allowed: true,
      usage: await applicationUsage(applicationId, "total", now)
    };
  }
  const usage = await applicationUsage(applicationId, budget.period, now);

  if (budget.maxUsd != null && usage.spentUsd + estimatedUsd > budget.maxUsd) {
    return {
      allowed: false,
      reason: `This app has spent $${usage.spentUsd.toFixed(4)} of its $${budget.maxUsd.toFixed(2)} ${budget.period} budget; the run would add about $${estimatedUsd.toFixed(4)}.`,
      usage,
      budget
    };
  }
  if (
    budget.maxInvocations != null &&
    usage.invocations + 1 > budget.maxInvocations
  ) {
    return {
      allowed: false,
      reason: `This app has used ${usage.invocations} of its ${budget.maxInvocations} ${budget.period} runs.`,
      usage,
      budget
    };
  }
  return { allowed: true, usage };
}

/** Record a run against the app. Also the release telemetry row. */
export async function recordInvocation(input: {
  applicationId: string;
  version?: number | null;
  invocationId: string;
  operationId?: string;
  estimatedUsd?: number;
}): Promise<InvocationRecord> {
  const db = getDb();
  const rows = await db
    .insert(applicationInvocations)
    .values({
      id: createTimeOrderedUuid(),
      application_id: input.applicationId,
      version: input.version ?? null,
      invocation_id: input.invocationId,
      operation_id: input.operationId ?? "",
      estimated_usd: input.estimatedUsd ?? 0,
      status: "running",
      created_at: new Date().toISOString()
    })
    .returning();
  return toRecord(rows[0] as Record<string, unknown>);
}

/**
 * Close out a run with what it actually cost. Until this lands the run keeps
 * counting at its estimate.
 */
export async function settleInvocation(
  invocationId: string,
  actualUsd: number,
  status: "completed" | "failed" | "cancelled" = "completed"
): Promise<InvocationRecord | null> {
  const db = getDb();
  const rows = await db
    .update(applicationInvocations)
    .set({
      actual_usd: actualUsd,
      status,
      settled_at: new Date().toISOString()
    })
    .where(eq(applicationInvocations.invocation_id, invocationId))
    .returning();
  const row = rows[0] as Record<string, unknown> | undefined;
  return row ? toRecord(row) : null;
}

/** Recent runs of an application, newest first. */
export async function listInvocations(
  applicationId: string,
  limit = 50
): Promise<InvocationRecord[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(applicationInvocations)
    .where(eq(applicationInvocations.application_id, applicationId))
    .orderBy(sql`${applicationInvocations.created_at} desc`)
    .limit(limit);
  return rows.map((r: Record<string, unknown>) => toRecord(r));
}
