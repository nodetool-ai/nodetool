/**
 * AccessToken model — a revocable bearer token that authenticates as one
 * NodeTool user.
 *
 * This is what a person pastes into an MCP client (Claude Code, Claude
 * Desktop, Codex) so an agent on another machine can reach their server. A
 * browser session is not usable there: a Supabase access token expires within
 * the hour and no static config file can refresh it.
 *
 * A token is two halves, `ntk_<id>_<secret>`. The id is public — it is the row
 * key, so verification is one indexed read — and only a SHA-256 of the secret
 * is stored. The plaintext exists exactly once, in the response that mints it;
 * nothing can recover it afterwards, which is why the UI shows it once and
 * offers no way back.
 *
 * Revocation is a row delete. That is the whole difference from the delegated
 * tokens in `@nodetool-ai/auth`: those are stateless HMACs that live until
 * they expire or the master key rotates, which is right for a bridge minting
 * one per connection and wrong for a credential sitting in a config file for
 * months.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { DBModel } from "./base-model.js";
import { getDb } from "./db.js";
import { accessTokens } from "./schema/access-tokens.js";

/** What marks a token as this model's. */
export const ACCESS_TOKEN_PREFIX = "ntk_";

/** Bytes of entropy in each half. The id only has to be unique; the secret
 * has to be unguessable, so it gets four times as much. */
const ID_BYTES = 8;
const SECRET_BYTES = 32;

export interface MintedAccessToken {
  record: AccessToken;
  /** The plaintext token. Never stored, and never recoverable. */
  token: string;
}

export interface CreateAccessTokenParams {
  userId: string;
  name: string;
  /** Lifetime in days. Omitted or null mints a token that does not expire. */
  expiresInDays?: number | null;
}

/** Whether a string claims to be an access token at all. */
export function isAccessToken(token: string): boolean {
  return token.startsWith(ACCESS_TOKEN_PREFIX);
}

/** Split `ntk_<id>_<secret>` into its halves, or null when it is not one. */
export function parseAccessToken(
  token: string
): { id: string; secret: string } | null {
  if (!isAccessToken(token)) return null;
  const body = token.slice(ACCESS_TOKEN_PREFIX.length);
  const separator = body.indexOf("_");
  if (separator <= 0) return null;
  const id = body.slice(0, separator);
  const secret = body.slice(separator + 1);
  if (!id || !secret) return null;
  return { id, secret };
}

function hashSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf-8").digest("hex");
}

/** Constant-time comparison of two hex digests of equal length. */
function digestsMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf-8");
  const right = Buffer.from(b, "utf-8");
  return left.length === right.length && timingSafeEqual(left, right);
}

export class AccessToken extends DBModel {
  static override table = accessTokens;

  declare id: string;
  declare user_id: string;
  declare name: string;
  declare secret_hash: string;
  declare created_at: string;
  declare expires_at: string | null;
  declare last_used_at: string | null;

  constructor(data: Record<string, unknown>) {
    super(data);
    this.created_at ??= new Date().toISOString();
    this.expires_at ??= null;
    this.last_used_at ??= null;
  }

  /** Whether the token is past its expiry at `now`. */
  isExpired(now: number = Date.now()): boolean {
    if (!this.expires_at) return false;
    const expiry = Date.parse(this.expires_at);
    return Number.isFinite(expiry) && expiry <= now;
  }

  /**
   * Mint a token for a user. The returned plaintext is the only copy — the
   * row holds a hash of the secret half and cannot reproduce it.
   */
  static async mint({
    userId,
    name,
    expiresInDays
  }: CreateAccessTokenParams): Promise<MintedAccessToken> {
    const id = randomBytes(ID_BYTES).toString("hex");
    const secret = randomBytes(SECRET_BYTES).toString("base64url");
    const expiresAt =
      expiresInDays == null
        ? null
        : new Date(Date.now() + expiresInDays * 86_400_000).toISOString();
    const record = new AccessToken({
      id,
      user_id: userId,
      name,
      secret_hash: hashSecret(secret),
      created_at: new Date().toISOString(),
      expires_at: expiresAt,
      last_used_at: null
    });
    await record.save();
    return { record, token: `${ACCESS_TOKEN_PREFIX}${id}_${secret}` };
  }

  /**
   * The user a presented token authenticates as, or null when it is not one
   * of ours, does not exist, does not match, or has expired.
   *
   * An expired row is deleted on the way past: nothing else sweeps the table,
   * and the row's only remaining use is being refused.
   */
  static async verify(token: string): Promise<AccessToken | null> {
    const parsed = parseAccessToken(token);
    if (!parsed) return null;
    const db = getDb();
    const rows = await db
      .select()
      .from(accessTokens)
      .where(eq(accessTokens.id, parsed.id))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    const record = new AccessToken(row as Record<string, unknown>);
    if (!digestsMatch(record.secret_hash, hashSecret(parsed.secret))) {
      return null;
    }
    if (record.isExpired()) {
      await record.delete();
      return null;
    }
    return record;
  }

  /**
   * Record that a token was used, at most once a minute.
   *
   * The column exists so a person can tell a live token from a forgotten one
   * before revoking it. Every request writing a timestamp would be a write
   * per agent call for a field read by a human, so a write is skipped while
   * the stored value is under a minute old.
   */
  async touch(now: number = Date.now()): Promise<void> {
    const last = this.last_used_at ? Date.parse(this.last_used_at) : 0;
    if (Number.isFinite(last) && now - last < 60_000) return;
    this.last_used_at = new Date(now).toISOString();
    await this.save();
  }

  /** Every token a user holds, newest first. Secret hashes included — the
   * caller is responsible for not putting them on the wire. */
  static async listForUser(userId: string): Promise<AccessToken[]> {
    const db = getDb();
    const rows = await db
      .select()
      .from(accessTokens)
      .where(eq(accessTokens.user_id, userId));
    return rows
      .map((row: Record<string, unknown>) => new AccessToken(row))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  /**
   * Revoke one of a user's tokens. Scoped to the owner, so a token id learned
   * elsewhere is not enough to delete somebody else's.
   */
  static async revoke(userId: string, id: string): Promise<boolean> {
    const db = getDb();
    const rows = await db
      .select()
      .from(accessTokens)
      .where(and(eq(accessTokens.id, id), eq(accessTokens.user_id, userId)))
      .limit(1);
    const row = rows[0];
    if (!row) return false;
    await new AccessToken(row as Record<string, unknown>).delete();
    return true;
  }
}
