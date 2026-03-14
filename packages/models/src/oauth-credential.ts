/**
 * OAuthCredential model – stores OAuth tokens for third-party services.
 *
 * Port of Python's `nodetool.models.oauth_credential`.
 */

import type { TableSchema } from "./database-adapter.js";
import type { Row } from "./database-adapter.js";
import {
  DBModel,
  createTimeOrderedUuid,
  type IndexSpec,
  type ModelClass,
} from "./base-model.js";
import { field } from "./condition-builder.js";
import { encrypt, decrypt, decryptFernet, getMasterKey, initMasterKey } from "@nodetool/security";

// ── Schema ───────────────────────────────────────────────────────────

const OAUTH_CREDENTIAL_SCHEMA: TableSchema = {
  table_name: "nodetool_oauth_credentials",
  primary_key: "id",
  columns: {
    id: { type: "string" },
    user_id: { type: "string" },
    provider: { type: "string" },
    account_id: { type: "string" },
    encrypted_access_token: { type: "string" },
    encrypted_refresh_token: { type: "string", optional: true },
    username: { type: "string", optional: true },
    token_type: { type: "string" },
    scope: { type: "string", optional: true },
    received_at: { type: "datetime" },
    expires_at: { type: "datetime", optional: true },
    created_at: { type: "datetime" },
    updated_at: { type: "datetime" },
  },
};

const OAUTH_CREDENTIAL_INDEXES: IndexSpec[] = [
  {
    name: "idx_oauth_user_id",
    columns: ["user_id"],
    unique: false,
  },
  {
    name: "idx_oauth_user_provider",
    columns: ["user_id", "provider"],
    unique: false,
  },
  {
    name: "idx_oauth_user_provider_account",
    columns: ["user_id", "provider", "account_id"],
    unique: true,
  },
];

// ── Model ────────────────────────────────────────────────────────────

export class OAuthCredential extends DBModel {
  static override schema = OAUTH_CREDENTIAL_SCHEMA;
  static override indexes = OAUTH_CREDENTIAL_INDEXES;

  declare id: string;
  declare user_id: string;
  declare provider: string;
  declare account_id: string;
  declare encrypted_access_token: string;
  declare encrypted_refresh_token: string | null;
  declare username: string | null;
  declare token_type: string;
  declare scope: string | null;
  declare received_at: string;
  declare expires_at: string | null;
  declare created_at: string;
  declare updated_at: string;

  constructor(data: Row) {
    super(data);
    const now = new Date().toISOString();
    this.id ??= createTimeOrderedUuid();
    this.encrypted_refresh_token ??= null;
    this.username ??= null;
    this.scope ??= null;
    this.expires_at ??= null;
    this.token_type ??= "Bearer";
    this.received_at ??= now;
    this.created_at ??= now;
    this.updated_at ??= now;
  }

  override beforeSave(): void {
    this.updated_at = new Date().toISOString();
  }

  // ── Static helpers ────────────────────────────────────────────────

  /**
   * Upsert an OAuth credential. If a credential already exists for the
   * given (user_id, provider, account_id) it is updated; otherwise a new
   * one is created.
   */
  static async upsert(opts: {
    user_id: string;
    provider: string;
    account_id: string;
    access_token: string;
    refresh_token?: string | null;
    username?: string | null;
    token_type: string;
    scope?: string | null;
    received_at: string;
    expires_at?: string | null;
  }): Promise<OAuthCredential> {
    const existing = await OAuthCredential.findByAccount(
      opts.user_id,
      opts.provider,
      opts.account_id,
    );

    if (existing) {
      existing.encrypted_access_token = opts.access_token;
      existing.encrypted_refresh_token = opts.refresh_token ?? existing.encrypted_refresh_token;
      existing.username = opts.username ?? existing.username;
      existing.token_type = opts.token_type;
      existing.scope = opts.scope ?? existing.scope;
      existing.received_at = opts.received_at;
      existing.expires_at = opts.expires_at ?? existing.expires_at;
      await existing.save();
      return existing;
    }

    return (await (
      OAuthCredential as unknown as ModelClass<OAuthCredential>
    ).create({
      user_id: opts.user_id,
      provider: opts.provider,
      account_id: opts.account_id,
      encrypted_access_token: opts.access_token,
      encrypted_refresh_token: opts.refresh_token ?? null,
      username: opts.username ?? null,
      token_type: opts.token_type,
      scope: opts.scope ?? null,
      received_at: opts.received_at,
      expires_at: opts.expires_at ?? null,
    })) as OAuthCredential;
  }

