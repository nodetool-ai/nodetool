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
import { getDb, getDbType } from "./db.js";
import {
  applicationBudgets,
  applicationInvocations
} from "./schema/application-budgets.js";
import { applications } from "./schema/applications.js";

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
  /** Owner of the app when the run was recorded; null on pre-existing rows. */
  userId: string | null;
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
  userId: row.user_id == null ? null : String(row.user_id),
  version: row.version == null ? null : Number(row.version),
  invocationId: String(row.invocation_id),
  operationId: String(row.operation_id ?? ""),
  estimatedUsd: Number(row.estimated_usd ?? 0),
  actualUsd: row.actual_usd == null ? null : Number(row.actual_usd),
  status: String(row.status ?? "running"),
  createdAt: String(row.created_at),
  settledAt: row.settled_at == null ? null : String(row.settled_at)
});

/**
 * Who a ledger row belongs to. The ledger is read by application id, and ids
 * are client-supplied, so each row records the owner of the app that produced
 * it instead of leaving that to whatever row holds the id later. Callers that
 * already know the user pass it; the rest read it off the parent.
 */
async function ownerOfApplication(
  applicationId: string
): Promise<string | null> {
  const db = getDb();
  const rows = await db
    .select({ user_id: applications.user_id })
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);
  return (rows[0]?.user_id as string | undefined) ?? null;
}

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
    max_usd:
      fields.maxUsd !== undefined ? fields.maxUsd : (existing?.maxUsd ?? null),
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
export async function recordInvocation(
  input: ReserveInput
): Promise<InvocationRecord> {
  const db = getDb();
  const userId =
    input.userId ?? (await ownerOfApplication(input.applicationId));
  const rows = await db
    .insert(applicationInvocations)
    .values(invocationRow(input, userId))
    .returning();
  return toRecord(rows[0] as Record<string, unknown>);
}

/**
 * Close out a run with what it actually cost. Until this lands the run keeps
 * counting at its estimate.
 *
 * `actualUsd` must be null when nothing measured the run's cost, which is not
 * the same as measuring it as zero. Only two node families report provider
 * cost today, so passing 0 for every other run would overwrite its reservation
 * and hand the spend back — a completed run would free budget it may well have
 * used. A null leaves `actual_usd` unset, and `applicationUsage` keeps counting
 * the estimate.
 *
 * The update is scoped to `applicationId` as well as the invocation. An
 * invocation id is a job id a caller can name freely, so an unscoped update let
 * anyone settle a stranger's in-flight reservation at zero and hand its budget
 * back. Settling a row that belongs to another app matches nothing and returns
 * null, the same as settling an invocation that does not exist.
 */
export async function settleInvocation(
  applicationId: string,
  invocationId: string,
  actualUsd: number | null,
  status: "completed" | "failed" | "cancelled" = "completed"
): Promise<InvocationRecord | null> {
  const db = getDb();
  type PatchFields = {
    actual_usd?: number;
    status: typeof status;
    settled_at: string;
  };
  const patch: PatchFields = {
    status,
    settled_at: new Date().toISOString()
  };
  // Left out, never set to `undefined`: Drizzle writes an explicit `undefined`
  // as a column update, so an unpriced settle must omit the column entirely.
  if (actualUsd != null) {
    patch.actual_usd = actualUsd;
  }
  const rows = await db
    .update(applicationInvocations)
    .set(patch)
    .where(
      and(
        eq(applicationInvocations.application_id, applicationId),
        eq(applicationInvocations.invocation_id, invocationId)
      )
    )
    .returning();
  const row = rows[0] as Record<string, unknown> | undefined;
  return row ? toRecord(row) : null;
}

export type Reservation =
  | { allowed: true; record: InvocationRecord; usage: ApplicationUsage }
  | {
      allowed: false;
      reason: string;
      usage: ApplicationUsage;
      budget: ApplicationBudget;
    };

/** Values every reserved row carries, independent of which driver writes it. */
const invocationRow = (input: ReserveInput, userId: string | null) => ({
  id: createTimeOrderedUuid(),
  application_id: input.applicationId,
  user_id: userId,
  version: input.version ?? null,
  invocation_id: input.invocationId,
  operation_id: input.operationId ?? "",
  estimated_usd: input.estimatedUsd ?? 0,
  status: "running",
  created_at: new Date().toISOString()
});

const overBudget = (
  budget: ApplicationBudget,
  usage: ApplicationUsage,
  estimatedUsd: number
): string | null => {
  if (budget.maxUsd != null && usage.spentUsd + estimatedUsd > budget.maxUsd) {
    return `This app has spent $${usage.spentUsd.toFixed(4)} of its $${budget.maxUsd.toFixed(2)} ${budget.period} budget; the run would add about $${estimatedUsd.toFixed(4)}.`;
  }
  if (
    budget.maxInvocations != null &&
    usage.invocations + 1 > budget.maxInvocations
  ) {
    return `This app has used ${usage.invocations} of its ${budget.maxInvocations} ${budget.period} runs.`;
  }
  return null;
};

export interface ReserveInput {
  applicationId: string;
  /** Owner the run is booked against. Read off the app when omitted. */
  userId?: string | null;
  version?: number | null;
  invocationId: string;
  operationId?: string;
  estimatedUsd?: number;
}

/**
 * Check the budget and claim the run against it in one atomic step.
 *
 * `checkApplicationBudget` followed by `recordInvocation` is two statements,
 * and concurrent runs of the same app interleave between them: each reads a
 * usage total that does not yet include the others, and every one of them is
 * admitted. On Postgres — where every statement is a round-trip — that let a
 * one-run budget admit eight. The check and the ledger write therefore happen
 * inside a transaction that first locks the app's budget row, which serializes
 * admissions per app and leaves apps without a budget completely unblocked.
 */
