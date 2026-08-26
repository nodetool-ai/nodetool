/**
 * MCP OAuth models — the durable half of the MCP OAuth 2.1 flow
 * (`docs/mcp-oauth-design.md` § "Token model and storage").
 *
 * Three tables, three classes:
 *
 * - `McpOauthClient` — a dynamically registered client (RFC 7591). Its id
 *   (`ntc_…`) doubles as the public `client_id`; DCR issues no secret. A
 *   client identified by a `https://…` URL (CIMD) is never a row here — its
 *   identity is the URL itself, resolved by `@nodetool-ai/websocket`'s CIMD
 *   fetcher, not this module.
 * - `McpOauthGrant` — one row per (user, client) consent. The unit the
 *   settings UI revokes.
 * - `McpOauthToken` — the access/refresh pair minted for a grant. Same
 *   secret-hash scheme as `AccessToken` (`access-token.ts`): only a SHA-256
 *   of the secret half is stored, so a database read cannot reconstruct a
 *   token. Refresh rotation is tracked through `rotated_from`, a
 *   self-referencing lineage: rotating a refresh token never deletes the row
 *   it replaces, it links the new row back to it. Presenting an
 *   already-superseded token is detected by that link existing, not by the
 *   presented row being gone — which is what makes reuse detectable even
 *   though the row is still there to hash-compare against.
 */

import { randomBytes } from "node:crypto";
import { digestsMatch, hashSecret } from "./access-token.js";
import { and, eq, isNull, lt, notInArray } from "drizzle-orm";
import { DBModel, createTimeOrderedUuid } from "./base-model.js";
import { getDb, getDbType, type DbTransaction } from "./db.js";
import {
  mcpOauthClients,
  mcpOauthGrants,
  mcpOauthTokens
} from "./schema/mcp-oauth.js";

/** What marks a dynamically registered client's id. No secret half — DCR for
 * a public client (`token_endpoint_auth_method: "none"`) issues none. */
export const MCP_OAUTH_CLIENT_ID_PREFIX = "ntc_";
/** What marks an OAuth access token. */
export const MCP_OAUTH_ACCESS_TOKEN_PREFIX = "nta_";
/** What marks an OAuth refresh token. */
export const MCP_OAUTH_REFRESH_TOKEN_PREFIX = "ntr_";

export const MCP_OAUTH_ACCESS_TTL_MS = 3_600_000;
export const MCP_OAUTH_REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const CLIENT_ID_BYTES = 16;
const TOKEN_ID_BYTES = 8;
const TOKEN_SECRET_BYTES = 32;

/** Split `<prefix><id>_<secret>` into its halves, or null when it does not
 * start with `prefix` or is malformed. */
function parseToken(
  token: string,
  prefix: string
): { id: string; secret: string } | null {
  if (!token.startsWith(prefix)) return null;
  const body = token.slice(prefix.length);
  const separator = body.indexOf("_");
  if (separator <= 0) return null;
  const id = body.slice(0, separator);
  const secret = body.slice(separator + 1);
  if (!id || !secret) return null;
  return { id, secret };
}

function isoNow(): string {
  return new Date().toISOString();
}

function isRowExpired(expiresAt: string, now: number): boolean {
  const expiry = Date.parse(expiresAt);
  return Number.isFinite(expiry) && expiry <= now;
}

// ── Clients ──────────────────────────────────────────────────────────

export interface McpOauthClientRow {
  id: string;
  client_name: string;
  redirect_uris: string[];
}

// @ts-expect-error -- the pinned contract (Tasks.md) fixes this factory's
// name and shape as `create(input): Promise<{ id }>`, which is not a valid
// override of DBModel's generic `create<T>(data): Promise<T>` factory this
// class never calls; TS's static-side check does not know that.
export class McpOauthClient extends DBModel {
  static override table = mcpOauthClients;

  declare id: string;
  declare client_name: string;
  declare redirect_uris: string[];
  declare created_at: string;
  declare last_used_at: string | null;

  constructor(data: Record<string, unknown>) {
    super(data);
    this.created_at ??= isoNow();
    this.last_used_at ??= null;
  }

  /** Register a new dynamic client. Returns its `ntc_…` id. */
  static async create(input: {
    client_name: string;
    redirect_uris: string[];
  }): Promise<{ id: string }> {
    const id = `${MCP_OAUTH_CLIENT_ID_PREFIX}${randomBytes(CLIENT_ID_BYTES).toString("hex")}`;
    const client = new McpOauthClient({
      id,
      client_name: input.client_name,
      redirect_uris: input.redirect_uris,
      created_at: isoNow(),
      last_used_at: null
    });
    await client.save();
    return { id };
  }