  /**
   * Find a credential by user, provider and account.
   */
  static async findByAccount(
    userId: string,
    provider: string,
    accountId: string,
  ): Promise<OAuthCredential | null> {
    const cond = field("user_id")
      .equals(userId)
      .and(field("provider").equals(provider))
      .and(field("account_id").equals(accountId));

    const [results] = await (
      OAuthCredential as unknown as ModelClass<OAuthCredential>
    ).query({ condition: cond, limit: 1 });

    return results.length > 0 ? results[0] : null;
  }

  /**
   * List all credentials for a user and provider.
   */
  static async listForUserAndProvider(
    userId: string,
    provider: string,
  ): Promise<OAuthCredential[]> {
    const cond = field("user_id")
      .equals(userId)
      .and(field("provider").equals(provider));

    const [results] = await (
      OAuthCredential as unknown as ModelClass<OAuthCredential>
    ).query({
      condition: cond,
      orderBy: "updated_at",
      reverse: true,
    });

    return results;
  }

  /**
   * Create a new credential with encrypted tokens.
   *
   * Encrypts access_token and optionally refresh_token before storing.
   */
  static async createEncrypted(opts: {
    user_id: string;
    provider: string;
    account_id: string;
    access_token: string;
    refresh_token?: string | null;
    username?: string | null;
    token_type?: string;
    scope?: string | null;
    received_at?: string;
    expires_at?: string | null;
  }): Promise<OAuthCredential> {
    const masterKey = getMasterKey();
    const encryptedAccessToken = encrypt(masterKey, opts.user_id, opts.access_token);
    const encryptedRefreshToken = opts.refresh_token
      ? encrypt(masterKey, opts.user_id, opts.refresh_token)
      : null;

    return (await (
      OAuthCredential as unknown as ModelClass<OAuthCredential>
    ).create({
      user_id: opts.user_id,
      provider: opts.provider,
      account_id: opts.account_id,
      encrypted_access_token: encryptedAccessToken,
      encrypted_refresh_token: encryptedRefreshToken,
      username: opts.username ?? null,
      token_type: opts.token_type ?? "Bearer",
      scope: opts.scope ?? null,
      received_at: opts.received_at ?? new Date().toISOString(),
      expires_at: opts.expires_at ?? null,
    })) as OAuthCredential;
  }

  /**
   * Decrypt and return the access token.
   */
  async getDecryptedAccessToken(): Promise<string> {
    const masterKey = await initMasterKey();
    try {
      return decrypt(masterKey, this.user_id, this.encrypted_access_token);
    } catch {
      return decryptFernet(masterKey, this.user_id, this.encrypted_access_token);
    }
  }

  /**
   * Decrypt and return the refresh token, or null if not set.
   */
  async getDecryptedRefreshToken(): Promise<string | null> {
    if (!this.encrypted_refresh_token) return null;
    const masterKey = await initMasterKey();
    try {
      return decrypt(masterKey, this.user_id, this.encrypted_refresh_token);
    } catch {
      return decryptFernet(masterKey, this.user_id, this.encrypted_refresh_token);
    }
  }

  /**
   * Update tokens with new encrypted values.
   */
  async updateTokens(opts: {
    accessToken: string;
    refreshToken?: string | null;
    tokenType?: string;
    scope?: string | null;
    receivedAt?: string;
    expiresAt?: string | null;
  }): Promise<void> {
    const masterKey = getMasterKey();
    this.encrypted_access_token = encrypt(masterKey, this.user_id, opts.accessToken);

    if (opts.refreshToken !== undefined && opts.refreshToken !== null) {
      this.encrypted_refresh_token = encrypt(masterKey, this.user_id, opts.refreshToken);
    }
    if (opts.tokenType !== undefined) {
      this.token_type = opts.tokenType;
    }
    if (opts.scope !== undefined) {
      this.scope = opts.scope;
    }
    this.received_at = opts.receivedAt ?? new Date().toISOString();
    if (opts.expiresAt !== undefined) {
      this.expires_at = opts.expiresAt;
    }

    await this.save();
  }

  /**
   * Return a safe dictionary representation without encrypted tokens.
   */
  toSafeObject(): Record<string, unknown> {
    return {
      id: this.id,
      user_id: this.user_id,
      provider: this.provider,
      account_id: this.account_id,
      username: this.username,
      token_type: this.token_type,
      scope: this.scope,
      received_at: this.received_at,
      expires_at: this.expires_at,
      created_at: this.created_at,
      updated_at: this.updated_at,
    };
  }
}
