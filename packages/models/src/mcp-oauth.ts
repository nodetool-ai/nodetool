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

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, isNull, lt, notInArray } from "drizzle-orm";
import { DBModel, createTimeOrderedUuid } from "./base-model.js";
import { getDb } from "./db.js";
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

/**
 * Hash a token secret for storage. SHA-256, not a slow KDF — see the long
 * comment on `access-token.ts`'s `hashSecret`, which applies verbatim: the
 * input is 256 bits from a CSPRNG, so a fast hash costs an attacker exactly
 * as much as a slow one, and a slow one would cost this module's own auth
 * hook on every `/mcp` request.
 */
function hashSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf-8").digest("hex");
}

/** Constant-time comparison of two hex digests of equal length. */
function digestsMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf-8");
  const right = Buffer.from(b, "utf-8");
  return left.length === right.length && timingSafeEqual(left, right);
}

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
   * Delete client rows with no grant that were created before `olderThanMs`
   * ago. A client that a user never approved (or fully revoked) is dead
   * weight; one with an active grant is left alone regardless of age.
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
  rotatedFrom: string | null = null
): MintedTokenRow {
  const id = randomBytes(TOKEN_ID_BYTES).toString("hex");
  const secret = randomBytes(TOKEN_SECRET_BYTES).toString("base64url");
  const expiresAt = new Date(Date.now() + ttlMs);
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

async function saveTokenRow(row: MintedTokenRow): Promise<void> {
  const db = getDb();
  await db.insert(mcpOauthTokens).values({
    id: row.id,
    grant_id: row.grant_id,
    kind: row.kind,
    secret_hash: row.secretHash,
    expires_at: row.expiresAt.toISOString(),
    rotated_from: row.rotatedFrom,
    last_used_at: null
  });
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
  static async rotateRefresh(token: string): Promise<
    | { accessToken: string; refreshToken: string; expiresAt: Date; grantId: string }
    | { reuseDetected: true }
    | null
  > {
    const parsed = parseToken(token, MCP_OAUTH_REFRESH_TOKEN_PREFIX);
    if (!parsed) return null;
    const db = getDb();
    const rows = await db
      .select()
      .from(mcpOauthTokens)
      .where(
        and(
          eq(mcpOauthTokens.id, parsed.id),
          eq(mcpOauthTokens.kind, "refresh")
        )
      )
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    const record = new McpOauthToken(row as Record<string, unknown>);
    if (!digestsMatch(record.secret_hash, hashSecret(parsed.secret))) {
      return null;
    }

    const successors = await db
      .select({ id: mcpOauthTokens.id })
      .from(mcpOauthTokens)
      .where(eq(mcpOauthTokens.rotated_from, record.id))
      .limit(1);
    if (successors.length > 0) {
      await McpOauthToken.revokeGrantTokens(record.grant_id);
      await db
        .update(mcpOauthGrants)
        .set({ revoked_at: isoNow() })
        .where(eq(mcpOauthGrants.id, record.grant_id));
      return { reuseDetected: true };
    }

    if (isRowExpired(record.expires_at, Date.now())) {
      await record.delete();
      return null;
    }

    const access = mintTokenRow(
      record.grant_id,
      "access",
      MCP_OAUTH_ACCESS_TTL_MS
    );
    const refresh = mintTokenRow(
      record.grant_id,
      "refresh",
      MCP_OAUTH_REFRESH_TTL_MS,
      record.id
    );
    await saveTokenRow(access);
    await saveTokenRow(refresh);
    return {
      accessToken: rawToken(access),
      refreshToken: rawToken(refresh),
      expiresAt: access.expiresAt,
      grantId: record.grant_id
    };
  }

  /** Delete every token row for a grant. Used by rotation-reuse and by
   * `McpOauthGrant.revoke`. */
  static async revokeGrantTokens(grant_id: string): Promise<void> {
    const db = getDb();
    await db.delete(mcpOauthTokens).where(eq(mcpOauthTokens.grant_id, grant_id));
  }

  /**
   * Revoke a single presented token (RFC 7009): `nta_` or `ntr_`. Returns
   * whether a matching row was found and deleted — the route always answers
   * 200 either way, per spec.
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
    await record.delete();
    return true;
  }
}