  static async get(id: string): Promise<McpOauthClientRow | null> {
    const db = getDb();
    const rows = await db
      .select()
      .from(mcpOauthClients)
      .where(eq(mcpOauthClients.id, id))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    const client = new McpOauthClient(row as Record<string, unknown>);
    return {
      id: client.id,
      client_name: client.client_name,
      redirect_uris: client.redirect_uris
    };
  }

  /**
   * Record that a client was used, at most once a minute — same throttling
   * as `AccessToken.touch`, so a busy client does not write on every call.
   */
  static async touch(id: string, now: number = Date.now()): Promise<void> {
    const db = getDb();
    const rows = await db
      .select()
      .from(mcpOauthClients)
      .where(eq(mcpOauthClients.id, id))
      .limit(1);
    const row = rows[0];
    if (!row) return;
    const client = new McpOauthClient(row as Record<string, unknown>);
    const last = client.last_used_at ? Date.parse(client.last_used_at) : 0;
    if (Number.isFinite(last) && now - last < 60_000) return;
    client.last_used_at = new Date(now).toISOString();
    await client.save();
  }

  /**
   * Delete client rows with no grant row at all that were created before
   * `olderThanMs` ago. A client the user never approved is dead weight; one
   * with any grant — active or revoked — is kept, because the revoked grant
   * row is the user-visible record of who was once connected.
   * Returns the number of rows deleted.
   */
  static async gcUnused(olderThanMs: number): Promise<number> {
    const db = getDb();
    const usedRows = await db
      .select({ client_id: mcpOauthGrants.client_id })
      .from(mcpOauthGrants);
    const usedIds = [
      ...new Set(usedRows.map((r: { client_id: string }) => r.client_id))
    ];
    const cutoff = new Date(Date.now() - olderThanMs).toISOString();
    // created_at is an ISO string; lexicographic comparison matches
    // chronological order.
    const condition =
      usedIds.length > 0
        ? and(
            lt(mcpOauthClients.created_at, cutoff),
            notInArray(mcpOauthClients.id, usedIds)
          )
        : lt(mcpOauthClients.created_at, cutoff);
    const deleted = await db
      .delete(mcpOauthClients)
      .where(condition)
      .returning({ id: mcpOauthClients.id });
    return deleted.length;
  }
}

// ── Grants ───────────────────────────────────────────────────────────

export interface McpOauthGrantRow {
  id: string;
  user_id: string;
  client_id: string;
  client_name: string;
  scope: string;
  resource: string;
  created_at: Date;
  revoked_at: Date | null;
}

function toGrantRow(grant: McpOauthGrant): McpOauthGrantRow {
  return {
    id: grant.id,
    user_id: grant.user_id,
    client_id: grant.client_id,
    client_name: grant.client_name,
    scope: grant.scope,
    resource: grant.resource,
    created_at: new Date(grant.created_at),
    revoked_at: grant.revoked_at ? new Date(grant.revoked_at) : null
  };
}

// @ts-expect-error -- same static-side conflict as McpOauthClient above.
export class McpOauthGrant extends DBModel {
  static override table = mcpOauthGrants;

  declare id: string;
  declare user_id: string;
  declare client_id: string;
  declare client_name: string;
  declare scope: string;
  declare resource: string;
  declare created_at: string;
  declare revoked_at: string | null;

  constructor(data: Record<string, unknown>) {
    super(data);
    this.id ??= createTimeOrderedUuid();
    this.created_at ??= isoNow();
    this.revoked_at ??= null;
  }

  static async create(input: {
    user_id: string;
    client_id: string;
    client_name: string;
    scope: string;
    resource: string;
  }): Promise<{ id: string }> {
    const grant = new McpOauthGrant({
      id: createTimeOrderedUuid(),
      user_id: input.user_id,
      client_id: input.client_id,
      client_name: input.client_name,
      scope: input.scope,
      resource: input.resource,
      created_at: isoNow(),
      revoked_at: null
    });
    await grant.save();
    return { id: grant.id };
  }

