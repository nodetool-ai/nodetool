/**
 * Setting model – stores unencrypted settings per user.
 *
 * Parallel to Secret but without encryption – for non-secret config
 * like COMFYUI_ADDR, paths, autosave settings, etc.
 */

import { eq, and } from "drizzle-orm";
import { DBModel, createTimeOrderedUuid } from "./base-model.js";
import { getDb } from "./db.js";
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
    const db = getDb();
    const row = db
      .select()
      .from(appSettings)
      .where(and(eq(appSettings.user_id, userId), eq(appSettings.key, key)))
      .limit(1)
      .get();
    return row ? new Setting(row as Record<string, unknown>) : null;
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
    const db = getDb();
    const rows = db
      .select()
      .from(appSettings)
      .where(eq(appSettings.user_id, userId))
      .all();
    return rows.map((r) => new Setting(r as Record<string, unknown>));
  }

  /** Get the plaintext value. */
  getValue(): string {
    return this.value;
  }
}
