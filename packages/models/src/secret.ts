/**
 * Secret model – stores encrypted secrets per user.
 *
 * Port of Python's `nodetool.models.secret`.
 */

import { eq, and } from "drizzle-orm";
import { DBModel, createTimeOrderedUuid } from "./base-model.js";
import { getDb } from "./db.js";
import { secrets } from "./schema/secrets.js";
import {
  encryptFernet,
  decrypt,
  decryptFernet,
  getMasterKey,
  initMasterKey
} from "@nodetool-ai/security";
import { createLogger } from "@nodetool-ai/config";

const log = createLogger("nodetool.models.secret");

export class Secret extends DBModel {
  static override table = secrets;

  declare id: string;
  declare user_id: string;
  declare key: string;
  declare encrypted_value: string;
  declare description: string;
  declare created_at: string;
  declare updated_at: string;

  constructor(data: Record<string, unknown>) {
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

  /** Find a secret by user_id and key. */
  static async find(userId: string, key: string): Promise<Secret | null> {
    const db = getDb();
    const [row] = await db
      .select()
      .from(secrets)
      .where(and(eq(secrets.user_id, userId), eq(secrets.key, key)))
      .limit(1);
    return row ? new Secret(row as Record<string, unknown>) : null;
  }

  /** Create or update a secret. Encrypts the plaintext value before storing. */
  static async upsert(opts: {
    userId: string;
    key: string;
    value: string;
    description?: string;
  }): Promise<Secret> {
    const masterKey = getMasterKey();
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

    return Secret.create<Secret>({
      id: createTimeOrderedUuid(),
      user_id: opts.userId,
      key: opts.key,
      encrypted_value: encryptedValue,
      description: opts.description ?? "",
      created_at: now,
      updated_at: now
    });
  }

  /** Create or update a secret with a pre-encrypted value (no re-encryption). */
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

    return Secret.create<Secret>({
      id: createTimeOrderedUuid(),
      user_id: opts.userId,
      key: opts.key,
      encrypted_value: opts.encryptedValue,
      description: opts.description ?? "",
      created_at: now,
      updated_at: now
    });
  }

  /** Delete a secret by user_id and key. */
  static async deleteSecret(userId: string, key: string): Promise<boolean> {
    const secret = await Secret.find(userId, key);
    if (secret) {
      await secret.delete();
      return true;
    }
    return false;
  }

  /** List all secrets for a user. */
  static async listForUser(
    userId: string,
    limit = 100
  ): Promise<[Secret[], string]> {
    const db = getDb();
    const rows = await db
      .select()
      .from(secrets)
      .where(eq(secrets.user_id, userId))
      .limit(limit + 1);

    const items = rows.map((r: Record<string, unknown>) => new Secret(r as Record<string, unknown>));
    if (items.length <= limit) return [items, ""];
    items.pop();
    const cursor = items[items.length - 1]?.id ?? "";
    return [items, cursor];
  }

  /** List all secrets across all users (admin only). */
  static async listAll(limit = 1000): Promise<Secret[]> {
    const db = getDb();
    const rows = await db.select().from(secrets).limit(limit);
    return rows.map((r: Record<string, unknown>) => new Secret(r as Record<string, unknown>));
  }

  /** Get the decrypted plaintext value. */
  async getDecryptedValue(): Promise<string> {
    const masterKey = await initMasterKey();
    try {
      return decrypt(masterKey, this.user_id, this.encrypted_value);
    } catch {
      try {
        return decryptFernet(masterKey, this.user_id, this.encrypted_value);
      } catch (fernetErr) {
        log.error("Both AES-GCM and Fernet decryption failed", {
          key: this.key,
          userId: this.user_id,
          fernetError: String(fernetErr)
        });
        throw fernetErr;
      }
    }
  }

  /** Return a safe dictionary representation without the encrypted value. */
  toSafeObject(): Record<string, unknown> {
    return {
      id: this.id,
      user_id: this.user_id,
      key: this.key,
      description: this.description,
      created_at: this.created_at,
      updated_at: this.updated_at
    };
  }
}