  static async get(id: string): Promise<McpOauthGrantRow | null> {
    const db = getDb();
    const rows = await db
      .select()
      .from(mcpOauthGrants)
      .where(eq(mcpOauthGrants.id, id))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return toGrantRow(new McpOauthGrant(row as Record<string, unknown>));
  }

  /** Every grant a user has approved that has not been revoked. */
  static async listForUser(user_id: string): Promise<McpOauthGrantRow[]> {
    const db = getDb();
    const rows = await db
      .select()
      .from(mcpOauthGrants)
      .where(
        and(
          eq(mcpOauthGrants.user_id, user_id),
          isNull(mcpOauthGrants.revoked_at)
        )
      );
    return rows
      .map((row: Record<string, unknown>) =>
        toGrantRow(new McpOauthGrant(row))
      )
      .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
  }

  /**
   * Revoke a user's grant: marks it revoked and deletes every token minted
   * for it. Scoped to the owner, like `AccessToken.revoke`.
   */
  static async revoke(user_id: string, id: string): Promise<boolean> {
    const db = getDb();
    const rows = await db
      .select()
      .from(mcpOauthGrants)
      .where(and(eq(mcpOauthGrants.id, id), eq(mcpOauthGrants.user_id, user_id)))
      .limit(1);
    const row = rows[0];
    if (!row) return false;
    const grant = new McpOauthGrant(row as Record<string, unknown>);
    grant.revoked_at = isoNow();
    await grant.save();
    await db.delete(mcpOauthTokens).where(eq(mcpOauthTokens.grant_id, id));
    return true;
  }
}

// ── Tokens ───────────────────────────────────────────────────────────

interface MintedTokenRow {
  id: string;
  grant_id: string;
  kind: "access" | "refresh";
  secret: string;
  secretHash: string;
  expiresAt: Date;
  rotatedFrom: string | null;
}

function mintTokenRow(
  grant_id: string,
  kind: "access" | "refresh",
  ttlMs: number,
  rotatedFrom: string | null = null,
  absoluteExpiry: Date | null = null
): MintedTokenRow {
  const id = randomBytes(TOKEN_ID_BYTES).toString("hex");
  const secret = randomBytes(TOKEN_SECRET_BYTES).toString("base64url");
  const fromTtl = new Date(Date.now() + ttlMs);
  // A rotated refresh token inherits its chain's expiry: the 30-day refresh
  // lifetime is absolute from first mint, not sliding — a client that
  // rotates monthly must still re-consent when the chain runs out.
  const expiresAt =
    absoluteExpiry && absoluteExpiry < fromTtl ? absoluteExpiry : fromTtl;
  return {
    id,
    grant_id,
    kind,
    secret,
    secretHash: hashSecret(secret),
    expiresAt,
    rotatedFrom
  };
}

function tokenPrefix(kind: "access" | "refresh"): string {
  return kind === "access"
    ? MCP_OAUTH_ACCESS_TOKEN_PREFIX
    : MCP_OAUTH_REFRESH_TOKEN_PREFIX;
}

function tokenValues(row: MintedTokenRow): {
  id: string;
  grant_id: string;
  kind: "access" | "refresh";
  secret_hash: string;
  expires_at: string;
  rotated_from: string | null;
  last_used_at: string | null;
} {
  return {
    id: row.id,
    grant_id: row.grant_id,
    kind: row.kind,
    secret_hash: row.secretHash,
    expires_at: row.expiresAt.toISOString(),
    rotated_from: row.rotatedFrom,
    last_used_at: null
  };
}

async function saveTokenRow(row: MintedTokenRow): Promise<void> {
  const db = getDb();
  await db.insert(mcpOauthTokens).values(tokenValues(row));
}

/** The name of the unique index that makes a rotation an atomic claim. */
const ROTATED_FROM_INDEX = "idx_mcp_oauth_token_rotated_from";

/**
 * True only for the unique-index violation on `rotated_from` — the one error
 * that means another rotation already claimed this refresh token, which is
 * reuse. Every other failure (a closed connection, a full disk, a timeout) is
 * transient and must propagate: classifying it as reuse would revoke a working
 * grant because the database hiccuped.
 */
