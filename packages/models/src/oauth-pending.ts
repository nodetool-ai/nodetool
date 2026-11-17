/**
 * The authorize-flow state of the OAuth server, stored in the database so
 * every server process sees it: a parked `/oauth/authorize` request while the
 * user is on the consent page, and the authorization code minted on approval.
 *
 * Both expire 10 minutes after they are written. Expired rows are deleted on
 * the next write, the same lazy pruning the in-memory store did. A code row
 * is keyed by the SHA-256 of the code, so reading the table cannot redeem
 * one.
 */

import { randomBytes } from "node:crypto";
import { and, eq, isNull, lt } from "drizzle-orm";
import { hashSecret } from "./access-token.js";
import { getPortableDb } from "./db.js";
import { oauthPendingEntries } from "./schema/mcp-oauth.js";

/** Lifetime of a parked request and of an authorization code. */
export const OAUTH_PENDING_TTL_MS = 600_000;

/** A row's payload, decoded. */
export type OauthPendingPayload = Record<string, unknown>;

/** What reading or consuming a code returns. */
export interface OauthPendingCode {
  payload: OauthPendingPayload;
  /** True when the code had been consumed before this call. */
  consumedBefore: boolean;
}

function cutoff(now: number): string {
  return new Date(now - OAUTH_PENDING_TTL_MS).toISOString();
}

async function pruneExpired(now: number): Promise<void> {
  await getPortableDb()
    .delete(oauthPendingEntries)
    .where(lt(oauthPendingEntries.created_at, cutoff(now)));
}

async function liveRow(
  id: string,
  entryType: "request" | "code",
  now: number
): Promise<typeof oauthPendingEntries.$inferSelect | null> {
  const rows = await getPortableDb()
    .select()
    .from(oauthPendingEntries)
    .where(
      and(
        eq(oauthPendingEntries.id, id),
        eq(oauthPendingEntries.entry_type, entryType)
      )
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (Date.parse(row.created_at) <= now - OAUTH_PENDING_TTL_MS) return null;
  return row;
}

export const OauthPending = {
  /** Park an authorize request. Returns its `request_id`. */
  async putRequest(
    payload: OauthPendingPayload,
    now: number = Date.now()
  ): Promise<string> {
    await pruneExpired(now);
    const id = randomBytes(16).toString("hex");
    await getPortableDb().insert(oauthPendingEntries).values({
      id,
      entry_type: "request",
      user_id: null,
      payload,
      created_at: new Date(now).toISOString(),
      consumed_at: null
    });
    return id;
  },

  /** Read a parked request without consuming it. */
  async getRequest(
    id: string,
    now: number = Date.now()
  ): Promise<OauthPendingPayload | null> {
    const row = await liveRow(id, "request", now);
    return row?.payload ?? null;
  },

  /**
   * Consume a parked request. The delete is the claim, so two processes that
   * approve and deny the same request at once cannot both succeed.
   */
  async consumeRequest(
    id: string,
    now: number = Date.now()
  ): Promise<OauthPendingPayload | null> {
    const deleted = await getPortableDb()
      .delete(oauthPendingEntries)
      .where(
        and(
          eq(oauthPendingEntries.id, id),
          eq(oauthPendingEntries.entry_type, "request")
        )
      )
      .returning();
    const row = deleted[0];
    if (!row) return null;
    if (Date.parse(row.created_at) <= now - OAUTH_PENDING_TTL_MS) return null;
    return row.payload;
  },

  /** Store an authorization code approved by `userId`. Returns the code. */
  async putCode(
    payload: OauthPendingPayload,
    userId: string,
    now: number = Date.now()
  ): Promise<string> {
    await pruneExpired(now);
    const code = randomBytes(32).toString("base64url");
    await getPortableDb().insert(oauthPendingEntries).values({
      id: hashSecret(code),
      entry_type: "code",
      user_id: userId,
      payload,
      created_at: new Date(now).toISOString(),
      consumed_at: null
    });
    return code;
  },

  /** Read a code without spending it. */
  async peekCode(
    code: string,
    now: number = Date.now()
  ): Promise<OauthPendingCode | null> {
    const row = await liveRow(hashSecret(code), "code", now);
    if (!row) return null;
    return { payload: row.payload, consumedBefore: row.consumed_at !== null };
  },

  /**
   * Spend a code. The conditional update is the claim: of two exchanges that
   * race, one sets `consumed_at` and the other reads `consumedBefore`.
   */
  async consumeCode(
    code: string,
    now: number = Date.now()
  ): Promise<OauthPendingCode | null> {
    const id = hashSecret(code);
    const claimed = await getPortableDb()
      .update(oauthPendingEntries)
      .set({ consumed_at: new Date(now).toISOString() })
      .where(
        and(
          eq(oauthPendingEntries.id, id),
          eq(oauthPendingEntries.entry_type, "code"),
          isNull(oauthPendingEntries.consumed_at)
        )
      )
      .returning();
    const row = claimed[0];
    if (row) {
      if (Date.parse(row.created_at) <= now - OAUTH_PENDING_TTL_MS) return null;
      return { payload: row.payload, consumedBefore: false };
    }
    const existing = await liveRow(id, "code", now);
    if (!existing) return null;
    return { payload: existing.payload, consumedBefore: true };
  }
};
