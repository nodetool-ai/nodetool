/**
 * Secret model – stores encrypted secrets per user.
 *
 * Port of Python's `nodetool.models.secret`.
 */

import type { TableSchema, Row } from "./database-adapter.js";
import {
  DBModel,
  createTimeOrderedUuid,
  type IndexSpec,
  type ModelClass,
} from "./base-model.js";
import { field } from "./condition-builder.js";
import { encryptFernet, decrypt, decryptFernet, getMasterKey, initMasterKey } from "@nodetool/security";
import { createLogger } from "@nodetool/config";

const log = createLogger("nodetool.models.secret");

// ── Schema ───────────────────────────────────────────────────────────

const SECRET_SCHEMA: TableSchema = {
  table_name: "nodetool_secrets",
  primary_key: "id",
  columns: {
    id: { type: "string" },
    user_id: { type: "string" },
    key: { type: "string" },
    encrypted_value: { type: "string" },
    description: { type: "string", optional: true },
    created_at: { type: "datetime" },
    updated_at: { type: "datetime" },
  },
};

const SECRET_INDEXES: IndexSpec[] = [
  { name: "idx_secrets_user_key", columns: ["user_id", "key"], unique: true },
  { name: "idx_secrets_user_id", columns: ["user_id"], unique: false },
];

// ── Model ────────────────────────────────────────────────────────────

export class Secret extends DBModel {
  static override schema = SECRET_SCHEMA;
  static override indexes = SECRET_INDEXES;

  declare id: string;
  declare user_id: string;
  declare key: string;
  declare encrypted_value: string;
  declare description: string;
  declare created_at: string;
  declare updated_at: string;

  constructor(data: Row) {
    super(data);
    const now = new Date().toISOString();
    this.id ??= createTimeOrderedUuid();
    this.description ??= "";
    this.created_at ??= now;
    this.updated_at ??= now;
  }

  override beforeSave(): void {
    this.updated_at = new Date().toISOString();
  }

  /**
   * Find a secret by user_id and key.
   */
  static async find(userId: string, key: string): Promise<Secret | null> {
    const condition = field("user_id").equals(userId).and(field("key").equals(key));
    const [results] = await (Secret as unknown as ModelClass<Secret>).query({
      condition,
      limit: 1,
    });
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Create or update a secret.
   *
   * Encrypts the plaintext value before storing.
   */
  static async upsert(opts: {
    userId: string;
    key: string;
    value: string;
    description?: string;
  }): Promise<Secret> {
    const masterKey = getMasterKey();
    // Use Fernet so Python can also decrypt secrets written by the TS server
    const encryptedValue = encryptFernet(masterKey, opts.userId, opts.value);
    const now = new Date().toISOString();

    const existing = await Secret.find(opts.userId, opts.key);

    if (existing) {
      existing.encrypted_value = encryptedValue;
      existing.updated_at = now;
      if (opts.description !== undefined) {
        existing.description = opts.description ?? "";
      }
      await existing.save();
      return existing;
    }

    return (await (Secret as unknown as ModelClass<Secret>).create({
      id: createTimeOrderedUuid(),
      user_id: opts.userId,
      key: opts.key,
      encrypted_value: encryptedValue,
      description: opts.description ?? "",
      created_at: now,
      updated_at: now,
    })) as Secret;
  }

  /**
   * Create or update a secret with a pre-encrypted value (no re-encryption).
   *
   * Use when the encrypted_value is already encrypted by the caller.
   */
  static async upsertEncrypted(opts: {
    userId: string;
    key: string;
    encryptedValue: string;
    description?: string;
  }): Promise<Secret> {
    const now = new Date().toISOString();
    const existing = await Secret.find(opts.userId, opts.key);

    if (existing) {
      existing.encrypted_value = opts.encryptedValue;
      existing.updated_at = now;
      if (opts.description !== undefined) {
        existing.description = opts.description ?? "";
      }
      await existing.save();
      return existing;
    }

    return (await (Secret as unknown as ModelClass<Secret>).create({
      id: createTimeOrderedUuid(),
      user_id: opts.userId,
      key: opts.key,
      encrypted_value: opts.encryptedValue,
      description: opts.description ?? "",
      created_at: now,
      updated_at: now,
    })) as Secret;
  }

  /**
   * Delete a secret by user_id and key.
   *
   * @returns True if the secret was deleted, false if not found.
   */
  static async deleteSecret(userId: string, key: string): Promise<boolean> {
    const secret = await Secret.find(userId, key);
    if (secret) {
      await secret.delete();
      return true;
    }
    return false;
  }

  /**
   * List all secrets for a user.
   */
  static async listForUser(
    userId: string,
    limit = 100
  ): Promise<[Secret[], string]> {
    const condition = field("user_id").equals(userId);
    return (Secret as unknown as ModelClass<Secret>).query({
      condition,
      limit,
    });
  }

  /**
   * List all secrets across all users (admin only).
   */
  static async listAll(limit = 1000): Promise<Secret[]> {
    const [secrets] = await (Secret as unknown as ModelClass<Secret>).query({
      limit,
    });
    return secrets;
  }

  /**
   * Get the decrypted plaintext value.
   */
  async getDecryptedValue(): Promise<string> {
    // Ensure master key is loaded from keychain (async) before decrypting
    const masterKey = await initMasterKey();
    // Try native AES-256-GCM first (TS-encrypted secrets), then Fernet (Python-encrypted)
    try {
      return decrypt(masterKey, this.user_id, this.encrypted_value);
    } catch {
      log.debug("AES-GCM decryption failed, trying Fernet", { key: this.key });
      return decryptFernet(masterKey, this.user_id, this.encrypted_value);
    }
  }

  /**
   * Return a safe dictionary representation without the encrypted value.
   */
  toSafeObject(): Record<string, unknown> {
    return {
      id: this.id,
      user_id: this.user_id,
      key: this.key,
      description: this.description,
      created_at: this.created_at,
      updated_at: this.updated_at,
    };
  }
}