function isRotatedFromConflict(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; current != null && depth < 5; depth += 1) {
    const candidate = current as {
      code?: unknown;
      constraint_name?: unknown;
      message?: unknown;
      cause?: unknown;
    };
    const code = typeof candidate.code === "string" ? candidate.code : "";
    const constraint =
      typeof candidate.constraint_name === "string"
        ? candidate.constraint_name
        : "";
    const message =
      typeof candidate.message === "string" ? candidate.message : "";
    // better-sqlite3
    if (
      code === "SQLITE_CONSTRAINT_UNIQUE" &&
      message.includes("mcp_oauth_tokens.rotated_from")
    ) {
      return true;
    }
    // postgres.js
    if (
      code === "23505" &&
      (constraint === ROTATED_FROM_INDEX || message.includes(ROTATED_FROM_INDEX))
    ) {
      return true;
    }
    if (candidate.cause === current) break;
    current = candidate.cause;
  }
  return false;
}

/** Mark a grant revoked and delete every token minted for it. */
function revokeGrantSync(tx: DbTransaction, grant_id: string): void {
  tx.delete(mcpOauthTokens).where(eq(mcpOauthTokens.grant_id, grant_id)).run();
  tx.update(mcpOauthGrants)
    .set({ revoked_at: isoNow() })
    .where(eq(mcpOauthGrants.id, grant_id))
    .run();
}

async function revokeGrantAsync(
  tx: DbTransaction,
  grant_id: string
): Promise<void> {
  await tx.delete(mcpOauthTokens).where(eq(mcpOauthTokens.grant_id, grant_id));
  await tx
    .update(mcpOauthGrants)
    .set({ revoked_at: isoNow() })
    .where(eq(mcpOauthGrants.id, grant_id));
}

/** Revoke a grant in its own transaction — the two writes never land apart. */
async function revokeGrantCompletely(grant_id: string): Promise<void> {
  const db = getDb();
  if (getDbType() === "sqlite") {
    // better-sqlite3 transactions must be fully synchronous; an async callback
    // returns a Promise the driver rejects.
    db.transaction((tx: DbTransaction): void => revokeGrantSync(tx, grant_id));
    return;
  }
  await db.transaction(
    async (tx: DbTransaction): Promise<void> => revokeGrantAsync(tx, grant_id)
  );
}

/** The grant a refresh-token row belongs to, read outside any transaction. */
async function grantIdOfToken(tokenId: string): Promise<string | null> {
  const rows = await getDb()
    .select({ grant_id: mcpOauthTokens.grant_id })
    .from(mcpOauthTokens)
    .where(eq(mcpOauthTokens.id, tokenId))
    .limit(1);
  return rows[0]?.grant_id ?? null;
}

/** What one refresh rotation decided. */
export type RefreshRotation =
  | {
      accessToken: string;
      refreshToken: string;
      expiresAt: Date;
      grantId: string;
    }
  | { reuseDetected: true }
  | null;

interface ParsedToken {
  id: string;
  secret: string;
}

type RotationStep =
  | { verdict: "unknown" }
  | { verdict: "reuse"; grantId: string }
  | { verdict: "expired"; grantId: string }
  | { verdict: "rotate"; record: McpOauthToken };

/**
 * The rotation decision that needs no database access: what the presented row
 * means. Shared by both dialect branches so they cannot drift.
 */
function rotationStep(
  row: Record<string, unknown> | undefined,
  parsed: ParsedToken,
  hasSuccessor: boolean,
  now: number
): RotationStep {
  if (!row) return { verdict: "unknown" };
  const record = new McpOauthToken(row);
  if (!digestsMatch(record.secret_hash, hashSecret(parsed.secret))) {
    return { verdict: "unknown" };
  }
  if (hasSuccessor) return { verdict: "reuse", grantId: record.grant_id };
  if (isRowExpired(record.expires_at, now)) {
    return { verdict: "expired", grantId: record.grant_id };
  }
  return { verdict: "rotate", record };
}

/** The pair a rotation mints, given the row it replaces. */
function rotationPair(record: McpOauthToken): {
  access: MintedTokenRow;
  refresh: MintedTokenRow;
} {
  return {
    access: mintTokenRow(record.grant_id, "access", MCP_OAUTH_ACCESS_TTL_MS),
    refresh: mintTokenRow(
      record.grant_id,
      "refresh",
      MCP_OAUTH_REFRESH_TTL_MS,
      record.id,
      new Date(record.expires_at)
    )
  };
}

function rotated(
  access: MintedTokenRow,
  refresh: MintedTokenRow,
  grantId: string
): RefreshRotation {
  return {
    accessToken: rawToken(access),
    refreshToken: rawToken(refresh),
    expiresAt: access.expiresAt,
    grantId
  };
}