export async function reserveInvocation(
  input: ReserveInput,
  now = new Date()
): Promise<Reservation> {
  const estimatedUsd = input.estimatedUsd ?? 0;
  const db = getDb();
  // Resolved before the transaction: the SQLite branch runs synchronously and
  // cannot await a lookup of its own.
  const userId =
    input.userId ?? (await ownerOfApplication(input.applicationId));

  // No budget row means unmetered, so there is nothing to serialize on.
  const configured = await getApplicationBudget(input.applicationId);
  if (!configured) {
    const record = await recordInvocation({ ...input, userId });
    return {
      allowed: true,
      record,
      usage: await applicationUsage(input.applicationId, "total", now)
    };
  }

  const decide = (budget: ApplicationBudget, usage: ApplicationUsage) => {
    const reason = overBudget(budget, usage, estimatedUsd);
    return reason ? { reason } : null;
  };

  /** Nothing left to check against — record the run and let it through. */
  const unmetered = (record: InvocationRecord): Reservation => ({
    allowed: true,
    record,
    usage: { period: "total", since: null, spentUsd: 0, invocations: 0 }
  });

  if (getDbType() === "sqlite") {
    // better-sqlite3 transactions must be fully synchronous; an async callback
    // returns a Promise the driver rejects.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return db.transaction((tx: any): Reservation => {
      const budgetRow = tx
        .select()
        .from(applicationBudgets)
        .where(eq(applicationBudgets.application_id, input.applicationId))
        .limit(1)
        .get();
      // The row was there a moment ago and is the thing being locked; if it
      // went away, the app is unmetered and the run is simply recorded.
      if (!budgetRow) {
        const orphan = tx
          .insert(applicationInvocations)
          .values(invocationRow(input, userId))
          .returning()
          .get();
        return unmetered(toRecord(orphan as Record<string, unknown>));
      }
      const budget = toBudget(budgetRow as Record<string, unknown>);
      const since = periodStart(budget.period, now);
      const conditions = [
        eq(applicationInvocations.application_id, input.applicationId)
      ];
      if (since) conditions.push(gte(applicationInvocations.created_at, since));
      const totals = tx
        .select({
          spent: sql<number>`sum(coalesce(${applicationInvocations.actual_usd}, ${applicationInvocations.estimated_usd}))`,
          count: sql<number>`count(*)`
        })
        .from(applicationInvocations)
        .where(and(...conditions))
        .get();
      const usage: ApplicationUsage = {
        period: budget.period,
        since,
        spentUsd: Number(totals?.spent ?? 0),
        invocations: Number(totals?.count ?? 0)
      };
      const refused = decide(budget, usage);
      if (refused) return { allowed: false, ...refused, usage, budget };
      const row = tx
        .insert(applicationInvocations)
        .values(invocationRow(input, userId))
        .returning()
        .get();
      return {
        allowed: true,
        record: toRecord(row as Record<string, unknown>),
        usage
      };
    }) as Reservation;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return db.transaction(async (tx: any): Promise<Reservation> => {
    // Locking the budget row is what makes the read-then-write atomic: every
    // other admission for this app waits here until this one has written.
    const [budgetRow] = await tx
      .select()
      .from(applicationBudgets)
      .where(eq(applicationBudgets.application_id, input.applicationId))
      .limit(1)
      .for("update");
    if (!budgetRow) {
      const [orphan] = await tx
        .insert(applicationInvocations)
        .values(invocationRow(input, userId))
        .returning();
      return unmetered(toRecord(orphan as Record<string, unknown>));
    }
    const budget = toBudget(budgetRow as Record<string, unknown>);
    const since = periodStart(budget.period, now);
    const conditions = [
      eq(applicationInvocations.application_id, input.applicationId)
    ];
    if (since) conditions.push(gte(applicationInvocations.created_at, since));
    const [totals] = await tx
      .select({
        spent: sql<number>`sum(coalesce(${applicationInvocations.actual_usd}, ${applicationInvocations.estimated_usd}))`,
        count: sql<number>`count(*)`
      })
      .from(applicationInvocations)
      .where(and(...conditions));
    const usage: ApplicationUsage = {
      period: budget.period,
      since,
      spentUsd: Number(totals?.spent ?? 0),
      invocations: Number(totals?.count ?? 0)
    };
    const refused = decide(budget, usage);
    if (refused) return { allowed: false, ...refused, usage, budget };
    const [row] = await tx
      .insert(applicationInvocations)
      .values(invocationRow(input, userId))
      .returning();
    return {
      allowed: true,
      record: toRecord(row as Record<string, unknown>),
      usage
    };
  });
}

/**
 * Recent runs of an application, newest first. `userId` scopes the read to the
 * owner the rows were written for; rows predating the column stay visible.
 */
export async function listInvocations(
  applicationId: string,
  limit = 50,
  userId?: string
): Promise<InvocationRecord[]> {
  const db = getDb();
  const scope =
    userId === undefined
      ? eq(applicationInvocations.application_id, applicationId)
      : and(
          eq(applicationInvocations.application_id, applicationId),
          sql`(${applicationInvocations.user_id} IS NULL OR ${applicationInvocations.user_id} = ${userId})`
        );
  const rows = await db
    .select()
    .from(applicationInvocations)
    .where(scope)
    .orderBy(sql`${applicationInvocations.created_at} desc`)
    .limit(limit);
  return rows.map((r: Record<string, unknown>) => toRecord(r));
}
