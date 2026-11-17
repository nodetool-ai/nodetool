/**
 * Setting model – stores unencrypted settings per user.
 *
 * Parallel to Secret but without encryption – for non-secret config
 * like paths, autosave settings, etc.
 */

import { eq, and } from "drizzle-orm";
import { DBModel, createTimeOrderedUuid } from "./base-model.js";
import { getDatabase, getPortableDb } from "./db.js";
import { appSettings } from "./schema/settings.js";

export class Setting extends DBModel {
  static override table = appSettings;

  declare id: string;
  declare user_id: string;
  declare key: string;
  declare value: string;
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

  /** Find a setting by user_id and key. */
  static async find(userId: string, key: string): Promise<Setting | null> {
    const db = getPortableDb();
    const [row] = await db
      .select()
      .from(appSettings)
      .where(and(eq(appSettings.user_id, userId), eq(appSettings.key, key)))
      .limit(1);
    return row ? new Setting(row) : null;
  }

  /** Create or update a setting. Value is stored as plaintext. */
  static async upsert(opts: {
    userId: string;
    key: string;
    value: string;
    description?: string;
  }): Promise<Setting> {
    const now = new Date().toISOString();
    const existing = await Setting.find(opts.userId, opts.key);

    if (existing) {
      existing.value = opts.value;
      existing.updated_at = now;
      if (opts.description !== undefined) {
        existing.description = opts.description ?? "";
      }
      await existing.save();
      return existing;
    }

    return Setting.create<Setting>({
      id: createTimeOrderedUuid(),
      user_id: opts.userId,
      key: opts.key,
      value: opts.value,
      description: opts.description ?? "",
      created_at: now,
      updated_at: now
    });
  }

  /**
   * Upsert `writes` in one transaction, but only while the user's setting
   * `guard.key` still holds `guard.expected` (null: no row). Returns false,
   * with nothing written, when it does not.
   */
  static async upsertManyIf(
    userId: string,
    guard: { key: string; expected: string | null },
    writes: Array<{ key: string; value: string }>
  ): Promise<boolean> {
    const now = new Date().toISOString();
    const rows = writes.map((write) => ({
      id: createTimeOrderedUuid(),
      user_id: userId,
      key: write.key,
      value: write.value,
      description: "",
      created_at: now,
      updated_at: now
    }));
    const connection = getDatabase();
    if (connection.dialect === "sqlite") {
      const table = connection.schema.appSettings;
      const owner = and(eq(table.user_id, userId), eq(table.key, guard.key));
      return connection.db.transaction(
        (tx): boolean => {
          const [current] = tx.select({ value: table.value }).from(table)
            .where(owner).limit(1).all();
          if ((current?.value ?? null) !== guard.expected) return false;
          for (const row of rows) {
            tx.insert(table).values(row).onConflictDoUpdate({
              target: [table.user_id, table.key],
              set: { value: row.value, updated_at: now }
            }).run();
          }
          return true;
        },
        { behavior: "immediate" }
      );
    }
    const table = connection.schema.appSettings;
    const owner = and(eq(table.user_id, userId), eq(table.key, guard.key));
    return connection.db.transaction(async (tx): Promise<boolean> => {
      const [current] = await tx.select({ value: table.value }).from(table)
        .where(owner).limit(1).for("update");
      if ((current?.value ?? null) !== guard.expected) return false;
      for (const row of rows) {
        await tx.insert(table).values(row).onConflictDoUpdate({
          target: [table.user_id, table.key],
          set: { value: row.value, updated_at: now }
        });
      }
      return true;
    });
  }

  /** Delete a setting by user_id and key. */
  static async deleteSetting(userId: string, key: string): Promise<boolean> {
    const setting = await Setting.find(userId, key);
    if (setting) {
      await setting.delete();
      return true;
    }
    return false;
  }

  /** List all settings for a user. */
  static async listForUser(userId: string): Promise<Setting[]> {
    const db = getPortableDb();
    const rows = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.user_id, userId));
    return rows.map((r: Record<string, unknown>) => new Setting(r));
  }

  /**
   * Every user's setting under `key`. Deliberately not user-scoped, for
   * startup jobs, so it must never back a request handler.
   */
  static async listByKey(key: string): Promise<Setting[]> {
    const db = getPortableDb();
    const rows = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, key));
    return rows.map((r: Record<string, unknown>) => new Setting(r));
  }

  /** Get the plaintext value. */
  getValue(): string {
    return this.value;
  }
}