function rotateSqlite(
  tx: DbTransaction,
  parsed: ParsedToken,
  now: number
): RefreshRotation {
  const row = tx
    .select()
    .from(mcpOauthTokens)
    .where(
      and(eq(mcpOauthTokens.id, parsed.id), eq(mcpOauthTokens.kind, "refresh"))
    )
    .limit(1)
    .get();
  const successor = row
    ? tx
        .select({ id: mcpOauthTokens.id })
        .from(mcpOauthTokens)
        .where(eq(mcpOauthTokens.rotated_from, parsed.id))
        .limit(1)
        .get()
    : undefined;
  const step = rotationStep(
    row as Record<string, unknown> | undefined,
    parsed,
    successor !== undefined,
    now
  );
  if (step.verdict === "unknown") return null;
  if (step.verdict === "reuse") {
    revokeGrantSync(tx, step.grantId);
    return { reuseDetected: true };
  }
  if (step.verdict === "expired") {
    tx.delete(mcpOauthTokens).where(eq(mcpOauthTokens.id, parsed.id)).run();
    return null;
  }
  const { access, refresh } = rotationPair(step.record);
  // The refresh row goes first: the unique index on `rotated_from` makes it
  // the atomic claim on this rotation. Two concurrent presentations of the
  // same token both pass the successor check above, but only one insert
  // survives the constraint — the loser is a reuse presentation, classified
  // by `isRotatedFromConflict` and handled by the caller.
  tx.insert(mcpOauthTokens).values(tokenValues(refresh)).run();
  tx.insert(mcpOauthTokens).values(tokenValues(access)).run();
  return rotated(access, refresh, step.record.grant_id);
}

async function rotatePostgres(
  tx: DbTransaction,
  parsed: ParsedToken,
  now: number
): Promise<RefreshRotation> {
  const rows = await tx
    .select()
    .from(mcpOauthTokens)
    .where(
      and(eq(mcpOauthTokens.id, parsed.id), eq(mcpOauthTokens.kind, "refresh"))
    )
    .limit(1);
  const successors = rows[0]
    ? await tx
        .select({ id: mcpOauthTokens.id })
        .from(mcpOauthTokens)
        .where(eq(mcpOauthTokens.rotated_from, parsed.id))
        .limit(1)
    : [];
  const step = rotationStep(
    rows[0] as Record<string, unknown> | undefined,
    parsed,
    successors.length > 0,
    now
  );
  if (step.verdict === "unknown") return null;
  if (step.verdict === "reuse") {
    await revokeGrantAsync(tx, step.grantId);
    return { reuseDetected: true };
  }
  if (step.verdict === "expired") {
    await tx.delete(mcpOauthTokens).where(eq(mcpOauthTokens.id, parsed.id));
    return null;
  }
  const { access, refresh } = rotationPair(step.record);
  await tx.insert(mcpOauthTokens).values(tokenValues(refresh));
  await tx.insert(mcpOauthTokens).values(tokenValues(access));
  return rotated(access, refresh, step.record.grant_id);
}

function rawToken(row: MintedTokenRow): string {
  return `${tokenPrefix(row.kind)}${row.id}_${row.secret}`;
}

export class McpOauthToken extends DBModel {
  static override table = mcpOauthTokens;

  declare id: string;
  declare grant_id: string;
  declare kind: "access" | "refresh";
  declare secret_hash: string;
  declare expires_at: string;
  declare rotated_from: string | null;
  declare last_used_at: string | null;

  constructor(data: Record<string, unknown>) {
    super(data);
    this.rotated_from ??= null;
    this.last_used_at ??= null;
  }

