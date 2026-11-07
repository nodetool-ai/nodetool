/**
 * Spend limits for the users of a self-hosted server.
 *
 * An admin sets a default limit (the row for {@link DEFAULT_QUOTA_SUBJECT})
 * and can replace it for one user. Usage is read from the prediction ledger
 * over the current UTC day or month. Two budgets exist: language-model tokens,
 * and media generation in USD. Rows a user paid for with a key they saved
 * themselves (`key_source = 'user'`) never count.
 */
import { and, eq, gte, isNull, ne, or, sql, type SQL } from "drizzle-orm";

import { periodStart } from "./application-budget.js";
import { getPortableDb } from "./db.js";
import { credentialSource, type CredentialSource } from "./secret-helper.js";
import { predictions } from "./schema/predictions.js";
import { userQuotas } from "./schema/user-quotas.js";

/** The `user_id` of the row every user gets unless they have their own. */
export const DEFAULT_QUOTA_SUBJECT = "*";

export const QUOTA_PERIODS = ["day", "month"] as const;
export type QuotaPeriod = (typeof QUOTA_PERIODS)[number];

export const isQuotaPeriod = (value: unknown): value is QuotaPeriod =>
  typeof value === "string" &&
  (QUOTA_PERIODS as readonly string[]).includes(value);

export interface UserQuota {
  /** A user id, or {@link DEFAULT_QUOTA_SUBJECT}. */
  subject: string;
  period: QuotaPeriod;
  /** Null is unlimited. */
  tokenLimit: number | null;
  /** Null is unlimited. */
  mediaUsdLimit: number | null;
  updatedAt: string;
  updatedBy: string | null;
}

export interface QuotaChange {
  period?: QuotaPeriod;
  tokenLimit?: number | null;
  mediaUsdLimit?: number | null;
}

export interface QuotaUsage {
  period: QuotaPeriod;
  /** Start of the current window, ISO. */
  since: string;
  tokens: number;
  mediaUsd: number;
}

export interface EffectiveQuota {
  /** The limits in force, or null when nothing limits this user. */
  quota: UserQuota | null;
  /** True when the user has a row of their own. */
  custom: boolean;
}

type Row = typeof userQuotas.$inferSelect;

function toQuota(row: Row): UserQuota {
  return {
    subject: row.user_id,
    period: isQuotaPeriod(row.period) ? row.period : "month",
    tokenLimit: row.token_limit ?? null,
    mediaUsdLimit: row.media_usd_limit ?? null,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by ?? null
  };
}

export async function getQuota(subject: string): Promise<UserQuota | null> {
  const rows = await getPortableDb()
    .select()
    .from(userQuotas)
    .where(eq(userQuotas.user_id, subject))
    .limit(1);
  return rows[0] ? toQuota(rows[0]) : null;
}

/** The user's own row, else the default, else nothing. */
export async function getEffectiveQuota(
  userId: string
): Promise<EffectiveQuota> {
  const own = await getQuota(userId);
  if (own) return { quota: own, custom: true };
  return { quota: await getQuota(DEFAULT_QUOTA_SUBJECT), custom: false };
}

/** Create or change a quota row. Fields left out keep their value. */
export async function setQuota(
  subject: string,
  change: QuotaChange,
  updatedBy: string | null
): Promise<UserQuota> {
  const now = new Date().toISOString();
  const existing = await getQuota(subject);
  const values = {
    period: change.period ?? existing?.period ?? "month",
    token_limit:
      change.tokenLimit !== undefined
        ? change.tokenLimit
        : (existing?.tokenLimit ?? null),
    media_usd_limit:
      change.mediaUsdLimit !== undefined
        ? change.mediaUsdLimit
        : (existing?.mediaUsdLimit ?? null),
    updated_at: now,
    updated_by: updatedBy
  };
  const db = getPortableDb();
  const rows = existing
    ? await db
        .update(userQuotas)
        .set(values)
        .where(eq(userQuotas.user_id, subject))
        .returning()
    : await db
        .insert(userQuotas)
        .values({ user_id: subject, created_at: now, ...values })
        .returning();
  return toQuota(rows[0]);
}

/** Remove a row. For a user, the default applies again. */
export async function clearQuota(subject: string): Promise<boolean> {
  const rows = await getPortableDb()
    .delete(userQuotas)
    .where(eq(userQuotas.user_id, subject))
    .returning({ user_id: userQuotas.user_id });
  return rows.length > 0;
}

/** Rows that count against a quota: not paid for with the user's own key. */
const countsAgainstQuota = (): SQL =>
  or(isNull(predictions.key_source), ne(predictions.key_source, "user")) as SQL;

/**
 * What a user spent on the server's keys in the current window. A row with
 * token counts is language-model spend and counts its tokens. A row without
 * them is a media generation and counts its USD cost.
 */
export async function quotaUsage(
  userId: string,
  period: QuotaPeriod,
  now = new Date()
): Promise<QuotaUsage> {
  const since = periodStart(period, now) ?? new Date(0).toISOString();
  const tokenized = sql`(${predictions.input_tokens} IS NOT NULL OR ${predictions.output_tokens} IS NOT NULL OR ${predictions.total_tokens} IS NOT NULL)`;
  const rows = await getPortableDb()
    .select({
      tokens: sql<number>`sum(CASE WHEN ${tokenized} THEN coalesce(${predictions.total_tokens}, coalesce(${predictions.input_tokens}, 0) + coalesce(${predictions.output_tokens}, 0)) ELSE 0 END)`,
      media: sql<number>`sum(CASE WHEN ${tokenized} THEN 0 WHEN ${predictions.currency} IS NOT NULL AND upper(${predictions.currency}) <> 'USD' THEN 0 ELSE coalesce(${predictions.cost}, 0) END)`
    })
    .from(predictions)
    .where(
      and(
        eq(predictions.user_id, userId),
        gte(predictions.created_at, since),
        countsAgainstQuota()
      )
    );
  const row = rows[0];
  return {
    period,
    since,
    tokens: Number(row?.tokens ?? 0),
    mediaUsd: Number(row?.media ?? 0)
  };
}

/**
 * Names the credential a provider's spend is paid with, for example
 * "OPENAI_API_KEY", or null for a provider that takes none. Registered by the
 * host that knows its provider registry; models has no provider list.
 */
export type ProviderCredentialKey = (provider: string) => string | null;

let providerCredentialKey: ProviderCredentialKey | null = null;

export function setProviderCredentialKeyResolver(
  resolver: ProviderCredentialKey | null
): void {
  providerCredentialKey = resolver;
}

export function getProviderCredentialKeyResolver(): ProviderCredentialKey | null {
  return providerCredentialKey;
}

/**
 * Whose key pays for `provider` when `userId` calls it: "user" for a key the
 * user saved, "server" otherwise. Null when no resolver is registered, so a
 * host that cannot tell leaves the ledger column unset.
 */
export async function providerKeySource(
  userId: string,
  provider: string
): Promise<CredentialSource | null> {
  if (!providerCredentialKey) return null;
  const key = providerCredentialKey(provider);
  if (!key) return "server";
  return credentialSource(key, userId);
}