  /**
   * Mint a fresh access+refresh pair for a grant. Returns the raw tokens —
   * the only time they exist in the clear, mirroring `AccessToken.mint`.
   */
  static async mintPair(
    grant_id: string
  ): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date }> {
    const access = mintTokenRow(grant_id, "access", MCP_OAUTH_ACCESS_TTL_MS);
    const refresh = mintTokenRow(
      grant_id,
      "refresh",
      MCP_OAUTH_REFRESH_TTL_MS
    );
    await saveTokenRow(access);
    await saveTokenRow(refresh);
    return {
      accessToken: rawToken(access),
      refreshToken: rawToken(refresh),
      expiresAt: access.expiresAt
    };
  }

  /**
   * Full verification of a presented `nta_` token: parse, hash-compare,
   * expiry, and the grant behind it must still be active. An expired token
   * row is deleted on the way past — nothing else sweeps this table.
   */
  static async verifyAccess(
    token: string
  ): Promise<{ userId: string; grantId: string; resource: string } | null> {
    const parsed = parseToken(token, MCP_OAUTH_ACCESS_TOKEN_PREFIX);
    if (!parsed) return null;
    const db = getDb();
    const rows = await db
      .select()
      .from(mcpOauthTokens)
      .where(
        and(
          eq(mcpOauthTokens.id, parsed.id),
          eq(mcpOauthTokens.kind, "access")
        )
      )
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    const record = new McpOauthToken(row as Record<string, unknown>);
    if (!digestsMatch(record.secret_hash, hashSecret(parsed.secret))) {
      return null;
    }
    if (isRowExpired(record.expires_at, Date.now())) {
      await record.delete();
      return null;
    }
    const grantRows = await db
      .select()
      .from(mcpOauthGrants)
      .where(eq(mcpOauthGrants.id, record.grant_id))
      .limit(1);
    const grantRow = grantRows[0];
    if (!grantRow) return null;
    const grant = new McpOauthGrant(grantRow as Record<string, unknown>);
    if (grant.revoked_at) return null;
    return {
      userId: grant.user_id,
      grantId: grant.id,
      resource: grant.resource
    };
  }

  /**
   * Rotate a refresh token: mint a fresh access+refresh pair, and link the
   * new refresh row back to the one it replaces via `rotated_from`. The old
   * row is never deleted — its continued presence, plus the successor link,
   * is exactly what makes reuse detectable: presenting it again finds a
   * successor already pointing back at it and revokes the whole grant.
   */
  static async rotateRefresh(token: string): Promise<RefreshRotation> {
    const parsed = parseToken(token, MCP_OAUTH_REFRESH_TOKEN_PREFIX);
    if (!parsed) return null;
    const db = getDb();
    const now = Date.now();
    try {
      if (getDbType() === "sqlite") {
        // better-sqlite3 transactions must be fully synchronous; an async
        // callback returns a Promise the driver rejects.
        return db.transaction((tx: DbTransaction): RefreshRotation =>
          rotateSqlite(tx, parsed, now)
        );
      }
      return await db.transaction(
        async (tx: DbTransaction): Promise<RefreshRotation> =>
          rotatePostgres(tx, parsed, now)
      );
    } catch (err) {
      if (!isRotatedFromConflict(err)) throw err;
      // Another presentation of this same token claimed the rotation while
      // this one was in flight — that, and only that, is reuse. The
      // transaction rolled back, so nothing of this attempt survives; the
      // grant goes.
      const grantId = await grantIdOfToken(parsed.id);
      if (grantId) await revokeGrantCompletely(grantId);
      return { reuseDetected: true };
    }
  }

  /** Delete every token row for a grant. Used by rotation-reuse and by
   * `McpOauthGrant.revoke`. */
  static async revokeGrantTokens(grant_id: string): Promise<void> {
    const db = getDb();
    await db.delete(mcpOauthTokens).where(eq(mcpOauthTokens.grant_id, grant_id));
  }

  /**
   * Revoke a presented token (RFC 7009): `nta_` or `ntr_`. Returns whether
   * a matching row was found — the route always answers 200 either way.
   *
   * An access token deletes only its own row. A refresh token revokes the
   * whole grant (RFC 7009 §2.1): deleting just the presented row would
   * erase the `rotated_from` link that reuse detection depends on, letting
   * an exfiltrated *ancestor* refresh token rotate successfully after the
   * user "disconnected" the client.
   */
  static async revokeByRawToken(token: string): Promise<boolean> {
    const parsed =
      parseToken(token, MCP_OAUTH_ACCESS_TOKEN_PREFIX) ??
      parseToken(token, MCP_OAUTH_REFRESH_TOKEN_PREFIX);
    if (!parsed) return false;
    const db = getDb();
    const rows = await db
      .select()
      .from(mcpOauthTokens)
      .where(eq(mcpOauthTokens.id, parsed.id))
      .limit(1);
    const row = rows[0];
    if (!row) return false;
    const record = new McpOauthToken(row as Record<string, unknown>);
    if (!digestsMatch(record.secret_hash, hashSecret(parsed.secret))) {
      return false;
    }
    if (record.kind === "refresh") {
      await revokeGrantCompletely(record.grant_id);
      return true;
    }
    await record.delete();
    return true;
  }
}
